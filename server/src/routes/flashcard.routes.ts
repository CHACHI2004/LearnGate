import { Router } from "express";
import {
  createFlashcardDeck,
  deleteFlashcardDeck,
  flashcardGenerationRateLimit,
  listFlashcardDecks,
  readFlashcardDeck,
  receiveFlashcardPresentation,
  requireFlashcardAiProvider,
  updateFlashcardDeck,
} from "../controllers/flashcard.controller.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = Router();
router.use(requireAuth, requireRoles("student", "faculty"));
router.get("/", asyncHandler(listFlashcardDecks));
router.post(
  "/",
  flashcardGenerationRateLimit,
  requireFlashcardAiProvider,
  receiveFlashcardPresentation,
  asyncHandler(createFlashcardDeck),
);
router.get("/:deckId", asyncHandler(readFlashcardDeck));
router.put("/:deckId", asyncHandler(updateFlashcardDeck));
router.delete("/:deckId", asyncHandler(deleteFlashcardDeck));

export default router;
