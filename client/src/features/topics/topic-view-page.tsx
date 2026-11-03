import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, FileText, LockKeyhole } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/features/auth/auth-context";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { api, getApiError } from "@/services/api";
import type { Topic } from "@/types/api";

export function TopicViewPage() {
  const { id = "", topicId = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const faculty = user?.role === "faculty";
  const query = useQuery({
    queryKey: ["topic", id, topicId],
    queryFn: async () => (await api.get<{ data: Topic }>(`/topics/subjects/${id}/topics/${topicId}`)).data.data,
  });
  const complete = useMutation({
    mutationFn: async () => (await api.post(`/topics/subjects/${id}/topics/${topicId}/complete`)).data.data,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["topic", id, topicId] }),
        queryClient.invalidateQueries({ queryKey: ["topics", id] }),
        queryClient.invalidateQueries({ queryKey: ["progress", id] }),
      ]);
    },
  });

  if (query.isLoading) return <div className="route-message" role="status">Loading lesson…</div>;
  if (query.isError || !query.data) return <div className="form-message form-error" role="alert">{getApiError(query.error)}</div>;
  const topic = query.data;
  return (
    <article className="lesson-page">
      <Link className="back-link" to={`/subjects/${id}`}><ArrowLeft size={15} /> Back to topic sequence</Link>
      <span className="eyebrow">LESSON {String(topic.order + 1).padStart(2, "0")}</span>
      <h1>{topic.title}</h1>
      {topic.description && <p className="lesson-description">{topic.description}</p>}
      {faculty && <Link className="text-action lesson-edit-action" to={`/subjects/${id}/topics/${topicId}?edit=true`}>Edit lesson</Link>}
      {faculty && <Link className="text-action lesson-quiz-action" to={`/subjects/${id}/topics/${topicId}/quiz`}>{topic.quizId ? "Edit quiz" : "Create quiz"}</Link>}
      {!faculty && topic.quizId && <Link className="primary-button lesson-quiz-action" to={`/subjects/${id}/topics/${topicId}/quiz`}>Take topic quiz</Link>}
      {!faculty && topic.hasQuiz && !topic.quizId && <p className="lesson-quiz-unpublished">A quiz is linked to this lesson, but your instructor has not published it yet.</p>}
      {!faculty && !topic.quizId && !topic.isCompleted && <button className="primary-button lesson-quiz-action" disabled={complete.isPending} onClick={() => complete.mutate()}>{complete.isPending ? "Saving…" : "Mark lesson complete"}</button>}
      {!faculty && topic.isCompleted && <p className="lesson-completed"><CheckCircle2 size={16} /> Topic completed</p>}
      {complete.isError && <div className="form-message form-error" role="alert">{getApiError(complete.error)}</div>}
      <RichTextEditor value={topic.content ?? ""} readOnly />
      {topic.summary && <section className="lesson-summary"><h2>Summary</h2><p>{topic.summary}</p></section>}
      {topic.attachments && topic.attachments.length > 0 && <section className="lesson-materials">
        <h2>Lesson materials</h2>
        {topic.attachments.map((attachment) => <a className="attachment-link" download={attachment.fileName} href={api.getUri({ url: attachment.url })} key={attachment._id}><FileText size={17} /> {attachment.fileName}</a>)}
      </section>}
      {!faculty && topic.isUnlocked === false && <p className="locked-label"><LockKeyhole size={15} /> This topic is locked until you pass the previous quiz.</p>}
    </article>
  );
}
