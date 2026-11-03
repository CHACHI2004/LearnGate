import type { RequestHandler } from "express";
import { z } from "zod";
import {
  AttemptModel,
  EnrollmentModel,
  ProgressModel,
  SubjectModel,
  TopicModel,
  UserModel,
} from "../models/index.js";
import { publicUser } from "../services/auth.service.js";

const userIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const facultyStatusSchema = z.object({ status: z.enum(["approved", "rejected"]) }).strict();
const accountStatusSchema = z.object({ isActive: z.boolean() }).strict();

function getMonthStart(monthOffset: number, now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));
}

async function monthlyCounts(
  model: typeof UserModel | typeof AttemptModel | typeof ProgressModel,
  dateField: "createdAt" | "submittedAt" | "completedAt",
  start: Date,
) {
  return model.aggregate<{ _id: string; count: number }>([
    { $match: { [dateField]: { $gte: start } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: `$${dateField}`, timezone: "UTC" } },
        count: { $sum: 1 },
      },
    },
  ]).option({ maxTimeMS: 5_000 });
}

export const getAnalytics: RequestHandler = async (_request, response) => {
  const now = new Date();
  const chartStart = getMonthStart(-5, now);
  const activityStart = getMonthStart(-6, now);

  const [
    totalUsers,
    activeUsers,
    students,
    faculty,
    admins,
    pendingFaculty,
    activeSubjects,
    archivedSubjects,
    publishedTopics,
    activeEnrollments,
    completedTopics,
    quizAttempts,
    quizResults,
    usersByMonth,
    attemptsByMonth,
    completionsByMonth,
    recentUsers,
    recentSubjects,
    recentEnrollments,
    recentAttempts,
    recentCompletions,
  ] = await Promise.all([
    UserModel.countDocuments().maxTimeMS(5_000),
    UserModel.countDocuments({ isActive: true }).maxTimeMS(5_000),
    UserModel.countDocuments({ role: "student" }).maxTimeMS(5_000),
    UserModel.countDocuments({ role: "faculty" }).maxTimeMS(5_000),
    UserModel.countDocuments({ role: "admin" }).maxTimeMS(5_000),
    UserModel.countDocuments({ role: "faculty", facultyApprovalStatus: "pending" }).maxTimeMS(5_000),
    SubjectModel.countDocuments({ isArchived: false }).maxTimeMS(5_000),
    SubjectModel.countDocuments({ isArchived: true }).maxTimeMS(5_000),
    TopicModel.countDocuments({ isPublished: true, isArchived: false }).maxTimeMS(5_000),
    EnrollmentModel.countDocuments({ status: "active" }).maxTimeMS(5_000),
    ProgressModel.countDocuments({ isCompleted: true }).maxTimeMS(5_000),
    AttemptModel.countDocuments({ status: { $in: ["submitted", "expired"] }, submittedAt: { $ne: null } }).maxTimeMS(5_000),
    AttemptModel.aggregate<{ averageScore: number | null; passed: number }>([
      { $match: { status: { $in: ["submitted", "expired"] }, submittedAt: { $ne: null }, score: { $ne: null } } },
      { $group: { _id: null, averageScore: { $avg: "$score" }, passed: { $sum: { $cond: ["$passed", 1, 0] } } } },
    ]).option({ maxTimeMS: 5_000 }),
    monthlyCounts(UserModel, "createdAt", chartStart),
    monthlyCounts(AttemptModel, "submittedAt", chartStart),
    monthlyCounts(ProgressModel, "completedAt", chartStart),
    UserModel.find({ createdAt: { $gte: activityStart } }).select("role createdAt").sort({ createdAt: -1 }).limit(12).maxTimeMS(5_000).lean(),
    SubjectModel.find({ createdAt: { $gte: activityStart } }).select("name code createdAt").sort({ createdAt: -1 }).limit(12).maxTimeMS(5_000).lean(),
    EnrollmentModel.find({ enrolledAt: { $gte: activityStart } }).select("status enrolledAt").sort({ enrolledAt: -1 }).limit(12).maxTimeMS(5_000).lean(),
    AttemptModel.find({ submittedAt: { $gte: activityStart }, status: { $in: ["submitted", "expired"] } })
      .select("score passed submittedAt").sort({ submittedAt: -1 }).limit(12).maxTimeMS(5_000).lean(),
    ProgressModel.find({ completedAt: { $gte: activityStart }, isCompleted: true })
      .select("completedAt").sort({ completedAt: -1 }).limit(12).maxTimeMS(5_000).lean(),
  ]);

  const result = quizResults[0];
  const monthLabels = Array.from({ length: 6 }, (_, index) => {
    const date = getMonthStart(index - 5, now);
    return {
      key: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date),
    };
  });
  const countsByMonth = (counts: Array<{ _id: string; count: number }>) =>
    new Map(counts.map(({ _id, count }) => [_id, count]));
  const usersTrend = countsByMonth(usersByMonth);
  const attemptsTrend = countsByMonth(attemptsByMonth);
  const completionsTrend = countsByMonth(completionsByMonth);
  const activity = [
    ...recentUsers.map((user) => ({
      id: `user-${user._id}`,
      type: "account" as const,
      label: "Account created",
      detail: `New ${user.role} account`,
      at: user.createdAt,
    })),
    ...recentSubjects.map((subject) => ({
      id: `subject-${subject._id}`,
      type: "subject" as const,
      label: "Subject created",
      detail: `${subject.code} · ${subject.name}`,
      at: subject.createdAt,
    })),
    ...recentEnrollments.map((enrollment) => ({
      id: `enrollment-${enrollment._id}`,
      type: "enrollment" as const,
      label: enrollment.status === "active" ? "Student enrolled" : "Enrollment removed",
      detail: "Subject enrollment",
      at: enrollment.enrolledAt,
    })),
    ...recentAttempts.map((attempt) => ({
      id: `attempt-${attempt._id}`,
      type: "quiz" as const,
      label: attempt.passed ? "Quiz passed" : "Quiz submitted",
      detail: `${attempt.score ?? 0}% score`,
      at: attempt.submittedAt!,
    })),
    ...recentCompletions.map((progress) => ({
      id: `completion-${progress._id}`,
      type: "completion" as const,
      label: "Lesson completed",
      detail: "Student learning progress",
      at: progress.completedAt!,
    })),
  ].sort((left, right) => right.at.getTime() - left.at.getTime()).slice(0, 20);

  response.json({
    data: {
      summary: {
        users: { total: totalUsers, active: activeUsers, students, faculty, admins, pendingFaculty },
        subjects: { active: activeSubjects, archived: archivedSubjects },
        learning: {
          publishedTopics,
          activeEnrollments,
          completedTopics,
          quizAttempts,
          averageQuizScore: result?.averageScore === null || result?.averageScore === undefined
            ? null
            : Math.round(result.averageScore * 10) / 10,
          passRate: quizAttempts ? Math.round(((result?.passed ?? 0) / quizAttempts) * 100) : null,
        },
      },
      trend: monthLabels.map(({ key, label }) => ({
        month: label,
        newAccounts: usersTrend.get(key) ?? 0,
        quizAttempts: attemptsTrend.get(key) ?? 0,
        topicCompletions: completionsTrend.get(key) ?? 0,
      })),
      activity,
      generatedAt: now,
    },
  });
};

