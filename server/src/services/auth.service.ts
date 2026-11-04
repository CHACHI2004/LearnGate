import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { EmailTokenModel } from "../models/email-token.model.js";
import { UserModel } from "../models/user.model.js";
import { EmailDeliveryError, sendAccountEmail, verificationEmailHtml } from "./email.service.js";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function createEmailToken(userId: string, purpose: "verify_email" | "reset_password") {
  const token = randomBytes(32).toString("base64url");
  await EmailTokenModel.create({
    userId,
    tokenHash: hashToken(token),
    purpose,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return token;
}

async function sendVerificationEmail(user: { id: string; email: string; firstName: string }) {
  await EmailTokenModel.deleteMany({ userId: user.id, purpose: "verify_email", usedAt: null });
  const token = await createEmailToken(user.id, "verify_email");
  const url = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendAccountEmail(
    user.email,
    "One quick step to join LearnGate — verify your email",
    `Hi ${user.firstName},\n\nVerify your LearnGate account using this secure link (expires in 1 hour):\n${url}\n\nIf you did not create an account, you can ignore this email.`,
    verificationEmailHtml(user.firstName, url),
  );
}

export async function registerUser(input: {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  role: "student" | "faculty";
  privacyConsent: true;
  facultyAccessCode?: string;
  profileImage?: string;
  profileImageFileId?: import("mongoose").Types.ObjectId;
  profileImagePublicId?: string;
}) {
  const existingUnverifiedUser = await UserModel.findOne({
    email: input.email,
    isEmailVerified: false,
  });
  if (existingUnverifiedUser) {
    await sendVerificationEmail({
      id: existingUnverifiedUser.id,
      email: existingUnverifiedUser.email,
      firstName: existingUnverifiedUser.firstName,
    });
    return {
      user: publicUser(existingUnverifiedUser),
      message: "This account is already registered but not verified. A new verification email has been sent.",
    };
  }

  const allowFacultyWithCode = Boolean(env.FACULTY_ACCESS_CODE)
    && input.facultyAccessCode === env.FACULTY_ACCESS_CODE;
  const facultyApprovalStatus = input.role === "faculty"
    ? allowFacultyWithCode ? "approved" : "pending"
    : "not_required";
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await UserModel.create({
    firstName: input.firstName,
    lastName: input.lastName,
    username: input.username,
    email: input.email,
    passwordHash,
    role: input.role,
    facultyApprovalStatus,
    privacyConsent: true,
    privacyConsentAt: new Date(),
    ...(input.profileImage ? { profileImage: input.profileImage } : {}),
    ...(input.profileImageFileId ? { profileImageFileId: input.profileImageFileId } : {}),
    ...(input.profileImagePublicId ? { profileImagePublicId: input.profileImagePublicId } : {}),
  });
  await sendVerificationEmail({ id: user.id, email: user.email, firstName: user.firstName });
  return {
    user: publicUser(user),
    message: input.role === "faculty" && facultyApprovalStatus === "pending"
      ? "Check your email to verify your account. Faculty access also requires administrator approval."
      : "Check your email to verify your account.",
  };
}

export async function verifyEmail(token: string) {
  const record = await EmailTokenModel.findOneAndUpdate(
    { tokenHash: hashToken(token), purpose: "verify_email", usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true },
  );
  if (!record) return false;
  await UserModel.updateOne({ _id: record.userId }, { $set: { isEmailVerified: true } });
  return true;
}

export async function authenticate(identifier: string, password: string) {
  const normalized = identifier.toLowerCase();
  const user = await UserModel.findOne({
    $or: [{ email: normalized }, { username: normalized }],
  }).select("+passwordHash");
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid || !user.isActive || !user.isEmailVerified) return null;
  return {
    user,
    token: jwt.sign({ authVersion: user.authVersion }, env.JWT_SECRET, {
      subject: user.id,
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    }),
  };
}

export async function requestPasswordReset(email: string) {
  const user = await UserModel.findOne({ email }).select("email");
  if (!user) return;
  const token = await createEmailToken(user.id, "reset_password");
  const url = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await sendAccountEmail(user.email, "Reset your LearnGate password", `Reset your password using this link:\n${url}`);
  } catch (error) {
    if (!(error instanceof EmailDeliveryError)) throw error;
  }
}

export async function resendVerification(email: string) {
  const user = await UserModel.findOne({ email, isEmailVerified: false }).select("email firstName");
  if (!user) return;
  try {
    await sendVerificationEmail({ id: user.id, email: user.email, firstName: user.firstName });
  } catch (error) {
    if (!(error instanceof EmailDeliveryError)) throw error;
  }
}

export async function resetPassword(token: string, password: string) {
  const record = await EmailTokenModel.findOneAndUpdate(
    { tokenHash: hashToken(token), purpose: "reset_password", usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true },
  );
  if (!record) return false;
  await UserModel.updateOne(
    { _id: record.userId },
    { $set: { passwordHash: await bcrypt.hash(password, 12) }, $inc: { authVersion: 1 } },
  );
  return true;
}

export function publicUser(user: {
  id?: string;
  _id?: { toString(): string };
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  isAdmin: boolean;
  isActive: boolean;
  isEmailVerified: boolean;
  facultyApprovalStatus: string;
  profileImage?: string | null;
}) {
  return {
    id: user.id ?? user._id?.toString() ?? "",
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    role: user.role,
    isAdmin: user.isAdmin,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    facultyApprovalStatus: user.facultyApprovalStatus,
    profileImage: user.profileImage ?? undefined,
  };
}
