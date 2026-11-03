import { Schema, model, type InferSchemaType } from "mongoose";

const choiceSchema = new Schema(
  {
    id: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  },
  { _id: false },
);

const sourceReferenceSchema = new Schema(
  {
    kind: { type: String, enum: ["slide", "page"], required: true },
    number: { type: Number, min: 1, required: true, validate: Number.isInteger },
  },
  { _id: false },
);

const questionSchema = new Schema(
  {
    quizId: { type: Schema.Types.ObjectId, ref: "Quiz", required: true },
    type: { type: String, enum: ["mcq", "true_false", "identification"], required: true },
    questionText: { type: String, required: true, trim: true, minlength: 3, maxlength: 2000 },
    choices: {
      type: [choiceSchema],
      default: [],
      validate: {
        validator(this: { type?: string }, choices: Array<{ id: string; text: string }>) {
          if (this.type !== "mcq") return choices.length === 0;
          return choices.length >= 2
            && choices.length <= 8
            && new Set(choices.map((choice) => choice.id)).size === choices.length;
        },
        message: "MCQ requires 2-8 unique choices; other question types must have no choices",
      },
    },
    correctAnswer: { type: Schema.Types.Mixed, required: true, select: false },
    explanation: { type: String, trim: true, maxlength: 2000, default: "" },
    points: { type: Number, min: 0.01, max: 100, default: 1, required: true },
    sourceReference: { type: sourceReferenceSchema, required: false },
  },
  { timestamps: true, versionKey: false },
);

questionSchema.path("correctAnswer").validate(function (answer: unknown) {
  if (this.type === "mcq") {
    return typeof answer === "string" && this.choices.some((choice) => choice.id === answer);
  }
  if (this.type === "true_false") return typeof answer === "boolean";
  return typeof answer === "string" && answer.trim().length > 0 && answer.length <= 1000;
}, "Correct answer must match the question type and a valid choice");

questionSchema.index({ quizId: 1, createdAt: 1 }, { name: "question_quiz_created" });

export type Question = InferSchemaType<typeof questionSchema>;
export const QuestionModel = model("Question", questionSchema);
