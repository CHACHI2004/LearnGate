import { Schema, model, type InferSchemaType } from "mongoose";

const quizSchema = new Schema(
  {
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true, unique: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 3000, default: "" },
    timeLimitSeconds: { type: Number, min: 60, max: 14_400, default: 600, required: true, validate: Number.isInteger },
    passingScore: { type: Number, min: 1, max: 100, default: 75, required: true },
    questionIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Question" }],
      default: [],
      validate: {
        validator: (ids: Schema.Types.ObjectId[]) => ids.length <= 20 && new Set(ids.map(String)).size === ids.length,
        message: "A quiz can contain at most 20 unique questions",
      },
    },
    scorePolicy: { type: String, enum: ["best", "latest"], default: "best", required: true },
    shuffleQuestions: { type: Boolean, default: true, required: true },
    shuffleChoices: { type: Boolean, default: true, required: true },
    showCorrectAnswers: { type: Boolean, default: false, required: true },
    isPublished: { type: Boolean, default: false, required: true },
    aiGenerated: { type: Boolean, default: false, required: true },
    sourceFile: {
      type: new Schema(
        {
          attachmentId: { type: Schema.Types.ObjectId, required: false },
          databaseFileId: { type: Schema.Types.ObjectId, ref: "uploads.files", required: false },
          url: { type: String, trim: true, required: false },
          publicId: { type: String, trim: true, required: false },
          fileName: { type: String, trim: true, maxlength: 255, required: false },
          mimeType: { type: String, trim: true, required: false },
          sizeBytes: { type: Number, min: 1, required: false },
          resourceType: { type: String, enum: ["image", "video", "raw"], required: false },
          deliveryType: { type: String, enum: ["upload", "authenticated"], required: false },
        },
        { _id: false },
      ),
      required: false,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, versionKey: false },
);

quizSchema.index({ createdBy: 1, updatedAt: -1 }, { name: "quiz_creator_updated" });
quizSchema.index({ topicId: 1, isPublished: 1 }, { name: "quiz_topic_publication" });

export type Quiz = InferSchemaType<typeof quizSchema>;
export const QuizModel = model("Quiz", quizSchema);
