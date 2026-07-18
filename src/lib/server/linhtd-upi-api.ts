import { Buffer } from "node:buffer";
import type { UpiExtractionDebugEvent, UpiExtractionProgress } from "@/lib/server/chatgpt-upi";

type LinhtdExtractInput = {
  credential: string;
  email?: string | null;
  shouldCancel?: () => boolean | Promise<boolean>;
  onProgress?: (progress: UpiExtractionProgress) => void;
  onDebug?: (event: UpiExtractionDebugEvent) => void;
};

export type LinhtdExtractedUpiQr = {
  checkoutSessionId: string;
  processorEntity: string;
  paymentUrl: string;
  chatGptPaymentUrl: string;
  hostedInstructionsUrl: string;
  expiresAt: number;
  qrPngBuffer: Buffer;
  steps: Array<{ name: string; status: number; state?: unknown; result?: unknown }>;
};

const DEFAULT_API_BASE = "https://upiapi.linhtd.com";
const JOB_TIMEOUT_MS = 8 * 60 * 1000;

function getLinhtdApiKey() {
  return String(process.env.LINHTD_UPI_API_KEY || process.env.UPIAPI_LINHTD_API_KEY || "").trim();
}

export function isLinhtdUpiApiEnabled() {
  return Boolean(getLinhtdApiKey()) && process.env.LINHTD_UPI_API_DISABLED !== "1";
}

function getLinhtdApiBase() {
  return String(process.env.LINHTD_UPI_API_BASE || DEFAULT_API_BASE).trim().replace(/\/+$/, "") || DEFAULT_API_BASE;
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function buildSubmitBody(input: LinhtdExtractInput) {
  const credential = input.credential.trim();
  const session = parseJsonObject(credential);
  if (session) return { session };
  return {
    access_token: credential,
    email: input.email || "account@example.com",
  };
}

function normalizeDataUrlBase64(value: string) {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(",");
  return commaIndex >= 0 ? trimmed.slice(commaIndex + 1) : trimmed;
}

function parseSseEvent(raw: string) {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim() || event;
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  const dataText = dataLines.join("\n").trim();
  let data: unknown = dataText;
  if (dataText) {
    try {
      data = JSON.parse(dataText);
    } catch {
      data = dataText;
    }
  }
  return { event, data };
}

function getString(data: unknown, keys: string[]) {
  if (!data || typeof data !== "object") return "";
  const obj = data as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getNumber(data: unknown, keys: string[]) {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

export async function extractUpiQrWithLinhtdApi(input: LinhtdExtractInput): Promise<LinhtdExtractedUpiQr> {
  const apiKey = getLinhtdApiKey();
  if (!apiKey) throw new Error("LINHTD UPI API key is not configured.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);
  const steps: LinhtdExtractedUpiQr["steps"] = [];
  let qrPngBase64 = "";
  let paymentUrl = "";
  let expiresAt = Date.now() + 5 * 60 * 1000;
  let checkoutSessionId = "";

  input.onProgress?.({ stage: "queued", percent: 5 });
  input.onDebug?.({ level: "info", message: "Submitting job to external Linhtd UPI API", stage: "queued", percent: 5 });

  try {
    const response = await fetch(`${getLinhtdApiBase()}/api/v1/jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(buildSubmitBody(input)),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new Error(`Linhtd API HTTP ${response.status}${text ? `: ${text.slice(0, 240)}` : ""}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let doneDelivered = false;

    while (true) {
      if (await input.shouldCancel?.()) throw new Error("Cancelled by user");
      const read = await reader.read();
      if (read.done) break;
      buffer += decoder.decode(read.value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || "";

      for (const part of parts) {
        if (!part.trim()) continue;
        const { event, data } = parseSseEvent(part);
        steps.push({ name: `linhtd_${event}`, status: 200, result: data });

        const message = typeof data === "string" ? data : getString(data, ["message", "log", "status"]);
        if (message) input.onDebug?.({ level: event === "failed" ? "error" : "info", message, stage: "waiting_qr", percent: 45 });

        const eventPaymentUrl = getString(data, ["payment_link", "payment_url", "paymentUrl", "url"]);
        const eventQrBase64 = getString(data, ["qr_png_base64", "qrPngBase64", "qr"]);
        const eventExpiresAt = getString(data, ["expires_at", "expiresAt"]);
        const eventJobId = getString(data, ["id", "job_id", "jobId"]);
        const eventExpiresIn = getNumber(data, ["expires_in", "expiresIn"]);

        if (eventJobId) checkoutSessionId = `external-${eventJobId}`;
        if (eventPaymentUrl) paymentUrl = eventPaymentUrl;
        if (eventQrBase64) qrPngBase64 = normalizeDataUrlBase64(eventQrBase64);
        if (eventExpiresAt) {
          const parsed = Date.parse(eventExpiresAt);
          if (Number.isFinite(parsed)) expiresAt = parsed;
        } else if (eventExpiresIn) {
          expiresAt = Date.now() + Math.max(30, eventExpiresIn) * 1000;
        }

        if (event === "accepted" || event === "started") input.onProgress?.({ stage: "checkout", percent: 20 });
        if (event === "log") input.onProgress?.({ stage: "waiting_qr", percent: 55 });
        if (event === "failed" || event === "timeout" || event === "cancelled") {
          throw new Error(message || `Linhtd API job ${event}`);
        }
        if (event === "done" || (paymentUrl && qrPngBase64)) {
          doneDelivered = true;
          input.onProgress?.({ stage: "completed", percent: 100 });
        }
      }

      if (doneDelivered && paymentUrl && qrPngBase64) break;
    }

    if (!paymentUrl) throw new Error("Linhtd API did not return a payment link.");
    if (!qrPngBase64) throw new Error("Linhtd API did not return a QR image.");

    const qrPngBuffer = Buffer.from(qrPngBase64, "base64");
    return {
      checkoutSessionId: checkoutSessionId || `external-${Date.now()}`,
      processorEntity: "external_linhtd",
      paymentUrl,
      chatGptPaymentUrl: "",
      hostedInstructionsUrl: paymentUrl,
      expiresAt,
      qrPngBuffer,
      steps,
    };
  } finally {
    clearTimeout(timeout);
  }
}
