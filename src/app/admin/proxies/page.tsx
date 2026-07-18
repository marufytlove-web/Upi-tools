import { AdminApiKeysFreshClient } from "@/components/app/admin-api-keys-fresh-client";
import { AdminPasswordLoginClient } from "@/components/app/admin-password-login-client";
import { getAdminSession } from "@/lib/server/auth";

export default async function AdminProxiesPage() {
  const admin = await getAdminSession();
  if (!admin) return <AdminPasswordLoginClient />;
  return <AdminApiKeysFreshClient />;
}