import type { RequestHandler } from "express";
import { AttemptModel } from "../models/attempt.model.js";
import { EnrollmentModel } from "../models/enrollment.model.js";
import { ProgressModel } from "../models/progress.model.js";
import { QuizModel } from "../models/quiz.model.js";
import { SubjectModel } from "../models/subject.model.js";
import { TopicModel } from "../models/topic.model.js";
import { UserModel } from "../models/user.model.js";
import { buildSubjectReport } from "../services/report.service.js";
import { objectIdSchema } from "../validators/subject.validators.js";
import { reportQuerySchema } from "../validators/report.validators.js";

export const readSubjectReport: RequestHandler = async (request, response) => {
  const subjectId = objectIdSchema.parse(request.params.subjectId);
  const query = reportQuerySchema.parse(request.query);
  const subject = await SubjectModel.findOne({
    _id: subjectId,
    facultyId: request.auth!.userId,
    isArchived: false,
  }).select("_id name code term academicYear themeColor").lean();
  if (!subject) {
    response.status(404).json({ error: { code: "SUBJECT_NOT_FOUND", message: "Subject not found" } });
    return;
  }

  const [topics, enrollments] = await Promise.all([
    TopicModel.find({ subjectId, isArchived: false, isPublished: true })
      .sort({ order: 1 })
      .select("_id title order quizId")
      .lean(),
    EnrollmentModel.find({ subjectId, status: "active" }).select("studentId").lean(),
  ]);
  const studentIds = enrollments.map(({ studentId }) => studentId);
  const topicIds = topics.map(({ _id }) => _id);
  const quizIds = topics.flatMap(({ quizId }) => quizId ? [quizId] : []);
  const [students, quizzes, progress] = await Promise.all([
    UserModel.find({ _id: { $in: studentIds }, role: "student", isActive: true })
      .select("firstName lastName username")
      .lean(),
    QuizModel.find({ _id: { $in: quizIds }, isPublished: true }).select("_id title scorePolicy").lean(),
    ProgressModel.find({ studentId: { $in: studentIds }, subjectId, topicId: { $in: topicIds } })
      .select("studentId topicId isCompleted lastLessonAccessAt")
      .lean(),
  ]);
  const quizById = new Map(quizzes.map((quiz) => [String(quiz._id), quiz]));
  const attempts = await AttemptModel.find({
    studentId: { $in: studentIds },
    topicId: { $in: topicIds },
    quizId: { $in: quizzes.map(({ _id }) => _id) },
    status: { $in: ["submitted", "expired"] },
  }).select("studentId topicId score submittedAt").lean();
  const report = buildSubjectReport(
    topics.map((topic) => {
      const quiz = topic.quizId ? quizById.get(String(topic.quizId)) : undefined;
      return {
        id: String(topic._id),
        title: topic.title,
        order: topic.order,
        quizTitle: quiz?.title ?? null,
        scorePolicy: quiz?.scorePolicy ?? "best",
      };
    }),
    students.map((student) => ({
      id: String(student._id),
      firstName: student.firstName,
      lastName: student.lastName,
      username: student.username,
    })),
    attempts.map((attempt) => ({
      studentId: String(attempt.studentId),
      topicId: String(attempt.topicId),
      score: attempt.score === null ? null : Number(attempt.score),
      submittedAt: attempt.submittedAt ?? null,
    })),
    progress.map((item) => ({
      studentId: String(item.studentId),
      topicId: String(item.topicId),
      isCompleted: item.isCompleted,
      lastLessonAccessAt: item.lastLessonAccessAt ?? null,
    })),
    query,
  );
  response.json({
    data: {
      subject,
      generatedAt: new Date().toISOString(),
      ...report,
    },
  });
};
