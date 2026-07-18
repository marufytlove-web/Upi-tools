import { AdminCdksFreshClient } from "@/components/app/admin-cdks-fresh-client";
import { AdminPasswordLoginClient } from "@/components/app/admin-password-login-client";
import { getAdminSession } from "@/lib/server/auth";

export default async function AdminCdksPage() {
  const admin = await getAdminSession();
  if (!admin) return <AdminPasswordLoginClient />;
  return <AdminCdksFreshClient />;
}