export const listUsers: RequestHandler = async (request, response) => {
  const query = z.object({
    role: z.enum(["student", "faculty", "admin"]).optional(),
    approval: z.enum(["pending", "approved", "rejected", "not_required"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }).parse(request.query);
  const filter = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.approval ? { facultyApprovalStatus: query.approval } : {}),
  };
  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .maxTimeMS(5_000)
      .lean(),
    UserModel.countDocuments(filter).maxTimeMS(5_000),
  ]);
  response.json({
    data: users.map(publicUser),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
  });
};

export const setFacultyApproval: RequestHandler = async (request, response) => {
  const userId = userIdSchema.parse(request.params.userId);
  const { status } = facultyStatusSchema.parse(request.body);
  const user = await UserModel.findOneAndUpdate(
    { _id: userId, role: "faculty" },
    { $set: { facultyApprovalStatus: status } },
    { new: true },
  );
  if (!user) {
    response.status(404).json({ error: { code: "FACULTY_NOT_FOUND", message: "Faculty account not found" } });
    return;
  }
  response.json({ data: { user: publicUser(user) } });
};

export const setAccountStatus: RequestHandler = async (request, response) => {
  const userId = userIdSchema.parse(request.params.userId);
  const { isActive } = accountStatusSchema.parse(request.body);
  if (userId === String(request.auth!.userId) && !isActive) {
    response.status(400).json({ error: { code: "CANNOT_DEACTIVATE_SELF", message: "Administrators cannot deactivate their own account" } });
    return;
  }
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: { isActive }, ...(isActive ? {} : { $inc: { authVersion: 1 } }) },
    { new: true },
  );
  if (!user) {
    response.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found" } });
    return;
  }
  response.json({ data: { user: publicUser(user) } });
};
