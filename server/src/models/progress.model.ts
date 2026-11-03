import { Schema, model, type InferSchemaType } from "mongoose";

const progressSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
    reviewRequiredAfter: { type: Date, default: null },
    lastLessonAccessAt: { type: Date, default: null },
    reviewCompletedAt: { type: Date, default: null },
    isCompleted: { type: Boolean, default: false, required: true },
    completedAt: { type: Date, default: null },
    lastPassedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

progressSchema.index(
  { studentId: 1, subjectId: 1, topicId: 1 },
  { unique: true, name: "progress_student_subject_topic_unique" },
);
progressSchema.index({ studentId: 1, subjectId: 1, isCompleted: 1 }, { name: "progress_student_subject_complete" });
progressSchema.index({ subjectId: 1, topicId: 1, isCompleted: 1 }, { name: "progress_subject_topic_complete" });

export type Progress = InferSchemaType<typeof progressSchema>;
export const ProgressModel = model("Progress", progressSchema);
