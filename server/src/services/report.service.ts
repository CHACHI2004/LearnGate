export type ReportScorePolicy = "best" | "latest";
export type ReportStudentStatus = "all" | "complete" | "in_progress" | "not_started";
export type ReportSort = "name" | "progress" | "averageScore" | "completedTopics";

export type ReportTopicInput = {
  id: string;
  title: string;
  order: number;
  quizTitle: string | null;
  scorePolicy: ReportScorePolicy;
};

export type ReportStudentInput = {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
};

export type ReportAttemptInput = {
  studentId: string;
  topicId: string;
  score: number | null;
  submittedAt: Date | null;
};

export type ReportProgressInput = {
  studentId: string;
  topicId: string;
  isCompleted: boolean;
  lastLessonAccessAt?: Date | null;
};

type ReportFilters = {
  search: string;
  status: ReportStudentStatus;
  sort: ReportSort;
  direction: "asc" | "desc";
  page: number;
  limit: number;
};

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

export function buildSubjectReport(
  topics: ReportTopicInput[],
  students: ReportStudentInput[],
  attempts: ReportAttemptInput[],
  progress: ReportProgressInput[],
  filters: ReportFilters,
) {
  const orderedTopics = [...topics].sort((left, right) => left.order - right.order);
  const attemptsByStudentAndTopic = new Map<string, ReportAttemptInput[]>();
  for (const attempt of attempts) {
    const key = `${attempt.studentId}:${attempt.topicId}`;
    const group = attemptsByStudentAndTopic.get(key) ?? [];
    group.push(attempt);
    attemptsByStudentAndTopic.set(key, group);
  }
  for (const group of attemptsByStudentAndTopic.values()) {
    group.sort((left, right) => (right.submittedAt?.getTime() ?? 0) - (left.submittedAt?.getTime() ?? 0));
  }

  const completedTopicsByStudent = new Map<string, Set<string>>();
  const activityTopicsByStudent = new Map<string, Set<string>>();
  for (const item of progress) {
    if (item.isCompleted || item.lastLessonAccessAt) {
      const activeTopics = activityTopicsByStudent.get(item.studentId) ?? new Set<string>();
      activeTopics.add(item.topicId);
      activityTopicsByStudent.set(item.studentId, activeTopics);
    }
    if (!item.isCompleted) continue;
    const completed = completedTopicsByStudent.get(item.studentId) ?? new Set<string>();
    completed.add(item.topicId);
    completedTopicsByStudent.set(item.studentId, completed);
  }

  const rows = students.map((student) => {
    const completed = completedTopicsByStudent.get(student.id) ?? new Set<string>();
    const studentTopics = orderedTopics.map((topic) => {
      const topicAttempts = attemptsByStudentAndTopic.get(`${student.id}:${topic.id}`) ?? [];
      const scores = topicAttempts.flatMap((attempt) => attempt.score === null ? [] : [attempt.score]);
      const latestScore = scores[0] ?? null;
      const bestScore = scores.length ? Math.max(...scores) : null;
      return {
        topicId: topic.id,
        attemptCount: topicAttempts.length,
        latestScore,
        bestScore,
        effectiveScore: topic.scorePolicy === "latest" ? latestScore : bestScore,
        isCompleted: completed.has(topic.id),
      };
    });
    const completedTopics = studentTopics.filter((topic) => topic.isCompleted).length;
    const progressPercent = orderedTopics.length ? Math.round((completedTopics / orderedTopics.length) * 100) : 0;
    const averageScore = average(studentTopics.flatMap((topic) => topic.effectiveScore === null ? [] : [topic.effectiveScore]));
    const hasStarted = studentTopics.some((topic) => topic.attemptCount > 0)
      || (activityTopicsByStudent.get(student.id)?.size ?? 0) > 0;
    return {
      studentId: student.id,
      name: `${student.firstName} ${student.lastName}`,
      username: student.username,
      hasStarted,
      completedTopics,
      totalTopics: orderedTopics.length,
      progressPercent,
      averageScore,
      topics: studentTopics,
    };
  });

  const normalizedSearch = filters.search.trim().toLocaleLowerCase();
  const filtered = rows.filter((row) => {
    const matchesSearch = !normalizedSearch
      || row.name.toLocaleLowerCase().includes(normalizedSearch)
      || row.username.toLocaleLowerCase().includes(normalizedSearch);
    const matchesStatus = filters.status === "all"
      || (filters.status === "complete" && row.totalTopics > 0 && row.completedTopics === row.totalTopics)
      || (filters.status === "in_progress" && row.hasStarted && row.completedTopics < row.totalTopics)
      || (filters.status === "not_started" && !row.hasStarted);
    return matchesSearch && matchesStatus;
  });
  const direction = filters.direction === "asc" ? 1 : -1;
  filtered.sort((left, right) => {
    if (filters.sort === "name") return left.name.localeCompare(right.name) * direction;
    const leftValue = filters.sort === "progress"
      ? left.progressPercent
      : filters.sort === "completedTopics"
        ? left.completedTopics
        : left.averageScore;
    const rightValue = filters.sort === "progress"
      ? right.progressPercent
      : filters.sort === "completedTopics"
        ? right.completedTopics
        : right.averageScore;
    if (leftValue === null) return rightValue === null ? left.name.localeCompare(right.name) : 1;
    if (rightValue === null) return -1;
    return (leftValue - rightValue) * direction;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / filters.limit));
  const page = Math.min(filters.page, totalPages);
  const pageStudents = filtered.slice((page - 1) * filters.limit, page * filters.limit);
  const topicStats = orderedTopics.map((topic, topicIndex) => {
    const cells = filtered.map((student) => student.topics[topicIndex]);
    const attempted = cells.filter((cell) => cell.attemptCount > 0);
    return {
      topicId: topic.id,
      title: topic.title,
      order: topic.order,
      quizTitle: topic.quizTitle,
      scorePolicy: topic.scorePolicy,
      studentsAttempted: attempted.length,
      attemptCount: cells.reduce((sum, cell) => sum + cell.attemptCount, 0),
      averageScore: average(attempted.flatMap((cell) => cell.effectiveScore === null ? [] : [cell.effectiveScore])),
      completedCount: cells.filter((cell) => cell.isCompleted).length,
      completionRate: cells.length ? Math.round((cells.filter((cell) => cell.isCompleted).length / cells.length) * 100) : 0,
    };
  });
  const averageProgress = average(filtered.map((student) => student.progressPercent)) ?? 0;
  const averageScore = average(filtered.flatMap((student) => student.averageScore === null ? [] : [student.averageScore]));
  const distribution = [
    { range: "0–59%", count: filtered.filter((student) => student.averageScore !== null && student.averageScore < 60).length },
    { range: "60–69%", count: filtered.filter((student) => student.averageScore !== null && student.averageScore >= 60 && student.averageScore < 70).length },
    { range: "70–79%", count: filtered.filter((student) => student.averageScore !== null && student.averageScore >= 70 && student.averageScore < 80).length },
    { range: "80–89%", count: filtered.filter((student) => student.averageScore !== null && student.averageScore >= 80 && student.averageScore < 90).length },
    { range: "90–100%", count: filtered.filter((student) => student.averageScore !== null && student.averageScore >= 90).length },
  ];

  return {
    students: pageStudents,
    topics: orderedTopics,
    topicStats,
    summary: {
      enrolledCount: students.length,
      filteredCount: total,
      averageProgress,
      averageScore,
      attemptedStudents: filtered.filter((student) => student.averageScore !== null).length,
      completionRate: averageProgress,
      scoreDistribution: distribution,
    },
    pagination: { page, limit: filters.limit, total, totalPages },
  };
}
