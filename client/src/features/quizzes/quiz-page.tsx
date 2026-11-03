import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ArrowLeft, CheckCircle2, Clock3, FileSpreadsheet, Plus, Save, Trash2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/features/auth/auth-context";
import { api, getApiError } from "@/services/api";

type QuestionType = "mcq" | "true_false" | "identification";
type Choice = { id: string; text: string };
type QuizQuestion = {
  id: string;
  type: QuestionType;
  questionText: string;
  choices: Choice[];
  correctAnswer: string | boolean;
  points: number;
  explanation: string;
  sourceReference?: { kind: "slide" | "page"; number: number };
};
type QuizSettings = {
  title: string;
  description: string;
  timeLimitSeconds: number;
  passingScore: number;
  scorePolicy: "best" | "latest";
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  showCorrectAnswers: boolean;
  isPublished: boolean;
};
type EditableQuiz = QuizSettings & { questions: Array<Record<string, unknown>> };
type StudentQuiz = {
  _id: string;
  title: string;
  description: string;
  timeLimitSeconds: number;
  passingScore: number;
  questionCount: number;
  hasPassedAttempt: boolean;
  attempts: Array<{
    _id: string;
    status: "active" | "submitted" | "expired";
    startedAt: string;
    expiresAt: string;
    submittedAt: string | null;
    score: number | null;
    passed: boolean | null;
  }>;
};
type AttemptQuestion = {
  _id: string;
  type: QuestionType;
  questionText: string;
  choices: Choice[];
  points: number;
  correctAnswer?: string | boolean;
  answer?: string | boolean | null;
  isCorrect?: boolean;
  pointsEarned?: number;
  explanation?: string;
};
type QuizAttempt = {
  _id: string;
  status: "active" | "submitted" | "expired";
  expiresAt: string;
  score: number | null;
  passed: boolean | null;
  correctCount: number | null;
  incorrectCount: number | null;
  questions: AttemptQuestion[];
  answers: Array<{ questionId: string; value: string | boolean }>;
};
type GenerationJob = {
  jobId: string;
  status: "queued" | "extracting" | "generating" | "review" | "failed";
  progress: number;
  message: string;
  fileName: string;
  errorMessage: string | null;
  questions?: Array<Record<string, unknown>>;
  quota: { used: number; limit: number; remaining: number };
};

const initialSettings: QuizSettings = {
  title: "Topic quiz",
  description: "",
  timeLimitSeconds: 600,
  passingScore: 75,
  scorePolicy: "best",
  shuffleQuestions: true,
  shuffleChoices: true,
  showCorrectAnswers: false,
  isPublished: false,
};

function makeChoice(text = ""): Choice {
  return { id: `choice-${Math.random().toString(36).slice(2, 10)}`, text };
}

function makeQuestion(): QuizQuestion {
  const choices = [makeChoice(), makeChoice(), makeChoice(), makeChoice()];
  return {
    id: `question-${Math.random().toString(36).slice(2, 10)}`,
    type: "mcq",
    questionText: "",
    choices,
    correctAnswer: choices[0].id,
    points: 1,
    explanation: "",
  };
}

function parseChoices(value: unknown): Choice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((choice): Choice[] => {
    if (typeof choice !== "object" || choice === null || !("id" in choice) || !("text" in choice)) return [];
    if (typeof choice.id !== "string" || typeof choice.text !== "string") return [];
    return [{ id: choice.id, text: choice.text }];
  });
}

function parseSourceReference(value: unknown): QuizQuestion["sourceReference"] {
  if (typeof value !== "object" || value === null || !("kind" in value) || !("number" in value)) return undefined;
  if ((value.kind !== "slide" && value.kind !== "page") || typeof value.number !== "number"
    || !Number.isInteger(value.number) || value.number < 1) return undefined;
  return { kind: value.kind, number: value.number };
}

function fromQuestion(value: Record<string, unknown>): QuizQuestion {
  const choices = parseChoices(value.choices);
  const sourceReference = parseSourceReference(value.sourceReference);
  return {
    id: String(value._id ?? `question-${Math.random().toString(36).slice(2, 10)}`),
    type: value.type === "true_false" || value.type === "identification" ? value.type : "mcq",
    questionText: String(value.questionText ?? ""),
    choices: choices.map((choice) => ({ id: String(choice.id), text: String(choice.text) })),
    correctAnswer: typeof value.correctAnswer === "boolean" ? value.correctAnswer : String(value.correctAnswer ?? ""),
    points: Number(value.points ?? 1),
    explanation: String(value.explanation ?? ""),
    ...(sourceReference ? { sourceReference } : {}),
  };
}

