import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { AiGenerationJobModel } from "../models/ai-generation-job.model.js";
import { AiFlashcardDeckModel } from "../models/ai-flashcard-deck.model.js";
import { QuizModel } from "../models/quiz.model.js";
import { TopicModel } from "../models/topic.model.js";
import { DocumentExtractionError, extractDocument } from "../services/document-extraction.js";
import { generateQuizQuestions, QuestionGenerationError } from "../services/ai-question-generator.js";
import { monthKey, readMonthlyGenerationQuota, refundMonthlyGeneration, reserveMonthlyGeneration, setGenerationStatus } from "../services/ai-quota.service.js";
import { deleteStoredFile, storeFileInBoth } from "../services/file-storage.service.js";
import { generationOptionsSchema } from "../validators/ai-generation.validators.js";
import { objectIdSchema } from "../validators/subject.validators.js";

const activeStatuses = ["queued", "extracting", "generating"] as const;
export const aiGenerationRateLimit = rateLimit({
  windowMs: env.AI_RATE_LIMIT_WINDOW_MS,
  limit: env.AI_RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export const receiveAiDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.DOCUMENT_MAX_SIZE_MB * 1024 * 1024, files: 1 },
}).single("file");

function safeErrorMessage(error: unknown) {
  if (error instanceof DocumentExtractionError || error instanceof QuestionGenerationError) return error.message;
  return "The document could not be processed. Check its format and try again.";
}

async function runGeneration(jobId: mongoose.Types.ObjectId, buffer: Buffer) {
  const job = await AiGenerationJobModel.findById(jobId);
  if (!job) return;
  const month = monthKey(job.createdAt);
  try {
    job.status = "extracting";
    job.progress = 12;
    job.message = "Reading pages and slides";
    await job.save();

    const units = await extractDocument(buffer, job.fileType);
    if (units.length < 1) throw new DocumentExtractionError("No readable pages or slides were found.");

    job.status = "generating";
    job.progress = 38;
    job.message = `Preparing ${units.length} source ${job.fileType === "pdf" ? "pages" : "slides"}`;
    await job.save();

    const generated = await generateQuizQuestions(units, {
      questionCount: job.questionCount,
      difficulty: job.difficulty,
      questionType: job.questionType,
      prompt: job.prompt,
    });
    job.questions = generated.map((question) => {
      const choices = question.type === "mcq"
        ? question.choices.map((text) => ({ id: randomUUID(), text }))
        : [];
      return {
        type: question.type,
        questionText: question.questionText,
        choices,
        correctAnswer: question.type === "mcq"
          ? choices[question.correctChoiceIndex].id
          : question.correctAnswer,
        explanation: question.explanation,
        points: 1,
        sourceReference: question.sourceReference,
      };
    }) as typeof job.questions;
    job.status = "review";
    job.progress = 100;
    job.message = "Questions are ready to review";
    job.completedAt = new Date();
    job.errorMessage = null;
    await job.save();
    await setGenerationStatus(job.userId, "succeeded", month);
  } catch (error) {
    const message = safeErrorMessage(error);
    job.status = "failed";
    job.progress = 100;
    job.message = "Generation could not be completed";
    job.errorMessage = message;
    job.completedAt = new Date();
    await job.save();
    await refundMonthlyGeneration(job.userId, month);
    await setGenerationStatus(job.userId, "failed", month);
    const reason = error instanceof Error ? error.name : "UnknownError";
    console.error(`AI question generation failed for job ${job._id}: ${reason} — ${message}`);
  }
}

export const requireAiProvider: RequestHandler = (_request, response, next) => {
  if (!env.GROQ_API_KEY) {
    response.status(503).json({
      error: { code: "AI_NOT_CONFIGURED", message: "AI generation is unavailable. Configure GROQ_API_KEY on the server." },
    });
    return;
  }
  next();
};

