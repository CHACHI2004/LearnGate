import { z } from "zod";

const sourceReferenceSchema = z.object({
  kind: z.literal("slide"),
  number: z.number().int().min(1),
}).strict();

export const generatedFlashcardSchema = z.object({
  front: z.string().trim().min(3).max(500),
  back: z.string().trim().min(1).max(2000),
  sourceReference: sourceReferenceSchema,
}).strict();

export const generatedFlashcardsResponseSchema = z.object({
  cards: z.array(generatedFlashcardSchema).min(3).max(30),
}).strict();

export const flashcardGenerationOptionsSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  cardCount: z.number().int().min(3).max(30).default(10),
}).strict();

export const updateFlashcardDeckSchema = z.object({
  title: z.string().trim().min(1).max(120),
  cards: z.array(generatedFlashcardSchema).min(1).max(30),
}).strict();
