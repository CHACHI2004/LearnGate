import { fileTypeFromBuffer } from "file-type";
import type { RequestHandler } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { getCloudinary } from "../config/cloudinary.js";
import { TopicModel } from "../models/topic.model.js";
import { isTopicUnlocked } from "../middleware/resource-access.js";
import { objectIdSchema } from "../validators/subject.validators.js";
import { deleteStoredFile, storeFileInBoth } from "../services/file-storage.service.js";

export const receiveUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.DOCUMENT_MAX_SIZE_MB * 1024 * 1024, files: 1 },
}).single("file");

const allowedMime = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
function isLegacyPpt(buffer: Buffer) {
  return buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}

export const uploadAttachment: RequestHandler = async (request, response) => {
  const { id, topicId } = request.params;
  const subjectId = objectIdSchema.parse(id);
  const topicObjectId = objectIdSchema.parse(topicId);
  const topic = await TopicModel.findOne({ _id: topicObjectId, subjectId, isArchived: false });
  if (!topic) {
    response.status(404).json({ error: { code: "TOPIC_NOT_FOUND", message: "Topic not found" } });
    return;
  }
  const file = request.file;
  if (!file) {
    response.status(400).json({ error: { code: "FILE_REQUIRED", message: "Choose a file to upload" } });
    return;
  }
  const extension = file.originalname.split(".").pop()?.toLowerCase();
  const detected = await fileTypeFromBuffer(file.buffer);
  const pptxZipHeader = file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const pptxSignature = pptxZipHeader
    && file.buffer.includes(Buffer.from("[Content_Types].xml"))
    && file.buffer.includes(Buffer.from("ppt/presentation.xml"));
  const detectedMime = extension === "ppt" && isLegacyPpt(file.buffer)
    ? "application/vnd.ms-powerpoint"
    : extension === "pptx" && pptxSignature
      ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      : detected?.mime;
  if (!detectedMime || !allowedMime.has(detectedMime) || file.mimetype !== detectedMime) {
    response.status(400).json({ error: { code: "UNSUPPORTED_FILE", message: "File content, extension, and MIME type must match an allowed format" } });
    return;
  }
  const expectedExtensions: Record<string, string[]> = {
    "application/pdf": ["pdf"],
    "application/vnd.ms-powerpoint": ["ppt"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/gif": ["gif"],
    "image/webp": ["webp"],
    "video/mp4": ["mp4"],
    "video/webm": ["webm"],
    "video/quicktime": ["mov"],
  };
  if (!expectedExtensions[detectedMime]?.includes(extension ?? "")) {
    response.status(400).json({ error: { code: "FILE_EXTENSION_MISMATCH", message: "File extension does not match its content" } });
    return;
  }
  const resourceType = detectedMime.startsWith("image/") ? "image"
    : detectedMime.startsWith("video/") ? "video" : "raw";
  const storedFile = await storeFileInBoth({
    buffer: file.buffer,
    fileName: file.originalname,
    mimeType: detectedMime,
    folder: "learngate/lessons",
    resourceType,
    authenticated: true,
  });
  const attachment = {
    url: storedFile.url,
    publicId: storedFile.publicId,
    databaseFileId: storedFile.databaseFileId,
    fileName: file.originalname,
    mimeType: detectedMime,
    sizeBytes: storedFile.sizeBytes,
    resourceType,
    deliveryType: storedFile.deliveryType,
  };
  try {
    topic.attachments.push(attachment);
    await topic.save();
  } catch (error) {
    await deleteStoredFile(storedFile);
    throw error;
  }
  response.status(201).json({ data: { attachment: topic.attachments.at(-1) } });
};

export const downloadAttachment: RequestHandler = async (request, response) => {
  const subjectId = objectIdSchema.parse(request.params.id);
  const topicId = objectIdSchema.parse(request.params.topicId);
  const attachmentId = objectIdSchema.parse(request.params.attachmentId);
  const topic = await TopicModel.findOne({
    _id: topicId,
    subjectId,
    isArchived: false,
    ...(request.auth!.role === "student" ? { isPublished: true } : {}),
  }).lean();
  if (!topic) {
    response.status(404).json({ error: { code: "ATTACHMENT_NOT_FOUND", message: "Lesson material not found" } });
    return;
  }
  if (request.auth!.role === "student" && !await isTopicUnlocked(request.auth!.userId, topic._id)) {
    response.status(403).json({ error: { code: "TOPIC_LOCKED", message: "Complete the previous topic to access this lesson" } });
    return;
  }
  const attachment = topic.attachments.find(({ _id }) => String(_id) === attachmentId);
  if (!attachment) {
    response.status(404).json({ error: { code: "ATTACHMENT_NOT_FOUND", message: "Lesson material not found" } });
    return;
  }
  const downloadUrl = getCloudinary().utils.private_download_url(
    attachment.publicId,
    attachment.fileName.split(".").pop() ?? "bin",
    {
      resource_type: attachment.resourceType,
      type: attachment.deliveryType ?? "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 300,
      attachment: true,
    },
  );
  response.setHeader("Cache-Control", "private, no-store");
  response.redirect(302, downloadUrl);
};