function parseDelimited(source: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new Error("A quoted field is not closed. Check the imported rows.");
  return rows;
}

function mapImportRows(rows: unknown[][]): QuizQuestion[] {
  const values = rows.map((row) => row.map((value) => String(value ?? "").trim())).filter((row) => row.some(Boolean));
  const first = values[0]?.map((cell) => cell.toLowerCase().replace(/[\s_-]+/g, "")) ?? [];
  const hasHeader = first.some((cell) => ["question", "questiontext", "prompt"].includes(cell));
  const headers = hasHeader ? first : ["question", "choice1", "choice2", "choice3", "choice4", "answer", "points", "explanation"];
  const dataRows = hasHeader ? values.slice(1) : values;
  const get = (row: string[], aliases: string[]) => {
    const index = headers.findIndex((header) => aliases.includes(header));
    return index >= 0 ? row[index] ?? "" : "";
  };

  const questions = dataRows.filter((row) => row.some(Boolean)).map((row, rowIndex) => {
    const rowNumber = rowIndex + (hasHeader ? 2 : 1);
    const questionText = get(row, ["question", "questiontext", "prompt"]);
    const rawAnswer = get(row, ["answer", "correctanswer", "correct"]);
    const rawType = get(row, ["type", "questiontype"]).toLowerCase().replace(/[\s-]+/g, "_");
    const rawPoints = get(row, ["points", "point"]);
    const explanation = get(row, ["explanation", "feedback"]);
    const choices = Array.from({ length: 8 }, (_, index) =>
      get(row, [`choice${index + 1}`, `option${index + 1}`, `answer${index + 1}`, String.fromCharCode(97 + index)])
        .trim(),
    ).filter(Boolean).map((text) => makeChoice(text));
    if (!questionText) throw new Error(`Row ${rowNumber}: add a question.`);
    const type: QuestionType = rawType === "true_false" || rawType === "truefalse"
      ? "true_false"
      : rawType === "identification" || rawType === "short_answer"
        ? "identification"
        : choices.length >= 2 ? "mcq" : "identification";
    const points = rawPoints ? Number(rawPoints) : 1;
    if (!Number.isFinite(points) || points <= 0 || points > 100) {
      throw new Error(`Row ${rowNumber}: points must be greater than 0 and no more than 100.`);
    }
    if (type === "mcq") {
      if (choices.length < 2) throw new Error(`Row ${rowNumber}: multiple-choice questions need at least two choices.`);
      const byIndex = Number(rawAnswer) - 1;
      const byLetter = /^[a-h]$/i.test(rawAnswer) ? rawAnswer.toLowerCase().charCodeAt(0) - 97 : -1;
      const correctChoice = choices.find((choice) => choice.text.toLowerCase() === rawAnswer.toLowerCase())
        ?? choices[byIndex]
        ?? choices[byLetter];
      if (!correctChoice) throw new Error(`Row ${rowNumber}: answer must match a choice, its letter, or its 1-based position.`);
      return { ...makeQuestion(), questionText, choices, correctAnswer: correctChoice.id, points, explanation };
    }
    if (type === "true_false") {
      if (!["true", "false"].includes(rawAnswer.toLowerCase())) {
        throw new Error(`Row ${rowNumber}: true/false answer must be true or false.`);
      }
      return { ...makeQuestion(), type, questionText, choices: [], correctAnswer: rawAnswer.toLowerCase() === "true", points, explanation };
    }
    if (!rawAnswer) throw new Error(`Row ${rowNumber}: add the correct answer.`);
    const question: QuizQuestion = { ...makeQuestion(), type: "identification", questionText, choices: [], correctAnswer: rawAnswer, points, explanation };
    return question;
  });
  if (!questions.length) throw new Error("No quiz questions were found in the selected file or pasted text.");
  if (questions.length > 20) throw new Error("A quiz can contain no more than 20 questions.");
  return questions;
}

