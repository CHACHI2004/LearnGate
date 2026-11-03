import { z } from "zod";

const passwordSchema = z.string().min(12).max(128);

export const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9._-]+$/),
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  role: z.enum(["student", "faculty"]),
  privacyConsent: z.literal(true),
  facultyAccessCode: z.string().max(200).optional(),
}).strict();

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
}).strict();

export const emailSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) }).strict();
export const tokenSchema = z.object({ token: z.string().min(32).max(256) }).strict();
export const resetPasswordSchema = tokenSchema.extend({ password: passwordSchema }).strict();
