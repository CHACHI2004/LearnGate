import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowLeft, ArrowUp, Clipboard, FileText, GripVertical, LockKeyhole, Plus, RotateCw, Upload, Users, ChartNoAxesCombined } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CSSProperties } from "react";
import { api, getApiError } from "@/services/api";
import { useAuth } from "@/features/auth/auth-context";
import type { Subject, Topic } from "@/types/api";

type SubjectResponse = Subject & { faculty?: string; topics?: Array<Pick<Topic, "_id" | "title" | "description" | "order">> };
type TopicProgress = {
  topicId: string;
  hasQuiz: boolean;
  attemptCount: number;
  latestScore: number | null;
  effectiveScore: number | null;
  scorePolicy: "best" | "latest";
};

function SortableTopicRow({
  topic,
  progress,
  index,
  count,
  faculty,
  subjectId,
  moving,
  onMove,
}: {
  topic: Topic;
  progress?: TopicProgress;
  index: number;
  count: number;
  faculty: boolean;
  subjectId: string;
  moving: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: topic._id,
    disabled: !faculty,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };
  const unlocked = faculty || topic.isUnlocked;
  return (
    <article className={`topic-row ${unlocked ? "" : "topic-locked"}`} ref={setNodeRef} style={style}>
      {faculty && <button
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${topic.title}`}
        className="icon-button topic-drag-handle"
        title="Drag to reorder"
      ><GripVertical size={17} /></button>}
      <span className="topic-order">{String(topic.order + 1).padStart(2, "0")}</span>
      <div className="topic-copy"><h3>{topic.title}</h3><p>{topic.description}</p>
        {topic.isCompleted && <span className="topic-completion">Completed</span>}
        {!faculty && progress?.hasQuiz && <span className="topic-quiz-status">Quiz available</span>}
        {progress && progress.attemptCount > 0 && <span className="topic-score">{progress.attemptCount} attempt{progress.attemptCount === 1 ? "" : "s"} · Latest {progress.latestScore}%{progress.scorePolicy === "best" && progress.effectiveScore !== progress.latestScore ? ` · Best ${progress.effectiveScore}%` : ""}</span>}
      </div>
      <div className="topic-row-actions">
        {unlocked
          ? <Link className="topic-open" to={`/subjects/${subjectId}/topics/${topic._id}`}>Open lesson <span aria-hidden="true">→</span></Link>
          : <span className="locked-label"><LockKeyhole size={15} /> Locked</span>}
        {!faculty && unlocked && progress?.hasQuiz && <Link
          className="topic-open topic-quiz-link"
          to={`/subjects/${subjectId}/topics/${topic._id}/quiz`}
        >Take quiz <span aria-hidden="true">→</span></Link>}
      </div>
      {faculty && <Link className="icon-button" aria-label={`Edit ${topic.title}`} to={`/subjects/${subjectId}/topics/${topic._id}?edit=true`}><Upload size={16} /></Link>}
      {faculty && <span className="topic-reorder">
        <button aria-label={`Move ${topic.title} up`} className="icon-button" disabled={index === 0 || moving} onClick={() => onMove(index, -1)}><ArrowUp size={15} /></button>
        <button aria-label={`Move ${topic.title} down`} className="icon-button" disabled={index === count - 1 || moving} onClick={() => onMove(index, 1)}><ArrowDown size={15} /></button>
      </span>}
    </article>
  );
}

export function SubjectDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const faculty = user?.role === "faculty";
  const subjectQuery = useQuery({
    queryKey: ["subject", id],
    queryFn: async () => (await api.get<{ data: SubjectResponse }>(`/subjects/${id}`)).data.data,
  });
  const topicsQuery = useQuery({
    queryKey: ["topics", id],
    queryFn: async () => (await api.get<{ data: Topic[] }>(`/topics/subjects/${id}/topics`)).data.data,
  });
  const progressQuery = useQuery({
    queryKey: ["progress", id],
    enabled: !faculty,
    queryFn: async () => (await api.get<{ data: { topics: TopicProgress[] } }>(`/quizzes/subjects/${id}/progress`)).data.data,
  });
  const rotateCode = useMutation({
    mutationFn: async () => (await api.post(`/subjects/${id}/join-code`)).data.data as Subject,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["subject", id] }); },
  });
  const reorder = useMutation({
    mutationFn: async (topicIds: string[]) => api.put(`/subjects/${id}/topics/order`, { topicIds }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["topics", id] }),
  });
  const archive = useMutation({
    mutationFn: async () => api.delete(`/subjects/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subjects"] });
      navigate("/");
    },
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (subjectQuery.isLoading) return <div className="route-message" role="status">Loading subject…</div>;
  if (subjectQuery.isError || !subjectQuery.data) return <div className="form-message form-error" role="alert">{getApiError(subjectQuery.error)}</div>;
  const subject = subjectQuery.data;
  const topics = topicsQuery.data ?? [];
  const progressByTopic = new Map((progressQuery.data?.topics ?? []).map((progress) => [progress.topicId, progress]));

  function saveOrder(next: Topic[]) {
    reorder.mutate(next.map(({ _id }) => _id));
  }

  function moveTopic(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= topics.length) return;
    saveOrder(arrayMove(topics, index, target));
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = topics.findIndex(({ _id }) => _id === event.active.id);
    const newIndex = topics.findIndex(({ _id }) => _id === event.over?.id);
    if (oldIndex >= 0 && newIndex >= 0) saveOrder(arrayMove(topics, oldIndex, newIndex));
  }

  async function copyJoinCode() {
    if (!subject.joinCode) return;
    await navigator.clipboard.writeText(subject.joinCode);
  }

  return (
    <>
      <Link className="back-link" to="/"><ArrowLeft size={15} /> All subjects</Link>
      <section className="subject-hero" style={{ borderTopColor: subject.themeColor }}>
        <div><span className="subject-code">{subject.code}</span><h1>{subject.name}</h1><p>{subject.term} · {subject.academicYear}</p><p>{subject.description}</p></div>
        <div className="subject-meta">{subject.faculty && <span>Faculty: {subject.faculty}</span>}
          {faculty && <Link className="text-action" to={`/subjects/${id}/edit`}>Edit subject</Link>}
          {faculty && subject.joinCode && <div className="join-code-box"><span>Join code <strong>{subject.joinCode}</strong></span><button aria-label="Copy join code" className="icon-button" onClick={() => void copyJoinCode()}><Clipboard size={16} /></button><button aria-label="Regenerate join code" className="icon-button" disabled={rotateCode.isPending} onClick={() => rotateCode.mutate()}><RotateCw size={16} /></button></div>}
        </div>
      </section>
      <div className="section-heading">
        <div><h2>Lessons</h2><span>{faculty ? "Topics in learning order" : `${topics.filter((topic) => topic.isCompleted).length} of ${topics.length} topics complete`}</span></div>
        <div className="subject-actions">
          {faculty && <Link className="text-action" to={`/subjects/${id}/people`}><Users size={16} /> People</Link>}
          {faculty && <Link className="text-action" to={`/subjects/${id}/reports`}><ChartNoAxesCombined size={16} /> Reports</Link>}
          {faculty && <Link className="text-action" to={`/subjects/${id}/topics/new`}><Plus size={16} /> Add topic</Link>}
        </div>
        {!faculty && topics.length > 0 && <div className="subject-progress" role="progressbar" aria-label="Subject topic completion" aria-valuemin={0} aria-valuemax={topics.length} aria-valuenow={topics.filter((topic) => topic.isCompleted).length}>
          <span style={{ width: `${(topics.filter((topic) => topic.isCompleted).length / topics.length) * 100}%` }} />
        </div>}
      </div>
      {topicsQuery.isError && <div className="form-message form-error" role="alert">{getApiError(topicsQuery.error)} <button className="inline-action" onClick={() => void topicsQuery.refetch()}>Try again</button></div>}
      {progressQuery.isError && <div className="form-message form-error" role="alert">{getApiError(progressQuery.error)} <button className="inline-action" onClick={() => void progressQuery.refetch()}>Try again</button></div>}
      {reorder.isError && <div className="form-message form-error" role="alert">{getApiError(reorder.error)}</div>}
      {archive.isError && <div className="form-message form-error" role="alert">{getApiError(archive.error)}</div>}
      {topicsQuery.isLoading && <div className="skeleton-card" />}
      {!topicsQuery.isLoading && !topicsQuery.isError && topics.length === 0 && <div className="empty-card compact-empty"><FileText size={22} /><h3>No lessons yet</h3><p>{faculty ? "Add a topic to start building this subject." : "Your faculty member has not published lessons yet."}</p></div>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={topics.map(({ _id }) => _id)} strategy={verticalListSortingStrategy}>
          <div className="topic-list" role="list">
            {topics.map((topic, index) => <SortableTopicRow
              count={topics.length}
              faculty={Boolean(faculty)}
              progress={progressByTopic.get(topic._id)}
              index={index}
              key={topic._id}
              moving={reorder.isPending}
              onMove={moveTopic}
              subjectId={id}
              topic={topic}
            />)}
          </div>
        </SortableContext>
      </DndContext>
      {faculty && <button className="danger-button archive-subject" disabled={archive.isPending} onClick={() => {
        if (window.confirm("Archive this subject? Existing enrollments and learning records will be retained.")) archive.mutate();
      }}>{archive.isPending ? "Archiving…" : "Archive subject"}</button>}
    </>
  );
}
