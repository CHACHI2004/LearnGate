import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { UserModel } from "../models/user.model.js";
import { asyncHandler } from "../utils/async-handler.js";

type SessionClaims = {
  sub: string;
  authVersion: number;
};

export const requireAuth: RequestHandler = asyncHandler(async (request, response, next) => {
  const token = request.cookies?.[env.COOKIE_NAME];
  if (typeof token !== "string") {
    response.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Please sign in" } });
    return;
  }

  let claims: SessionClaims;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === "string" || typeof decoded.sub !== "string") throw new Error("Invalid session claims");
    if (typeof decoded.authVersion !== "number") throw new Error("Invalid session claims");
    claims = { sub: decoded.sub, authVersion: decoded.authVersion };
  } catch {
    response.clearCookie(env.COOKIE_NAME, cookieOptions());
    response.status(401).json({ error: { code: "SESSION_INVALID", message: "Your session expired or is invalid. Please sign in again." } });
    return;
  }

  if (!mongoose.isValidObjectId(claims.sub)) {
    response.clearCookie(env.COOKIE_NAME, cookieOptions());
    response.status(401).json({ error: { code: "SESSION_INVALID", message: "Your session is invalid. Please sign in again." } });
    return;
  }

  const user = await UserModel.findById(claims.sub)
    .select("firstName lastName username email role isAdmin isActive isEmailVerified facultyApprovalStatus authVersion profileImage")
    .maxTimeMS(5_000)
    .lean();
  if (!user || !user.isActive || !user.isEmailVerified || user.authVersion !== claims.authVersion) {
    response.clearCookie(env.COOKIE_NAME, cookieOptions());
    response.status(401).json({ error: { code: "SESSION_ACCOUNT_UNAVAILABLE", message: "This account is inactive, unverified, or its session was revoked. Please sign in again." } });
    return;
  }
  request.auth = { userId: user._id, role: user.role, isAdmin: user.isAdmin };
  response.locals.user = user;
  next();
});

export function requireRoles(...roles: Array<"student" | "faculty" | "admin">): RequestHandler {
  return (request, response, next) => {
    if (!request.auth || !roles.includes(request.auth.role)) {
      response.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have permission for this action" } });
      return;
    }
    if (request.auth.role === "faculty") {
      const user = response.locals.user as { facultyApprovalStatus?: string };
      if (user.facultyApprovalStatus !== "approved") {
        response.status(403).json({ error: { code: "FACULTY_PENDING", message: "Faculty approval is required" } });
        return;
      }
    }
    next();
  };
}

export const requireAdmin: RequestHandler = (request, response, next) => {
  if (!request.auth?.isAdmin || request.auth.role !== "admin") {
    response.status(403).json({ error: { code: "FORBIDDEN", message: "Administrator access is required" } });
    return;
  }
  next();
};

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_IS_SECURE,
    sameSite: env.COOKIE_IS_SECURE ? "none" as const : "lax" as const,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    path: "/",
  };
}

export function jwtCookieMaxAgeMs() {
  const [, amount, unit] = env.JWT_EXPIRES_IN.match(/^(\d+)([smhd])$/)!;
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(amount) * multipliers[unit as keyof typeof multipliers];
}
