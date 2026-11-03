import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  BookOpenText,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { api, getApiError } from "@/services/api";

type AdminAnalytics = {
  summary: {
    users: {
      total: number;
      active: number;
      students: number;
      faculty: number;
      admins: number;
      pendingFaculty: number;
    };
    subjects: { active: number; archived: number };
    learning: {
      publishedTopics: number;
      activeEnrollments: number;
      completedTopics: number;
      quizAttempts: number;
      averageQuizScore: number | null;
      passRate: number | null;
    };
  };
  trend: Array<{
    month: string;
    newAccounts: number;
    quizAttempts: number;
    topicCompletions: number;
  }>;
  activity: Array<{
    id: string;
    type: "account" | "subject" | "enrollment" | "quiz" | "completion";
    label: string;
    detail: string;
    at: string;
  }>;
  generatedAt: string;
};

const activityIcons = {
  account: UserPlus,
  subject: BookOpenText,
  enrollment: GraduationCap,
  quiz: ClipboardCheck,
  completion: CheckCircle2,
};

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminDashboard() {
  const query = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => (await api.get<{ data: AdminAnalytics }>("/admin/analytics", { timeout: 15_000 })).data.data,
    refetchInterval: 60_000,
  });

  if (query.isLoading) return <div className="route-message" role="status">Loading system analytics…</div>;
  if (query.isError || !query.data) {
    return (
      <div className="form-message form-error" role="alert">
        Could not load system analytics: {getApiError(query.error)}
        <button className="inline-action" disabled={query.isFetching} onClick={() => void query.refetch()} type="button">
          {query.isFetching ? "Trying again…" : "Try again"}
        </button>
      </div>
    );
  }

  const { summary, trend, activity, generatedAt } = query.data;
  const metrics = [
    { label: "Total accounts", value: summary.users.total.toLocaleString(), detail: `${summary.users.students} students · ${summary.users.faculty} faculty`, icon: Users },
    { label: "Active accounts", value: summary.users.active.toLocaleString(), detail: `${summary.users.admins} administrators`, icon: Activity },
    { label: "Active subjects", value: summary.subjects.active.toLocaleString(), detail: `${summary.subjects.archived} archived`, icon: BookOpenText },
    { label: "Active enrollments", value: summary.learning.activeEnrollments.toLocaleString(), detail: "Students enrolled system-wide", icon: GraduationCap },
    { label: "Published lessons", value: summary.learning.publishedTopics.toLocaleString(), detail: "Available to learners", icon: BookOpenCheck },
    { label: "Lessons completed", value: summary.learning.completedTopics.toLocaleString(), detail: "Recorded student completions", icon: CheckCircle2 },
    { label: "Quiz submissions", value: summary.learning.quizAttempts.toLocaleString(), detail: `Pass rate ${summary.learning.passRate === null ? "—" : `${summary.learning.passRate}%`}`, icon: ClipboardCheck },
    { label: "Average quiz score", value: summary.learning.averageQuizScore === null ? "—" : `${summary.learning.averageQuizScore}%`, detail: "Across submitted quizzes", icon: Activity },
  ];

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard-header">
        <div className="page-intro">
          <span className="eyebrow">SYSTEM OVERVIEW</span>
          <h1>Administration</h1>
          <p>System-wide accounts, learning progress, and recent activity.</p>
        </div>
        <Link className="primary-button link-button" to="/admin/users">Manage users <ArrowRight size={16} /></Link>
      </header>

      {summary.users.pendingFaculty > 0 && (
        <Link className="admin-pending-notice" to="/admin/users">
          <span><strong>{summary.users.pendingFaculty} faculty account{summary.users.pendingFaculty === 1 ? "" : "s"}</strong> waiting for approval</span>
          <ArrowRight size={16} />
        </Link>
      )}

      <section className="report-metrics admin-analytics-metrics" aria-label="System analytics">
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <article className="report-metric admin-analytics-metric" key={label}>
            <span className="admin-metric-label"><Icon aria-hidden="true" size={15} />{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>

      <section className="report-chart-grid admin-analytics-grid">
        <article className="report-panel">
          <div className="report-panel-heading">
            <div><h2>System activity</h2><p>Accounts and learning activity over the last six months.</p></div>
          </div>
          {trend.every((month) => !month.newAccounts && !month.quizAttempts && !month.topicCompletions)
            ? <p className="report-empty">No activity recorded in this period yet.</p>
            : <div className="report-chart admin-activity-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={35} />
                  <Tooltip />
                  <Bar dataKey="newAccounts" name="New accounts" fill="#17684f" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="quizAttempts" name="Quiz submissions" fill="#74ae8a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="topicCompletions" name="Lesson completions" fill="#d4a36a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>}
        </article>

        <article className="report-panel admin-activity-panel">
          <div className="report-panel-heading">
            <div><h2>Recent history</h2><p>Latest account, subject, and learning events.</p></div>
          </div>
          {activity.length === 0
            ? <p className="report-empty">No recent system activity is available.</p>
            : <ol className="admin-activity-list">
              {activity.map((item) => {
                const Icon = activityIcons[item.type];
                return (
                  <li className="admin-activity-item" key={item.id}>
                    <span className="admin-activity-icon"><Icon aria-hidden="true" size={15} /></span>
                    <div className="admin-activity-copy">
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                      <time dateTime={item.at}>{formatActivityDate(item.at)}</time>
                    </div>
                  </li>
                );
              })}
            </ol>}
        </article>
      </section>
      <p className="admin-analytics-updated">Updated {formatActivityDate(generatedAt)} · refreshes every minute</p>
    </div>
  );
}
