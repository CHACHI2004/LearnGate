import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { AiFlashcardDeckModel } from "../models/ai-flashcard-deck.model.js";
import { AiGenerationJobModel } from "../models/ai-generation-job.model.js";
import { DocumentExtractionError, extractDocument } from "../services/document-extraction.js";
import { FlashcardGenerationError, generateFlashcards } from "../services/ai-flashcard-generator.js";
import { monthKey, readMonthlyGenerationQuota, refundMonthlyGeneration, reserveMonthlyGeneration, setGenerationStatus } from "../services/ai-quota.service.js";
import { deleteStoredFile, storeFileInBoth } from "../services/file-storage.service.js";
import { flashcardGenerationOptionsSchema, updateFlashcardDeckSchema } from "../validators/flashcard.validators.js";
import { objectIdSchema } from "../validators/subject.validators.js";

const activeStatuses = ["queued", "extracting", "generating"] as const;
const pptSignature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export const flashcardGenerationRateLimit = rateLimit({
  windowMs: env.AI_RATE_LIMIT_WINDOW_MS,
  limit: env.AI_RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export const receiveFlashcardPresentation = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.DOCUMENT_MAX_SIZE_MB * 1024 * 1024, files: 1 },
}).single("file");

export const requireFlashcardAiProvider: RequestHandler = (_request, response, next) => {
  if (!env.GROQ_API_KEY) {
    response.status(503).json({
      error: { code: "AI_NOT_CONFIGURED", message: "Flashcard generation is unavailable. Configure GROQ_API_KEY on the server." },
    });
    return;
  }
  next();
};

function safeErrorMessage(error: unknown) {
  if (error instanceof DocumentExtractionError || error instanceof FlashcardGenerationError) return error.message;
  return "The presentation could not be processed. Check its format and try again.";
}

async function runFlashcardGeneration(deckId: mongoose.Types.ObjectId, buffer: Buffer) {
  const deck = await AiFlashcardDeckModel.findById(deckId);
  if (!deck) return;
  const month = monthKey(deck.createdAt);
  try {
    deck.status = "extracting";
    deck.progress = 12;
    deck.message = "Reading presentation slides";
    await deck.save();

    const units = await extractDocument(buffer, deck.fileType);
    deck.slideCount = units.reduce((maximum, unit) => Math.max(maximum, unit.number), 0);
    deck.sourceSlideNumbers = units.map((unit) => unit.number);
    if (units.length < 1) throw new DocumentExtractionError("No readable slides were found.");

    deck.status = "generating";
    deck.progress = 40;
    deck.message = `Preparing ${units.length} slides`;
    await deck.save();

    const cards = await generateFlashcards(units, deck.requestedCardCount);
    deck.set("cards", cards);
    deck.status = "ready";
    deck.progress = 100;
    deck.message = `${cards.length} flashcards are ready to study`;
    deck.errorMessage = null;
    deck.completedAt = new Date();
    await deck.save();
    await setGenerationStatus(deck.userId, "succeeded", month);
  } catch (error) {
    const message = safeErrorMessage(error);
    deck.status = "failed";
    deck.progress = 100;
    deck.message = "Flashcards could not be generated";
    deck.errorMessage = message;
    deck.completedAt = new Date();
    await deck.save();
    await setGenerationStatus(deck.userId, "failed", month);
    const reason = error instanceof Error ? error.name : "UnknownError";
    console.error(`AI flashcard generation failed for deck ${deck._id}: ${reason}`);
  }
}

export const listFlashcardDecks: RequestHandler = async (request, response) => {
  const decks = await AiFlashcardDeckModel.find({ userId: request.auth!.userId })
    .select("title fileName fileType status progress message errorMessage requestedCardCount createdAt")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  response.json({
    data: {
      decks: decks.map((deck) => ({
        ...deck,
        _id: String(deck._id),
        cardCount: deck.status === "ready" ? deck.requestedCardCount : 0,
      })),
      quota: await readMonthlyGenerationQuota(request.auth!.userId),
    },
  });
};

