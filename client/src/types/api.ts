export type UserRole = "student" | "faculty" | "admin";
export type FlashcardSourceReference = { kind: "slide"; number: number };
export interface Flashcard {
  _id?: string;
  front: string;
  back: string;
  sourceReference: FlashcardSourceReference;
}
export interface FlashcardDeck {
  _id: string;
  title: string;
  fileName: string;
  fileType: "ppt" | "pptx";
  status: "queued" | "extracting" | "generating" | "ready" | "failed";
  progress: number;
  message: string;
  errorMessage: string | null;
  requestedCardCount: number;
  cards: Flashcard[];
  createdAt: string;
}
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: UserRole;
  isAdmin: boolean;
  isActive: boolean;
  isEmailVerified: boolean;
  facultyApprovalStatus: "not_required" | "pending" | "approved" | "rejected";
  profileImage?: string;
}

export interface Subject {
  _id: string;
  name: string;
  code: string;
  description: string;
  term: string;
  academicYear: string;
  themeColor: string;
  joinCode?: string;
  facultyName?: string;
}

export interface Topic {
  _id: string;
  title: string;
  description: string;
  content?: string;
  summary?: string;
  order: number;
  isPublished: boolean;
  isUnlocked?: boolean;
  isCompleted?: boolean;
  quizId?: string | null;
  hasQuiz?: boolean;
  attachments?: Array<{
    _id: string;
    url: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}
