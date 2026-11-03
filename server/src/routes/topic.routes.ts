import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { requireSubjectAccess } from "../middleware/resource-access.js";
import { asyncHandler } from "../utils/async-handler.js";
import { completeTopic, createTopic, deleteTopic, listTopics, readTopic, updateTopic } from "../controllers/topic.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/subjects/:id/topics", requireRoles("student", "faculty"), requireSubjectAccess, asyncHandler(listTopics));
router.post("/subjects/:id/topics", requireRoles("faculty"), requireSubjectAccess, asyncHandler(createTopic));
router.get("/subjects/:id/topics/:topicId", requireRoles("student", "faculty"), requireSubjectAccess, asyncHandler(readTopic));
router.post("/subjects/:id/topics/:topicId/complete", requireRoles("student"), requireSubjectAccess, asyncHandler(completeTopic));
router.patch("/subjects/:id/topics/:topicId", requireRoles("faculty"), requireSubjectAccess, asyncHandler(updateTopic));
router.delete("/subjects/:id/topics/:topicId", requireRoles("faculty"), requireSubjectAccess, asyncHandler(deleteTopic));
export default router;
