import { useEffect } from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, UserRoundX } from "lucide-react";
import { api, getApiError } from "@/services/api";
import { useAuth } from "@/features/auth/auth-context";
import type { User } from "@/types/api";

type UserUpdate =
  | { id: string; endpoint: "status"; data: { isActive: boolean } }
  | { id: string; endpoint: "faculty-approval"; data: { status: "approved" | "rejected" } };

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const query = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => (await api.get<{ data: User[]; pagination: { total: number } }>("/admin/users?limit=100", {
      timeout: 10_000,
    })).data,
    retry: false,
  });
  useEffect(() => {
    if (axios.isAxiosError(query.error) && query.error.response?.status === 401) {
      void refresh();
    }
  }, [query.error, refresh]);
  const update = useMutation({
    mutationFn: async ({ id, endpoint, data }: UserUpdate) => api.patch(`/admin/users/${id}/${endpoint}`, data),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  if (query.isLoading) return <div className="route-message" role="status">Loading users…</div>;
  if (query.isError) {
    return (
      <div className="form-message form-error" role="alert">
        Could not load users: {getApiError(query.error)}
        <button className="inline-action" disabled={query.isFetching} onClick={() => void query.refetch()} type="button">
          {query.isFetching ? "Trying again…" : "Try again"}
        </button>
      </div>
    );
  }
  const users = query.data?.data ?? [];
  return (
    <section>
      <div className="page-intro"><span className="eyebrow">ADMINISTRATION</span><h1>User management</h1><p>{query.data?.pagination.total ?? 0} accounts</p></div>
      {update.isError && <div className="form-message form-error" role="alert">{getApiError(update.error)}</div>}
      <div className="admin-user-list">
        {users.map((user) => <article className="admin-user-row" key={user.id}>
          <div><strong>{user.firstName} {user.lastName}</strong><span>{user.email} · {user.role}</span></div>
          <div className="admin-user-actions">
            {user.role === "faculty" && user.facultyApprovalStatus === "pending" && <>
              <button className="small-action" onClick={() => update.mutate({ id: user.id, endpoint: "faculty-approval", data: { status: "approved" } })}><Check size={15} /> Approve</button>
              <button className="small-action danger-text" onClick={() => update.mutate({ id: user.id, endpoint: "faculty-approval", data: { status: "rejected" } })}><UserRoundX size={15} /> Reject</button>
            </>}
            <button className="small-action" onClick={() => update.mutate({ id: user.id, endpoint: "status", data: { isActive: !user.isActive } })}>{user.isActive ? "Deactivate" : "Activate"}</button>
          </div>
        </article>)}
      </div>
    </section>
  );
}
