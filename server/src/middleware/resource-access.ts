import mongoose from "mongoose";
import type { RequestHandler } from "express";
import { EnrollmentModel } from "../models/enrollment.model.js";
import { SubjectModel } from "../models/subject.model.js";
import { TopicModel } from "../models/topic.model.js";
import { ProgressModel } from "../models/progress.model.js";
import { asyncHandler } from "../utils/async-handler.js";

export async function hasSubjectAccess(userId: mongoose.Types.ObjectId, role: string, subjectId: mongoose.Types.ObjectId) {
  if (role === "faculty") {
    return Boolean(await SubjectModel.exists({ _id: subjectId, facultyId: userId, isArchived: false }));
  }
  if (role === "student") {
    return Boolean(await EnrollmentModel.exists({ subjectId, studentId: userId, status: "active" }));
  }
  return false;
}

export const requireSubjectAccess: RequestHandler = asyncHandler(async (request, response, next) => {
  const subjectId = request.params.subjectId ?? request.params.id;
  if (typeof subjectId !== "string" || !mongoose.isValidObjectId(subjectId) || !request.auth) {
    response.status(400).json({ error: { code: "INVALID_SUBJECT", message: "Invalid subject identifier" } });
    return;
  }
  if (!await hasSubjectAccess(request.auth.userId, request.auth.role, new mongoose.Types.ObjectId(subjectId))) {
    response.status(404).json({ error: { code: "SUBJECT_NOT_FOUND", message: "Subject not found" } });
    return;
  }
  next();
});

export async function isTopicUnlocked(studentId: mongoose.Types.ObjectId, topicId: mongoose.Types.ObjectId) {
  const topic = await TopicModel.findOne({ _id: topicId, isArchived: false }).select("subjectId order isPublished").lean();
  if (!topic || !topic.isPublished) return false;
  if (topic.order === 0) return true;
  const previous = await TopicModel.findOne({ subjectId: topic.subjectId, order: topic.order - 1, isArchived: false })
    .select("_id").lean();
  if (!previous) return false;
  return Boolean(await ProgressModel.exists({
    studentId,
    subjectId: topic.subjectId,
    topicId: previous._id,
    isCompleted: true,
  }));
}
