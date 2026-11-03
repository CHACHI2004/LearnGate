import { Schema, model, type InferSchemaType } from "mongoose";

const emailTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true, select: false },
    purpose: { type: String, enum: ["verify_email", "reset_password"], required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

emailTokenSchema.index({ tokenHash: 1 }, { unique: true, name: "email_token_hash_unique" });
emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "email_token_expiry_ttl" });
emailTokenSchema.index({ userId: 1, purpose: 1, usedAt: 1 }, { name: "email_token_user_purpose_used" });

export type EmailToken = InferSchemaType<typeof emailTokenSchema>;
export const EmailTokenModel = model("EmailToken", emailTokenSchema);
