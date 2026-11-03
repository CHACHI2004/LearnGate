import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileUp, Save, Trash2 } from "lucide-react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { api, getApiError } from "@/services/api";
import type { Topic } from "@/types/api";

export function TopicEditorPage({ create = false }: { create?: boolean }) {
  const { id = "", topicId = "" } = useParams();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [published, setPublished] = useState(false);
  const [fileError, setFileError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileSizeError, setFileSizeError] = useState("");
  const navigationState = location.state as { attachmentError?: string } | null;

  const topicQuery = useQuery({
    queryKey: ["topic", id, topicId],
    enabled: !create,
    queryFn: async () => (await api.get<{ data: Topic }>(`/topics/subjects/${id}/topics/${topicId}`)).data.data,
  });

  useEffect(() => {
    const topic = topicQuery.data;
    if (!topic) return;
    setTitle(topic.title);
    setDescription(topic.description);
    setSummary(topic.summary ?? "");
    setContent(topic.content ?? "");
    setPublished(topic.isPublished);
  }, [topicQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const body = { title, description, summary, content, isPublished: published };
      return create
        ? (await api.post(`/topics/subjects/${id}/topics`, body)).data.data as Topic
        : (await api.patch(`/subjects/${id}/topics/${topicId}`, body)).data.data as Topic;
    },
    onSuccess: async (topic) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["topics", id] }),
        queryClient.invalidateQueries({ queryKey: ["subject", id] }),
      ]);
      if (create) {
        let attachmentError: string | undefined;
        if (selectedFile) {
          try {
            const body = new FormData();
            body.append("file", selectedFile);
            await api.post(`/uploads/subjects/${id}/topics/${topic._id}/attachments`, body, {
              headers: { "Content-Type": "multipart/form-data" },
            });
          } catch (error) {
            attachmentError = `Topic saved, but the file could not be uploaded: ${getApiError(error)}`;
          }
        }
        navigate(`/subjects/${id}/topics/${topic._id}?edit=true`, {
          state: attachmentError ? { attachmentError } : null,
        });
      }
      else await queryClient.invalidateQueries({ queryKey: ["topic", id, topicId] });
    },
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return (await api.post(`/uploads/subjects/${id}/topics/${topicId}/attachments`, body, {
        headers: { "Content-Type": "multipart/form-data" },
      })).data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["topic", id, topicId] });
      setFileError("");
    },
    onError: (reason) => setFileError(getApiError(reason)),
  });
  const remove = useMutation({
    mutationFn: async () => api.delete(`/subjects/${id}/topics/${topicId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["topics", id] });
      navigate(`/subjects/${id}`);
    },
  });

  if (!create && topicQuery.isLoading) return <div className="route-message" role="status">Loading topic…</div>;
  if (!create && topicQuery.isError) return <div className="form-message form-error" role="alert">{getApiError(topicQuery.error)}</div>;
  const topic = topicQuery.data;

  return (
    <section className="form-page lesson-edit-page">
      <Link className="back-link" to={`/subjects/${id}`}><ArrowLeft size={15} /> Back to subject</Link>
      <span className="eyebrow">{create ? "NEW LESSON" : "LESSON EDITOR"}</span>
      <h1>{create ? "Add a topic" : "Edit topic"}</h1>
      {navigationState?.attachmentError && <div className="form-message form-error" role="alert">{navigationState.attachmentError}</div>}
      <form className="form-stack form-panel" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <label>Topic title<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} /></label>
        <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></label>
        <label>Lesson content<RichTextEditor value={content} onChange={setContent} /></label>
        <label>Summary<textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={3000} /></label>
        {create && <section className="topic-create-materials">
          <label className="upload-button"><FileUp size={17} /> {selectedFile ? "Choose a different file" : "Add lesson material"}
            <input type="file" accept=".pdf,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov" onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (file && file.size > 20 * 1024 * 1024) {
                setSelectedFile(null);
                setFileSizeError("Files must be 20 MB or smaller.");
              } else {
                setSelectedFile(file);
                setFileSizeError("");
              }
              event.currentTarget.value = "";
            }} />
          </label>
          <span className="field-note">Optional · PDF, PowerPoint, image, or video · up to 20 MB. The file uploads after the topic is saved.</span>
          {selectedFile && <div className="topic-create-file">
            <span>{selectedFile.name} · {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</span>
            <button className="inline-action" onClick={() => setSelectedFile(null)} type="button">Remove</button>
          </div>}
          {fileSizeError && <span className="inline-error" role="alert">{fileSizeError}</span>}
        </section>}
        <label className="checkbox-row"><input checked={published} onChange={(event) => setPublished(event.target.checked)} type="checkbox" /> Publish this topic to enrolled students</label>
        <div className="form-actions">
          <button className="primary-button" disabled={save.isPending}><Save size={16} /> {save.isPending ? selectedFile ? "Saving & uploading…" : "Saving…" : "Save topic"}</button>
          {save.isError && <span className="inline-error" role="alert">{getApiError(save.error)}</span>}
        </div>
      </form>

      {!create && topic && <section className="form-panel attachments-panel">
        <h2>Lesson materials</h2>
        <p>Documents and presentations up to 20 MB are stored in the configured Cloudinary account.</p>
        {topic.attachments?.map((attachment) => <a className="attachment-link" download={attachment.fileName} key={attachment._id} href={api.getUri({ url: attachment.url })}>{attachment.fileName}</a>)}
        <label className="upload-button"><FileUp size={17} /> Upload material
          <input type="file" accept=".pdf,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            event.currentTarget.value = "";
          }} />
        </label>
        {upload.isPending && <span role="status">Uploading material…</span>}
        {fileError && <div className="form-message form-error" role="alert">{fileError}</div>}
      </section>}
      {!create && <section className="form-panel lesson-quiz-panel">
        <h2>Topic quiz</h2>
        <p>Create questions, set a time limit, and track which students have completed the topic.</p>
        <Link className="text-action" to={`/subjects/${id}/topics/${topicId}/quiz`}>{topic?.quizId ? "Manage quiz" : "Create quiz"} <span aria-hidden="true">→</span></Link>
      </section>}
      {!create && <button className="danger-button" disabled={remove.isPending} onClick={() => {
        if (window.confirm("Archive this topic? Historical quiz results are retained.")) remove.mutate();
      }}><Trash2 size={16} /> Archive topic</button>}
      {params.get("edit") === "true" && <div className="visually-hidden">Editing lesson materials</div>}
    </section>
  );
}
