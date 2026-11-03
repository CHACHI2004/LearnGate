import type { RequestHandler } from "express";
import { z } from "zod";
import { UserModel } from "../models/user.model.js";
import { publicUser } from "../services/auth.service.js";
import { uploadProfileImage } from "../services/profile-image.service.js";
import { deleteStoredFile } from "../services/file-storage.service.js";

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
}).strict();

export const getProfile: RequestHandler = async (request, response) => {
  const user = await UserModel.findById(request.auth!.userId);
  if (!user) {
    response.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found" } });
    return;
  }
  response.json({ data: { user: publicUser(user) } });
};

export const updateProfile: RequestHandler = async (request, response) => {
  const input = profileSchema.parse(request.body);
  const user = await UserModel.findByIdAndUpdate(
    request.auth!.userId,
    { $set: input },
    { new: true, runValidators: true },
  );
  if (!user) {
    response.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found" } });
    return;
  }
  response.json({ data: { user: publicUser(user) } });
};

export const updateProfileImage: RequestHandler = async (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: { code: "FILE_REQUIRED", message: "Choose a profile photo to upload" } });
    return;
  }
  const profileImage = await uploadProfileImage(request.file);
  const user = await UserModel.findById(request.auth!.userId);
  if (!user) {
    await deleteStoredFile(profileImage);
    response.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found" } });
    return;
  }
  const oldFile = user.profileImageFileId && user.profileImagePublicId
    ? {
        databaseFileId: user.profileImageFileId,
        publicId: user.profileImagePublicId,
        resourceType: "image" as const,
        deliveryType: "upload" as const,
      }
    : null;
  user.profileImage = profileImage.url;
  user.profileImageFileId = profileImage.databaseFileId;
  user.profileImagePublicId = profileImage.publicId;
  try {
    await user.save();
  } catch (error) {
    await deleteStoredFile(profileImage);
    throw error;
  }
  if (oldFile) await deleteStoredFile(oldFile);
  response.json({ data: { user: publicUser(user) } });
};
