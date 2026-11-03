import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpenText, CircleCheck, Clock3, FileText, GraduationCap, Plus, Target, TrendingUp, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api, getApiError } from "@/services/api";
import type { Subject } from "@/types/api";
import { useAuth } from "@/features/auth/auth-context";
import { AdminDashboard } from "@/features/admin/admin-dashboard";

type StudentProgressResponse = {
  data: {
    subject: { _id: string };
    summary: {
      topicCount: number;
      completedTopicCount: number;
      quizAttemptCount: number;
      scoredQuizAttemptCount: number;
      averageQuizScore: number | null;
      availableQuizCount: number;
    };
    recentAttempts: Array<{
      attemptId: string;
      topicId: string;
      topicTitle: string;
      score: number | null;
      passed: boolean | null;
      status: "submitted" | "expired";
      startedAt: string;
      submittedAt: string | null;
    }>;
  };
};

type FacultyDashboardResponse = {
  data: {
    summary: {
      subjectCount: number;
      studentCount: number;
      publishedTopicCount: number;
      draftTopicCount: number;
      publishedQuizCount: number;
      quizAttemptCount: number;
      averageQuizScore: number | null;
    };
    subjects: Array<Subject & {
      enrollmentCount: number;
      publishedTopics: number;
      draftTopics: number;
      publishedQuizzes: number;
      draftQuizzes: number;
    }>;
    recentAttempts: Array<{
      attemptId: string;
      subjectId: string | null;
      subjectName: string;
      topicId: string;
      topicTitle: string;
      quizTitle: string;
      studentName: string;
      score: number | null;
      passed: boolean | null;
      status: "submitted" | "expired";
      startedAt: string;
      submittedAt: string | null;
    }>;
  };
};

function FacultyDashboard({ userName }: { userName: string }) {
  const dashboardQuery = useQuery({
    queryKey: ["faculty-dashboard"],
    queryFn: async () => (await api.get<FacultyDashboardResponse>("/subjects/dashboard")).data.data,
  });
  const dashboard = dashboardQuery.data;

  function formatDate(value: string) {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
  }

  if (dashboardQuery.isLoading) return <div className="route-message" role="status">Loading your faculty dashboard…</div>;
  if (dashboardQuery.isError || !dashboard) return <div className="form-message form-error" role="alert">{getApiError(dashboardQuery.error)}<button className="inline-action" onClick={() => void dashboardQuery.refetch()}>Try again</button></div>;

  const { summary, subjects, recentAttempts } = dashboard;
  return (
    <>
      <section className="page-intro student-dashboard-intro">
        <span className="eyebrow">FACULTY WORKSPACE</span>
        <h1>Welcome back, {userName}</h1>
        <p>Manage your classes, monitor student activity, and keep lessons moving.</p>
      </section>

      <section className="student-dashboard-metrics" aria-label="Teaching summary">
        <article className="student-metric-card"><span className="student-metric-icon"><BookOpenText size={18} /></span><span className="student-metric-label">Your classes</span><strong>{summary.subjectCount}</strong><small>Active subjects</small></article>
        <article className="student-metric-card"><span className="student-metric-icon"><Users size={18} /></span><span className="student-metric-label">Enrolled students</span><strong>{summary.studentCount}</strong><small>Across your classes</small></article>
        <article className="student-metric-card"><span className="student-metric-icon"><FileText size={18} /></span><span className="student-metric-label">Published quizzes</span><strong>{summary.publishedQuizCount}</strong><small>{summary.draftTopicCount} unpublished lessons</small></article>
        <article className="student-metric-card"><span className="student-metric-icon"><TrendingUp size={18} /></span><span className="student-metric-label">Average quiz score</span><strong>{summary.averageQuizScore === null ? "—" : `${summary.averageQuizScore}%`}</strong><small>{summary.quizAttemptCount} completed attempts</small></article>
      </section>

      <div className="section-heading student-dashboard-section-heading">
        <div><h2>Your classes</h2><span>{subjects.length} {subjects.length === 1 ? "class" : "classes"}</span></div>
        <Link className="text-action" to="/subjects/new"><Plus size={16} /> Create subject</Link>
      </div>
      {subjects.length === 0 && <section className="empty-card"><span className="empty-icon"><BookOpenText size={23} /></span><h3>Create your first class</h3><p>Set up a subject to start adding lessons and resources for your students.</p><Link className="primary-button link-button" to="/subjects/new">Create subject <ArrowRight size={17} /></Link></section>}
      {subjects.length > 0 && <section className="faculty-subject-grid" aria-label="Your classes">
        {subjects.map((subject) => (
          <article className="faculty-subject-card" key={subject._id}>
            <div className="faculty-subject-heading">
              <span className="student-subject-color" style={{ backgroundColor: subject.themeColor }} />
              <div><span className="subject-code">{subject.code}</span><h3>{subject.name}</h3><p>{subject.term} · {subject.academicYear}</p></div>
            </div>
            <div className="faculty-subject-stats">
              <span><Users size={14} /> {subject.enrollmentCount} students</span>
              <span><BookOpenText size={14} /> {subject.publishedTopics} published lessons</span>
              <span><CircleCheck size={14} /> {subject.publishedQuizzes} published quizzes</span>
              {(subject.draftTopics > 0 || subject.draftQuizzes > 0) && <span className="faculty-draft-count">{subject.draftTopics} draft lessons · {subject.draftQuizzes} unpublished quizzes</span>}
            </div>
            <div className="faculty-subject-actions">
              <Link to={`/subjects/${subject._id}`}>Open class <ArrowRight size={14} /></Link>
              <Link to={`/subjects/${subject._id}/people`}>Students</Link>
              <Link to={`/subjects/${subject._id}/reports`}>Reports</Link>
            </div>
          </article>
        ))}
      </section>}

      <section className="student-recent-activity">
        <div className="section-heading"><div><h2>Recent student activity</h2><span>Latest completed quiz attempts across your classes</span></div></div>
        {recentAttempts.length === 0 && <div className="student-activity-empty"><Clock3 size={18} /><p>Completed student quiz attempts will appear here.</p></div>}
        {recentAttempts.length > 0 && <div className="student-activity-list">
          {recentAttempts.map((attempt) => (
            <article className="student-activity-item" key={attempt.attemptId}>
              <span className={`student-activity-result ${attempt.passed ? "passed" : "not-passed"}`}><Target size={16} /></span>
              <div className="student-activity-copy"><strong>{attempt.studentName} · {attempt.topicTitle}</strong><span>{attempt.subjectName} · {attempt.quizTitle} · {formatDate(attempt.submittedAt ?? attempt.startedAt)}</span></div>
              <strong className="student-activity-score">{attempt.score === null ? "No score" : `${attempt.score}%`}</strong>
              <span className={`student-activity-status ${attempt.passed ? "passed" : "not-passed"}`}>{attempt.passed ? "Passed" : "Not passed"}</span>
              {attempt.subjectId && <Link aria-label={`Open ${attempt.subjectName} report`} className="student-activity-link" to={`/subjects/${attempt.subjectId}/reports`}><ArrowRight size={16} /></Link>}
            </article>
          ))}
        </div>}
      </section>
    </>
  );
}

