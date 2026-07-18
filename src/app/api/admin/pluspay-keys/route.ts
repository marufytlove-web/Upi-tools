import { requireAdminSession } from "@/lib/server/auth";
import {
  getConfiguredPlusPayApiKeys,
  maskPlusPayApiKey,
  parsePlusPayApiKeys,
  setStoredPlusPayApiKeys,
} from "@/lib/server/pluspay-upi-api";
import { fail, handleRouteError, ok } from "@/lib/server/responses";

export const runtime = "nodejs";

type PlusPayKeyStatus = {
  index: number;
  maskedKey: string;
  enabled: boolean;
  ok: boolean;
  tgId?: number | null;
  balance?: number | null;
  used?: number | null;
  limit?: number | null;
  remaining?: number | null;
  status?: string | null;
  message?: string | null;
};

async function checkKey(apiKey: string, index: number): Promise<PlusPayKeyStatus> {
  const maskedKey = maskPlusPayApiKey(apiKey);
  try {
    const response = await fetch(`${process.env.PLUSPAY_API_BASE || "https://api.pluspaybot.dpdns.org"}/v1/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const data = await response.json().catch(() => null) as {
      ok?: boolean;
      tg_id?: number;
      quota?: { used?: number; limit?: number; remaining?: number };
      balance?: number;
      error?: string;
      message?: string;
    } | null;

    const quota = data?.quota || null;
    const isOk = response.ok && Boolean(data?.ok);
    return {
      index,
      maskedKey,
      enabled: true,
      ok: isOk,
      tgId: data?.tg_id ?? null,
      balance: typeof data?.balance === "number" ? data.balance : null,
      used: quota ? Number(quota.used || 0) : null,
      limit: quota ? Number(quota.limit || 0) : null,
      remaining: quota ? Number(quota.remaining || 0) : null,
      status: isOk ? "ready" : "failed",
      message: isOk ? null : data?.message || data?.error || `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      index,
      maskedKey,
      enabled: true,
      ok: false,
      balance: null,
      used: null,
      limit: null,
      remaining: null,
      status: "failed",
      message: error instanceof Error ? error.message : "Check failed",
    };
  }
}

async function payload() {
  const keys = await getConfiguredPlusPayApiKeys();
  const statuses = await Promise.all(keys.map((key, index) => checkKey(key, index + 1)));
  return {
    keys,
    maskedKeys: keys.map(maskPlusPayApiKey),
    statuses,
    count: keys.length,
    remainingTotal: statuses.reduce((sum, status) => sum + Number(status.remaining || 0), 0),
  };
}

function keysFromBody(body: { keys?: unknown; apiKeys?: unknown }) {
  if (Array.isArray(body.keys)) return body.keys.map((key) => String(key)).join("\n");
  if (typeof body.keys === "string") return body.keys;
  return String(body.apiKeys || "");
}

export async function GET() {
  try {
    await requireAdminSession();
    return ok(await payload());
  } catch (error) {
    if (error instanceof Response) return fail("Unauthorized", 401);
    return handleRouteError(error);
  }
}

async function save(request: Request) {
  try {
    await requireAdminSession();
    const body = await request.json().catch(() => ({})) as { keys?: unknown; apiKeys?: unknown };
    const apiKeys = parsePlusPayApiKeys(keysFromBody(body));
    if (apiKeys.length > 50) return fail("At most 50 PlusPay API keys are allowed.", 400);
    await setStoredPlusPayApiKeys(apiKeys.join("\n"));
    return ok(await payload());
  } catch (error) {
    if (error instanceof Response) return fail("Unauthorized", 401);
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  return save(request);
}

export async function PUT(request: Request) {
  return save(request);
}