import { Buffer } from "node:buffer";
import type { UpiExtractionDebugEvent, UpiExtractionProgress } from "@/lib/server/chatgpt-upi";
import { prisma } from "@/lib/server/prisma";

type PlusPayExtractInput = {
  credential: string;
  shouldCancel?: () => boolean | Promise<boolean>;
  onProgress?: (progress: UpiExtractionProgress) => void;
  onDebug?: (event: UpiExtractionDebugEvent) => void;
};

export type PlusPayExtractedUpiQr = {
  checkoutSessionId: string;
  processorEntity: string;
  paymentUrl: string;
  chatGptPaymentUrl: string;
  hostedInstructionsUrl: string;
  expiresAt: number;
  qrPngBuffer: Buffer;
  steps: Array<{ name: string; status: number; state?: unknown; result?: unknown }>;
};

const DEFAULT_API_BASE = "https://api.pluspaybot.dpdns.org";
export const SETTING_PLUSPAY_API_KEYS = "pluspay_api_keys";

function splitKeyList(value: string) {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parsePlusPayApiKeys(value: string) {
  return Array.from(new Set(splitKeyList(value)));
}

export function maskPlusPayApiKey(apiKey: string) {
  if (apiKey.length <= 16) return `${apiKey.slice(0, 4)}...`;
  return `${apiKey.slice(0, 12)}...${apiKey.slice(-6)}`;
}

export async function getConfiguredPlusPayApiKeys() {
  const dbSetting = await prisma.systemSetting.findUnique({
    where: { key: SETTING_PLUSPAY_API_KEYS },
    select: { value: true },
  });
  const keys = [
    ...splitKeyList(String(dbSetting?.value || "")),
    ...splitKeyList(String(process.env.PLUSPAY_API_KEYS || "")),
    ...splitKeyList(String(process.env.PLUSPAY_API_KEY || "")),
  ];
  return Array.from(new Set(keys));
}

export async function setStoredPlusPayApiKeys(value: string) {
  const keys = parsePlusPayApiKeys(value).join("\n");
  await prisma.systemSetting.upsert({
    where: { key: SETTING_PLUSPAY_API_KEYS },
    update: { value: keys },
    create: { key: SETTING_PLUSPAY_API_KEYS, value: keys },
  });
  return keys;
}

export async function isPlusPayApiEnabled() {
  return (await getConfiguredPlusPayApiKeys()).length > 0 && process.env.PLUSPAY_API_DISABLED !== "1";
}

function getPlusPayApiBase() {
  return String(process.env.PLUSPAY_API_BASE || DEFAULT_API_BASE).trim().replace(/\/+$/, "") || DEFAULT_API_BASE;
}

function normalizeDataUrlBase64(value: string) {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(",");
  return commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;
}

function getString(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

function apiKeyLabel(apiKey: string) {
  return `${apiKey.slice(0, 12)}...`;
}

function isQuotaError(responseStatus: number, data: Record<string, unknown> | null) {
  if (responseStatus === 402 || responseStatus === 429) return true;
  if (!data) return false;
  const error = getString(data, "error").toLowerCase();
  const message = getString(data, "message").toLowerCase();
  return (
    error.includes("quota") ||
    error.includes("credit") ||
    error.includes("limit") ||
    error.includes("remaining") ||
    message.includes("quota") ||
    message.includes("credit") ||
    message.includes("limit") ||
    message.includes("remaining")
  );
}

export async function extractUpiQrWithPlusPayApi(input: PlusPayExtractInput): Promise<PlusPayExtractedUpiQr> {
  const apiKeys = await getConfiguredPlusPayApiKeys();
  if (!apiKeys.length) throw new Error("PlusPay API key is not configured.");
  if (await input.shouldCancel?.()) throw new Error("Cancelled by user");

  input.onProgress?.({ stage: "queued", percent: 5 });
  input.onDebug?.({
    level: "info",
    message: `Submitting job to external PlusPay API (${apiKeys.length} key${apiKeys.length === 1 ? "" : "s"} configured)`,
    stage: "queued",
    percent: 5,
  });

  const steps: PlusPayExtractedUpiQr["steps"] = [];
  const errors: string[] = [];

  for (const [index, apiKey] of apiKeys.entries()) {
    if (await input.shouldCancel?.()) throw new Error("Cancelled by user");
    input.onDebug?.({
      level: "info",
      message: `Trying PlusPay API key ${index + 1}/${apiKeys.length} (${apiKeyLabel(apiKey)})`,
      stage: "checkout",
      percent: Math.min(85, 10 + index * 8),
    });

    let response: Response;
    let data: Record<string, unknown> | null;
    try {
      response = await fetch(`${getPlusPayApiBase()}/v1/generate/upi`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session_json: input.credential.trim() }),
      });
      data = await response.json().catch(() => null) as Record<string, unknown> | null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${apiKeyLabel(apiKey)} network error: ${message}`);
      continue;
    }

    steps.push({ name: "pluspay_generate_upi", status: response.status, result: data || undefined });
    if (!response.ok || !data) {
      const message = `PlusPay API HTTP ${response.status}`;
      errors.push(`${apiKeyLabel(apiKey)} ${message}`);
      if (isQuotaError(response.status, data)) continue;
      throw new Error(message);
    }
    if (!data.ok) {
      const error = getString(data, "error") || "generation_failed";
      const message = getString(data, "message");
      const formatted = `PlusPay API ${error}${message ? `: ${message}` : ""}`;
      errors.push(`${apiKeyLabel(apiKey)} ${formatted}`);
      if (isQuotaError(response.status, data)) continue;
      throw new Error(formatted);
    }

    const paymentUrl = getString(data, "upi_instructions_url") || getString(data, "payment_link");
    const qrDataUrl = getString(data, "qr_data_url");
    const upiPayload = getString(data, "upi_payload");
    if (!paymentUrl && !upiPayload) throw new Error("PlusPay API did not return a payment link or UPI payload.");
    if (!qrDataUrl) throw new Error("PlusPay API did not return a QR image.");

    input.onProgress?.({ stage: "completed", percent: 100 });
    return {
      checkoutSessionId: `external-pluspay-${getString(data, "job_id") || Date.now()}`,
      processorEntity: "external_pluspay",
      paymentUrl: paymentUrl || upiPayload,
      chatGptPaymentUrl: "",
      hostedInstructionsUrl: paymentUrl || "",
      expiresAt: Date.now() + 5 * 60 * 1000,
      qrPngBuffer: Buffer.from(normalizeDataUrlBase64(qrDataUrl), "base64"),
      steps,
    };
  }

  throw new Error(`All PlusPay API keys failed or have no quota. ${errors.slice(-3).join(" | ")}`);
}
