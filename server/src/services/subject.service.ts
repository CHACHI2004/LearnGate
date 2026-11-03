import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { EnrollmentModel } from "../models/enrollment.model.js";
import { SubjectModel } from "../models/subject.model.js";
import { TopicModel } from "../models/topic.model.js";
import { UserModel } from "../models/user.model.js";

function createJoinCode() {
  return randomBytes(6).toString("base64url").replace(/[-_]/g, "A").slice(0, 8).toUpperCase();
}

export async function createSubject(input: {
  name: string;
  code: string;
  description: string;
  term: string;
  academicYear: string;
  themeColor: string;
}, facultyId: mongoose.Types.ObjectId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await SubjectModel.create({ ...input, facultyId, joinCode: createJoinCode() });
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000)) throw error;
      const duplicateField = "keyPattern" in error && typeof error.keyPattern === "object"
        && error.keyPattern !== null && "joinCode" in error.keyPattern;
      if (!duplicateField || attempt === 4) throw error;
    }
  }
  throw new Error("Unable to generate a unique subject join code");
}

export async function listForUser(userId: mongoose.Types.ObjectId, role: string) {
  if (role === "faculty") {
    return SubjectModel.find({ facultyId: userId, isArchived: false }).sort({ updatedAt: -1 }).lean();
  }
  const enrollments = await EnrollmentModel.find({ studentId: userId, status: "active" }).select("subjectId").lean();
  const subjectIds = enrollments.map(({ subjectId }) => subjectId);
  const subjects = await SubjectModel.find({ _id: { $in: subjectIds }, isArchived: false }).sort({ updatedAt: -1 }).lean();
  const facultyIds = [...new Set(subjects.map(({ facultyId }) => String(facultyId)))];
  const faculty = await UserModel.find({ _id: { $in: facultyIds } }).select("firstName lastName").lean();
  const facultyById = new Map(faculty.map(({ _id, firstName, lastName }) => [String(_id), `${firstName} ${lastName}`]));
  return subjects.map((subject) => ({
    ...subject,
    facultyName: facultyById.get(String(subject.facultyId)) ?? "Faculty",
  }));
}

export async function rotateJoinCode(subjectId: mongoose.Types.ObjectId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const joinCode = createJoinCode();
    try {
      const subject = await SubjectModel.findByIdAndUpdate(subjectId, { $set: { joinCode } }, { new: true });
      return subject;
    } catch (error) {
      if (!(typeof error === "object" && error !== null && "code" in error && error.code === 11000) || attempt === 4) throw error;
    }
  }
  throw new Error("Unable to generate a unique subject join code");
}

export async function reorderSubjectTopics(subjectId: mongoose.Types.ObjectId, topicIds: string[]) {
  const topics = await TopicModel.find({ subjectId, isArchived: false }).select("_id order").lean();
  const currentIds = new Set(topics.map(({ _id }) => String(_id)));
  if (topics.length !== topicIds.length || topicIds.some((id) => !currentIds.has(id)) || new Set(topicIds).size !== topicIds.length) {
    return false;
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await TopicModel.bulkWrite(topicIds.map((id, order) => ({
        updateOne: { filter: { _id: id, subjectId }, update: { $set: { order: -(order + 1) } } },
      })), { session });
      for (let order = 0; order < topicIds.length; order++) {
        await TopicModel.updateOne({ _id: topicIds[order], subjectId }, { $set: { order } }, { session });
      }
    });
  } finally {
    await session.endSession();
  }
  return true;
}
