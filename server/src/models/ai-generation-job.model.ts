import { Schema, model, type InferSchemaType } from "mongoose";

const generatedQuestionSchema = new Schema(
  {
    type: { type: String, enum: ["mcq", "true_false", "identification"], required: true },
    questionText: { type: String, required: true, trim: true, maxlength: 2000 },
    choices: {
      type: [{
        id: { type: String, required: true, trim: true, maxlength: 80 },
        text: { type: String, required: true, trim: true, maxlength: 2000 },
      }],
      default: [],
    },
    correctAnswer: { type: Schema.Types.Mixed, required: true, select: false },
    explanation: { type: String, trim: true, maxlength: 2000, default: "" },
    points: { type: Number, min: 0.01, max: 100, default: 1, required: true },
    sourceReference: {
      type: new Schema({
        kind: { type: String, enum: ["slide", "page"], required: true },
        number: { type: Number, min: 1, required: true, validate: Number.isInteger },
      }, { _id: false }),
      required: true,
    },
  },
  { _id: false },
);

const aiGenerationJobSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    status: {
      type: String,
      enum: ["queued", "extracting", "generating", "review", "failed"],
      default: "queued",
      required: true,
    },
    progress: { type: Number, min: 0, max: 100, default: 0, required: true },
    message: { type: String, trim: true, maxlength: 300, default: "Waiting to start" },
    fileName: { type: String, trim: true, maxlength: 255, required: true },
    fileType: { type: String, enum: ["pdf", "pptx"], required: true },
    questionCount: { type: Number, min: 1, max: 20, required: true },
    difficulty: { type: String, enum: ["mixed", "easy", "medium", "hard"], default: "mixed", required: true },
    questionType: { type: String, enum: ["mixed", "mcq", "true_false", "identification"], default: "mixed", required: true },
    prompt: { type: String, trim: true, maxlength: 1000, default: "" },
    sourceFile: {
      type: new Schema({
        databaseFileId: { type: Schema.Types.ObjectId, ref: "uploads.files", required: true },
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        mimeType: { type: String, required: true },
        sizeBytes: { type: Number, min: 1, required: true },
        resourceType: { type: String, enum: ["image", "video", "raw"], required: true },
        deliveryType: { type: String, enum: ["upload", "authenticated"], required: true },
      }, { _id: false }),
      required: false,
    },
    questions: { type: [generatedQuestionSchema], default: [], select: false },
    errorMessage: { type: String, trim: true, maxlength: 500, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

aiGenerationJobSchema.index({ userId: 1, createdAt: -1 }, { name: "ai_job_user_created" });
aiGenerationJobSchema.index({ status: 1, createdAt: -1 }, { name: "ai_job_status_created" });

export type AiGenerationJob = InferSchemaType<typeof aiGenerationJobSchema>;
export const AiGenerationJobModel = model("AiGenerationJob", aiGenerationJobSchema);
