import { Schema, model, type InferSchemaType } from "mongoose";

const enrollmentSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    enrolledAt: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: ["active", "removed"], required: true, default: "active" },
  },
  { timestamps: true, versionKey: false },
);

enrollmentSchema.index({ studentId: 1, subjectId: 1 }, { unique: true, name: "enrollment_student_subject_unique" });
enrollmentSchema.index({ subjectId: 1, status: 1, enrolledAt: -1 }, { name: "enrollment_subject_status_date" });
enrollmentSchema.index({ studentId: 1, status: 1, enrolledAt: -1 }, { name: "enrollment_student_status_date" });

export type Enrollment = InferSchemaType<typeof enrollmentSchema>;
export const EnrollmentModel = model("Enrollment", enrollmentSchema);
