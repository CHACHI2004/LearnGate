import type { RequestHandler } from "express";
import mongoose from "mongoose";
import sanitizeHtml from "sanitize-html";
import { ProgressModel } from "../models/progress.model.js";
import { QuizModel } from "../models/quiz.model.js";
import { SubjectModel } from "../models/subject.model.js";
import { TopicModel } from "../models/topic.model.js";
import { isTopicUnlocked } from "../middleware/resource-access.js";
import { objectIdSchema } from "../validators/subject.validators.js";
import { topicCreateSchema, topicUpdateSchema } from "../validators/topic.validators.js";

function cleanContent(content: string) {
  return sanitizeHtml(content, {
    allowedTags: [
      "h1", "h2", "h3", "p", "strong", "em", "u", "s", "ul", "ol", "li",
      "a", "blockquote", "pre", "code", "br",
    ],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }, true),
    },
  });
}

export const listTopics: RequestHandler = async (request, response) => {
  const subjectId = objectIdSchema.parse(request.params.id);
  const topics = await TopicModel.find({
    subjectId,
    isArchived: false,
    ...(request.auth!.role === "student" ? { isPublished: true } : {}),
  })
    .sort({ order: 1 }).lean();
  if (request.auth!.role !== "student") {
    response.json({ data: topics });
    return;
  }
  const unlocked = new Set<string>();
  for (const topic of topics) {
    const available = topic.order === 0 || (await isTopicUnlocked(request.auth!.userId, topic._id));
    if (available) unlocked.add(String(topic._id));
  }
  const progress = await ProgressModel.find({ studentId: request.auth!.userId, subjectId }).lean();
  const progressByTopic = new Map(progress.map((item) => [String(item.topicId), item]));
  response.json({
    data: topics.map((topic) => ({
      _id: topic._id,
      title: topic.title,
      description: topic.description,
      order: topic.order,
      isPublished: topic.isPublished,
      isUnlocked: unlocked.has(String(topic._id)),
      isCompleted: progressByTopic.get(String(topic._id))?.isCompleted ?? false,
    })),
  });
};

export const createTopic: RequestHandler = async (request, response) => {
  const subjectId = objectIdSchema.parse(request.params.id);
  const input = topicCreateSchema.parse(request.body);
  const nextOrder = await TopicModel.countDocuments({ subjectId, isArchived: false });
  const topic = await TopicModel.create({
    ...input,
    content: cleanContent(input.content),
    subjectId,
    order: nextOrder,
  });
  response.status(201).json({ data: topic });
};

