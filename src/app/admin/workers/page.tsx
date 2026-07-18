import { AdminPasswordLoginClient } from "@/components/app/admin-password-login-client";
import { AdminWorkersFreshClient } from "@/components/app/admin-workers-fresh-client";
import { getAdminSession } from "@/lib/server/auth";

export default async function AdminWorkersPage() {
  const admin = await getAdminSession();
  if (!admin) return <AdminPasswordLoginClient />;
  return <AdminWorkersFreshClient />;
}