function StudentDashboard({
  userName,
  subjects,
  progress,
  progressLoading,
  progressError,
  retryProgress,
}: {
  userName: string;
  subjects: Subject[];
  progress?: StudentProgressResponse["data"][];
  progressLoading: boolean;
  progressError: string | null;
  retryProgress: () => void;
}) {
  const progressBySubject = new Map((progress ?? []).map((item) => [item.subject._id, item]));
  const totals = (progress ?? []).reduce((result, item) => ({
    topics: result.topics + item.summary.topicCount,
    completed: result.completed + item.summary.completedTopicCount,
    attempts: result.attempts + item.summary.quizAttemptCount,
    scoredAttempts: result.scoredAttempts + item.summary.scoredQuizAttemptCount,
    weightedScore: result.weightedScore + (item.summary.averageQuizScore ?? 0) * item.summary.scoredQuizAttemptCount,
    availableQuizzes: result.availableQuizzes + item.summary.availableQuizCount,
  }), { topics: 0, completed: 0, attempts: 0, scoredAttempts: 0, weightedScore: 0, availableQuizzes: 0 });
  const completionRate = totals.topics ? Math.round((totals.completed / totals.topics) * 100) : 0;
  const averageScore = totals.scoredAttempts
    ? Math.round(totals.weightedScore / totals.scoredAttempts * 10) / 10
    : null;
  const recentAttempts = (progress ?? []).flatMap((item) => {
    const subject = subjects.find(({ _id }) => _id === item.subject._id);
    return item.recentAttempts.map((attempt) => ({ ...attempt, subject }));
  }).sort((left, right) => new Date(right.submittedAt ?? right.startedAt).getTime() - new Date(left.submittedAt ?? left.startedAt).getTime()).slice(0, 6);

  function formatDate(value: string) {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
  }

  return (
    <>
      <section className="page-intro student-dashboard-intro">
        <span className="eyebrow">STUDENT WORKSPACE</span>
        <h1>Welcome back, {userName}</h1>
        <p>Track your learning progress, quiz results, and what to work on next.</p>
      </section>

      {progressError && <div className="form-message form-error" role="alert">{progressError}<button className="inline-action" onClick={retryProgress}>Try again</button></div>}

      <section className="student-dashboard-metrics" aria-label="Your learning summary">
        <article className="student-metric-card"><span className="student-metric-icon"><BookOpenText size={18} /></span><span className="student-metric-label">Enrolled subjects</span><strong>{subjects.length}</strong><small>Active courses</small></article>
        <article className="student-metric-card"><span className="student-metric-icon"><CircleCheck size={18} /></span><span className="student-metric-label">Lessons completed</span><strong>{progressLoading ? "—" : `${totals.completed}/${totals.topics}`}</strong><small>{progressLoading ? "Loading progress" : `${completionRate}% overall completion`}</small></article>
        <article className="student-metric-card"><span className="student-metric-icon"><Target size={18} /></span><span className="student-metric-label">Quiz attempts</span><strong>{progressLoading ? "—" : totals.attempts}</strong><small>{progressLoading ? "Loading results" : `${totals.availableQuizzes} published quizzes available`}</small></article>
        <article className="student-metric-card"><span className="student-metric-icon"><TrendingUp size={18} /></span><span className="student-metric-label">Average quiz score</span><strong>{progressLoading ? "—" : averageScore === null ? "—" : `${averageScore}%`}</strong><small>{progressLoading ? "Loading results" : averageScore === null ? "Complete a quiz to see your average" : `Across ${totals.scoredAttempts} scored attempts`}</small></article>
      </section>

      <div className="section-heading student-dashboard-section-heading">
        <div><h2>Your subjects</h2><span>{subjects.length} {subjects.length === 1 ? "subject" : "subjects"}</span></div>
        <Link className="text-action" to="/subjects/join"><Plus size={16} /> Join subject</Link>
      </div>
      {subjects.length === 0 && (
        <section className="empty-card">
          <span className="empty-icon"><BookOpenText size={23} /></span>
          <h3>Join your first subject</h3>
          <p>Use the join code shared by your faculty member to start learning.</p>
          <Link className="primary-button link-button" to="/subjects/join">Join subject <ArrowRight size={17} /></Link>
        </section>
      )}
      <section className="student-subject-progress-list" aria-label="Subject progress">
        {subjects.map((subject) => {
          const subjectProgress = progressBySubject.get(subject._id);
          const topicCount = subjectProgress?.summary.topicCount ?? 0;
          const completedCount = subjectProgress?.summary.completedTopicCount ?? 0;
          const percent = topicCount ? Math.round((completedCount / topicCount) * 100) : 0;
          return (
            <article className="student-subject-progress-card" key={subject._id}>
              <div className="student-subject-heading">
                <span className="student-subject-color" style={{ backgroundColor: subject.themeColor }} />
                <div><span className="subject-code">{subject.code}</span><h3>{subject.name}</h3><p>{subject.term} · {subject.academicYear}</p></div>
                <Link aria-label={`Open ${subject.name}`} className="student-subject-open" to={`/subjects/${subject._id}`}><ArrowRight size={17} /></Link>
              </div>
              <div className="student-subject-progress-meta"><span>{progressLoading ? "Loading progress…" : progressError ? "Progress unavailable" : `${completedCount} of ${topicCount} lessons complete`}</span><strong>{progressLoading || progressError ? "—" : `${percent}%`}</strong></div>
              <div className="student-progress-track" role="progressbar" aria-label={`${subject.name} lesson completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressLoading || progressError ? 0 : percent}><span style={{ width: `${progressLoading || progressError ? 0 : percent}%` }} /></div>
              <div className="student-subject-footer"><span><Target size={14} /> {subjectProgress?.summary.availableQuizCount ?? 0} quizzes available</span><Link to={`/subjects/${subject._id}`}>Continue learning <ArrowRight size={14} /></Link></div>
            </article>
          );
        })}
      </section>

      <section className="student-recent-activity">
        <div className="section-heading"><div><h2>Recent quiz activity</h2><span>Your latest results</span></div></div>
        {progressLoading && <div className="skeleton-card" aria-label="Loading recent quiz activity" />}
        {!progressLoading && !progressError && recentAttempts.length === 0 && <div className="student-activity-empty"><Clock3 size={18} /><p>Your completed quiz attempts will appear here.</p></div>}
        {!progressLoading && !progressError && recentAttempts.length > 0 && <div className="student-activity-list">
          {recentAttempts.map((attempt) => (
            <article className="student-activity-item" key={attempt.attemptId}>
              <span className={`student-activity-result ${attempt.passed ? "passed" : "not-passed"}`}><Target size={16} /></span>
              <div className="student-activity-copy"><strong>{attempt.topicTitle}</strong><span>{attempt.subject?.name ?? "Subject"} · {formatDate(attempt.submittedAt ?? attempt.startedAt)}</span></div>
              <strong className="student-activity-score">{attempt.score === null ? "No score" : `${attempt.score}%`}</strong>
              <span className={`student-activity-status ${attempt.passed ? "passed" : "not-passed"}`}>{attempt.passed ? "Passed" : "Try again"}</span>
              {attempt.subject && <Link aria-label={`Review ${attempt.topicTitle} quiz`} className="student-activity-link" to={`/subjects/${attempt.subject._id}/topics/${attempt.topicId}/quiz`}><ArrowRight size={16} /></Link>}
            </article>
          ))}
        </div>}
      </section>
    </>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const subjectsQuery = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get<{ data: Subject[] }>("/subjects")).data.data,
    enabled: user?.role !== "admin",
  });
  const subjects = subjectsQuery.data ?? [];
  const studentProgressQuery = useQuery({
    queryKey: ["student-dashboard-progress", subjects.map(({ _id }) => _id).join(",")],
    enabled: user?.role === "student" && Boolean(subjectsQuery.data),
    queryFn: async () => Promise.all(subjects.map(async (subject) => (
      (await api.get<StudentProgressResponse>(`/quizzes/subjects/${subject._id}/progress`)).data.data
    ))),
  });
  const title = user?.role === "faculty" ? "Your teaching space" : user?.role === "admin" ? "Administration" : "Your learning space";

  if (user?.role === "faculty" && user.facultyApprovalStatus !== "approved") {
    return <section className="notice-card"><h2>Faculty access pending</h2><p>Your account is verified, but a LearnGate administrator must approve faculty access.</p></section>;
  }
  if (user?.role === "admin") {
    return <AdminDashboard />;
  }
  if (user?.role === "faculty") {
    return <FacultyDashboard userName={user.firstName} />;
  }
  if (user?.role === "student") {
    if (subjectsQuery.isLoading) return <div className="route-message" role="status">Loading your learning dashboard…</div>;
    if (subjectsQuery.isError) return <div className="form-message form-error" role="alert">{getApiError(subjectsQuery.error)}<button className="inline-action" onClick={() => void subjectsQuery.refetch()}>Try again</button></div>;
    return <StudentDashboard
      userName={user.firstName}
      subjects={subjects}
      progress={studentProgressQuery.data}
      progressLoading={studentProgressQuery.isLoading}
      progressError={studentProgressQuery.isError ? getApiError(studentProgressQuery.error) : null}
      retryProgress={() => void studentProgressQuery.refetch()}
    />;
  }
  return (
    <>
      <section className="page-intro">
        <span className="eyebrow">{user?.role === "faculty" ? "FACULTY WORKSPACE" : "STUDENT WORKSPACE"}</span>
        <h1>{title}</h1>
        <p>{user?.role === "faculty" ? "Organize your subjects, lessons, and learning materials." : "Pick up where you left off and keep moving forward."}</p>
      </section>
      <div className="section-heading">
        <div><h2>{user?.role === "faculty" ? "Your subjects" : "Enrolled subjects"}</h2><span>{subjects.length} {subjects.length === 1 ? "subject" : "subjects"}</span></div>
        <Link className="text-action" to={user?.role === "faculty" ? "/subjects/new" : "/subjects/join"}>
          <Plus size={16} /> {user?.role === "faculty" ? "Create subject" : "Join subject"}
        </Link>
      </div>
      {subjectsQuery.isLoading && <div className="subject-grid" aria-label="Loading subjects"><div className="skeleton-card" /><div className="skeleton-card" /></div>}
      {subjectsQuery.isError && <div className="form-message form-error" role="alert">{getApiError(subjectsQuery.error)} <button className="inline-action" onClick={() => void subjectsQuery.refetch()}>Try again</button></div>}
      {!subjectsQuery.isLoading && !subjectsQuery.isError && subjects.length === 0 && (
        <section className="empty-card">
          <span className="empty-icon"><BookOpenText size={23} /></span>
          <h3>{user?.role === "faculty" ? "Create your first subject" : "Join your first subject"}</h3>
          <p>{user?.role === "faculty" ? "Set up a subject to start adding lessons and resources." : "Use the join code shared by your faculty member."}</p>
          <Link className="primary-button link-button" to={user?.role === "faculty" ? "/subjects/new" : "/subjects/join"}>
            {user?.role === "faculty" ? "Create subject" : "Join subject"} <ArrowRight size={17} />
          </Link>
        </section>
      )}
      <section className="subject-grid">
        {subjects.map((subject) => (
          <Link className="subject-card" key={subject._id} to={`/subjects/${subject._id}`}>
            <div className="subject-card-banner" style={{ backgroundColor: subject.themeColor }} />
            <div className="subject-card-content">
              <span className="subject-code">{subject.code}</span>
              <h3>{subject.name}</h3>
              <p>{subject.term} · {subject.academicYear}</p>
              {subject.facultyName && <span className="faculty-name"><GraduationCap size={15} /> {subject.facultyName}</span>}
              <span className="subject-open">Open subject <ArrowRight size={15} /></span>
            </div>
          </Link>
        ))}
      </section>
    </>
  );
}