export const readTopic: RequestHandler = async (request, response) => {
  const { id, topicId } = request.params;
  const subjectId = objectIdSchema.parse(id);
  const topicObjectId = objectIdSchema.parse(topicId);
  const topic = await TopicModel.findOne({ _id: topicObjectId, subjectId, isArchived: false }).lean();
  if (!topic || (!topic.isPublished && request.auth!.role === "student")) {
    response.status(404).json({ error: { code: "TOPIC_NOT_FOUND", message: "Topic not found" } });
    return;
  }
  let isCompleted: boolean | undefined;
  let isUnlocked: boolean | undefined;
  let hasQuiz: boolean | undefined;
  let publishedQuizId: string | null | undefined;
  if (request.auth!.role === "student") {
    if (!await isTopicUnlocked(request.auth!.userId, topic._id)) {
      response.status(403).json({ error: { code: "TOPIC_LOCKED", message: "Complete the previous topic to unlock this lesson" } });
      return;
    }
    isUnlocked = true;
    const progress = await ProgressModel.findOneAndUpdate(
      { studentId: request.auth!.userId, subjectId, topicId: topic._id },
      { $set: { lastLessonAccessAt: new Date() }, $setOnInsert: { isCompleted: false } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    isCompleted = progress.isCompleted;
    const quiz = topic.quizId
      ? await QuizModel.findById(topic.quizId).select("_id isPublished").lean()
      : null;
    hasQuiz = Boolean(quiz);
    publishedQuizId = quiz?.isPublished ? String(quiz._id) : null;
  }
  response.json({
    data: {
      ...topic,
      ...(isCompleted === undefined ? {} : { isCompleted }),
      ...(request.auth!.role === "student" ? { isUnlocked, hasQuiz, quizId: publishedQuizId } : {}),
      content: cleanContent(topic.content),
      attachments: topic.attachments.map((attachment) => ({
        _id: attachment._id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        url: `/uploads/subjects/${subjectId}/topics/${topic._id}/attachments/${attachment._id}`,
      })),
    },
  });
};

export const completeTopic: RequestHandler = async (request, response) => {
  const subjectId = objectIdSchema.parse(request.params.id);
  const topicId = objectIdSchema.parse(request.params.topicId);
  const topic = await TopicModel.findOne({
    _id: topicId,
    subjectId,
    isArchived: false,
    isPublished: true,
  }).select("_id quizId").lean();
  if (!topic) {
    response.status(404).json({ error: { code: "TOPIC_NOT_FOUND", message: "Topic not found" } });
    return;
  }
  if (!await isTopicUnlocked(request.auth!.userId, topic._id)) {
    response.status(403).json({ error: { code: "TOPIC_LOCKED", message: "Complete the previous topic to unlock this lesson" } });
    return;
  }
  const existingProgress = await ProgressModel.findOne({
    studentId: request.auth!.userId,
    subjectId,
    topicId: topic._id,
  }).lean();
  if (existingProgress?.isCompleted) {
    response.json({ data: existingProgress });
    return;
  }
  if (!existingProgress?.lastLessonAccessAt) {
    response.status(409).json({ error: { code: "LESSON_NOT_ACCESSED", message: "Open the lesson before marking it complete" } });
    return;
  }
  if (topic.quizId && await QuizModel.exists({ _id: topic.quizId, isPublished: true })) {
    response.status(409).json({ error: { code: "QUIZ_REQUIRED", message: "Pass this topic's quiz to mark it complete" } });
    return;
  }
  const completedAt = new Date();
  const progress = await ProgressModel.findOneAndUpdate(
    { studentId: request.auth!.userId, subjectId, topicId: topic._id },
    { $set: { isCompleted: true, completedAt } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  response.json({ data: progress });
};

export const updateTopic: RequestHandler = async (request, response) => {
  const { id, topicId } = request.params;
  const subjectId = objectIdSchema.parse(id);
  const input = topicUpdateSchema.parse(request.body);
  const sanitized = input.content === undefined ? input : { ...input, content: cleanContent(input.content) };
  const topic = await TopicModel.findOneAndUpdate(
    { _id: objectIdSchema.parse(topicId), subjectId, isArchived: false },
    { $set: sanitized },
    { new: true, runValidators: true },
  );
  if (!topic) {
    response.status(404).json({ error: { code: "TOPIC_NOT_FOUND", message: "Topic not found" } });
    return;
  }
  response.json({ data: topic });
};

export const deleteTopic: RequestHandler = async (request, response) => {
  const { id, topicId } = request.params;
  const subjectId = objectIdSchema.parse(id);
  const targetId = objectIdSchema.parse(topicId);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const target = await TopicModel.findOne({ _id: targetId, subjectId, isArchived: false }).session(session);
      if (!target) return;
      await TopicModel.updateOne({ _id: targetId, subjectId }, { $set: { isArchived: true } }, { session });
      const laterTopics = await TopicModel.find({ subjectId, isArchived: false, order: { $gt: target.order } })
        .sort({ order: 1 }).select("_id").session(session);
      await TopicModel.bulkWrite(laterTopics.map((topic, index) => ({
        updateOne: { filter: { _id: topic._id }, update: { $set: { order: -(index + 1) } } },
      })), { session });
      await TopicModel.bulkWrite(laterTopics.map((topic, index) => ({
        updateOne: { filter: { _id: topic._id }, update: { $set: { order: target.order + index } } },
      })), { session });
    });
  } finally {
    await session.endSession();
  }
  response.status(204).end();
};

export async function assertSubjectOwner(subjectId: string, userId: mongoose.Types.ObjectId) {
  return Boolean(await SubjectModel.exists({ _id: subjectId, facultyId: userId, isArchived: false }));
}
