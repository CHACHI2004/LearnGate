import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { ZodError } from "zod";
import { EmailDeliveryError } from "../services/email.service.js";
import { ProfileImageValidationError } from "../services/profile-image.service.js";

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof EmailDeliveryError) {
    response.status(503).json({ error: { code: "EMAIL_DELIVERY_FAILED", message: error.message } });
    return;
  }
  if (error instanceof ProfileImageValidationError) {
    response.status(400).json({ error: { code: "INVALID_PROFILE_IMAGE", message: error.message } });
    return;
  }
  if (error instanceof multer.MulterError) {
    response.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      error: {
        code: error.code,
        message: error.code === "LIMIT_FILE_SIZE" ? "File exceeds the upload size limit" : "Upload could not be processed",
      },
    });
    return;
  }
  if (error instanceof ZodError) {
    response.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: error.flatten() },
    });
    return;
  }
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    response.status(400).json({ error: { code: "INVALID_DATA", message: "The submitted data is invalid" } });
    return;
  }
  if (error instanceof mongoose.Error.MongooseServerSelectionError) {
    console.error("MongoDB is unavailable", error.message);
    response.status(503).json({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "LearnGate cannot reach MongoDB. Check Atlas network access and the server configuration.",
      },
    });
    return;
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === 50) {
    console.error("MongoDB query exceeded its time limit", error);
    response.status(503).json({
      error: {
        code: "DATABASE_QUERY_TIMEOUT",
        message: "MongoDB did not complete the request in time. Check the database connection and try again.",
      },
    });
    return;
  }
  if (error instanceof Error && error.message === "Origin is not allowed by CORS") {
    response.status(403).json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed" } });
    return;
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
    response.status(409).json({ error: { code: "ALREADY_EXISTS", message: "A record with that value already exists" } });
    return;
  }

  console.error("Unhandled request error", error);
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
};

export function notFoundHandler(_request: import("express").Request, response: import("express").Response) {
  response.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found" } });
}
