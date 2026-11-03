import { z } from "zod";

export const reportQuerySchema = z.object({
  search: z.string().trim().max(80).default(""),
  status: z.enum(["all", "complete", "in_progress", "not_started"]).default("all"),
  sort: z.enum(["name", "progress", "averageScore", "completedTopics"]).default("name"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type ReportQuery = z.infer<typeof reportQuerySchema>;
