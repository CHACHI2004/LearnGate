import { Schema, model, type InferSchemaType } from "mongoose";

const aiGenerationLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    count: { type: Number, min: 0, default: 0, required: true },
    status: {
      type: String,
      enum: ["ready", "generating", "succeeded", "failed", "exhausted"],
      default: "ready",
      required: true,
    },
  },
  { timestamps: true, versionKey: false },
);

aiGenerationLogSchema.index({ userId: 1, month: 1 }, { unique: true, name: "ai_usage_user_month_unique" });

export type AiGenerationLog = InferSchemaType<typeof aiGenerationLogSchema>;
export const AiGenerationLogModel = model("AiGenerationLog", aiGenerationLogSchema);
