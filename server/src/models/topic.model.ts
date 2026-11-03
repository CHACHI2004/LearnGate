import { Schema, model, type InferSchemaType } from "mongoose";

const attachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    databaseFileId: { type: Schema.Types.ObjectId, ref: "uploads.files" },
    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    mimeType: { type: String, required: true, trim: true, maxlength: 120 },
    sizeBytes: { type: Number, required: true, min: 1, max: 20 * 1024 * 1024 },
    resourceType: { type: String, enum: ["image", "video", "raw"], required: true },
    deliveryType: { type: String, enum: ["upload", "authenticated"], default: "authenticated", required: true },
  },
  { _id: true },
);

const topicSchema = new Schema(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    order: { type: Number, required: true, min: 0, validate: Number.isInteger },
    content: { type: String, default: "", maxlength: 200_000 },
    summary: { type: String, trim: true, maxlength: 3000, default: "" },
    attachments: { type: [attachmentSchema], default: [] },
    quizId: { type: Schema.Types.ObjectId, ref: "Quiz", default: null },
    isPublished: { type: Boolean, default: false, required: true },
    isArchived: { type: Boolean, default: false, required: true },
  },
  { timestamps: true, versionKey: false },
);

topicSchema.index(
  { subjectId: 1, order: 1 },
  { unique: true, partialFilterExpression: { isArchived: false }, name: "topic_subject_order_unique" },
);
topicSchema.index({ subjectId: 1, isPublished: 1, order: 1 }, { name: "topic_subject_publication_order" });

export type Topic = InferSchemaType<typeof topicSchema>;
export const TopicModel = model("Topic", topicSchema);
