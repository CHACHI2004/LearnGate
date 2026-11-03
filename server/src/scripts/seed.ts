import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { AttemptModel } from "../models/attempt.model.js";
import { EnrollmentModel } from "../models/enrollment.model.js";
import { ProgressModel } from "../models/progress.model.js";
import { QuestionModel } from "../models/question.model.js";
import { QuizModel } from "../models/quiz.model.js";
import { SubjectModel } from "../models/subject.model.js";
import { TopicModel } from "../models/topic.model.js";
import { UserModel } from "../models/user.model.js";

type SeedAccount = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: "student" | "faculty" | "admin";
};

const accounts: SeedAccount[] = [
  { firstName: "Morgan", lastName: "Faculty", username: "demo.faculty", email: "faculty@learngate.example", role: "faculty" },
  { firstName: "Jamie", lastName: "Student", username: "demo.student", email: "student@learngate.example", role: "student" },
  { firstName: "Taylor", lastName: "Student", username: "demo.student2", email: "student2@learngate.example", role: "student" },
  { firstName: "Alex", lastName: "Admin", username: "demo.admin", email: "admin@learngate.example", role: "admin" },
];

const sampleQuestions = [
  [
    {
      type: "mcq" as const,
      questionText: "Which term describes the variety of life in an ecosystem?",
      choices: [{ id: "bio-q1-a", text: "Biodiversity" }, { id: "bio-q1-b", text: "Biomass" }, { id: "bio-q1-c", text: "Biodegradation" }],
      correctAnswer: "bio-q1-a",
      explanation: "Biodiversity describes the variety of living organisms in an area.",
      points: 1,
    },
    {
      type: "mcq" as const,
      questionText: "What is the primary source of energy for most ecosystems?",
      choices: [{ id: "bio-q2-a", text: "The Sun" }, { id: "bio-q2-b", text: "The Moon" }, { id: "bio-q2-c", text: "Soil minerals" }],
      correctAnswer: "bio-q2-a",
      explanation: "Sunlight provides energy to producers and supports most food webs.",
      points: 1,
    },
  ],
  [
    {
      type: "mcq" as const,
      questionText: "Which organisms convert atmospheric nitrogen into usable compounds?",
      choices: [{ id: "bio-q3-a", text: "Nitrogen-fixing bacteria" }, { id: "bio-q3-b", text: "Herbivores" }, { id: "bio-q3-c", text: "Decomposing rocks" }],
      correctAnswer: "bio-q3-a",
      explanation: "Nitrogen-fixing bacteria make atmospheric nitrogen available to plants.",
      points: 1,
    },
    {
      type: "mcq" as const,
      questionText: "What is a food web?",
      choices: [{ id: "bio-q4-a", text: "Connected food chains in an ecosystem" }, { id: "bio-q4-b", text: "A list of habitat temperatures" }, { id: "bio-q4-c", text: "A map of soil layers" }],
      correctAnswer: "bio-q4-a",
      explanation: "A food web shows how multiple food chains connect.",
      points: 1,
    },
  ],
];