export const createFlashcardDeck: RequestHandler = async (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: { code: "FILE_REQUIRED", message: "Choose a .ppt or .pptx presentation." } });
    return;
  }
  const file = request.file;
  const extension = file.originalname.split(".").pop()?.toLowerCase();
  const fileType = extension === "pptx" && file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    ? "pptx"
    : extension === "ppt" && file.buffer.subarray(0, 8).equals(pptSignature)
      ? "ppt"
      : null;
  if (!fileType) {
    response.status(400).json({ error: { code: "UNSUPPORTED_FILE", message: "Upload a valid PowerPoint presentation (.ppt or .pptx)." } });
    return;
  }

  const options = flashcardGenerationOptionsSchema.parse({
    title: request.body.title || undefined,
    cardCount: request.body.cardCount ? Number(request.body.cardCount) : undefined,
  });
  const [activeQuizJob, activeFlashcardDeck] = await Promise.all([
    AiGenerationJobModel.exists({ userId: request.auth!.userId, status: { $in: activeStatuses } }),
    AiFlashcardDeckModel.exists({ userId: request.auth!.userId, status: { $in: activeStatuses } }),
  ]);
  if (activeQuizJob || activeFlashcardDeck) {
    response.status(409).json({ error: { code: "AI_JOB_ACTIVE", message: "Wait for your current AI generation to finish." } });
    return;
  }

  const usage = await reserveMonthlyGeneration(request.auth!.userId);
  if (!usage) {
    await setGenerationStatus(request.auth!.userId, "exhausted");
    response.status(429).json({
      error: {
        code: "AI_MONTHLY_QUOTA_EXCEEDED",
        message: `You have used all ${env.AI_MONTHLY_GENERATION_CAP} AI generations for this month.`,
      },
    });
    return;
  }

  const fileName = file.originalname.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255);
  const defaultTitle = fileName.replace(/\.(pptx?)$/i, "").trim().slice(0, 120) || "PowerPoint study set";
  let storedFile;
  let deck;
  try {
    storedFile = await storeFileInBoth({
      buffer: file.buffer,
      fileName,
      mimeType: fileType === "ppt"
        ? "application/vnd.ms-powerpoint"
        : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      folder: "learngate/flashcard-sources",
      resourceType: "raw",
      authenticated: true,
    });
    deck = await AiFlashcardDeckModel.create({
      userId: request.auth!.userId,
      title: options.title ?? defaultTitle,
      fileName,
      fileType,
      sourceFile: storedFile,
      requestedCardCount: options.cardCount,
    });
  } catch (error) {
    if (storedFile) await deleteStoredFile(storedFile);
    await refundMonthlyGeneration(request.auth!.userId, usage.month);
    await setGenerationStatus(request.auth!.userId, "failed", usage.month);
    throw error;
  }

  const buffer = Buffer.from(file.buffer);
  response.status(202).json({
    data: {
      deckId: String(deck._id),
      status: deck.status,
      quota: { used: usage.used, limit: usage.limit, remaining: Math.max(0, usage.limit - usage.used) },
    },
  });
  setImmediate(() => {
    void runFlashcardGeneration(deck._id, buffer).catch(async (error: unknown) => {
      console.error(`Could not persist flashcard generation state for deck ${deck._id}:`, error);
      await AiFlashcardDeckModel.updateOne(
        { _id: deck._id },
        {
          $set: {
            status: "failed",
            progress: 100,
            message: "Flashcards could not be generated",
            errorMessage: "The presentation could not be processed. Please submit it again.",
            completedAt: new Date(),
          },
        },
      );
      await setGenerationStatus(deck.userId, "failed", usage.month);
    });
  });
};

export const readFlashcardDeck: RequestHandler = async (request, response) => {
  const deckId = objectIdSchema.parse(request.params.deckId);
  const deck = await AiFlashcardDeckModel.findOne({
    _id: deckId,
    userId: request.auth!.userId,
  }).lean();
  if (!deck) {
    response.status(404).json({ error: { code: "FLASHCARD_DECK_NOT_FOUND", message: "Flashcard deck not found." } });
    return;
  }
  response.json({ data: { ...deck, _id: String(deck._id) } });
};

export const updateFlashcardDeck: RequestHandler = async (request, response) => {
  const deckId = objectIdSchema.parse(request.params.deckId);
  const deck = await AiFlashcardDeckModel.findOne({ _id: deckId, userId: request.auth!.userId });
  if (!deck) {
    response.status(404).json({ error: { code: "FLASHCARD_DECK_NOT_FOUND", message: "Flashcard deck not found." } });
    return;
  }
  if (deck.status !== "ready") {
    response.status(409).json({ error: { code: "FLASHCARD_DECK_NOT_READY", message: "Only a ready flashcard deck can be edited." } });
    return;
  }

  const input = updateFlashcardDeckSchema.parse(request.body);
  const sourceSlideNumbers = new Set(deck.sourceSlideNumbers);
  if (input.cards.some((card) => !sourceSlideNumbers.has(card.sourceReference.number))) {
    response.status(400).json({ error: { code: "INVALID_SLIDE_REFERENCE", message: "Each source reference must match a slide in this presentation." } });
    return;
  }
  deck.title = input.title;
  deck.set("cards", input.cards);
  deck.requestedCardCount = input.cards.length;
  await deck.save();
  response.json({ data: { saved: true } });
};

export const deleteFlashcardDeck: RequestHandler = async (request, response) => {
  const deckId = objectIdSchema.parse(request.params.deckId);
  const deck = await AiFlashcardDeckModel.findOne({ _id: deckId, userId: request.auth!.userId }).select("status sourceFile").lean();
  if (!deck) {
    response.status(404).json({ error: { code: "FLASHCARD_DECK_NOT_FOUND", message: "Flashcard deck not found." } });
    return;
  }
  if (activeStatuses.includes(deck.status as typeof activeStatuses[number])) {
    response.status(409).json({ error: { code: "FLASHCARD_DECK_PROCESSING", message: "Wait for generation to finish before deleting this deck." } });
    return;
  }
  await AiFlashcardDeckModel.deleteOne({ _id: deckId, userId: request.auth!.userId });
  if (deck.sourceFile) {
    await deleteStoredFile({
      databaseFileId: deck.sourceFile.databaseFileId,
      publicId: deck.sourceFile.publicId,
      resourceType: "raw",
      deliveryType: "authenticated",
    });
  }
  response.status(204).end();
};