function mapRowsFromText(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiterCount = (line: string, delimiter: string) => {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === '"' && line[index + 1] === '"' && quoted) index += 1;
      else if (line[index] === '"') quoted = !quoted;
      else if (line[index] === delimiter && !quoted) count += 1;
    }
    return count;
  };
  const delimiter = ["\t", ",", "|"].sort((left, right) =>
    delimiterCount(firstLine, right) - delimiterCount(firstLine, left),
  )[0];
  return mapImportRows(parseDelimited(text, delimiter));
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function AiGenerationPanel({
  subjectId,
  topicId,
  onQuestions,
  onJobChange,
}: {
  subjectId: string;
  topicId: string;
  onQuestions: (questions: QuizQuestion[]) => void;
  onJobChange: (jobId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState("mixed");
  const [questionType, setQuestionType] = useState("mixed");
  const [prompt, setPrompt] = useState("");
  const [jobId, setJobId] = useState("");
  const appliedJobId = useRef("");
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a PDF or PPTX file first.");
      const body = new FormData();
      body.append("file", file);
      body.append("questionCount", String(questionCount));
      body.append("difficulty", difficulty);
      body.append("questionType", questionType);
      body.append("prompt", prompt.trim());
      return (await api.post<{ data: { jobId: string } }>(
        `/quizzes/subjects/${subjectId}/topics/${topicId}/ai-generation`,
        body,
        { headers: { "Content-Type": "multipart/form-data" } },
      )).data.data;
    },
    onSuccess: async ({ jobId: nextJobId }) => {
      setJobId(nextJobId);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onJobChange(nextJobId);
      appliedJobId.current = "";
      await queryClient.invalidateQueries({ queryKey: ["ai-quota"] });
    },
  });
  const jobQuery = useQuery({
    queryKey: ["ai-generation-job", subjectId, jobId],
    enabled: Boolean(jobId),
    queryFn: async () => (await api.get<{ data: GenerationJob }>(
      `/quizzes/subjects/${subjectId}/ai-generation/${jobId}`,
    )).data.data,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ["queued", "extracting", "generating"].includes(status) ? 1500 : false;
    },
  });

  useEffect(() => {
    const result = jobQuery.data;
    if (!result || result.status !== "review" || !result.questions || appliedJobId.current === result.jobId) return;
    onQuestions(result.questions.map(fromQuestion));
    appliedJobId.current = result.jobId;
  }, [jobQuery.data, onQuestions]);

  const running = Boolean(jobQuery.data && ["queued", "extracting", "generating"].includes(jobQuery.data.status));
  const quota = jobQuery.data?.quota;
  return (
    <section className="quiz-ai-generator" aria-labelledby="ai-generator-heading">
      <div className="quiz-section-heading"><div><h2 id="ai-generator-heading">Generate from a presentation</h2><p>Choose the question format and add instructions for the quiz you want.</p></div><span className="quiz-ai-badge">AI ASSISTED</span></div>
      <div className="quiz-ai-options">
        <label>Presentation or PDF
          <input accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" disabled={running || start.isPending} onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
          }} ref={fileInputRef} type="file" />
        </label>
        <label>Questions<select disabled={running || start.isPending} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}><option value={5}>5 questions</option><option value={10}>10 questions</option><option value={15}>15 questions</option><option value={20}>20 questions</option></select></label>
        <label>Difficulty<select disabled={running || start.isPending} value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
        <label>Question format<select disabled={running || start.isPending} value={questionType} onChange={(event) => setQuestionType(event.target.value)}><option value="mixed">Mixed types</option><option value="mcq">Multiple choice</option><option value="true_false">True or false</option><option value="identification">Short answer</option></select></label>
        <button className="secondary-button" disabled={!file || running || start.isPending} onClick={() => start.mutate()} type="button">{start.isPending ? "Uploading…" : running ? "Generating…" : "Generate questions"}</button>
      </div>
      <label className="quiz-ai-prompt">Quiz instructions (optional)
        <textarea disabled={running || start.isPending} maxLength={1000} onChange={(event) => setPrompt(event.target.value)} placeholder="Example: Focus on real-world applications. Use scenario-based questions and test the key terms from slides 3–8." rows={3} value={prompt} />
        <small>Describe the topics, scenarios, or style you want. The questions will stay grounded in the uploaded material.</small>
      </label>
      {file && <p className="quiz-ai-file">Selected: {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</p>}
      {start.isError && <div className="form-message form-error" role="alert">{getApiError(start.error)}</div>}
      {jobQuery.isError && <div className="form-message form-error" role="alert">{getApiError(jobQuery.error)}</div>}
      {jobQuery.data && <div className="quiz-ai-job" aria-live="polite">
        <div className="quiz-ai-job-meta"><strong>{jobQuery.data.message}</strong><span>{jobQuery.data.progress}%</span></div>
        <div className="quiz-ai-progress" role="progressbar" aria-label="AI quiz generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={jobQuery.data.progress}><span style={{ width: `${jobQuery.data.progress}%` }} /></div>
        <p>{jobQuery.data.fileName}{quota && ` · ${quota.remaining} of ${quota.limit} monthly generations remaining`}</p>
        {jobQuery.data.status === "review" && <p className="form-success quiz-ai-ready"><CheckCircle2 size={15} /> Questions were loaded below. Review and edit every answer before saving.</p>}
        {jobQuery.data.status === "failed" && <div className="form-message form-error" role="alert">{jobQuery.data.errorMessage ?? "Generation failed."}</div>}
      </div>}
    </section>
  );
}

