import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import { gradeQuizAnswers } from "../src/services/quiz-grading.js";
import { saveQuizSchema, submitAttemptSchema } from "../src/validators/quiz.validators.js";

const quizSettings = {
  title: "Foundations",
  description: "",
  timeLimitSeconds: 600,
  passingScore: 75,
  scorePolicy: "best" as const,
  shuffleQuestions: true,
  shuffleChoices: true,
  showCorrectAnswers: false,
  isPublished: false,
};

describe("quiz authoring validation", () => {
  it("accepts supported question types with valid answer keys", () => {
    const parsed = saveQuizSchema.parse({
      ...quizSettings,
      questions: [
        {
          type: "mcq",
          questionText: "Which choice is correct?",
          choices: [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }],
          correctAnswer: "b",
          explanation: "",
          points: 2,
        },
        {
          type: "true_false",
          questionText: "LearnGate is a learning platform.",
          correctAnswer: true,
          explanation: "",
          points: 1,
        },
        {
          type: "identification",
          questionText: "Name the platform.",
          correctAnswer: "LearnGate",
          explanation: "",
          points: 1,
        },
      ],
    });
    expect(parsed.questions).toHaveLength(3);
  });

  it("rejects publishing an empty quiz, invalid correct choices, and extra fields", () => {
    expect(saveQuizSchema.safeParse({ ...quizSettings, isPublished: true, questions: [] }).success).toBe(false);
    expect(saveQuizSchema.safeParse({
      ...quizSettings,
      questions: [{
        type: "mcq",
        questionText: "Choose an answer",
        choices: [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }],
        correctAnswer: "missing",
        points: 1,
      }],
    }).success).toBe(false);
    expect(saveQuizSchema.safeParse({ ...quizSettings, questions: [], answerKey: true }).success).toBe(false);
  });

  it("rejects duplicate or malformed submitted answer identifiers", () => {
    const questionId = "65f000000000000000000001";
    expect(submitAttemptSchema.safeParse({
      answers: [{ questionId, value: true }, { questionId, value: false }],
    }).success).toBe(false);
    expect(submitAttemptSchema.safeParse({ answers: [{ questionId: "invalid", value: "answer" }] }).success).toBe(false);
  });
});

describe("server-side quiz scoring", () => {
  it("grades exact choice and boolean answers and normalized identification text", () => {
    const questions = [
      { _id: new mongoose.Types.ObjectId(), type: "mcq" as const, correctAnswer: "b", points: 2 },
      { _id: new mongoose.Types.ObjectId(), type: "true_false" as const, correctAnswer: true, points: 1 },
      { _id: new mongoose.Types.ObjectId(), type: "identification" as const, correctAnswer: "LearnGate", points: 2 },
    ];
    const result = gradeQuizAnswers(questions, [
      { questionId: questions[0]._id, value: "b" },
      { questionId: questions[1]._id, value: false },
      { questionId: questions[2]._id, value: "  learngate  " },
    ]);

    expect(result.earnedPoints).toBe(4);
    expect(result.correctCount).toBe(2);
    expect(result.details.map(({ isCorrect }) => isCorrect)).toEqual([true, false, true]);
    expect(result.details.map(({ pointsEarned }) => pointsEarned)).toEqual([2, 0, 2]);
  });

  it("treats omitted answers as incorrect and never awards partial points", () => {
    const question = {
      _id: new mongoose.Types.ObjectId(),
      type: "identification" as const,
      correctAnswer: "green",
      points: 3,
    };
    const result = gradeQuizAnswers([question], []);
    expect(result.earnedPoints).toBe(0);
    expect(result.correctCount).toBe(0);
    expect(result.details[0].pointsEarned).toBe(0);
  });
});
