import { z } from "zod";

const subjectInput = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().min(2).max(24).regex(/^[A-Z0-9-]+$/),
  description: z.string().trim().max(4000).default(""),
  term: z.string().trim().min(1).max(80),
  academicYear: z.string().trim().min(4).max(20),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#17684f"),
}).strict();

export const createSubjectSchema = subjectInput;
export const updateSubjectSchema = subjectInput.partial().strict();
export const joinSubjectSchema = z.object({ joinCode: z.string().trim().toUpperCase().min(6).max(16) }).strict();
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const topicInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(""),
  content: z.string().max(200_000).default(""),
  summary: z.string().trim().max(3000).default(""),
  isPublished: z.boolean().default(false),
}).strict();
export const reorderTopicsSchema = z.object({
  topicIds: z.array(objectIdSchema).min(1).max(500),
}).strict();