export function QuizPage() {
  const { id = "", topicId = "" } = useParams();
  const { user } = useAuth();
  const faculty = user?.role === "faculty";
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState(initialSettings);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [answerValues, setAnswerValues] = useState<Record<string, string | boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [reviewAttemptId, setReviewAttemptId] = useState("");
  const [answerSaveError, setAnswerSaveError] = useState("");
  const [aiJobId, setAiJobId] = useState("");
  const answerSaveQueue = useRef<Promise<void>>(Promise.resolve());

  const quizQuery = useQuery({
    queryKey: ["quiz", id, topicId, faculty ? "faculty" : "student"],
    queryFn: async () => (await api.get<{ data: EditableQuiz | StudentQuiz | null }>(
      `/quizzes/subjects/${id}/topics/${topicId}/quiz`,
    )).data.data,
  });

  useEffect(() => {
    if (!faculty || !quizQuery.data || !("questions" in quizQuery.data)) return;
    const quiz = quizQuery.data;
    setSettings({
      title: quiz.title,
      description: quiz.description,
      timeLimitSeconds: quiz.timeLimitSeconds,
      passingScore: quiz.passingScore,
      scorePolicy: quiz.scorePolicy,
      shuffleQuestions: quiz.shuffleQuestions,
      shuffleChoices: quiz.shuffleChoices,
      showCorrectAnswers: quiz.showCorrectAnswers,
      isPublished: quiz.isPublished,
    });
    setQuestions(quiz.questions.map(fromQuestion));
  }, [faculty, quizQuery.data]);

  const saveQuiz = useMutation({
    mutationFn: async () => {
      const payload = {
        ...settings,
        questions: questions.map((question) => question.type === "mcq"
          ? {
            type: question.type,
            questionText: question.questionText,
            choices: question.choices,
            correctAnswer: question.correctAnswer,
            points: question.points,
            explanation: question.explanation,
            ...(question.sourceReference ? { sourceReference: question.sourceReference } : {}),
          }
          : {
            type: question.type,
            questionText: question.questionText,
            correctAnswer: question.correctAnswer,
            points: question.points,
            explanation: question.explanation,
            ...(question.sourceReference ? { sourceReference: question.sourceReference } : {}),
          }),
      };
      const saved = (await api.put<{ data: EditableQuiz }>(
        `/quizzes/subjects/${id}/topics/${topicId}/quiz`,
        payload,
      )).data.data;
      if (aiJobId) {
        await api.post(`/quizzes/subjects/${id}/topics/${topicId}/ai-generation/${aiJobId}/save`);
      }
      return saved;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["quiz", id, topicId] }),
        queryClient.invalidateQueries({ queryKey: ["topics", id] }),
        queryClient.invalidateQueries({ queryKey: ["topic", id, topicId] }),
      ]);
    },
  });

  const startAttempt = useMutation({
    mutationFn: async () => (await api.post<{ data: QuizAttempt }>(
      `/quizzes/subjects/${id}/topics/${topicId}/quiz/attempts`,
    )).data.data,
    onSuccess: (activeAttempt) => {
      setAttempt(activeAttempt);
      setAnswerValues(Object.fromEntries(activeAttempt.answers.map(({ questionId, value }) => [questionId, value])));
      setReviewAttemptId("");
    },
  });
  const submitAttempt = useMutation({
    mutationFn: async (answers: Record<string, string | boolean>) => {
      if (!attempt) throw new Error("No active quiz attempt");
      return (await api.post<{ data: QuizAttempt }>(
        `/quizzes/attempts/${attempt._id}/submit`,
        { answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })) },
      )).data.data;
    },
    onSuccess: async (result) => {
      setAttempt(null);
      setReviewAttemptId(result._id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["quiz", id, topicId] }),
        queryClient.invalidateQueries({ queryKey: ["progress", id] }),
        queryClient.invalidateQueries({ queryKey: ["topics", id] }),
      ]);
    },
  });
  const reviewQuery = useQuery({
    queryKey: ["quiz-review", reviewAttemptId],
    enabled: Boolean(reviewAttemptId),
    queryFn: async () => (await api.get<{ data: QuizAttempt & { review: AttemptQuestion[]; showCorrectAnswers: boolean } }>(
      `/quizzes/attempts/${reviewAttemptId}/review`,
    )).data.data,
  });

  useEffect(() => {
    if (!attempt) return;
    const attemptId = attempt._id;
    const timer = window.setTimeout(() => {
      const save = answerSaveQueue.current.catch(() => undefined).then(async () => {
        await api.patch(`/quizzes/attempts/${attemptId}/answers`, {
          answers: Object.entries(answerValues).map(([questionId, value]) => ({ questionId, value })),
        });
        setAnswerSaveError("");
      });
      answerSaveQueue.current = save;
      void save.catch((error: unknown) => {
        if (axios.isAxiosError<{ error?: { code?: string } }>(error)
          && error.response?.data.error?.code === "ATTEMPT_ALREADY_SUBMITTED") return;
        setAnswerSaveError(getApiError(error));
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [attempt?._id, answerValues]);

  const studentQuiz = !faculty && quizQuery.data && !("questions" in quizQuery.data)
    ? quizQuery.data
    : null;
  const reviewQuestions = reviewQuery.data?.review ?? [];

  useEffect(() => {
    if (!attempt) return;
    const updateTime = () => {
      const remaining = Math.max(0, Math.ceil((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && !submitAttempt.isPending) submitAttempt.mutate(answerValues);
    };
    updateTime();
    const timer = window.setInterval(updateTime, 1000);
    return () => window.clearInterval(timer);
  }, [attempt, answerValues, submitAttempt.isPending, submitAttempt.mutate]);

  const totalPoints = useMemo(() => questions.reduce((total, question) => total + question.points, 0), [questions]);

  function updateQuestion(questionId: string, update: Partial<QuizQuestion>) {
    setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, ...update } : question));
  }

  function importQuestions(nextQuestions: QuizQuestion[]) {
    if (questions.length + nextQuestions.length > 20) {
      throw new Error("A quiz can contain no more than 20 questions. Remove a question before importing.");
    }
    setQuestions((current) => [...current, ...nextQuestions]);
    setImportMessage(`Imported ${nextQuestions.length} question${nextQuestions.length === 1 ? "" : "s"}.`);
  }

  async function importFile(file: File) {
    setImportMessage("");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Keep question files under 5 MB.");
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const { default: readXlsxFile } = await import("read-excel-file/browser");
        const sheets = await readXlsxFile(file);
        const firstSheet = sheets[0];
        if (!firstSheet) throw new Error("The spreadsheet does not contain a worksheet.");
        importQuestions(mapImportRows(firstSheet.data));
      } else {
        importQuestions(mapRowsFromText(await file.text()));
      }
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "The file could not be imported.");
    }
  }

  if (quizQuery.isLoading) return <div className="route-message" role="status">Loading quiz…</div>;
  if (quizQuery.isError) return <div className="form-message form-error" role="alert">{getApiError(quizQuery.error)}</div>;

  if (faculty) {
    const existing = quizQuery.data && "questions" in quizQuery.data ? quizQuery.data : null;
    return (
      <section className="quiz-page">
        <Link className="back-link" to={`/subjects/${id}/topics/${topicId}`}><ArrowLeft size={15} /> Back to lesson</Link>
        <span className="eyebrow">QUIZ BUILDER</span>
        <h1>{existing ? "Edit topic quiz" : "Create a topic quiz"}</h1>
        <p className="quiz-intro">Write questions, bring in a spreadsheet, and set a fair time limit before publishing.</p>
        <form className="quiz-editor" onSubmit={(event) => { event.preventDefault(); saveQuiz.mutate(); }}>
          <section className="form-panel quiz-settings">
            <h2>Quiz settings</h2>
            <div className="quiz-settings-grid">
              <label>Quiz title<input maxLength={160} required value={settings.title} onChange={(event) => setSettings({ ...settings, title: event.target.value })} /></label>
              <label>Time limit (minutes)<input type="number" min={1} max={240} required value={Math.round(settings.timeLimitSeconds / 60)} onChange={(event) => setSettings({ ...settings, timeLimitSeconds: Number(event.target.value) * 60 })} /></label>
              <label>Passing score (%)<input type="number" min={1} max={100} required value={settings.passingScore} onChange={(event) => setSettings({ ...settings, passingScore: Number(event.target.value) })} /></label>
              <label>Score policy<select value={settings.scorePolicy} onChange={(event) => setSettings({ ...settings, scorePolicy: event.target.value === "latest" ? "latest" : "best" })}><option value="best">Keep best attempt</option><option value="latest">Use latest attempt</option></select></label>
            </div>
            <label>Description<textarea rows={2} maxLength={3000} value={settings.description} onChange={(event) => setSettings({ ...settings, description: event.target.value })} /></label>
            <div className="quiz-toggle-list">
              <label><input checked={settings.shuffleQuestions} onChange={(event) => setSettings({ ...settings, shuffleQuestions: event.target.checked })} type="checkbox" /> Shuffle questions</label>
              <label><input checked={settings.shuffleChoices} onChange={(event) => setSettings({ ...settings, shuffleChoices: event.target.checked })} type="checkbox" /> Shuffle answer choices</label>
              <label><input checked={settings.showCorrectAnswers} onChange={(event) => setSettings({ ...settings, showCorrectAnswers: event.target.checked })} type="checkbox" /> Show correct answers after submission</label>
              <label><input checked={settings.isPublished} onChange={(event) => setSettings({ ...settings, isPublished: event.target.checked })} type="checkbox" /> Publish quiz to enrolled students</label>
            </div>
          </section>

          <section className="form-panel quiz-import">
            <div className="quiz-section-heading"><div><h2>Import questions</h2><p>Use a spreadsheet or paste delimited rows.</p></div><FileSpreadsheet size={20} /></div>
            <p className="quiz-import-format">First worksheet or pasted columns: question, type, choice1–choice8, answer, points, explanation. Types: mcq, true_false, identification. For MCQ, answer can be the choice text, A–H, or its 1-based position.</p>
            <label className="quiz-file-button">Choose CSV or XLSX<input accept=".csv,.tsv,.txt,.xlsx" type="file" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.currentTarget.value = "";
            }} /></label>
            <label className="quiz-paste-label">Paste CSV, TSV, or pipe-separated questions<textarea maxLength={1_000_000} rows={4} placeholder={'question,type,choice1,choice2,answer,points\\nWhat is 2 + 2?,mcq,3,4,4,1'} value={pasteText} onChange={(event) => setPasteText(event.target.value)} /></label>
            <div className="quiz-import-actions"><button className="secondary-button" disabled={!pasteText.trim()} onClick={() => {
              try { importQuestions(mapRowsFromText(pasteText)); setPasteText(""); }
              catch (error) { setImportMessage(error instanceof Error ? error.message : "Could not import pasted questions."); }
            }} type="button">Import pasted questions</button>{importMessage && <span role="status">{importMessage}</span>}</div>
          </section>

          <AiGenerationPanel
            onJobChange={setAiJobId}
            onQuestions={setQuestions}
            subjectId={id}
            topicId={topicId}
          />

          <section className="quiz-question-list">
            <div className="quiz-section-heading"><div><h2>Questions</h2><p>{questions.length} of 20 · {totalPoints} points total</p></div><button className="secondary-button" disabled={questions.length >= 20} onClick={() => setQuestions([...questions, makeQuestion()])} type="button"><Plus size={16} /> Add question</button></div>
            {questions.map((question, index) => (
              <article className="form-panel quiz-question-card" key={question.id}>
                <div className="quiz-question-heading"><strong>Question {index + 1}</strong><button aria-label={`Remove question ${index + 1}`} className="icon-button" onClick={() => setQuestions(questions.filter(({ id: questionKey }) => questionKey !== question.id))} type="button"><Trash2 size={16} /></button></div>
                {question.sourceReference && <p className="quiz-source-reference">Source: {question.sourceReference.kind === "slide" ? "Slide" : "Page"} {question.sourceReference.number}</p>}
                <label>Question text<textarea required minLength={3} maxLength={2000} rows={2} value={question.questionText} onChange={(event) => updateQuestion(question.id, { questionText: event.target.value })} /></label>
                <div className="quiz-question-settings">
                  <label>Question type<select value={question.type} onChange={(event) => {
                    const type = event.target.value as QuestionType;
                    const choices = type === "mcq" ? (question.choices.length >= 2 ? question.choices : [makeChoice(), makeChoice()]) : [];
                    updateQuestion(question.id, {
                      type,
                      choices,
                      correctAnswer: type === "true_false" ? false : type === "identification" ? "" : choices[0]?.id ?? "",
                    });
                  }}><option value="mcq">Multiple choice</option><option value="true_false">True or false</option><option value="identification">Short answer</option></select></label>
                  <label>Points<input type="number" min="0.01" max="100" step="0.01" required value={question.points} onChange={(event) => updateQuestion(question.id, { points: Number(event.target.value) })} /></label>
                </div>
                {question.type === "mcq" && <fieldset className="quiz-choice-list"><legend>Answer choices · select the correct answer</legend>{question.choices.map((choice, choiceIndex) => <div className="quiz-choice-row" key={choice.id}><input aria-label={`Mark choice ${choiceIndex + 1} correct`} checked={question.correctAnswer === choice.id} name={`correct-${question.id}`} onChange={() => updateQuestion(question.id, { correctAnswer: choice.id })} type="radio" /><input aria-label={`Choice ${choiceIndex + 1}`} maxLength={2000} required value={choice.text} onChange={(event) => updateQuestion(question.id, { choices: question.choices.map((item) => item.id === choice.id ? { ...item, text: event.target.value } : item) })} /><button aria-label={`Remove choice ${choiceIndex + 1}`} className="icon-button" disabled={question.choices.length <= 2} onClick={() => {
                    const nextChoices = question.choices.filter((item) => item.id !== choice.id);
                    updateQuestion(question.id, { choices: nextChoices, correctAnswer: question.correctAnswer === choice.id ? nextChoices[0].id : question.correctAnswer });
                  }} type="button"><Trash2 size={14} /></button></div>)}<button className="inline-action" disabled={question.choices.length >= 8} onClick={() => updateQuestion(question.id, { choices: [...question.choices, makeChoice()] })} type="button"><Plus size={14} /> Add choice</button></fieldset>}
                {question.type === "true_false" && <fieldset className="quiz-choice-list"><legend>Correct answer</legend><label><input checked={question.correctAnswer === true} name={`correct-${question.id}`} onChange={() => updateQuestion(question.id, { correctAnswer: true })} type="radio" /> True</label><label><input checked={question.correctAnswer === false} name={`correct-${question.id}`} onChange={() => updateQuestion(question.id, { correctAnswer: false })} type="radio" /> False</label></fieldset>}
                {question.type === "identification" && <label>Accepted answer<input required maxLength={1000} value={typeof question.correctAnswer === "string" ? question.correctAnswer : ""} onChange={(event) => updateQuestion(question.id, { correctAnswer: event.target.value })} /></label>}
                <label>Explanation (optional)<textarea rows={2} maxLength={2000} value={question.explanation} onChange={(event) => updateQuestion(question.id, { explanation: event.target.value })} /></label>
              </article>
            ))}
            {questions.length === 0 && <div className="empty-card compact-empty">Add a question or import a question sheet to get started.</div>}
          </section>
          {saveQuiz.isError && <div className="form-message form-error" role="alert">{getApiError(saveQuiz.error)}</div>}
          {saveQuiz.isSuccess && <div className="form-message form-success" role="status"><CheckCircle2 size={17} /> Quiz saved.</div>}
          <div className="quiz-save-row"><Link className="text-action" to={`/subjects/${id}/topics/${topicId}`}>Cancel</Link><button className="primary-button" disabled={saveQuiz.isPending} type="submit"><Save size={16} /> {saveQuiz.isPending ? "Saving…" : "Save quiz"}</button></div>
        </form>
      </section>
    );
  }

  if (!studentQuiz) {
    return <section className="quiz-page"><Link className="back-link" to={`/subjects/${id}/topics/${topicId}`}><ArrowLeft size={15} /> Back to lesson</Link><div className="empty-card compact-empty"><h2>Quiz unavailable</h2><p>Your instructor has not published a quiz for this lesson yet.</p></div></section>;
  }
  const activeQuizAttempt = studentQuiz.attempts.find(({ status }) => status === "active");
  const hasPassedAttempt = studentQuiz.hasPassedAttempt;

  if (attempt) {
    return (
      <section className="quiz-page quiz-taking-page">
        <Link className="back-link" to={`/subjects/${id}/topics/${topicId}`}><ArrowLeft size={15} /> Back to lesson</Link>
        <div className="quiz-timer" role="timer" aria-live="polite"><Clock3 size={17} /> Time left <strong>{formatTime(secondsLeft)}</strong></div>
        <span className="eyebrow">QUIZ IN PROGRESS</span><h1>{studentQuiz.title}</h1>
        <form className="quiz-question-list" onSubmit={(event) => { event.preventDefault(); submitAttempt.mutate(answerValues); }}>
          {attempt.questions.map((question, index) => (
            <article className="form-panel quiz-question-card" key={question._id}>
              <div className="quiz-question-heading"><strong>Question {index + 1}</strong><span>{question.points} point{question.points === 1 ? "" : "s"}</span></div>
              <h2>{question.questionText}</h2>
              {question.type === "mcq" && question.choices.map((choice) => <label className="quiz-answer-choice" key={choice.id}><input checked={answerValues[question._id] === choice.id} name={question._id} onChange={() => setAnswerValues({ ...answerValues, [question._id]: choice.id })} type="radio" /><span>{choice.text}</span></label>)}
              {question.type === "true_false" && [true, false].map((value) => <label className="quiz-answer-choice" key={String(value)}><input checked={answerValues[question._id] === value} name={question._id} onChange={() => setAnswerValues({ ...answerValues, [question._id]: value })} type="radio" /><span>{value ? "True" : "False"}</span></label>)}
              {question.type === "identification" && <label>Your answer<input maxLength={1000} value={typeof answerValues[question._id] === "string" ? answerValues[question._id] as string : ""} onChange={(event) => setAnswerValues({ ...answerValues, [question._id]: event.target.value })} /></label>}
            </article>
          ))}
          {answerSaveError && <div className="form-message form-error" role="alert">{answerSaveError} Your answers may not have been saved.</div>}
          {submitAttempt.isError && <div className="form-message form-error" role="alert">{getApiError(submitAttempt.error)}</div>}
          <button className="primary-button" disabled={submitAttempt.isPending} type="submit">{submitAttempt.isPending ? "Submitting…" : "Submit answers"}</button>
        </form>
      </section>
    );
  }

  return (
    <section className="quiz-page">
      <Link className="back-link" to={`/subjects/${id}/topics/${topicId}`}><ArrowLeft size={15} /> Back to lesson</Link>
      <span className="eyebrow">TOPIC QUIZ</span><h1>{studentQuiz.title}</h1>
      {studentQuiz.description && <p className="quiz-intro">{studentQuiz.description}</p>}
      <section className="form-panel quiz-overview"><div><strong>{studentQuiz.questionCount}</strong><span>questions</span></div><div><strong>{Math.ceil(studentQuiz.timeLimitSeconds / 60)}</strong><span>minutes</span></div><div><strong>{studentQuiz.passingScore}%</strong><span>to pass</span></div><button className="primary-button" disabled={startAttempt.isPending || (hasPassedAttempt && !activeQuizAttempt)} onClick={() => startAttempt.mutate()}>{startAttempt.isPending ? "Starting…" : activeQuizAttempt ? "Continue quiz" : hasPassedAttempt ? "Quiz passed" : studentQuiz.attempts.length > 0 ? "Retake quiz" : "Start quiz"}</button></section>
      {studentQuiz.attempts.some(({ passed }) => passed === false) && !hasPassedAttempt && !activeQuizAttempt && <p className="quiz-attempt-limit">You need to pass this quiz to unlock the next topic. Review the lesson, then retake the quiz when you’re ready.</p>}
      {startAttempt.isError && <div className="form-message form-error" role="alert">{getApiError(startAttempt.error)}</div>}
      {reviewAttemptId && <section className="form-panel quiz-result"><div className="quiz-result-heading"><div><span className="eyebrow">RESULT</span><h2>{reviewQuery.data?.passed ? "Nice work — you passed." : "Attempt complete"}</h2></div><strong>{reviewQuery.data?.score ?? "—"}%</strong></div>
        {reviewQuery.isLoading && <p role="status">Loading answer review…</p>}
        {reviewQuery.isError && <div className="form-message form-error" role="alert">{getApiError(reviewQuery.error)}</div>}
        {reviewQuestions.map((question, index) => <div className="quiz-review-item" key={question._id}><strong>{index + 1}. {question.questionText}</strong><span className={question.isCorrect ? "review-correct" : "review-incorrect"}>{question.isCorrect ? "Correct" : "Not correct"} · {question.pointsEarned ?? 0}/{question.points} points</span><p>Your answer: {question.answer === null || question.answer === undefined ? "No answer" : typeof question.answer === "boolean" ? (question.answer ? "True" : "False") : question.choices.find(({ id: choiceId }) => choiceId === question.answer)?.text ?? question.answer}</p>{question.correctAnswer !== undefined && <p>Correct answer: {typeof question.correctAnswer === "boolean" ? (question.correctAnswer ? "True" : "False") : question.choices.find(({ id: choiceId }) => choiceId === question.correctAnswer)?.text ?? question.correctAnswer}</p>}{question.explanation && <p>{question.explanation}</p>}</div>)}
      </section>}
      {studentQuiz.attempts.length > 0 && <section className="quiz-attempt-history"><h2>Previous attempts</h2>{studentQuiz.attempts.map((previous, index) => <div className="quiz-history-row" key={previous._id}><span>Attempt {studentQuiz.attempts.length - index}</span><span>{previous.score === null ? previous.status : `${previous.score}%`}</span><span>{previous.passed === true ? "Passed" : previous.passed === false ? "Not passed" : ""}</span><button className="inline-action" disabled={previous.status === "active"} onClick={() => setReviewAttemptId(previous._id)} type="button">Review</button></div>)}</section>}
    </section>
  );
}
