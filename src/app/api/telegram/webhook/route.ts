import { handleTelegramUpdate, type TelegramUpdate } from "@/lib/server/telegram-bot";
import { fail, ok } from "@/lib/server/responses";

export const runtime = "nodejs";
export const maxDuration = 300;

function webhookSecretMatches(request: Request) {
  const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (!expected) return true;
  return request.headers.get("x-telegram-bot-api-secret-token") === expected;
}

export async function GET() {
  return ok({ status: "telegram webhook ready" });
}

export async function POST(request: Request) {
  if (!webhookSecretMatches(request)) return fail("Unauthorized webhook request.", 401);
  const update = await request.json().catch(() => null) as TelegramUpdate | null;
  if (!update || typeof update.update_id !== "number") return fail("Invalid Telegram update.", 400);
  const result = await handleTelegramUpdate(update);
  return ok(result);
}
