import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  API_PREFIX: z.string().startsWith("/").default("/api/v1"),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  CLIENT_URLS: z.string().default("http://localhost:5173"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DATABASE: z.string().min(1).default("learngate"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/).default("1d"),
  COOKIE_NAME: z.string().min(1).default("learngate_session"),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  FACULTY_ACCESS_CODE: z.string().optional(),
  MAILTRAP_HOST: z.string().optional(),
  MAILTRAP_PORT: z.coerce.number().int().positive().default(2525),
  MAILTRAP_USER: z.string().optional(),
  MAILTRAP_PASS: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  AI_PROVIDER: z.literal("groq").default("groq"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("openai/gpt-oss-20b"),
  AI_MONTHLY_GENERATION_CAP: z.coerce.number().int().positive().default(20),
  AI_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(3_600_000),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  DOCUMENT_MAX_SIZE_MB: z.coerce.number().positive().max(20).default(20),
  QUIZ_DEFAULT_TIME_LIMIT_SECONDS: z.coerce.number().int().positive().default(600),
  QUIZ_DEFAULT_PASSING_SCORE: z.coerce.number().min(1).max(100).default(75),
  QUIZ_MAX_QUESTIONS: z.coerce.number().int().min(1).max(20).default(20),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map(({ path, message }) => `${path.join(".")}: ${message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = {
  ...parsed.data,
  CLIENT_ORIGINS: [...new Set(
    `${parsed.data.CLIENT_URL},${parsed.data.CLIENT_URLS}`
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  )],
  COOKIE_IS_SECURE: parsed.data.COOKIE_SECURE
    ? parsed.data.COOKIE_SECURE === "true"
    : parsed.data.NODE_ENV === "production",
};
