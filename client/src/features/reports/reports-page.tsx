import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Download, FileSpreadsheet, FileText, Printer, Search } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, getApiError } from "@/services/api";
import { createXlsxWorkbook } from "./xlsx-export";

type ReportStatus = "all" | "complete" | "in_progress" | "not_started";
type ReportSort = "name" | "progress" | "averageScore" | "completedTopics";
type TopicCell = {
  topicId: string;
  attemptCount: number;
  latestScore: number | null;
  bestScore: number | null;
  effectiveScore: number | null;
  isCompleted: boolean;
};
type StudentReportRow = {
  studentId: string;
  name: string;
  username: string;
  hasStarted: boolean;
  completedTopics: number;
  totalTopics: number;
  progressPercent: number;
  averageScore: number | null;
  topics: TopicCell[];
};
type TopicReport = {
  id: string;
  title: string;
  order: number;
  quizTitle: string | null;
  scorePolicy: "best" | "latest";
};
type TopicStat = {
  topicId: string;
  title: string;
  order: number;
  quizTitle: string | null;
  scorePolicy: "best" | "latest";
  studentsAttempted: number;
  attemptCount: number;
  averageScore: number | null;
  completedCount: number;
  completionRate: number;
};
type ReportPayload = {
  subject: { name: string; code: string; term: string; academicYear: string };
  generatedAt: string;
  students: StudentReportRow[];
  topics: TopicReport[];
  topicStats: TopicStat[];
  summary: {
    enrolledCount: number;
    filteredCount: number;
    averageProgress: number;
    averageScore: number | null;
    attemptedStudents: number;
    completionRate: number;
    scoreDistribution: Array<{ range: string; count: number }>;
  };
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

const pageSize = 25;
const exportPageSize = 100;
const spreadsheetExportLimit = 5000;
const pdfExportLimit = 1000;

function displayScore(score: number | null) {
  return score === null ? "—" : `${score.toFixed(1)}%`;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function reportFileName(subject: ReportPayload["subject"], extension: string) {
  const safeName = `${subject.code}-${subject.name}`.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "");
  return `learngate-${safeName}-report.${extension}`;
}

export function ReportsPage() {
  const { id = "" } = useParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReportStatus>("all");
  const [sort, setSort] = useState<ReportSort>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [exportError, setExportError] = useState("");
  const query = useQuery({
    queryKey: ["subject-report", id, search, status, sort, direction, page],
    queryFn: async () => (await api.get<{ data: ReportPayload }>(`/reports/subjects/${id}`, {
      params: { search, status, sort, direction, page, limit: pageSize },
    })).data.data,
  });
  const data = query.data;
  const chartTopics = useMemo(() => (data?.topicStats ?? [])
    .filter((topic) => topic.averageScore !== null)
    .sort((left, right) => (right.averageScore ?? 0) - (left.averageScore ?? 0))
    .slice(0, 10)
    .map((topic) => ({ ...topic, chartScore: topic.averageScore ?? 0 })), [data?.topicStats]);

  async function loadExportRows(maxRows: number) {
    if (!data) throw new Error("Wait for the report to finish loading.");
    if (data.pagination.total > maxRows) {
      throw new Error(`This export supports up to ${maxRows.toLocaleString()} matching students. Narrow your search or filters and try again.`);
    }
    const pageCount = Math.ceil(data.pagination.total / exportPageSize);
    const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
    const result: StudentReportRow[] = [];
    for (let offset = 0; offset < pages.length; offset += 4) {
      const responses = await Promise.all(pages.slice(offset, offset + 4).map(async (exportPage) => (
        await api.get<{ data: ReportPayload }>(`/reports/subjects/${id}`, {
          params: { search, status, sort, direction, page: exportPage, limit: exportPageSize },
        })
      )));
      const batch = responses.map((response) => response.data.data.students);
      result.push(...batch.flat());
    }
    return result;
  }

  async function exportExcel() {
    setExporting("excel");
    setExportError("");
    try {
      const rows = await loadExportRows(spreadsheetExportLimit);
      const output = createXlsxWorkbook([
        {
          name: "Summary",
          rows: [
            ["LearnGate subject report"],
            ["Subject", data!.subject.name],
            ["Code", data!.subject.code],
            ["Term", `${data!.subject.term} ${data!.subject.academicYear}`],
            ["Generated", displayDate(data!.generatedAt)],
            ["Active students", data!.summary.enrolledCount],
            ["Filtered students", data!.pagination.total],
            ["Average score", data!.summary.averageScore === null ? "N/A" : `${data!.summary.averageScore}%`],
            ["Average progress", `${data!.summary.averageProgress}%`],
          ],
        },
        {
          name: "Score matrix",
          rows: [
            ["Student", "Username", "Progress", "Average score", ...data!.topics.map((topic) => topic.title)],
            ...rows.map((student) => [
              student.name,
              student.username,
              `${student.progressPercent}%`,
              student.averageScore === null ? "N/A" : `${student.averageScore}%`,
              ...student.topics.map((topic) => topic.effectiveScore === null ? "—" : `${topic.effectiveScore}%`),
            ]),
          ],
        },
        {
          name: "Topic performance",
          rows: [
            ["Topic", "Quiz", "Score policy", "Average score", "Students attempted", "Attempts", "Completion rate"],
            ...data!.topicStats.map((topic) => [
              topic.title,
              topic.quizTitle ?? "No quiz",
              topic.scorePolicy,
              topic.averageScore === null ? "N/A" : `${topic.averageScore}%`,
              topic.studentsAttempted,
              topic.attemptCount,
              `${topic.completionRate}%`,
            ]),
          ],
        },
      ]);
      const blob = new Blob([output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = reportFileName(data!.subject, "xlsx");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The spreadsheet could not be created.");
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    setExporting("pdf");
    setExportError("");
    try {
      const rows = await loadExportRows(pdfExportLimit);
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      pdf.setFontSize(18);
      pdf.setTextColor(23, 104, 79);
      pdf.text(`${data!.subject.code} · ${data!.subject.name}`, 40, 42);
      pdf.setFontSize(10);
      pdf.setTextColor(90, 105, 96);
      pdf.text(`Learning progress and scores · Generated ${displayDate(data!.generatedAt)}`, 40, 61);
      pdf.text(
        `${data!.pagination.total} students · Avg score ${displayScore(data!.summary.averageScore)} · Avg progress ${data!.summary.averageProgress}%`,
        40,
        78,
      );
      autoTable(pdf, {
        startY: 94,
        head: [["Topic", "Policy", "Avg score", "Students attempted", "Attempts", "Completion"]],
        body: data!.topicStats.map((topic) => [
          topic.title,
          topic.scorePolicy,
          displayScore(topic.averageScore),
          topic.studentsAttempted,
          topic.attemptCount,
          `${topic.completionRate}%`,
        ]),
        styles: { fontSize: 8, cellPadding: 5 },
        headStyles: { fillColor: [23, 104, 79] },
      });
      autoTable(pdf, {
        head: [[
          "Student",
          "Username",
          "Progress",
          "Average",
          ...data!.topics.map((topic) => `${topic.order + 1}. ${topic.title}`),
        ]],
        body: rows.map((student) => [
          student.name,
          student.username,
          `${student.completedTopics}/${student.totalTopics} (${student.progressPercent}%)`,
          displayScore(student.averageScore),
          ...student.topics.map((topic) => topic.effectiveScore === null ? "—" : displayScore(topic.effectiveScore)),
        ]),
        styles: { fontSize: 7, cellPadding: 4, overflow: "linebreak" },
        headStyles: { fillColor: [23, 104, 79] },
      });
      pdf.save(reportFileName(data!.subject, "pdf"));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The PDF report could not be created.");
    } finally {
      setExporting(null);
    }
  }

  function changeSort(nextSort: ReportSort) {
    setPage(1);
    if (nextSort === sort) setDirection(direction === "asc" ? "desc" : "asc");
    else {
      setSort(nextSort);
      setDirection(nextSort === "name" ? "asc" : "desc");
    }
  }

  if (query.isLoading) return <div className="route-message" role="status">Loading subject reports…</div>;
  if (query.isError || !data) return (
    <div className="form-message form-error" role="alert">
      {getApiError(query.error)} <button className="inline-action" onClick={() => void query.refetch()} type="button">Try again</button>
    </div>
  );

  return (
    <div className="reports-page">
      <Link className="back-link" to={`/subjects/${id}`}><ArrowLeft size={15} /> Back to subject</Link>
      <header className="reports-header">
        <div>
          <span className="subject-code">{data.subject.code} · {data.subject.term} {data.subject.academicYear}</span>
          <h1>Learning reports</h1>
          <p>Track scores, topic completion, and student progress in {data.subject.name}.</p>
        </div>
        <div className="reports-export-actions">
          <button className="secondary-button" disabled={Boolean(exporting) || query.isFetching} onClick={() => void exportExcel()} type="button">
            <FileSpreadsheet size={16} /> {exporting === "excel" ? "Preparing Excel…" : "Export Excel"}
          </button>
          <button className="secondary-button" disabled={Boolean(exporting) || query.isFetching} onClick={() => void exportPdf()} type="button">
            <FileText size={16} /> {exporting === "pdf" ? "Preparing PDF…" : "Export PDF"}
          </button>
          <button className="icon-button report-print-button" title="Print report" aria-label="Print report" onClick={() => window.print()} type="button"><Printer size={17} /></button>
        </div>
      </header>
      {exportError && <div className="form-message form-error" role="alert">{exportError}</div>}
      <section className="report-metrics" aria-label="Class overview">
        <article className="report-metric"><span>Enrolled</span><strong>{data.summary.enrolledCount}</strong><small>{data.pagination.total} match current filters</small></article>
        <article className="report-metric"><span>Average score</span><strong>{displayScore(data.summary.averageScore)}</strong><small>{data.summary.attemptedStudents} students with scores</small></article>
        <article className="report-metric"><span>Average progress</span><strong>{data.summary.averageProgress}%</strong><small>Topic completion per student</small></article>
        <article className="report-metric"><span>Topics tracked</span><strong>{data.topics.length}</strong><small>Includes topics without a quiz</small></article>
      </section>

      <section className="report-chart-grid" aria-label="Performance analytics">
        <article className="report-panel">
          <div className="report-panel-heading"><div><h2>Topic score overview</h2><p>Class average by topic for the selected students.</p></div></div>
          {chartTopics.length === 0
            ? <p className="report-empty">No quiz scores match the current filters yet.</p>
            : <div className="report-chart report-topic-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartTopics} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="title" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={66} />
                  <YAxis domain={[0, 100]} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} unit="%" width={44} />
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Average score"]} />
                  <Bar dataKey="chartScore" name="Average score" fill="#17684f" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>}
        </article>
        <article className="report-panel">
          <div className="report-panel-heading"><div><h2>Score distribution</h2><p>Student averages by score band.</p></div></div>
          <div className="report-chart report-distribution-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.summary.scoreDistribution} margin={{ top: 12, right: 10, bottom: 4, left: -18 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="range" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" name="Students" radius={[6, 6, 0, 0]} maxBarSize={42}>
                  {data.summary.scoreDistribution.map((item, index) => (
                    <Cell key={item.range} fill={["#d78678", "#d4a36a", "#a9b866", "#69a779", "#17684f"][index]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="report-panel report-topic-table-panel">
        <div className="report-panel-heading"><div><h2>Per-topic performance</h2><p>Average effective score follows each quiz’s best/latest scoring policy.</p></div></div>
        <div className="report-table-scroll">
          <table className="report-table">
            <thead><tr><th>Topic</th><th>Quiz</th><th>Policy</th><th>Avg score</th><th>Students attempted</th><th>Attempts</th><th>Completion</th></tr></thead>
            <tbody>{data.topicStats.map((topic) => <tr key={topic.topicId}>
              <td><strong>{topic.order + 1}. {topic.title}</strong></td>
              <td>{topic.quizTitle ?? <span className="report-muted">No quiz</span>}</td>
              <td className="report-capitalize">{topic.quizTitle ? topic.scorePolicy : "—"}</td>
              <td>{displayScore(topic.averageScore)}</td>
              <td>{topic.studentsAttempted}</td>
              <td>{topic.attemptCount}</td>
              <td>{topic.completionRate}%</td>
            </tr>)}
            {data.topicStats.length === 0 && <tr><td colSpan={7} className="report-empty">No active topics are available in this subject.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-panel report-student-panel">
        <div className="report-panel-heading report-student-heading">
          <div><h2>Student score matrix</h2><p>Effective score is the configured best or latest completed attempt.</p></div>
          <span className="report-updated">Updated {displayDate(data.generatedAt)}</span>
        </div>
        <div className="report-filters">
          <label className="report-search"><Search size={16} /><span className="sr-only">Search students</span>
            <input maxLength={80} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name or username" value={search} />
          </label>
          <label>Progress
            <select onChange={(event) => { setStatus(event.target.value as ReportStatus); setPage(1); }} value={status}>
              <option value="all">All students</option><option value="not_started">Not started</option>
              <option value="in_progress">In progress</option><option value="complete">Complete</option>
            </select>
          </label>
          <label>Sort by
            <select onChange={(event) => { setSort(event.target.value as ReportSort); setPage(1); }} value={sort}>
              <option value="name">Name</option><option value="progress">Progress</option>
              <option value="averageScore">Average score</option><option value="completedTopics">Completed topics</option>
            </select>
          </label>
          <button className="icon-button report-sort-direction" aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`} onClick={() => setDirection(direction === "asc" ? "desc" : "asc")} title={`Sort ${direction === "asc" ? "descending" : "ascending"}`}>
            {direction === "asc" ? <ArrowUp size={17} /> : <ArrowDown size={17} />}
          </button>
        </div>
        {query.isFetching && <div className="report-refresh" role="status">Refreshing report…</div>}
        <div className="report-table-scroll report-matrix-scroll">
          <table className="report-table report-matrix">
            <caption className="sr-only">Scores and lesson completion by student and topic</caption>
            <thead><tr>
              <th className="report-student-sticky"><button className="report-sort-button" onClick={() => changeSort("name")} type="button">Student</button></th>
              <th><button className="report-sort-button" onClick={() => changeSort("progress")} type="button">Progress</button></th>
              <th><button className="report-sort-button" onClick={() => changeSort("averageScore")} type="button">Average</button></th>
              {data.topics.map((topic) => <th key={topic.id} title={topic.title}>{topic.order + 1}. {topic.title}</th>)}
            </tr></thead>
            <tbody>{data.students.map((student) => <tr key={student.studentId}>
              <td className="report-student-sticky"><strong>{student.name}</strong><small>@{student.username}</small></td>
              <td><span className="report-progress-cell">{student.completedTopics}/{student.totalTopics} · {student.progressPercent}%</span></td>
              <td><strong>{displayScore(student.averageScore)}</strong></td>
              {student.topics.map((topic) => <td key={topic.topicId}>
                <span className={topic.isCompleted ? "report-score report-score-complete" : "report-score"}>
                  {displayScore(topic.effectiveScore)}
                </span>
                <small className="report-cell-meta">{topic.attemptCount ? `${topic.attemptCount} attempt${topic.attemptCount === 1 ? "" : "s"}` : topic.isCompleted ? "Complete" : "—"}</small>
              </td>)}
            </tr>)}
            {data.students.length === 0 && <tr><td colSpan={data.topics.length + 3} className="report-empty">No students match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="report-pagination">
          <span>Showing {data.pagination.total ? (data.pagination.page - 1) * data.pagination.limit + 1 : 0}–{Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of {data.pagination.total}</span>
          <div><button className="secondary-button" disabled={data.pagination.page <= 1 || query.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Previous</button>
            <span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
            <button className="secondary-button" disabled={data.pagination.page >= data.pagination.totalPages || query.isFetching} onClick={() => setPage((value) => value + 1)} type="button">Next</button></div>
        </div>
      </section>
      <p className="report-footnote"><Download size={14} /> Excel exports include all matching students (up to {spreadsheetExportLimit.toLocaleString()}); PDF exports support up to {pdfExportLimit.toLocaleString()} matching students.</p>
    </div>
  );
}
