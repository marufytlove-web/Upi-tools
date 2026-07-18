import { AdminUpiExtractClient } from "@/components/app/admin-upi-extract-client";
import { AdminPasswordLoginClient } from "@/components/app/admin-password-login-client";
import { getAdminSession } from "@/lib/server/auth";

export default async function AdminUpiExtractPage() {
  const admin = await getAdminSession();
  if (!admin) return <AdminPasswordLoginClient />;
  return <AdminUpiExtractClient />;
}