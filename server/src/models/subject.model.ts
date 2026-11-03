import { Schema, model, type InferSchemaType } from "mongoose";

const subjectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    code: { type: String, required: true, trim: true, uppercase: true, minlength: 2, maxlength: 24 },
    description: { type: String, trim: true, maxlength: 4000, default: "" },
    term: { type: String, required: true, trim: true, maxlength: 80 },
    academicYear: { type: String, required: true, trim: true, maxlength: 20 },
    themeColor: {
      type: String,
      required: true,
      default: "#17684f",
      match: /^#[0-9a-fA-F]{6}$/,
    },
    banner: {
      type: new Schema(
        {
          url: { type: String, required: true },
          publicId: { type: String, required: true },
          resourceType: { type: String, enum: ["image", "video", "raw"], default: "image" },
        },
        { _id: false },
      ),
      required: false,
    },
    facultyId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    joinCode: { type: String, required: true, uppercase: true, trim: true, minlength: 6, maxlength: 16 },
    isArchived: { type: Boolean, default: false, required: true },
    settings: {
      allowStudentPreviews: { type: Boolean, default: false },
    },
  },
  { timestamps: true, versionKey: false },
);

subjectSchema.index({ joinCode: 1 }, { unique: true, name: "subject_join_code_unique" });
subjectSchema.index({ facultyId: 1, updatedAt: -1 }, { name: "subject_faculty_updated" });

export type Subject = InferSchemaType<typeof subjectSchema>;
export const SubjectModel = model("Subject", subjectSchema);
