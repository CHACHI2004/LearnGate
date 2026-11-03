import type { RequestHandler } from "express";
import mongoose from "mongoose";
import { AttemptModel } from "../models/attempt.model.js";
import { EnrollmentModel } from "../models/enrollment.model.js";
import { ProgressModel } from "../models/progress.model.js";
import { QuestionModel } from "../models/question.model.js";
import { QuizModel } from "../models/quiz.model.js";
import { SubjectModel } from "../models/subject.model.js";
import { TopicModel } from "../models/topic.model.js";
import { isTopicUnlocked } from "../middleware/resource-access.js";
import { gradeQuizAnswers } from "../services/quiz-grading.js";
import { sendQuizResultNotifications } from "../services/quiz-result-email.service.js";
import { objectIdSchema } from "../validators/subject.validators.js";
import { saveQuizSchema, submitAttemptSchema } from "../validators/quiz.validators.js";

type QuestionDocument = {
  _id: mongoose.Types.ObjectId;
  type: "mcq" | "true_false" | "identification";
  questionText: string;
  choices: Array<{ id: string; text: string }>;
  correctAnswer: string | boolean;
  explanation: string;
  points: number;
  sourceReference?: { kind: "slide" | "page"; number: number };
};

function shuffle<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function sendError(response: Parameters<RequestHandler>[1], status: number, code: string, message: string) {
  response.status(status).json({ error: { code, message } });
}

async function findAccessibleTopic(subjectId: string, topicId: string, studentId?: mongoose.Types.ObjectId) {
  const topic = await TopicModel.findOne({
    _id: topicId,
    subjectId,
    isArchived: false,
    ...(studentId ? { isPublished: true } : {}),
  }).lean();
  if (!topic) return { error: "not_found" as const };
  if (studentId && !await isTopicUnlocked(studentId, topic._id)) return { error: "locked" as const };
  return { topic };
}

async function getTopicQuiz(topicId: mongoose.Types.ObjectId) {
  const topic = await TopicModel.findById(topicId).select("quizId").lean();
  if (!topic?.quizId) return null;
  return QuizModel.findById(topic.quizId).lean();
}

function attemptQuestionPayload(question: QuestionDocument, choiceIds?: string[]) {
  const choices = choiceIds
    ? [...question.choices].sort((a, b) => choiceIds.indexOf(a.id) - choiceIds.indexOf(b.id))
    : question.choices;
  return {
    _id: String(question._id),
    type: question.type,
    questionText: question.questionText,
    choices,
    points: question.points,
    ...(question.sourceReference ? { sourceReference: question.sourceReference } : {}),
  };
}

function reviewPayload(
  questions: QuestionDocument[],
  answers: Array<{ questionId: mongoose.Types.ObjectId; value: unknown }>,
  details: Array<{ questionId: mongoose.Types.ObjectId; isCorrect: boolean; pointsEarned: number }>,
  showCorrectAnswers: boolean,
) {
  const answerById = new Map(answers.map((answer) => [String(answer.questionId), answer.value]));
  const detailById = new Map(details.map((detail) => [String(detail.questionId), detail]));
  return questions.map((question) => {
    const detail = detailById.get(String(question._id));
    return {
      ...attemptQuestionPayload(question),
      answer: answerById.get(String(question._id)) ?? null,
      isCorrect: detail?.isCorrect ?? false,
      pointsEarned: detail?.pointsEarned ?? 0,
      ...(showCorrectAnswers
        ? { correctAnswer: question.correctAnswer, explanation: question.explanation }
        : {}),
    };
  });
}

