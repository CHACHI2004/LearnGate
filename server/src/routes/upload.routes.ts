import { Router } from "express";
import { downloadAttachment, uploadAttachment, receiveUpload } from "../controllers/upload.controller.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { requireSubjectAccess } from "../middleware/resource-access.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = Router();
router.get(
  "/subjects/:id/topics/:topicId/attachments/:attachmentId",
  requireAuth,
  requireRoles("student", "faculty"),
  requireSubjectAccess,
  asyncHandler(downloadAttachment),
);
router.post(
  "/subjects/:id/topics/:topicId/attachments",
  requireAuth,
  requireRoles("faculty"),
  requireSubjectAccess,
  receiveUpload,
  asyncHandler(uploadAttachment),
);
export default router;
