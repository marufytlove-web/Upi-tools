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
  key: string;
  ok: boolean;
  tgId?: number | null;
  quota?: { used: number; limit: number; remaining: number } | null;
  error?: string | null;
};

async function checkKey(apiKey: string, index: number): Promise<PlusPayKeyStatus> {
  try {
    const response = await fetch(`${process.env.PLUSPAY_API_BASE || "https://api.pluspaybot.dpdns.org"}/v1/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const data = await response.json().catch(() => null) as {
      ok?: boolean;
      tg_id?: number;
      quota?: { used?: number; limit?: number; remaining?: number };
      error?: string;
      message?: string;
    } | null;

    return {
      index,
      key: maskPlusPayApiKey(apiKey),
      ok: response.ok && Boolean(data?.ok),
      tgId: data?.tg_id ?? null,
      quota: data?.quota
        ? {
          used: Number(data.quota.used || 0),
          limit: Number(data.quota.limit || 0),
          remaining: Number(data.quota.remaining || 0),
        }
        : null,
      error: response.ok && data?.ok ? null : data?.message || data?.error || `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      index,
      key: maskPlusPayApiKey(apiKey),
      ok: false,
      quota: null,
      error: error instanceof Error ? error.message : "Check failed",
    };
  }
}

async function payload() {
  const keys = await getConfiguredPlusPayApiKeys();
  const statuses = await Promise.all(keys.map((key, index) => checkKey(key, index + 1)));
  const remainingTotal = statuses.reduce((sum, status) => sum + Number(status.quota?.remaining || 0), 0);
  return {
    count: keys.length,
    remainingTotal,
    keys: statuses,
  };
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

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const body = await request.json().catch(() => ({})) as { apiKeys?: unknown };
    const apiKeys = parsePlusPayApiKeys(String(body.apiKeys || ""));
    if (apiKeys.length > 50) return fail("At most 50 PlusPay API keys are allowed.", 400);
    await setStoredPlusPayApiKeys(apiKeys.join("\n"));
    return ok(await payload());
  } catch (error) {
    if (error instanceof Response) return fail("Unauthorized", 401);
    return handleRouteError(error);
  }
}
