import { Router } from "express";
import { readProgress, readQuiz, reviewAttempt, saveAttemptAnswers, saveQuiz, startAttempt, submitAttempt } from "../controllers/quiz.controller.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { requireSubjectAccess } from "../middleware/resource-access.js";
import { asyncHandler } from "../utils/async-handler.js";
import { aiGenerationRateLimit, readAiGenerationJob, readAiQuota, receiveAiDocument, requireAiProvider, saveAiDraft, startAiGeneration } from "../controllers/ai-generation.controller.js";

const router = Router();
router.use(requireAuth);
router.get("/subjects/:id/topics/:topicId/quiz", requireRoles("student", "faculty"), requireSubjectAccess, asyncHandler(readQuiz));
router.put("/subjects/:id/topics/:topicId/quiz", requireRoles("faculty"), requireSubjectAccess, asyncHandler(saveQuiz));
router.post("/subjects/:id/topics/:topicId/quiz/attempts", requireRoles("student"), requireSubjectAccess, asyncHandler(startAttempt));
router.post("/attempts/:attemptId/submit", requireRoles("student"), asyncHandler(submitAttempt));
router.patch("/attempts/:attemptId/answers", requireRoles("student"), asyncHandler(saveAttemptAnswers));
router.get("/attempts/:attemptId/review", requireRoles("student"), asyncHandler(reviewAttempt));
router.get("/subjects/:id/progress", requireRoles("student"), asyncHandler(readProgress));
router.get("/ai/quota", requireRoles("faculty"), asyncHandler(readAiQuota));
router.post(
  "/subjects/:id/topics/:topicId/ai-generation",
  requireRoles("faculty"),
  requireSubjectAccess,
  aiGenerationRateLimit,
  requireAiProvider,
  receiveAiDocument,
  asyncHandler(startAiGeneration),
);
router.get(
  "/subjects/:id/ai-generation/:jobId",
  requireRoles("faculty"),
  requireSubjectAccess,
  asyncHandler(readAiGenerationJob),
);
router.post(
  "/subjects/:id/topics/:topicId/ai-generation/:jobId/save",
  requireRoles("faculty"),
  requireSubjectAccess,
  asyncHandler(saveAiDraft),
);
export default router;
