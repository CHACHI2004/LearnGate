import type { RequestHandler } from "express";
import { authenticate, publicUser, registerUser, requestPasswordReset, resendVerification, resetPassword, verifyEmail } from "../services/auth.service.js";
import { cookieOptions, jwtCookieMaxAgeMs } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { emailSchema, loginSchema, registerSchema, resetPasswordSchema, tokenSchema } from "../validators/auth.validators.js";
import { uploadProfileImage } from "../services/profile-image.service.js";
import { deleteStoredFile } from "../services/file-storage.service.js";
import { UserModel } from "../models/user.model.js";

export const register: RequestHandler = async (request, response) => {
  const input = registerSchema.parse({
    ...request.body,
    privacyConsent: request.body.privacyConsent === true || request.body.privacyConsent === "true",
  });
  const profileImage = request.file ? await uploadProfileImage(request.file) : undefined;
  try {
    const result = await registerUser({
      ...input,
      ...(profileImage ? {
        profileImage: profileImage.url,
        profileImageFileId: profileImage.databaseFileId,
        profileImagePublicId: profileImage.publicId,
      } : {}),
    });
    response.status(201).json({ data: result });
  } catch (error) {
    if (profileImage && !await UserModel.exists({ profileImageFileId: profileImage.databaseFileId })) {
      await deleteStoredFile(profileImage);
    }
    throw error;
  }
};

export const login: RequestHandler = async (request, response) => {
  const input = loginSchema.parse(request.body);
  const result = await authenticate(input.identifier, input.password);
  if (!result) {
    response.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Credentials are invalid or the account is not yet available" } });
    return;
  }
  response.cookie(env.COOKIE_NAME, result.token, {
    ...cookieOptions(),
    maxAge: jwtCookieMaxAgeMs(),
  });
  response.json({ data: { user: publicUser(result.user) } });
};

export const logout: RequestHandler = (_request, response) => {
  response.clearCookie(env.COOKIE_NAME, cookieOptions());
  response.status(204).end();
};

export const verify: RequestHandler = async (request, response) => {
  const { token } = tokenSchema.parse(request.body);
  if (!await verifyEmail(token)) {
    response.status(400).json({ error: { code: "INVALID_OR_EXPIRED_TOKEN", message: "The verification link is invalid or expired" } });
    return;
  }
  response.json({ data: { message: "Email verified. You can now sign in." } });
};

export const resendVerify: RequestHandler = async (request, response) => {
  const { email } = emailSchema.parse(request.body);
  await resendVerification(email);
  response.status(202).json({ data: { message: "If the account needs verification, instructions will be sent." } });
};

export const forgotPassword: RequestHandler = async (request, response) => {
  const { email } = emailSchema.parse(request.body);
  await requestPasswordReset(email);
  response.status(202).json({ data: { message: "If an account matches that email, password reset instructions will be sent." } });
};

export const changePassword: RequestHandler = async (request, response) => {
  const { token, password } = resetPasswordSchema.parse(request.body);
  if (!await resetPassword(token, password)) {
    response.status(400).json({ error: { code: "INVALID_OR_EXPIRED_TOKEN", message: "The reset link is invalid or expired" } });
    return;
  }
  response.json({ data: { message: "Password updated. You can now sign in." } });
};

export const session: RequestHandler = async (request, response) => {
  const user = response.locals.user as Parameters<typeof publicUser>[0] | undefined;
  if (!user) {
    response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please sign in" } });
    return;
  }
  response.json({ data: { user: publicUser(user) } });
};
