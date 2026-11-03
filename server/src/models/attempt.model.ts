import { Schema, model, type InferSchemaType } from "mongoose";

const attemptAnswerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: "Question", required: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const choiceOrderSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: "Question", required: true },
    choiceIds: { type: [String], default: [] },
  },
  { _id: false },
);

const attemptSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    quizId: { type: Schema.Types.ObjectId, ref: "Quiz", required: true },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    status: { type: String, enum: ["active", "submitted", "expired"], default: "active", required: true },
    questionOrder: { type: [{ type: Schema.Types.ObjectId, ref: "Question" }], required: true },
    choiceOrder: { type: [choiceOrderSchema], default: [] },
    answers: { type: [attemptAnswerSchema], default: [] },
    score: { type: Number, min: 0, default: null },
    correctCount: { type: Number, min: 0, default: null },
    incorrectCount: { type: Number, min: 0, default: null },
    passed: { type: Boolean, default: null },
    durationSeconds: { type: Number, min: 0, default: null },
    totalPoints: { type: Number, min: 0, required: true },
    scorePolicyAtSubmission: { type: String, enum: ["best", "latest"], required: true },
    passingScoreAtSubmission: { type: Number, min: 1, max: 100, required: true },
    showCorrectAnswersAtSubmission: { type: Boolean, default: false, required: true },
    resultDetails: {
      type: [{
        questionId: { type: Schema.Types.ObjectId, ref: "Question", required: true },
        isCorrect: { type: Boolean, required: true },
        pointsEarned: { type: Number, min: 0, required: true },
      }],
      default: [],
      select: false,
    },
  },
  { timestamps: true, versionKey: false },
);

attemptSchema.index({ studentId: 1, quizId: 1, startedAt: -1 }, { name: "attempt_student_quiz_started" });
attemptSchema.index({ quizId: 1, studentId: 1, submittedAt: -1 }, { name: "attempt_quiz_student_submitted" });
attemptSchema.index(
  { studentId: 1, quizId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
    name: "attempt_one_active_per_student_quiz",
  },
);

export type Attempt = InferSchemaType<typeof attemptSchema>;
export const AttemptModel = model("Attempt", attemptSchema);
