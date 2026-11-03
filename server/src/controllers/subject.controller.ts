import mongoose from "mongoose";
import type { RequestHandler } from "express";
import { EnrollmentModel } from "../models/enrollment.model.js";
import { AttemptModel } from "../models/attempt.model.js";
import { QuizModel } from "../models/quiz.model.js";
import { SubjectModel } from "../models/subject.model.js";
import { TopicModel } from "../models/topic.model.js";
import { UserModel } from "../models/user.model.js";
import { createSubject, listForUser, reorderSubjectTopics, rotateJoinCode } from "../services/subject.service.js";
import { createSubjectSchema, joinSubjectSchema, objectIdSchema, reorderTopicsSchema, updateSubjectSchema } from "../validators/subject.validators.js";

export const listSubjects: RequestHandler = async (request, response) => {
  const subjects = await listForUser(request.auth!.userId, request.auth!.role);
  response.json({ data: subjects });
};

export const readFacultyDashboard: RequestHandler = async (request, response) => {
  const subjects = await SubjectModel.find({ facultyId: request.auth!.userId, isArchived: false })
    .sort({ updatedAt: -1 })
    .select("_id name code term academicYear themeColor")
    .lean();
  const subjectIds = subjects.map(({ _id }) => _id);
  const [enrollments, topics] = await Promise.all([
    EnrollmentModel.find({ subjectId: { $in: subjectIds }, status: "active" }).select("subjectId studentId").lean(),
    TopicModel.find({ subjectId: { $in: subjectIds }, isArchived: false })
      .select("_id subjectId title isPublished quizId")
      .lean(),
  ]);
  const topicIds = topics.map(({ _id }) => _id);
  const quizzes = await QuizModel.find({ topicId: { $in: topicIds } })
    .select("_id topicId title isPublished")
    .lean();
  const publishedQuizzes = quizzes.filter(({ isPublished }) => isPublished);
  const publishedQuizIds = publishedQuizzes.map(({ _id }) => _id);
  const [attemptStats, recentAttempts] = await Promise.all([
    AttemptModel.aggregate<{ count: number; scoredCount: number; averageScore: number | null }>([
      { $match: { quizId: { $in: publishedQuizIds }, status: { $in: ["submitted", "expired"] } } },
      { $group: {
        _id: null,
        count: { $sum: 1 },
        scoredCount: { $sum: { $cond: [{ $ne: ["$score", null] }, 1, 0] } },
        averageScore: { $avg: "$score" },
      } },
    ]),
    AttemptModel.find({ quizId: { $in: publishedQuizIds }, status: { $in: ["submitted", "expired"] } })
      .sort({ startedAt: -1 })
      .limit(8)
      .select("studentId topicId quizId score passed status startedAt submittedAt")
      .lean(),
  ]);
  const studentIds = [...new Set(recentAttempts.map(({ studentId }) => String(studentId)))];
  const [students, subjectsById] = await Promise.all([
    UserModel.find({ _id: { $in: studentIds } }).select("firstName lastName").lean(),
    Promise.resolve(new Map(subjects.map((subject) => [String(subject._id), subject]))),
  ]);
  const studentById = new Map(students.map((student) => [String(student._id), student]));
  const topicById = new Map(topics.map((topic) => [String(topic._id), topic]));
  const quizByTopicId = new Map(quizzes.map((quiz) => [String(quiz.topicId), quiz]));
  const enrollmentCountBySubject = new Map<string, number>();
  const topicStatsBySubject = new Map<string, { publishedTopics: number; draftTopics: number; publishedQuizzes: number; draftQuizzes: number }>();
  for (const enrollment of enrollments) {
    const key = String(enrollment.subjectId);
    enrollmentCountBySubject.set(key, (enrollmentCountBySubject.get(key) ?? 0) + 1);
  }
  for (const topic of topics) {
    const key = String(topic.subjectId);
    const stats = topicStatsBySubject.get(key) ?? { publishedTopics: 0, draftTopics: 0, publishedQuizzes: 0, draftQuizzes: 0 };
    if (topic.isPublished) stats.publishedTopics += 1;
    else stats.draftTopics += 1;
    const quiz = quizByTopicId.get(String(topic._id));
    if (quiz?.isPublished) stats.publishedQuizzes += 1;
    else if (quiz) stats.draftQuizzes += 1;
    topicStatsBySubject.set(key, stats);
  }
  const stats = attemptStats[0];
  response.json({
    data: {
      summary: {
        subjectCount: subjects.length,
        studentCount: enrollments.length,
        publishedTopicCount: topics.filter(({ isPublished }) => isPublished).length,
        draftTopicCount: topics.filter(({ isPublished }) => !isPublished).length,
        publishedQuizCount: publishedQuizzes.length,
        quizAttemptCount: stats?.count ?? 0,
        averageQuizScore: stats?.averageScore === null || stats?.averageScore === undefined
          ? null
          : Math.round(stats.averageScore * 10) / 10,
      },
      subjects: subjects.map((subject) => ({
        ...subject,
        enrollmentCount: enrollmentCountBySubject.get(String(subject._id)) ?? 0,
        ...(topicStatsBySubject.get(String(subject._id)) ?? {
          publishedTopics: 0,
          draftTopics: 0,
          publishedQuizzes: 0,
          draftQuizzes: 0,
        }),
      })),
      recentAttempts: recentAttempts.map((attempt) => {
        const topic = topicById.get(String(attempt.topicId));
        const student = studentById.get(String(attempt.studentId));
        const subject = topic ? subjectsById.get(String(topic.subjectId)) : undefined;
        return {
          attemptId: String(attempt._id),
          subjectId: subject ? String(subject._id) : null,
          subjectName: subject?.name ?? "Subject",
          topicId: String(attempt.topicId),
          topicTitle: topic?.title ?? "Lesson quiz",
          quizTitle: quizByTopicId.get(String(attempt.topicId))?.title ?? "Quiz",
          studentName: student ? `${student.firstName} ${student.lastName}` : "Student",
          score: attempt.score,
          passed: attempt.passed,
          status: attempt.status,
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
        };
      }),
    },
  });
};

