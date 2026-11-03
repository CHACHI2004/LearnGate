import { z } from "zod";
import { objectIdSchema } from "./subject.validators.js";

const choiceSchema = z.object({
  id: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(2000),
}).strict();

const questionBase = {
  questionText: z.string().trim().min(3).max(2000),
  explanation: z.string().trim().max(2000).default(""),
  points: z.number().min(0.01).max(100),
  sourceReference: z.object({
    kind: z.enum(["slide", "page"]),
    number: z.number().int().min(1),
  }).strict().optional(),
};

const mcqQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("mcq"),
  choices: z.array(choiceSchema).min(2).max(8),
  correctAnswer: z.string().trim().min(1).max(80),
}).strict().superRefine((question, context) => {
  const ids = question.choices.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["choices"], message: "Choice identifiers must be unique" });
  }
  if (!ids.includes(question.correctAnswer)) {
    context.addIssue({ code: "custom", path: ["correctAnswer"], message: "Select one of the listed choices" });
  }
});

const trueFalseQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("true_false"),
  correctAnswer: z.boolean(),
}).strict();

const identificationQuestionSchema = z.object({
  ...questionBase,
  type: z.literal("identification"),
  correctAnswer: z.string().trim().min(1).max(1000),
}).strict();

export const quizQuestionSchema = z.discriminatedUnion("type", [
  mcqQuestionSchema,
  trueFalseQuestionSchema,
  identificationQuestionSchema,
]);

export const saveQuizSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(3000).default(""),
  timeLimitSeconds: z.number().int().min(60).max(14_400),
  passingScore: z.number().int().min(1).max(100),
  scorePolicy: z.enum(["best", "latest"]),
  shuffleQuestions: z.boolean(),
  shuffleChoices: z.boolean(),
  showCorrectAnswers: z.boolean(),
  isPublished: z.boolean(),
  questions: z.array(quizQuestionSchema).max(20),
}).strict().superRefine((quiz, context) => {
  if (quiz.isPublished && quiz.questions.length === 0) {
    context.addIssue({ code: "custom", path: ["questions"], message: "Add at least one question before publishing" });
  }
});

export const submitAttemptSchema = z.object({
  answers: z.array(z.object({
    questionId: objectIdSchema,
    value: z.union([z.string().max(2000), z.boolean()]),
  }).strict()).max(20),
}).strict().superRefine((input, context) => {
  const ids = input.answers.map(({ questionId }) => questionId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["answers"], message: "Only one answer per question is allowed" });
  }
});
