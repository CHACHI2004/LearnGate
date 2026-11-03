import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import type { RequestHandler } from "express";
import multer from "multer";
import { storeFileInBoth } from "./file-storage.service.js";

const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
export class ProfileImageValidationError extends Error {
  constructor() {
    super("Choose a valid JPG, PNG, or WebP image.");
    this.name = "ProfileImageValidationError";
  }
}

const allowedProfileImageTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const parseProfileImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROFILE_IMAGE_BYTES, files: 1 },
}).single("profileImage");

export const receiveProfileImage: RequestHandler = (request, response, next) => {
  parseProfileImage(request, response, (error) => {
    if (error instanceof multer.MulterError) {
      next(error);
      return;
    }
    if (error) {
      response.status(400).json({
        error: { code: "INVALID_MULTIPART", message: "The profile photo upload could not be processed." },
      });
      return;
    }
    next();
  });
};

export async function uploadProfileImage(file: Express.Multer.File) {
  const extension = file.originalname.split(".").pop()?.toLowerCase() ?? "";
  const detectedType = await fileTypeFromBuffer(file.buffer);
  const expectedType = allowedProfileImageTypes[extension];
  if (!expectedType || detectedType?.mime !== expectedType || file.mimetype !== expectedType) {
    throw new ProfileImageValidationError();
  }

  return storeFileInBoth({
    buffer: file.buffer,
    fileName: `${randomUUID()}.${extension}`,
    mimeType: expectedType,
    folder: "learngate/profiles",
    resourceType: "image",
  });
}