async function finalizeAttempt(
  attempt: InstanceType<typeof AttemptModel>,
  questions: QuestionDocument[],
  submittedAt: Date,
  expired: boolean,
) {
  const answers = attempt.answers as Array<{ questionId: mongoose.Types.ObjectId; value: unknown }>;
  const grade = gradeQuizAnswers(questions, answers);
  const detailById = new Map(grade.details.map((detail) => [String(detail.questionId), detail]));

  const totalPoints = Number(attempt.totalPoints);
  const score = totalPoints === 0 ? 0 : Math.round((grade.earnedPoints / totalPoints) * 10000) / 100;
  attempt.score = score;
  attempt.correctCount = grade.correctCount;
  attempt.incorrectCount = questions.length - grade.correctCount;
  attempt.passed = score >= Number(attempt.passingScoreAtSubmission);
  attempt.durationSeconds = Math.max(0, Math.floor(
    (Math.min(submittedAt.getTime(), attempt.expiresAt.getTime()) - attempt.startedAt.getTime()) / 1000,
  ));
  attempt.submittedAt = submittedAt;
  attempt.status = expired ? "expired" : "submitted";
  attempt.resultDetails = attempt.questionOrder.map((questionId) => detailById.get(String(questionId))!) as typeof attempt.resultDetails;
  await attempt.save();

  if (attempt.passed) {
    await recordTopicCompletion(attempt, submittedAt);
  } else {
    await recordTopicFailure(attempt);
  }
  return attempt;
}

