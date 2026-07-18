import { AdminPasswordLoginClient } from "@/components/app/admin-password-login-client";
import { AdminUsersFreshClient } from "@/components/app/admin-users-fresh-client";
import { getAdminSession } from "@/lib/server/auth";

export default async function AdminUsersPage() {
  const admin = await getAdminSession();
  if (!admin) return <AdminPasswordLoginClient />;
  return <AdminUsersFreshClient />;
}