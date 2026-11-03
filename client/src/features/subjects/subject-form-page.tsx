import { useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getApiError } from "@/services/api";
import type { Subject } from "@/types/api";

const subjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().toUpperCase().min(2).max(24).regex(/^[A-Z0-9-]+$/),
  description: z.string().max(4000),
  term: z.string().trim().min(1).max(80),
  academicYear: z.string().trim().min(4).max(20),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export function SubjectFormPage({ join = false, edit = false }: { join?: boolean; edit?: boolean }) {
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const subjectQuery = useQuery({
    queryKey: ["subject", id],
    enabled: edit,
    queryFn: async () => (await api.get<{ data: Subject }>(`/subjects/${id}`)).data.data,
  });
  const [values, setValues] = useState<Partial<Subject>>({});
  const mutation = useMutation({
    mutationFn: async (input: Record<string, string>) => {
      if (join) return (await api.post("/subjects/join", input)).data.data;
      if (edit) return (await api.patch(`/subjects/${id}`, input)).data.data;
      return (await api.post("/subjects", input)).data.data;
    },
    onSuccess: async (subject) => {
      await queryClient.invalidateQueries({ queryKey: ["subjects"] });
      if (edit) await queryClient.invalidateQueries({ queryKey: ["subject", id] });
      navigate(`/subjects/${subject.subjectId ?? subject._id ?? id}`);
    },
    onError: (reason) => setError(getApiError(reason)),
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    if (join) {
      const code = String(form.get("joinCode") ?? "").trim().toUpperCase();
      if (code.length < 6 || code.length > 16) {
        setError("Enter a valid subject join code.");
        return;
      }
      mutation.mutate({ joinCode: code });
      return;
    }
    const input = {
      name: String(form.get("name") ?? ""),
      code: String(form.get("code") ?? ""),
      description: String(form.get("description") ?? ""),
      term: String(form.get("term") ?? ""),
      academicYear: String(form.get("academicYear") ?? ""),
      themeColor: String(form.get("themeColor") ?? "#17684f"),
    };
    const parsed = subjectSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your subject details.");
      return;
    }
    mutation.mutate(parsed.data);
  }

  if (edit && subjectQuery.isLoading) return <div className="route-message" role="status">Loading subject…</div>;
  if (edit && subjectQuery.isError) return <div className="form-message form-error" role="alert">{getApiError(subjectQuery.error)}</div>;
  const subject = subjectQuery.data;

  return (
    <section className="form-page">
      <Link className="back-link" to={edit ? `/subjects/${id}` : "/"}>← Back to {edit ? "subject" : "subjects"}</Link>
      <span className="eyebrow">{join ? "STUDENT ENROLLMENT" : edit ? "SUBJECT SETTINGS" : "SUBJECT SETUP"}</span>
      <h1>{join ? "Join a subject" : edit ? "Edit subject" : "Create a subject"}</h1>
      <p>{join ? "Enter the join code provided by your faculty member." : edit ? "Update the subject details and student-facing information." : "Set up a subject workspace for your students."}</p>
      {error && <div className="form-message form-error" role="alert">{error}</div>}
      <form className="form-stack form-panel" onSubmit={submit}>
        {join ? <label>Subject join code<input name="joinCode" autoCapitalize="characters" autoComplete="off" required maxLength={16} /></label> : <>
          <label>Subject name<input name="name" value={values.name ?? subject?.name ?? ""} onChange={(event) => setValues({ ...values, name: event.target.value })} required maxLength={120} /></label>
          <label>Subject code<input name="code" value={values.code ?? subject?.code ?? ""} onChange={(event) => setValues({ ...values, code: event.target.value })} required maxLength={24} placeholder="e.g. BIO-101" /></label>
          <label>Description<textarea name="description" rows={3} maxLength={4000} value={values.description ?? subject?.description ?? ""} onChange={(event) => setValues({ ...values, description: event.target.value })} /></label>
          <div className="form-grid">
            <label>Term<input name="term" value={values.term ?? subject?.term ?? ""} onChange={(event) => setValues({ ...values, term: event.target.value })} required placeholder="e.g. Fall" /></label>
            <label>Academic year<input name="academicYear" value={values.academicYear ?? subject?.academicYear ?? ""} onChange={(event) => setValues({ ...values, academicYear: event.target.value })} required placeholder="e.g. 2026–2027" /></label>
          </div>
          <label>Theme color<input name="themeColor" type="color" value={values.themeColor ?? subject?.themeColor ?? "#17684f"} onChange={(event) => setValues({ ...values, themeColor: event.target.value })} className="color-input" /></label>
        </>}
        <button className="primary-button" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : join ? "Join subject" : edit ? "Save changes" : "Create subject"}</button>
      </form>
    </section>
  );
}
