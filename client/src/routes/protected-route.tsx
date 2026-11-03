import { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth/auth-context";
import type { UserRole } from "@/types/api";

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { user, loading, error, refresh } = useAuth();
  const [retrying, setRetrying] = useState(false);

  const retrySession = async () => {
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  };

  if (loading) return <div className="route-message" role="status">Loading your account…</div>;
  if (error) {
    return (
      <div className="route-message" role="alert">
        {error}
        <button className="inline-action" disabled={retrying} onClick={() => void retrySession()} type="button">
          {retrying ? "Checking…" : "Try again"}
        </button>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
