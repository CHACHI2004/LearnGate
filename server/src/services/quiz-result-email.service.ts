import { AttemptModel } from "../models/attempt.model.js";
import { QuizModel } from "../models/quiz.model.js";
import { SubjectModel } from "../models/subject.model.js";
import { TopicModel } from "../models/topic.model.js";
import { UserModel } from "../models/user.model.js";
import { escapeHtml, sendAccountEmail } from "./email.service.js";

type QuizResultEmailData = {
  recipientName: string;
  studentName: string;
  subjectName: string;
  quizTitle: string;
  score: number;
  passed: boolean;
  correctCount: number;
  questionCount: number;
  facultyNotification: boolean;
};

export function quizResultEmailHtml(data: QuizResultEmailData) {
  const recipientName = escapeHtml(data.recipientName);
  const studentName = escapeHtml(data.studentName);
  const subjectName = escapeHtml(data.subjectName);
  const quizTitle = escapeHtml(data.quizTitle);
  const result = data.passed ? "Passed" : "Not passed";
  const greeting = data.facultyNotification
    ? `Student ${studentName} submitted a quiz in ${subjectName}.`
    : `Your quiz result for ${subjectName} is ready.`;
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px;background:#f1f5f0;font-family:Arial,Helvetica,sans-serif;color:#183229;">
    <main style="max-width:560px;margin:0 auto;padding:32px;background:#fff;border:1px solid #dce5dc;border-radius:16px;">
      <p>Hi ${recipientName},</p>
      <p>${greeting}</p>
      <h1 style="font-size:22px;">${quizTitle}</h1>
      <p><strong>Score:</strong> ${data.score}% (${data.correctCount}/${data.questionCount} correct)</p>
      <p><strong>Result:</strong> ${result}</p>
    </main>
  </body>
</html>`;
}

export async function sendQuizResultNotifications(attempt: InstanceType<typeof AttemptModel>) {
  const [topic, student, quiz] = await Promise.all([
    TopicModel.findById(attempt.topicId).select("subjectId").lean(),
    UserModel.findById(attempt.studentId).select("firstName lastName email").lean(),
    QuizModel.findById(attempt.quizId).select("title").lean(),
  ]);
  if (!topic || !student || !quiz || attempt.score === null || typeof attempt.passed !== "boolean") {
    throw new Error("Quiz result notification data is unavailable");
  }

  const subject = await SubjectModel.findById(topic.subjectId).select("name facultyId").lean();
  if (!subject) throw new Error("Class is unavailable for quiz result notification");
  const faculty = await UserModel.findById(subject.facultyId).select("firstName lastName email").lean();
  if (!faculty) throw new Error("Class faculty is unavailable for quiz result notification");

  const studentName = `${student.firstName} ${student.lastName}`.trim();
  const score = Number(attempt.score);
  const common = {
    studentName,
    subjectName: subject.name,
    quizTitle: quiz.title,
    score,
    passed: attempt.passed,
    correctCount: Number(attempt.correctCount ?? 0),
    questionCount: Number(attempt.correctCount ?? 0) + Number(attempt.incorrectCount ?? 0),
  };
  const deliveries = [
    {
      label: "student",
      to: student.email,
      recipientName: student.firstName,
      facultyNotification: false,
    },
    ...(faculty.email.toLowerCase() === student.email.toLowerCase()
      ? []
      : [{
        label: "faculty",
        to: faculty.email,
        recipientName: `${faculty.firstName} ${faculty.lastName}`.trim(),
        facultyNotification: true,
      }]),
  ];

  const results = await Promise.allSettled(deliveries.map(({ to, recipientName, facultyNotification }) => {
    const data = { ...common, recipientName, facultyNotification };
    const subjectLine = facultyNotification
      ? `Quiz submitted: ${studentName} — ${quiz.title}`
      : `Your quiz result: ${quiz.title}`;
    const text = facultyNotification
      ? `${studentName} submitted "${quiz.title}" in ${subject.name}.\nScore: ${score}% (${common.correctCount}/${common.questionCount} correct).\nResult: ${attempt.passed ? "Passed" : "Not passed"}.`
      : `Hi ${student.firstName},\n\nYour result for "${quiz.title}" in ${subject.name} is ready.\nScore: ${score}% (${common.correctCount}/${common.questionCount} correct).\nResult: ${attempt.passed ? "Passed" : "Not passed"}.`;
    return sendAccountEmail(to, subjectLine, text, quizResultEmailHtml(data));
  }));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`Quiz result email delivery failed for ${deliveries[index].label}`,
        result.reason instanceof Error ? result.reason.message : "Unknown email error");
    }
  });
}
