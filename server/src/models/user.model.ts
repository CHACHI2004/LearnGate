import { Schema, model, type InferSchemaType } from "mongoose";

export const userRoles = ["student", "faculty", "admin"] as const;
export const facultyApprovalStatuses = ["not_required", "pending", "approved", "rejected"] as const;

const userSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 32,
      match: /^[a-z0-9._-]+$/,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: userRoles, required: true, default: "student" },
    isAdmin: { type: Boolean, default: false, required: true },
    isEmailVerified: { type: Boolean, default: false, required: true },
    facultyApprovalStatus: {
      type: String,
      enum: facultyApprovalStatuses,
      default: "not_required",
      required: true,
    },
    isActive: { type: Boolean, default: true, required: true },
    authVersion: { type: Number, default: 0, required: true, min: 0 },
    privacyConsent: { type: Boolean, required: true, validate: (value: boolean) => value === true },
    privacyConsentAt: { type: Date, required: true },
    profileImage: { type: String, trim: true, maxlength: 2048 },
    profileImageFileId: { type: Schema.Types.ObjectId, ref: "uploads.files" },
    profileImagePublicId: { type: String, trim: true },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index({ username: 1 }, { unique: true, name: "user_username_unique" });
userSchema.index({ email: 1 }, { unique: true, name: "user_email_unique" });
userSchema.index({ role: 1, facultyApprovalStatus: 1, createdAt: -1 }, { name: "user_role_approval_created" });

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
