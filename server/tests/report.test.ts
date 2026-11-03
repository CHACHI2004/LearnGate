import { describe, expect, it } from "vitest";
import { buildSubjectReport } from "../src/services/report.service.js";

const topics = [
  { id: "topic-1", title: "Foundations", order: 0, quizTitle: "Foundations quiz", scorePolicy: "best" as const },
  { id: "topic-2", title: "Applications", order: 1, quizTitle: "Applications quiz", scorePolicy: "latest" as const },
];
const students = [
  { id: "student-a", firstName: "Ari", lastName: "Adams", username: "ari" },
  { id: "student-b", firstName: "Bea", lastName: "Baker", username: "bea" },
  { id: "student-c", firstName: "Cal", lastName: "Clark", username: "cal" },
];
const attempts = [
  { studentId: "student-a", topicId: "topic-1", score: 50, submittedAt: new Date("2026-01-01") },
  { studentId: "student-a", topicId: "topic-1", score: 80, submittedAt: new Date("2026-01-02") },
  { studentId: "student-a", topicId: "topic-2", score: 90, submittedAt: new Date("2026-01-01") },
  { studentId: "student-a", topicId: "topic-2", score: 60, submittedAt: new Date("2026-01-02") },
  { studentId: "student-b", topicId: "topic-1", score: 95, submittedAt: new Date("2026-01-03") },
];
const progress = [
  { studentId: "student-a", topicId: "topic-1", isCompleted: true },
  { studentId: "student-b", topicId: "topic-1", isCompleted: false },
];
const filters = {
  search: "",
  status: "all" as const,
  sort: "name" as const,
  direction: "asc" as const,
  page: 1,
  limit: 25,
};

describe("subject learning reports", () => {
  it("uses each quiz score policy for the student score matrix", () => {
    const report = buildSubjectReport(topics, students, attempts, progress, filters);
    expect(report.students[0]).toMatchObject({
      name: "Ari Adams",
      completedTopics: 1,
      progressPercent: 50,
      averageScore: 70,
      topics: [
        { latestScore: 80, bestScore: 80, effectiveScore: 80, isCompleted: true },
        { latestScore: 60, bestScore: 90, effectiveScore: 60 },
      ],
    });
    expect(report.topicStats.map(({ averageScore, studentsAttempted }) => ({ averageScore, studentsAttempted })))
      .toEqual([{ averageScore: 87.5, studentsAttempted: 2 }, { averageScore: 60, studentsAttempted: 1 }]);
  });

  it("filters and sorts rows before paginating and reports matching totals", () => {
    const report = buildSubjectReport(topics, students, attempts, progress, {
      ...filters,
      search: "ari",
      status: "in_progress",
      sort: "averageScore",
      direction: "desc",
      limit: 1,
    });
    expect(report.students.map(({ studentId }) => studentId)).toEqual(["student-a"]);
    expect(report.pagination).toEqual({ page: 1, limit: 1, total: 1, totalPages: 1 });
    expect(report.summary.filteredCount).toBe(1);
    expect(report.summary.averageScore).toBe(70);
  });

  it("keeps students without scores visible and places them after scored students", () => {
    const report = buildSubjectReport(topics, students, attempts, progress, {
      ...filters,
      sort: "averageScore",
      direction: "desc",
    });
    expect(report.students.map(({ studentId }) => studentId)).toEqual(["student-b", "student-a", "student-c"]);
    expect(report.students[2].averageScore).toBeNull();
    expect(report.summary.scoreDistribution.reduce((sum, item) => sum + item.count, 0)).toBe(2);
  });

  it("counts failed attempts as activity when filtering students by progress", () => {
    const inProgress = buildSubjectReport(topics, students, attempts, progress, {
      ...filters,
      status: "in_progress",
    });
    const notStarted = buildSubjectReport(topics, students, attempts, progress, {
      ...filters,
      status: "not_started",
    });
    expect(inProgress.students.map(({ studentId }) => studentId)).toEqual(["student-a", "student-b"]);
    expect(notStarted.students.map(({ studentId }) => studentId)).toEqual(["student-c"]);
  });
});
