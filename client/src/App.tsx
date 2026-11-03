import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { AppLayout } from "./components/layout/app-layout";
import { ProtectedRoute } from "./routes/protected-route";
import { useAuth } from "./features/auth/auth-context";

const HomeRoute = lazy(() => import("./features/public/home-route").then((module) => ({ default: module.HomeRoute })));
const ProfilePage = lazy(() => import("./features/auth/profile-page").then((module) => ({ default: module.ProfilePage })));
const SubjectDetailPage = lazy(() => import("./features/subjects/subject-detail-page").then((module) => ({ default: module.SubjectDetailPage })));
const ClassesPage = lazy(() => import("./features/subjects/classes-page").then((module) => ({ default: module.ClassesPage })));
const SubjectFormPage = lazy(() => import("./features/subjects/subject-form-page").then((module) => ({ default: module.SubjectFormPage })));
const PeoplePage = lazy(() => import("./features/subjects/people-page").then((module) => ({ default: module.PeoplePage })));
const ReportsPage = lazy(() => import("./features/reports/reports-page").then((module) => ({ default: module.ReportsPage })));
const FlashcardsPage = lazy(() => import("./features/flashcards/flashcards-page").then((module) => ({ default: module.FlashcardsPage })));
const TopicEditorPage = lazy(() => import("./features/topics/topic-editor-page").then((module) => ({ default: module.TopicEditorPage })));
const TopicViewPage = lazy(() => import("./features/topics/topic-view-page").then((module) => ({ default: module.TopicViewPage })));
const QuizPage = lazy(() => import("./features/quizzes/quiz-page").then((module) => ({ default: module.QuizPage })));
const AdminUsersPage = lazy(() => import("./features/admin/users-page").then((module) => ({ default: module.AdminUsersPage })));
const AuthPage = lazy(() => import("./features/auth/auth-page").then((module) => ({ default: module.AuthPage })));

function LessonRoute() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  return (
    <Suspense fallback={<div className="route-message" role="status">Loading lesson tools…</div>}>
      {params.get("edit") === "true" && user?.role === "faculty" ? <TopicEditorPage /> : <TopicViewPage />}
    </Suspense>
  );
}

function App() {
  return (
    <Suspense fallback={<div className="route-message" role="status">Loading LearnGate…</div>}>
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/verify-email" element={<AuthPage mode="verify" />} />
      <Route path="/resend-verification" element={<AuthPage mode="resend" />} />
      <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
      <Route path="/reset-password" element={<AuthPage mode="reset" />} />
      <Route path="/" element={<HomeRoute />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route element={<ProtectedRoute roles={["student", "faculty"]} />}>
            <Route path="/classes" element={<Suspense fallback={<div className="route-message" role="status">Loading your classes…</div>}><ClassesPage /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute roles={["student", "faculty"]} />}>
            <Route path="/flashcards" element={<Suspense fallback={<div className="route-message" role="status">Loading flashcards…</div>}><FlashcardsPage /></Suspense>} />
            <Route path="/flashcards/:deckId" element={<Suspense fallback={<div className="route-message" role="status">Loading flashcards…</div>}><FlashcardsPage /></Suspense>} />
          </Route>
          <Route path="/subjects/:id" element={<SubjectDetailPage />} />
          <Route element={<ProtectedRoute roles={["faculty"]} />}>
            <Route path="/subjects/:id/people" element={<PeoplePage />} />
            <Route path="/subjects/:id/reports" element={<Suspense fallback={<div className="route-message" role="status">Loading reports…</div>}><ReportsPage /></Suspense>} />
          </Route>
          <Route path="/subjects/:id/topics/:topicId" element={<LessonRoute />} />
          <Route element={<ProtectedRoute roles={["student", "faculty"]} />}>
            <Route path="/subjects/:id/topics/:topicId/quiz" element={<Suspense fallback={<div className="route-message" role="status">Loading quiz…</div>}><QuizPage /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute roles={["faculty"]} />}>
            <Route path="/subjects/new" element={<SubjectFormPage />} />
            <Route path="/subjects/:id/edit" element={<SubjectFormPage edit />} />
            <Route path="/subjects/:id/topics/new" element={<Suspense fallback={<div className="route-message" role="status">Loading editor…</div>}><TopicEditorPage create /></Suspense>} />
          </Route>
          <Route element={<ProtectedRoute roles={["student"]} />}>
            <Route path="/subjects/join" element={<SubjectFormPage join />} />
          </Route>
          <Route element={<ProtectedRoute roles={["admin"]} />}>
            <Route path="/admin/users" element={<Suspense fallback={<div className="route-message" role="status">Loading users…</div>}><AdminUsersPage /></Suspense>} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

export default App;