async function recordTopicFailure(attempt: InstanceType<typeof AttemptModel>) {
  if (await AttemptModel.exists({ quizId: attempt.quizId, studentId: attempt.studentId, passed: true })) return;
  const topic = await TopicModel.findById(attempt.topicId).select("subjectId").lean();
  if (!topic) throw new Error("Cannot record quiz failure because its topic no longer exists");
  await ProgressModel.findOneAndUpdate(
    { studentId: attempt.studentId, subjectId: topic.subjectId, topicId: attempt.topicId },
    { $set: { isCompleted: false, completedAt: null, lastPassedAt: null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function recordTopicCompletion(attempt: InstanceType<typeof AttemptModel>, completedAt: Date) {
  const topic = await TopicModel.findById(attempt.topicId).select("subjectId").lean();
  if (!topic) throw new Error("Cannot record quiz completion because its topic no longer exists");
  await ProgressModel.findOneAndUpdate(
    { studentId: attempt.studentId, subjectId: topic.subjectId, topicId: attempt.topicId },
    { $set: { isCompleted: true, completedAt, lastPassedAt: completedAt } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function loadAttemptQuestions(attempt: InstanceType<typeof AttemptModel>) {
  const ids = attempt.questionOrder;
  const questions = await QuestionModel.find({ _id: { $in: ids } }).select("+correctAnswer").lean<QuestionDocument[]>();
  const byId = new Map(questions.map((question) => [String(question._id), question]));
  return ids.map((id) => byId.get(String(id))).filter((question): question is QuestionDocument => Boolean(question));
}

function attemptSummary(attempt: InstanceType<typeof AttemptModel>) {
  return {
    _id: String(attempt._id),
    status: attempt.status,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt,
    score: attempt.score,
    passed: attempt.passed,
    correctCount: attempt.correctCount,
    incorrectCount: attempt.incorrectCount,
    durationSeconds: attempt.durationSeconds,
    totalPoints: attempt.totalPoints,
  };
}

export const readQuiz: RequestHandler = async (request, response) => {
  const subjectId = objectIdSchema.parse(request.params.id);
  const topicId = objectIdSchema.parse(request.params.topicId);
  const studentId = request.auth!.role === "student" ? request.auth!.userId : undefined;
  const result = await findAccessibleTopic(subjectId, topicId, studentId);
  if ("error" in result) {
    sendError(response, result.error === "locked" ? 403 : 404, result.error === "locked" ? "TOPIC_LOCKED" : "TOPIC_NOT_FOUND",
      result.error === "locked" ? "Complete the previous topic to unlock this lesson" : "Topic not found");
    return;
  }
  const quiz = await getTopicQuiz(result.topic._id);
  if (!quiz && !studentId) {
    response.json({ data: null });
    return;
  }
  if (!quiz || (studentId && !quiz.isPublished)) {
    sendError(response, 404, "QUIZ_NOT_FOUND", "Quiz not found");
    return;
  }

  const questions = await QuestionModel.find({ _id: { $in: quiz.questionIds } })
    .select(studentId ? "-correctAnswer" : "+correctAnswer")
    .lean();
  const orderedQuestions = quiz.questionIds.map((id) => questions.find((question) => String(question._id) === String(id)))
    .filter((question) => question !== undefined);
  if (!studentId) {
    response.json({ data: { ...quiz, questions: orderedQuestions } });
    return;
  }
  const attempts = await AttemptModel.find({ quizId: quiz._id, studentId }).sort({ startedAt: -1 }).limit(50);
  const now = new Date();
  for (const attempt of attempts) {
    if (attempt.status !== "active" || attempt.expiresAt.getTime() > now.getTime()) continue;
    const expiredQuestions = await loadAttemptQuestions(attempt);
    if (expiredQuestions.length !== attempt.questionOrder.length) continue;
    await finalizeAttempt(attempt, expiredQuestions, now, true);
  }
  const hasPassedAttempt = Boolean(await AttemptModel.exists({
    quizId: quiz._id,
    studentId,
    passed: true,
  }));
  response.json({
    data: {
      _id: String(quiz._id),
      title: quiz.title,
      description: quiz.description,
      timeLimitSeconds: quiz.timeLimitSeconds,
      passingScore: quiz.passingScore,
      questionCount: quiz.questionIds.length,
      hasPassedAttempt,
      attempts: attempts.map((attempt) => ({
        _id: String(attempt._id),
        status: attempt.status,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt,
        submittedAt: attempt.submittedAt,
        score: attempt.score,
        passed: attempt.passed,
      })),
    },
  });
};

export const saveQuiz: RequestHandler = async (request, response) => {
  const subjectId = objectIdSchema.parse(request.params.id);
  const topicId = objectIdSchema.parse(request.params.topicId);
  const result = await findAccessibleTopic(subjectId, topicId);
  if ("error" in result) {
    sendError(response, 404, "TOPIC_NOT_FOUND", "Topic not found");
    return;
  }
  const input = saveQuizSchema.parse(request.body);
  const existingQuiz = await QuizModel.findOne({ topicId: result.topic._id }).select("questionIds").lean();
  const oldQuestionIds = existingQuiz?.questionIds ?? [];
  const quiz = await QuizModel.findOneAndUpdate(
    { topicId: result.topic._id },
    {
      $set: {
        title: input.title,
        description: input.description,
        timeLimitSeconds: input.timeLimitSeconds,
        passingScore: input.passingScore,
        scorePolicy: input.scorePolicy,
        shuffleQuestions: input.shuffleQuestions,
        shuffleChoices: input.shuffleChoices,
        showCorrectAnswers: input.showCorrectAnswers,
        isPublished: input.isPublished,
      },
      $setOnInsert: { topicId: result.topic._id, createdBy: request.auth!.userId },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  const questionDocs = input.questions.map((question) => ({
    ...question,
    quizId: quiz._id,
    choices: question.type === "mcq" ? question.choices : [],
  }));
  const createdQuestions = questionDocs.length
    ? await QuestionModel.create(questionDocs)
    : [];
  quiz.questionIds = createdQuestions.map((question) => question._id);
  await quiz.save();
  await TopicModel.updateOne({ _id: result.topic._id }, { $set: { quizId: quiz._id } });

  const liveQuestionIds = createdQuestions.map((question) => question._id);
  const obsoleteIds = oldQuestionIds.filter((oldId) => !liveQuestionIds.some((id) => id.equals(oldId)));
  if (obsoleteIds.length > 0) {
    const referenced = await AttemptModel.distinct("questionOrder", { quizId: quiz._id, questionOrder: { $in: obsoleteIds } });
    const retainedIds = new Set(referenced.map(String));
    await QuestionModel.deleteMany({ _id: { $in: obsoleteIds.filter((id) => !retainedIds.has(String(id))) } });
  }
  response.json({ data: { ...quiz.toObject(), questions: createdQuestions } });
};

export const startAttempt: RequestHandler = async (request, response) => {
  const subjectId = objectIdSchema.parse(request.params.id);
  const topicId = objectIdSchema.parse(request.params.topicId);
  const result = await findAccessibleTopic(subjectId, topicId, request.auth!.userId);
  if ("error" in result) {
    sendError(response, result.error === "locked" ? 403 : 404, result.error === "locked" ? "TOPIC_LOCKED" : "TOPIC_NOT_FOUND",
      result.error === "locked" ? "Complete the previous topic to unlock this lesson" : "Topic not found");
    return;
  }
  const lessonAccessed = await ProgressModel.exists({
    studentId: request.auth!.userId,
    subjectId,
    topicId: result.topic._id,
    lastLessonAccessAt: { $ne: null },
  });
  if (!lessonAccessed) {
    sendError(response, 409, "LESSON_NOT_ACCESSED", "Open the lesson before starting its quiz");
    return;
  }
  const quiz = await getTopicQuiz(result.topic._id);
  if (!quiz || !quiz.isPublished || quiz.questionIds.length === 0) {
    sendError(response, 404, "QUIZ_NOT_FOUND", "Quiz not found");
    return;
  }
  const now = new Date();
  const existing = await AttemptModel.findOne({ quizId: quiz._id, studentId: request.auth!.userId, status: "active" });
  if (existing && existing.expiresAt.getTime() > now.getTime()) {
    const questions = await loadAttemptQuestions(existing);
    if (questions.length !== existing.questionOrder.length) {
      sendError(response, 409, "QUIZ_QUESTIONS_CHANGED", "Question data is unavailable for this attempt");
      return;
    }
    const choiceOrders = new Map(existing.choiceOrder.map((item) => [String(item.questionId), item.choiceIds]));
    response.json({
      data: {
        ...attemptSummary(existing),
        questions: questions.map((question) => attemptQuestionPayload(question, choiceOrders.get(String(question._id)))),
        answers: existing.answers,
      },
    });
    return;
  }
  if (existing) {
    const questions = await loadAttemptQuestions(existing);
    if (questions.length !== existing.questionOrder.length) {
      sendError(response, 409, "QUIZ_QUESTIONS_CHANGED", "Question data is unavailable for this attempt");
      return;
    }
    await finalizeAttempt(existing, questions, now, true);
  }
  if (await AttemptModel.exists({ quizId: quiz._id, studentId: request.auth!.userId, passed: true })) {
    sendError(response, 409, "QUIZ_ALREADY_PASSED", "You have already passed this quiz.");
    return;
  }

  const savedQuestions = await QuestionModel.find({ _id: { $in: quiz.questionIds } }).select("+correctAnswer").lean<QuestionDocument[]>();
  const questionById = new Map(savedQuestions.map((question) => [String(question._id), question]));
  const questions = quiz.questionIds.map((id) => questionById.get(String(id))).filter((question): question is QuestionDocument => Boolean(question));
  if (questions.length !== quiz.questionIds.length || questions.length === 0) {
    sendError(response, 409, "QUIZ_QUESTIONS_CHANGED", "This quiz is being updated. Reload and try again.");
    return;
  }
  const ordered = quiz.shuffleQuestions ? shuffle([...questions]) : questions;
  const choiceOrder = ordered.map((question) => ({
    questionId: question._id,
    choiceIds: quiz.shuffleChoices && question.type === "mcq"
      ? shuffle(question.choices.map(({ id }) => id))
      : question.choices.map(({ id }) => id),
  }));
  const totalPoints = questions.reduce((total, question) => total + question.points, 0);
  const attempt = await AttemptModel.create({
    studentId: request.auth!.userId,
    quizId: quiz._id,
    topicId: result.topic._id,
    startedAt: now,
    expiresAt: new Date(now.getTime() + quiz.timeLimitSeconds * 1000),
    status: "active",
    questionOrder: ordered.map(({ _id }) => _id),
    choiceOrder,
    answers: [],
    totalPoints,
    scorePolicyAtSubmission: quiz.scorePolicy,
    passingScoreAtSubmission: quiz.passingScore,
    showCorrectAnswersAtSubmission: quiz.showCorrectAnswers,
  });
  response.status(201).json({
    data: {
      ...attemptSummary(attempt),
      questions: ordered.map((question) => attemptQuestionPayload(question, choiceOrder.find((item) => item.questionId.equals(question._id))?.choiceIds)),
      answers: [],
    },
  });
};

export const submitAttempt: RequestHandler = async (request, response) => {
  const attemptId = objectIdSchema.parse(request.params.attemptId);
  const input = submitAttemptSchema.parse(request.body);
  const attempt = await AttemptModel.findOne({ _id: attemptId, studentId: request.auth!.userId }).select("+resultDetails");
  if (!attempt) {
    sendError(response, 404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found");
    return;
  }
  if (attempt.status !== "active") {
    if (attempt.passed) await recordTopicCompletion(attempt, attempt.submittedAt ?? new Date());
    else await recordTopicFailure(attempt);
    const questions = await loadAttemptQuestions(attempt);
    if (questions.length !== attempt.questionOrder.length) {
      sendError(response, 409, "QUIZ_QUESTIONS_CHANGED", "Question data is unavailable for this attempt");
      return;
    }
    const details = attempt.resultDetails as Array<{ questionId: mongoose.Types.ObjectId; isCorrect: boolean; pointsEarned: number }>;
    response.json({
      data: {
        ...attemptSummary(attempt),
        ...(attempt.showCorrectAnswersAtSubmission
          ? { review: reviewPayload(questions, attempt.answers, details, true) }
          : {}),
      },
    });
    return;
  }

  const now = new Date();
  const questions = await loadAttemptQuestions(attempt);
  if (questions.length !== attempt.questionOrder.length) {
    sendError(response, 409, "QUIZ_QUESTIONS_CHANGED", "Question data is unavailable for this attempt");
    return;
  }
  if (now.getTime() <= attempt.expiresAt.getTime()) {
    const invalidAnswer = validateAttemptAnswers(attempt, questions, input.answers);
    if (invalidAnswer) {
      sendError(response, 400, "INVALID_ANSWER", invalidAnswer);
      return;
    }
    attempt.answers = input.answers.map(({ questionId, value }) => ({
      questionId: new mongoose.Types.ObjectId(questionId),
      value,
    })) as typeof attempt.answers;
  }

  const expired = now.getTime() > attempt.expiresAt.getTime();
  await finalizeAttempt(attempt, questions, now, expired);
  try {
    await sendQuizResultNotifications(attempt);
  } catch (error) {
    console.error("Quiz result notifications could not be sent",
      error instanceof Error ? error.message : "Unknown notification error");
  }
  const details = attempt.resultDetails as Array<{ questionId: mongoose.Types.ObjectId; isCorrect: boolean; pointsEarned: number }>;
  response.json({
    data: {
      ...attemptSummary(attempt),
      ...(attempt.showCorrectAnswersAtSubmission
        ? { review: reviewPayload(questions, attempt.answers, details, true) }
        : {}),
    },
  });
};

function validateAttemptAnswers(
  attempt: InstanceType<typeof AttemptModel>,
  questions: QuestionDocument[],
  answers: Array<{ questionId: string; value: string | boolean }>,
) {
  const allowed = new Set(attempt.questionOrder.map(String));
  const questionById = new Map(questions.map((question) => [String(question._id), question]));
  for (const answer of answers) {
    if (!allowed.has(answer.questionId)) return "An answer does not belong to this attempt";
    const question = questionById.get(answer.questionId);
    if (!question) return "Question data is unavailable for this answer";
    if ((question.type === "true_false" && typeof answer.value !== "boolean")
      || (question.type !== "true_false" && typeof answer.value !== "string")
      || (question.type === "mcq" && typeof answer.value === "string" && !question.choices.some(({ id }) => id === answer.value))) {
      return "An answer does not match its question";
    }
  }
  return null;
}

export const saveAttemptAnswers: RequestHandler = async (request, response) => {
  const attemptId = objectIdSchema.parse(request.params.attemptId);
  const input = submitAttemptSchema.parse(request.body);
  const attempt = await AttemptModel.findOne({ _id: attemptId, studentId: request.auth!.userId });
  if (!attempt) {
    sendError(response, 404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found");
    return;
  }
  if (attempt.status !== "active") {
    sendError(response, 409, "ATTEMPT_ALREADY_SUBMITTED", "This quiz attempt is no longer active");
    return;
  }
  if (Date.now() > attempt.expiresAt.getTime()) {
    sendError(response, 409, "ATTEMPT_EXPIRED", "The quiz time limit has elapsed");
    return;
  }
  const questions = await loadAttemptQuestions(attempt);
  if (questions.length !== attempt.questionOrder.length) {
    sendError(response, 409, "QUIZ_QUESTIONS_CHANGED", "Question data is unavailable for this attempt");
    return;
  }
  const invalidAnswer = validateAttemptAnswers(attempt, questions, input.answers);
  if (invalidAnswer) {
    sendError(response, 400, "INVALID_ANSWER", invalidAnswer);
    return;
  }
  const answers = input.answers.map(({ questionId, value }) => ({
    questionId: new mongoose.Types.ObjectId(questionId),
    value,
  }));
  const updated = await AttemptModel.findOneAndUpdate(
    { _id: attempt._id, studentId: request.auth!.userId, status: "active", expiresAt: { $gte: new Date() } },
    { $set: { answers } },
    { new: true, runValidators: true },
  );
  if (!updated) {
    sendError(response, 409, "ATTEMPT_EXPIRED", "The quiz attempt has ended");
    return;
  }
  response.json({ data: { savedAt: new Date(), answerCount: input.answers.length } });
};

export const reviewAttempt: RequestHandler = async (request, response) => {
  const attemptId = objectIdSchema.parse(request.params.attemptId);
  const attempt = await AttemptModel.findOne({ _id: attemptId, studentId: request.auth!.userId }).select("+resultDetails");
  if (!attempt) {
    sendError(response, 404, "ATTEMPT_NOT_FOUND", "Quiz attempt not found");
    return;
  }
  if (attempt.status === "active") {
    sendError(response, 403, "ATTEMPT_NOT_SUBMITTED", "Submit the attempt before reviewing answers");
    return;
  }
  const questions = await loadAttemptQuestions(attempt);
  if (questions.length !== attempt.questionOrder.length) {
    sendError(response, 409, "QUIZ_QUESTIONS_CHANGED", "Question data is unavailable for this attempt");
    return;
  }
  const details = attempt.resultDetails as Array<{ questionId: mongoose.Types.ObjectId; isCorrect: boolean; pointsEarned: number }>;
  response.json({
    data: {
      ...attemptSummary(attempt),
      showCorrectAnswers: attempt.showCorrectAnswersAtSubmission,
      review: reviewPayload(questions, attempt.answers, details, attempt.showCorrectAnswersAtSubmission),
    },
  });
};

export const readProgress: RequestHandler = async (request, response) => {
  const subjectId = objectIdSchema.parse(request.params.id);
  const studentId = request.auth!.userId;
  const [subject, enrollment] = await Promise.all([
    SubjectModel.findOne({ _id: subjectId, isArchived: false }).select("_id name code").lean(),
    EnrollmentModel.exists({ subjectId, studentId, status: "active" }),
  ]);
  if (!subject || !enrollment) {
    sendError(response, 404, "SUBJECT_NOT_FOUND", "Subject not found");
    return;
  }
  const topics = await TopicModel.find({ subjectId, isArchived: false, isPublished: true })
    .sort({ order: 1 }).select("_id title order quizId").lean();
  const topicIds = topics.map(({ _id }) => _id);
  const [progress, attempts, publishedQuizzes] = await Promise.all([
    ProgressModel.find({ studentId, subjectId }).lean(),
    AttemptModel.find({ studentId, topicId: { $in: topicIds }, status: { $in: ["submitted", "expired"] } })
      .sort({ startedAt: -1 }).lean(),
    QuizModel.find({ _id: { $in: topics.map(({ quizId }) => quizId).filter(Boolean) }, isPublished: true }).select("_id scorePolicy").lean(),
  ]);
  const publishedQuizIds = new Set(publishedQuizzes.map(({ _id }) => String(_id)));
  const scorePolicyByQuiz = new Map(publishedQuizzes.map(({ _id, scorePolicy }) => [String(_id), scorePolicy]));
  const progressByTopic = new Map(progress.map((item) => [String(item.topicId), item]));
  const topicById = new Map(topics.map((topic) => [String(topic._id), topic]));
  const attemptsByTopic = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const key = String(attempt.topicId);
    const list = attemptsByTopic.get(key) ?? [];
    list.push(attempt);
    attemptsByTopic.set(key, list);
  }
  const scoredAttempts = attempts.filter((attempt) => attempt.score !== null);
  const completedTopicCount = topics.filter((topic) => progressByTopic.get(String(topic._id))?.isCompleted).length;
  response.json({
    data: {
      subject,
      summary: {
        topicCount: topics.length,
        completedTopicCount,
        quizAttemptCount: attempts.length,
        scoredQuizAttemptCount: scoredAttempts.length,
        averageQuizScore: scoredAttempts.length
          ? Math.round(scoredAttempts.reduce((sum, attempt) => sum + Number(attempt.score), 0) / scoredAttempts.length * 10) / 10
          : null,
        availableQuizCount: topics.filter((topic) => topic.quizId && publishedQuizIds.has(String(topic.quizId))).length,
      },
      recentAttempts: attempts.slice(0, 8).map((attempt) => ({
        attemptId: String(attempt._id),
        topicId: String(attempt.topicId),
        topicTitle: topicById.get(String(attempt.topicId))?.title ?? "Lesson quiz",
        score: attempt.score,
        passed: attempt.passed,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
      })),
      topics: await Promise.all(topics.map(async (topic) => {
        const topicAttempts = attemptsByTopic.get(String(topic._id)) ?? [];
        const completed = progressByTopic.get(String(topic._id))?.isCompleted ?? false;
        const unlocked = topic.order === 0 || await isTopicUnlocked(studentId, topic._id);
        const scores = topicAttempts.map((attempt) => Number(attempt.score ?? 0));
        const scorePolicy = topic.quizId ? scorePolicyByQuiz.get(String(topic.quizId)) ?? "best" : "best";
        const latestScore = topicAttempts[0]?.score ?? null;
        const bestScore = scores.length ? Math.max(...scores) : null;
        return {
          topicId: String(topic._id),
          title: topic.title,
          order: topic.order,
          hasQuiz: topic.quizId ? publishedQuizIds.has(String(topic.quizId)) : false,
          isUnlocked: unlocked,
          isCompleted: completed,
          attemptCount: topicAttempts.length,
          scorePolicy,
          latestScore,
          bestScore,
          effectiveScore: scorePolicy === "latest" ? latestScore : bestScore,
          latestAttemptId: topicAttempts[0] ? String(topicAttempts[0]._id) : null,
          passed: completed,
        };
      })),
    },
  });
};
