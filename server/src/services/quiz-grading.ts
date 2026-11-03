import type mongoose from "mongoose";

type GradedQuestion = {
  _id: mongoose.Types.ObjectId;
  type: "mcq" | "true_false" | "identification";
  points: number;
  correctAnswer: string | boolean;
};

type SubmittedAnswer = {
  questionId: mongoose.Types.ObjectId;
  value: unknown;
};

export type QuestionGrade = {
  questionId: mongoose.Types.ObjectId;
  isCorrect: boolean;
  pointsEarned: number;
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function gradeQuizAnswers(questions: GradedQuestion[], answers: SubmittedAnswer[]) {
  const answersByQuestion = new Map(answers.map((answer) => [String(answer.questionId), answer.value]));
  let earnedPoints = 0;
  let correctCount = 0;
  const details: QuestionGrade[] = questions.map((question) => {
    const answer = answersByQuestion.get(String(question._id));
    const isCorrect = question.type === "mcq"
      ? typeof answer === "string" && answer === question.correctAnswer
      : question.type === "true_false"
        ? typeof answer === "boolean" && answer === question.correctAnswer
        : typeof answer === "string"
          && typeof question.correctAnswer === "string"
          && normalizeText(answer) === normalizeText(question.correctAnswer);
    const pointsEarned = isCorrect ? question.points : 0;
    earnedPoints += pointsEarned;
    if (isCorrect) correctCount += 1;
    return { questionId: question._id, isCorrect, pointsEarned };
  });
  return { details, earnedPoints, correctCount };
}
