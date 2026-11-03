import { Schema, model, type InferSchemaType } from "mongoose";

const flashcardSchema = new Schema(
  {
    front: { type: String, trim: true, required: true, minlength: 3, maxlength: 500 },
    back: { type: String, trim: true, required: true, minlength: 1, maxlength: 2000 },
    sourceReference: {
      type: new Schema({
        kind: { type: String, enum: ["slide"], required: true },
        number: { type: Number, min: 1, required: true, validate: Number.isInteger },
      }, { _id: false }),
      required: true,
    },
  },
  { timestamps: false },
);

const aiFlashcardDeckSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, trim: true, required: true, minlength: 1, maxlength: 120 },
    fileName: { type: String, trim: true, required: true, maxlength: 255 },
    fileType: { type: String, enum: ["ppt", "pptx"], required: true },
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
    slideCount: { type: Number, min: 1, required: true, default: 1 },
    sourceSlideNumbers: { type: [{ type: Number, min: 1, validate: Number.isInteger }], default: [] },
    requestedCardCount: { type: Number, min: 1, max: 30, required: true, default: 10 },
    status: {
      type: String,
      enum: ["queued", "extracting", "generating", "ready", "failed"],
      default: "queued",
      required: true,
    },
    progress: { type: Number, min: 0, max: 100, default: 0, required: true },
    message: { type: String, trim: true, maxlength: 300, default: "Waiting to process your presentation" },
    cards: { type: [flashcardSchema], default: [] },
    errorMessage: { type: String, trim: true, maxlength: 500, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

aiFlashcardDeckSchema.index({ userId: 1, createdAt: -1 }, { name: "flashcard_deck_user_created" });
aiFlashcardDeckSchema.index({ userId: 1, status: 1 }, { name: "flashcard_deck_user_status" });

export type AiFlashcardDeck = InferSchemaType<typeof aiFlashcardDeckSchema>;
export const AiFlashcardDeckModel = model("AiFlashcardDeck", aiFlashcardDeckSchema);
