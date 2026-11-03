import { z } from "zod";
import { env } from "../config/env.js";

const sourceReferenceSchema = z.object({
  kind: z.enum(["slide", "page"]),
  number: z.number().int().min(1),
}).strict();

const generatedQuestionBase = {
  questionText: z.string().trim().min(8).max(2000),
  explanation: z.string().trim().min(1).max(2000),
  sourceReference: sourceReferenceSchema,
};

const generatedMcqSchema = z.object({
  ...generatedQuestionBase,
  type: z.literal("mcq"),
  choices: z.array(z.string().trim().min(1).max(500)).min(3).max(5),
  correctChoiceIndex: z.number().int().min(0).max(4),
}).strict().superRefine((question, context) => {
  if (question.correctChoiceIndex >= question.choices.length) {
    context.addIssue({ code: "custom", path: ["correctChoiceIndex"], message: "Correct choice index is outside the choice list" });
  }
  if (new Set(question.choices.map((choice) => choice.toLowerCase())).size !== question.choices.length) {
    context.addIssue({ code: "custom", path: ["choices"], message: "Choice text must be unique" });
  }
});

const generatedTrueFalseSchema = z.object({
  ...generatedQuestionBase,
  type: z.literal("true_false"),
  correctAnswer: z.boolean(),
}).strict();

const generatedIdentificationSchema = z.object({
  ...generatedQuestionBase,
  type: z.literal("identification"),
  correctAnswer: z.string().trim().min(1).max(500),
}).strict();

export const generatedQuestionSchema = z.discriminatedUnion("type", [
  generatedMcqSchema,
  generatedTrueFalseSchema,
  generatedIdentificationSchema,
]);

export const generatedQuestionsResponseSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1).max(env.QUIZ_MAX_QUESTIONS),
}).strict();

export const generationOptionsSchema = z.object({
  questionCount: z.number().int().min(3).max(env.QUIZ_MAX_QUESTIONS).default(5),
  difficulty: z.enum(["mixed", "easy", "medium", "hard"]).default("mixed"),
  questionType: z.enum(["mixed", "mcq", "true_false", "identification"]).default("mixed"),
  prompt: z.string().trim().max(1000).default(""),
}).strict();

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
