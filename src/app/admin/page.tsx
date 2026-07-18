import { AdminApiDashboardClient } from "@/components/app/admin-api-dashboard-client";
import { AdminPasswordLoginClient } from "@/components/app/admin-password-login-client";
import { getAdminSession } from "@/lib/server/auth";

export default async function AdminPage() {
  const admin = await getAdminSession();
  if (!admin) return <AdminPasswordLoginClient />;
  return <AdminApiDashboardClient />;
}