export const startAiGeneration: RequestHandler = async (request, response, next) => {
  try {
      const subjectId = objectIdSchema.parse(request.params.id);
      const topicId = objectIdSchema.parse(request.params.topicId);
      const topic = await TopicModel.findOne({ _id: topicId, subjectId, isArchived: false }).select("_id").lean();
      if (!topic) {
        response.status(404).json({ error: { code: "TOPIC_NOT_FOUND", message: "Topic not found" } });
        return;
      }
      if (!request.file) {
        response.status(400).json({ error: { code: "FILE_REQUIRED", message: "Choose a PDF or PPTX file" } });
        return;
      }
      const file = request.file;
      const extension = file.originalname.split(".").pop()?.toLowerCase();
      const detectedType = await fileTypeFromBuffer(file.buffer);
      const fileType = extension === "pdf" && detectedType?.mime === "application/pdf"
        ? "pdf"
        : extension === "pptx"
          && file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
          ? "pptx"
          : null;
      if (!fileType) {
        response.status(400).json({ error: { code: "UNSUPPORTED_FILE", message: "Upload a valid PDF or PowerPoint presentation (.pptx)" } });
        return;
      }
      const options = generationOptionsSchema.parse({
        questionCount: request.body.questionCount ? Number(request.body.questionCount) : undefined,
        difficulty: request.body.difficulty || undefined,
        questionType: request.body.questionType || undefined,
        prompt: request.body.prompt || undefined,
      });

      const [activeJob, activeFlashcardDeck] = await Promise.all([
        AiGenerationJobModel.exists({ userId: request.auth!.userId, status: { $in: activeStatuses } }),
        AiFlashcardDeckModel.exists({ userId: request.auth!.userId, status: { $in: ["queued", "extracting", "generating"] } }),
      ]);
      if (activeJob || activeFlashcardDeck) {
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
      let storedFile;
      let job;
      try {
        storedFile = await storeFileInBoth({
          buffer: file.buffer,
          fileName,
          mimeType: fileType === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          folder: "learngate/quiz-sources",
          resourceType: "raw",
          authenticated: true,
        });
        job = await AiGenerationJobModel.create({
          userId: request.auth!.userId,
          subjectId,
          topicId,
          status: "queued",
          progress: 0,
          message: "Waiting to process your document",
          fileName,
          fileType,
          sourceFile: storedFile,
          questionCount: options.questionCount,
          difficulty: options.difficulty,
          questionType: options.questionType,
          prompt: options.prompt,
        });
      } catch (error) {
        if (storedFile) await deleteStoredFile(storedFile);
        await refundMonthlyGeneration(request.auth!.userId, usage.month);
        await setGenerationStatus(request.auth!.userId, "failed");
        throw error;
      }

      const documentBuffer = Buffer.from(file.buffer);
      response.status(202).json({
        data: {
          jobId: String(job._id),
          status: job.status,
          quota: { used: usage.used, limit: usage.limit, remaining: Math.max(0, usage.limit - usage.used) },
        },
      });
      setImmediate(() => {
        void runGeneration(job._id, documentBuffer).catch(async (error: unknown) => {
          console.error(`Could not persist AI generation state for job ${job._id}:`, error);
          await AiGenerationJobModel.updateOne(
            { _id: job._id },
            { $set: { status: "failed", progress: 100, message: "Generation could not be completed", errorMessage: "The document could not be processed. Try again.", completedAt: new Date() } },
          );
          await setGenerationStatus(job.userId, "failed", monthKey(job.createdAt));
        });
      });
  } catch (error) {
    next(error);
  }
};

export const readAiGenerationJob: RequestHandler = async (request, response) => {
  const subjectId = objectIdSchema.parse(request.params.id);
  const jobId = objectIdSchema.parse(request.params.jobId);
  const job = await AiGenerationJobModel.findOne({
    _id: jobId,
    userId: request.auth!.userId,
    subjectId,
  }).select("+questions +questions.correctAnswer").lean();
  if (!job) {
    response.status(404).json({ error: { code: "AI_JOB_NOT_FOUND", message: "Generation job not found" } });
    return;
  }
  const quota = await readMonthlyGenerationQuota(job.userId, monthKey(job.createdAt));
  response.json({
    data: {
      jobId: String(job._id),
      status: job.status,
      progress: job.progress,
      message: job.message,
      fileName: job.fileName,
      questionCount: job.questionCount,
      difficulty: job.difficulty,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      quota: {
        ...quota,
      },
      ...(job.status === "review" ? { questions: job.questions } : {}),
    },
  });
};

export const readAiQuota: RequestHandler = async (request, response) => {
  response.json({ data: await readMonthlyGenerationQuota(request.auth!.userId) });
};

export async function markInterruptedAiJobsFailed() {
  await AiGenerationJobModel.updateMany(
    { status: { $in: activeStatuses } },
    {
      $set: {
        status: "failed",
        progress: 100,
        message: "Generation stopped when the server restarted",
        errorMessage: "The server restarted before generation finished. Please submit the document again.",
        completedAt: new Date(),
      },
    },
  );
  await AiFlashcardDeckModel.updateMany(
    { status: { $in: activeStatuses } },
    {
      $set: {
        status: "failed",
        progress: 100,
        message: "Generation stopped when the server restarted",
        errorMessage: "The server restarted before generation finished. Please submit the presentation again.",
        completedAt: new Date(),
      },
    },
  );
}

export const saveAiDraft: RequestHandler = async (request, response) => {
  const subjectId = objectIdSchema.parse(request.params.id);
  const topicId = objectIdSchema.parse(request.params.topicId);
  const jobId = objectIdSchema.parse(request.params.jobId);
  const job = await AiGenerationJobModel.findOne({
    _id: jobId,
    userId: request.auth!.userId,
    subjectId,
    topicId,
    status: "review",
  }).select("fileName sourceFile").lean();
  if (!job) {
    response.status(404).json({ error: { code: "AI_JOB_NOT_FOUND", message: "Review-ready generation job not found" } });
    return;
  }
  const quiz = await QuizModel.findOne({ topicId }).select("_id").lean();
  if (!quiz) {
    response.status(409).json({ error: { code: "QUIZ_NOT_SAVED", message: "Save the reviewed questions from the quiz editor first." } });
    return;
  }
  const updated = await QuizModel.updateOne(
    { _id: quiz._id, createdBy: request.auth!.userId },
    { $set: { aiGenerated: true, sourceFile: { ...job.sourceFile, fileName: job.fileName } } },
  );
  if (updated.matchedCount !== 1) {
    response.status(404).json({ error: { code: "QUIZ_NOT_FOUND", message: "Quiz not found" } });
    return;
  }
  response.json({ data: { saved: true } });
};