async function seed() {
  if (env.NODE_ENV !== "development" || !process.argv.includes("--confirm")) {
    throw new Error("Seeding is restricted to development and requires the explicit --confirm flag.");
  }

  const password = process.env.SEED_PASSWORD || "LearnGate-Dev-Only-2026!";
  if (password.length < 12 || password.length > 128) {
    throw new Error("SEED_PASSWORD must be between 12 and 128 characters.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await connectDatabase();

  const seededUsers = await Promise.all(accounts.map(async (account) => UserModel.findOneAndUpdate(
    { email: account.email },
    {
      $set: {
        ...account,
        passwordHash,
        isEmailVerified: true,
        isActive: true,
        isAdmin: account.role === "admin",
        facultyApprovalStatus: account.role === "faculty" ? "approved" : "not_required",
        privacyConsent: true,
        privacyConsentAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  )));
  const userByEmail = new Map(seededUsers.map((user) => [user.email, user]));
  const faculty = userByEmail.get("faculty@learngate.example");
  const firstStudent = userByEmail.get("student@learngate.example");
  const secondStudent = userByEmail.get("student2@learngate.example");
  if (!faculty || !firstStudent || !secondStudent) throw new Error("Seed accounts could not be loaded.");

  const subject = await SubjectModel.findOneAndUpdate(
    { facultyId: faculty._id, code: "BIO-101" },
    {
      $set: {
        name: "Foundations of Biology",
        code: "BIO-101",
        description: "Explore ecosystems, biodiversity, and the cycles that sustain life.",
        term: "Fall",
        academicYear: "2026–2027",
        themeColor: "#17684f",
        isArchived: false,
      },
      $setOnInsert: { facultyId: faculty._id, joinCode: "BIOSEED26" },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  const topicContent = [
    "<h2>Living systems</h2><p>Biology studies living systems and their interactions. Biodiversity describes the variety of life in a community.</p><p>Consider how habitat, available energy, and species relationships shape a healthy ecosystem.</p>",
    "<h2>Energy and food webs</h2><p>Most ecosystems depend on sunlight. Producers capture energy, which moves through connected food chains to consumers and decomposers.</p><p>Food webs reveal the many relationships that support ecosystem stability.</p>",
    "<h2>Nutrient cycles</h2><p>Matter cycles through ecosystems. Nitrogen-fixing bacteria transform atmospheric nitrogen into forms plants can use.</p><p>Decomposers return nutrients to the environment.</p>",
  ];
  const topicTitles = ["Ecosystems and biodiversity", "Energy flow and food webs", "Nutrient cycles"];
  const topics = await Promise.all(topicTitles.map((title, order) => TopicModel.findOneAndUpdate(
    { subjectId: subject._id, title },
    {
      $set: {
        title,
        order,
        description: `Lesson ${order + 1} in the biology learning sequence.`,
        content: topicContent[order],
        summary: "Review the key ideas, then complete the quiz to check your understanding.",
        isPublished: true,
        isArchived: false,
      },
      $setOnInsert: { subjectId: subject._id },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  )));

  const quizzes = [];
  for (let topicIndex = 0; topicIndex < 2; topicIndex += 1) {
    const topic = topics[topicIndex];
    if (!topic) continue;
    const quiz = await QuizModel.findOneAndUpdate(
      { topicId: topic._id },
      {
        $set: {
          title: `${topicTitles[topicIndex]} quiz`,
          description: "A short practice quiz for the seeded LearnGate course.",
          timeLimitSeconds: 300,
          passingScore: 75,
          scorePolicy: "best",
          shuffleQuestions: true,
          shuffleChoices: true,
          showCorrectAnswers: true,
          isPublished: true,
          createdBy: faculty._id,
        },
        $setOnInsert: { topicId: topic._id, questionIds: [] },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    const questionIds = await Promise.all(sampleQuestions[topicIndex]!.map(async (question) => {
      let saved = await QuestionModel.findOne({ quizId: quiz._id, questionText: question.questionText });
      if (saved) {
        saved.set({ ...question, quizId: quiz._id });
      } else {
        saved = new QuestionModel({ ...question, quizId: quiz._id });
      }
      await saved.save();
      return saved._id;
    }));
    quiz.questionIds = questionIds;
    await quiz.save();
    topic.quizId = quiz._id;
    await topic.save();
    quizzes.push(quiz);
  }

  await Promise.all([firstStudent, secondStudent].map((student) => EnrollmentModel.findOneAndUpdate(
    { studentId: student._id, subjectId: subject._id },
    { $set: { status: "active", enrolledAt: new Date("2026-09-01T00:00:00.000Z") } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  )));

  const firstQuiz = quizzes[0];
  const secondQuiz = quizzes[1];
  if (!firstQuiz || !secondQuiz) throw new Error("Seed quizzes could not be loaded.");
  const firstQuestionIds = firstQuiz.questionIds;
  const secondQuestionIds = secondQuiz.questionIds;
  const sampleDate = new Date("2026-09-15T12:00:00.000Z");
  const attempts = [
    {
      student: firstStudent,
      quiz: firstQuiz,
      topic: topics[0]!,
      questionIds: firstQuestionIds,
      answers: [{ questionId: firstQuestionIds[0]!, value: "bio-q1-a" }, { questionId: firstQuestionIds[1]!, value: "bio-q2-a" }],
      correctAnswers: [true, true],
      score: 100,
      passed: true,
    },
    {
      student: secondStudent,
      quiz: firstQuiz,
      topic: topics[0]!,
      questionIds: firstQuestionIds,
      answers: [{ questionId: firstQuestionIds[0]!, value: "bio-q1-a" }, { questionId: firstQuestionIds[1]!, value: "bio-q2-b" }],
      correctAnswers: [true, false],
      score: 50,
      passed: false,
    },
    {
      student: firstStudent,
      quiz: secondQuiz,
      topic: topics[1]!,
      questionIds: secondQuestionIds,
      answers: [{ questionId: secondQuestionIds[0]!, value: "bio-q3-a" }, { questionId: secondQuestionIds[1]!, value: "bio-q4-a" }],
      correctAnswers: [true, true],
      score: 100,
      passed: true,
    },
  ];
  for (const [index, item] of attempts.entries()) {
    const startedAt = new Date(sampleDate.getTime() + index * 60_000);
    const submittedAt = new Date(startedAt.getTime() + 120_000);
    await AttemptModel.findOneAndUpdate(
      { studentId: item.student._id, quizId: item.quiz._id, startedAt },
      {
        $set: {
          studentId: item.student._id,
          quizId: item.quiz._id,
          topicId: item.topic._id,
          startedAt,
          expiresAt: new Date(startedAt.getTime() + 300_000),
          submittedAt,
          status: "submitted",
          questionOrder: item.questionIds,
          choiceOrder: [],
          answers: item.answers,
          score: item.score,
          correctCount: item.passed ? 2 : 1,
          incorrectCount: item.passed ? 0 : 1,
          passed: item.passed,
          durationSeconds: 120,
          totalPoints: 2,
          scorePolicyAtSubmission: "best",
          passingScoreAtSubmission: 75,
          showCorrectAnswersAtSubmission: true,
          resultDetails: item.questionIds.map((questionId, questionIndex) => ({
            questionId,
            isCorrect: item.correctAnswers[questionIndex] ?? false,
            pointsEarned: item.correctAnswers[questionIndex] ? 1 : 0,
          })),
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  await Promise.all([
    ProgressModel.findOneAndUpdate(
      { studentId: firstStudent._id, subjectId: subject._id, topicId: topics[0]!._id },
      { $set: { isCompleted: true, completedAt: sampleDate, lastPassedAt: sampleDate } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ),
    ProgressModel.findOneAndUpdate(
      { studentId: firstStudent._id, subjectId: subject._id, topicId: topics[1]!._id },
      {
        $set: {
          isCompleted: true,
          completedAt: new Date(sampleDate.getTime() + 4 * 60_000),
          lastPassedAt: new Date(sampleDate.getTime() + 4 * 60_000),
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ),
    ProgressModel.findOneAndUpdate(
      { studentId: secondStudent._id, subjectId: subject._id, topicId: topics[0]!._id },
      { $set: { isCompleted: false, completedAt: null, lastPassedAt: null } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ),
  ]);
  console.info("LearnGate development seed complete.");
  console.info("Demo accounts:");
  for (const account of accounts) console.info(`  ${account.role}: ${account.email}`);
  console.info("Use SEED_PASSWORD if set; otherwise the local-only password is LearnGate-Dev-Only-2026!.");
}

seed()
  .catch((error: unknown) => {
    console.error("LearnGate development seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
