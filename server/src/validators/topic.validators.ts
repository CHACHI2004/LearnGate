import { z } from "zod";
import { objectIdSchema, topicInputSchema } from "./subject.validators.js";

export const topicCreateSchema = topicInputSchema;
export const topicUpdateSchema = topicInputSchema.partial().strict();
export const topicIdParamsSchema = z.object({ id: objectIdSchema, topicId: objectIdSchema });
