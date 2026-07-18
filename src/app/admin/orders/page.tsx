import { AdminOrdersFreshClient } from "@/components/app/admin-orders-fresh-client";
import { AdminPasswordLoginClient } from "@/components/app/admin-password-login-client";
import { getAdminSession } from "@/lib/server/auth";

export default async function AdminOrdersPage() {
  const admin = await getAdminSession();
  if (!admin) return <AdminPasswordLoginClient />;
  return <AdminOrdersFreshClient />;
}