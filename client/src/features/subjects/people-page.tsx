import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserMinus } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, getApiError } from "@/services/api";

interface Person {
  enrollmentId: string;
  enrolledAt: string;
  student?: { _id: string; firstName: string; lastName: string; username: string; email: string };
}

export function PeoplePage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["subject-people", id],
    queryFn: async () => (await api.get<{ data: Person[] }>(`/subjects/${id}/people`)).data.data,
  });
  const remove = useMutation({
    mutationFn: async (studentId: string) => api.delete(`/subjects/${id}/people/${studentId}`),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["subject-people", id] }),
  });

  if (query.isLoading) return <div className="route-message" role="status">Loading enrolled students…</div>;
  if (query.isError) return <div className="form-message form-error" role="alert">{getApiError(query.error)}</div>;
  const people = query.data ?? [];
  return (
    <section>
      <Link className="back-link" to={`/subjects/${id}`}><ArrowLeft size={15} /> Back to subject</Link>
      <div className="page-intro"><span className="eyebrow">SUBJECT ROSTER</span><h1>People</h1><p>{people.length} enrolled {people.length === 1 ? "student" : "students"}</p></div>
      {remove.isError && <div className="form-message form-error" role="alert">{getApiError(remove.error)}</div>}
      {people.length === 0 && <div className="empty-card"><h3>No students enrolled yet</h3><p>Share your subject join code to invite students.</p></div>}
      <div className="admin-user-list">
        {people.map((person) => person.student && <article className="admin-user-row" key={person.enrollmentId}>
          <div><strong>{person.student.firstName} {person.student.lastName}</strong><span>{person.student.username} · {person.student.email}</span></div>
          <button className="small-action danger-text" disabled={remove.isPending} onClick={() => {
            if (window.confirm(`Remove ${person.student?.firstName} ${person.student?.lastName} from this subject?`)) {
              remove.mutate(person.student!._id);
            }
          }}><UserMinus size={15} /> Remove</button>
        </article>)}
      </div>
    </section>
  );
}
