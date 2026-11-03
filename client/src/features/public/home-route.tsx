import { useAuth } from "@/features/auth/auth-context";
import { AppLayout } from "@/components/layout/app-layout";
import { DashboardPage } from "@/features/subjects/dashboard-page";
import { LandingPage } from "./landing-page";

export function HomeRoute() {
  const { user } = useAuth();
  if (user) return <AppLayout><DashboardPage /></AppLayout>;
  return <LandingPage />;
}
