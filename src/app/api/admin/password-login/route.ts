import { setPasswordAdminCookie } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/responses";

export const runtime = "nodejs";

function getAdminPassword() {
  return String(process.env.ADMIN_PASSWORD || "").trim();
}

export async function POST(request: Request) {
  const configuredPassword = getAdminPassword();
  if (!configuredPassword) return fail("ADMIN_PASSWORD is not configured.", 503);

  const body = await request.json().catch(() => ({})) as { password?: unknown };
  const password = String(body.password || "");
  if (password !== configuredPassword) return fail("Wrong admin password.", 401);

  const response = ok({ ok: true });
  await setPasswordAdminCookie(response);
  return response;
}