export const create: RequestHandler = async (request, response) => {
  const input = createSubjectSchema.parse(request.body);
  const subject = await createSubject(input, request.auth!.userId);
  response.status(201).json({ data: subject });
};

export const readSubject: RequestHandler = async (request, response) => {
  const id = objectIdSchema.parse(request.params.id);
  const subject = await SubjectModel.findOne({ _id: id, isArchived: false }).lean();
  if (!subject) {
    response.status(404).json({ error: { code: "SUBJECT_NOT_FOUND", message: "Subject not found" } });
    return;
  }
  const [faculty, enrollmentCount, topics] = await Promise.all([
    UserModel.findById(subject.facultyId).select("firstName lastName").lean(),
    EnrollmentModel.countDocuments({ subjectId: subject._id, status: "active" }),
    TopicModel.find({ subjectId: subject._id, isPublished: true }).sort({ order: 1 }).select("_id title description order").lean(),
  ]);
  response.json({ data: { ...subject, faculty: faculty ? `${faculty.firstName} ${faculty.lastName}` : null, enrollmentCount, topics } });
};

export const update: RequestHandler = async (request, response) => {
  const id = objectIdSchema.parse(request.params.id);
  const input = updateSubjectSchema.parse(request.body);
  const subject = await SubjectModel.findOneAndUpdate(
    { _id: id, facultyId: request.auth!.userId, isArchived: false },
    { $set: input },
    { new: true, runValidators: true },
  );
  if (!subject) {
    response.status(404).json({ error: { code: "SUBJECT_NOT_FOUND", message: "Subject not found" } });
    return;
  }
  response.json({ data: subject });
};

export const archive: RequestHandler = async (request, response) => {
  const id = objectIdSchema.parse(request.params.id);
  const subject = await SubjectModel.findOneAndUpdate(
    { _id: id, facultyId: request.auth!.userId, isArchived: false },
    { $set: { isArchived: true } },
    { new: true },
  );
  if (!subject) {
    response.status(404).json({ error: { code: "SUBJECT_NOT_FOUND", message: "Subject not found" } });
    return;
  }
  response.status(204).end();
};

export const regenerateJoinCode: RequestHandler = async (request, response) => {
  const id = objectIdSchema.parse(request.params.id);
  const owned = await SubjectModel.exists({ _id: id, facultyId: request.auth!.userId, isArchived: false });
  if (!owned) {
    response.status(404).json({ error: { code: "SUBJECT_NOT_FOUND", message: "Subject not found" } });
    return;
  }
  response.json({ data: await rotateJoinCode(new mongoose.Types.ObjectId(id)) });
};

export const joinSubject: RequestHandler = async (request, response) => {
  const { joinCode } = joinSubjectSchema.parse(request.body);
  const subject = await SubjectModel.findOne({ joinCode, isArchived: false }).select("_id");
  if (!subject) {
    response.status(404).json({ error: { code: "INVALID_JOIN_CODE", message: "No active subject matches that join code" } });
    return;
  }
  const enrollment = await EnrollmentModel.findOneAndUpdate(
    { subjectId: subject._id, studentId: request.auth!.userId },
    { $set: { status: "active", enrolledAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  response.status(200).json({ data: enrollment });
};

export const listPeople: RequestHandler = async (request, response) => {
  const id = objectIdSchema.parse(request.params.id);
  const enrollments = await EnrollmentModel.find({ subjectId: id, status: "active" }).sort({ enrolledAt: 1 }).lean();
  const users = await UserModel.find({ _id: { $in: enrollments.map(({ studentId }) => studentId) } })
    .select("firstName lastName username email").lean();
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  response.json({
    data: enrollments.map(({ _id, studentId, enrolledAt }) => ({
      enrollmentId: _id,
      enrolledAt,
      student: usersById.get(String(studentId)),
    })),
  });
};

export const removePerson: RequestHandler = async (request, response) => {
  const id = objectIdSchema.parse(request.params.id);
  const studentId = objectIdSchema.parse(request.params.studentId);
  const result = await EnrollmentModel.updateOne(
    { subjectId: id, studentId, status: "active" },
    { $set: { status: "removed" } },
  );
  if (result.modifiedCount === 0) {
    response.status(404).json({ error: { code: "ENROLLMENT_NOT_FOUND", message: "Active enrollment not found" } });
    return;
  }
  response.status(204).end();
};

export const reorderTopics: RequestHandler = async (request, response) => {
  const id = objectIdSchema.parse(request.params.id);
  const { topicIds } = reorderTopicsSchema.parse(request.body);
  const reordered = await reorderSubjectTopics(new mongoose.Types.ObjectId(id), topicIds);
  if (!reordered) {
    response.status(400).json({ error: { code: "INVALID_TOPIC_ORDER", message: "Provide every topic in this subject exactly once" } });
    return;
  }
  response.json({ data: { message: "Topic sequence updated" } });
};
