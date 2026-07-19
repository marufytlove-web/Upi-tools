import { randomBytes } from "crypto";
import { execFileSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import { prisma } from "@/lib/server/prisma";
import {
  approveTelegramLoginCode,
  isAllowedAdmin,
  normalizeTelegramUsername,
  type TelegramLoginActor,
} from "@/lib/server/telegram-login";
import {
  createPublicUpiExtractJob,
  getPublicUpiExtractJob,
  getPublicUpiExtractUserHistoryPage,
  type PublicUpiExtractActivity,
  type PublicUpiExtractUserHistoryFilter,
} from "@/lib/server/public-upi-extract-queue";
import { EmailBoundError, hasRecognizedSessionCredential, validateCredentialForUpiExtraction } from "@/lib/server/chatgpt-upi";
import { getPublicUserWalletSummary, redeemRechargeCdk, type PublicUserIdentity } from "@/lib/server/public-user-wallet";

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
};

type TelegramMessage = {
  message_id: number;
  chat: { id: number };
  from?: TelegramUser;
  text?: string;
  caption?: string;
  document?: {
    file_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: TelegramMessage;
  };
};

export const TELEGRAM_BOT_COMMANDS = [
  { command: "start", description: "Start the UPI QR bot" },
  { command: "balance", description: "Check wallet balance" },
  { command: "redeem", description: "Redeem a recharge CDK" },
  { command: "login", description: "Confirm a web login code" },
  { command: "worker", description: "Confirm a worker login code" },
  { command: "tasks", description: "View extraction tasks" },
  { command: "help", description: "Show help" },
];

export const TELEGRAM_ADMIN_BOT_COMMANDS = [
  ...TELEGRAM_BOT_COMMANDS,
  { command: "admin", description: "Confirm an admin login code" },
  { command: "reg", description: "Admin: register or update a worker" },
];

let proxyConfigured = false;
const TASKS_PAGE_SIZE = 5;
const TASK_FILTERS: PublicUpiExtractUserHistoryFilter[] = ["all", "active", "completed", "failed"];

function ensureProxyUrl(proxy: string) {
  if (/^[a-z]+:\/\//i.test(proxy)) return proxy;
  return `http://${proxy}`;
}

function readWindowsProxy() {
  if (process.platform !== "win32") return null;

  try {
    const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
    const enabledOutput = execFileSync("reg", ["query", key, "/v", "ProxyEnable"], { encoding: "utf8" });
    if (!/\bProxyEnable\b[\s\S]*0x1/i.test(enabledOutput)) return null;

    const serverOutput = execFileSync("reg", ["query", key, "/v", "ProxyServer"], { encoding: "utf8" });
    const match = serverOutput.match(/\bProxyServer\b\s+REG_SZ\s+(.+)\s*$/im);
    const proxyServer = match?.[1]?.trim();
    if (!proxyServer) return null;

    const entries = proxyServer.split(";").map((entry) => entry.trim()).filter(Boolean);
    const httpsEntry = entries.find((entry) => entry.toLowerCase().startsWith("https="));
    const httpEntry = entries.find((entry) => entry.toLowerCase().startsWith("http="));
    const selected = (httpsEntry || httpEntry)?.split("=").slice(1).join("=") || entries[0];
    return ensureProxyUrl(selected);
  } catch {
    return null;
  }
}

function configureTelegramProxy() {
  if (proxyConfigured) return;
  proxyConfigured = true;

  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    readWindowsProxy();

  if (proxyUrl) setGlobalDispatcher(new ProxyAgent(ensureProxyUrl(proxyUrl)));
}

function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

function extractLoginCode(text: string) {
  const trimmed = text.trim();
  const startPayloadMatch = trimmed.match(/^\/start(?:@\w+)?\s+(?:login_)?([a-z0-9]{8})$/i);
  if (startPayloadMatch) return startPayloadMatch[1];

  const commandMatch = trimmed.match(/^\/(?:login|worker|admin)(?:@\w+)?\s+([a-z0-9]{1,32})$/i);
  if (commandMatch) return commandMatch[1];

  const codeMatch = trimmed.match(/^[a-z0-9]{8}$/i);
  if (codeMatch) return trimmed;

  return null;
}

function parseRegCommand(text: string) {
  if (!/^\/reg(?:@\w+)?(?:\s|$)/i.test(text)) return null;
  const match = text.trim().match(/^\/reg(?:@\w+)?\s+@?([a-z0-9_]{1,32})\s+(\d+(?:\.\d{1,4})?)$/i);
  if (!match) {
    return { ok: false as const, message: "Invalid format. Usage: /reg @username 0.70" };
  }

  const telegramUsername = normalizeTelegramUsername(match[1]);
  const unitPrice = Number(match[2]);
  if (!telegramUsername) return { ok: false as const, message: "Invalid Telegram username." };
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return { ok: false as const, message: "Unit price must be a number greater than or equal to 0." };

  return {
    ok: true as const,
    telegramUsername,
    unitPrice: unitPrice.toFixed(2),
  };
}

function getHelpText(isAdmin = false) {
  return [
    "Tool Mart UPI Bot",
    "",
    "Send one ChatGPT session token/session.json file per message. I will generate a UPI QR when a valid checkout is available.",
    "",
    "Wallet:",
    "/balance  Check your balance.",
    "/redeem CODE  Redeem a recharge CDK.",
    "",
    "Useful commands:",
    "/tasks  View your extraction tasks.",
    "/help  Show this help.",
    "",
    "Admin/worker web login still works with /login CODE, /worker CODE, and /admin CODE.",
    ...(isAdmin
      ? [
          "",
          "Admin commands:",
          "/admin CODE  Confirm an admin login code.",
          "/reg @username 0.70  Register or update a worker and set the unit price.",
        ]
      : []),
  ].join("\n");
}

function getStartText() {
  return [
    "\u{1F44B} *UPI QR Bot*",
    "",
    "Send one account per message:",
    "? `session.json` file ? drag and drop",
    "? Or paste one session token / session JSON text",
    "",
    "?? Do not batch multiple accounts in one message.",
    "\u{1F4B0} Use /balance to check wallet credit.",
    "\u{1F39F} Use /redeem CODE to add CDK credit.",
    "",
    "Pick an action:",
  ].join("\n");
}

function buildMainMenuKeyboard() {
  const miniAppUrl = process.env.TELEGRAM_MINI_APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
  const contactUrl = process.env.TELEGRAM_CONTACT_URL || "";
  const groupUrl = process.env.TELEGRAM_GROUP_URL || "";
  const keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
  if (miniAppUrl) keyboard.push([{ text: "\u{1F680} Open Mini App", url: miniAppUrl }]);
  keyboard.push(
    [{ text: "\u{1F4B0} Wallet", callback_data: "menu:balance" }, { text: "\u{1F6D2} Buy credits", callback_data: "menu:credits" }],
    [{ text: "\u{1F4CA} Status", callback_data: "menu:tasks" }, { text: "\u{1F6D1} Stop all", callback_data: "menu:stop" }],
    [{ text: "\u{1F511} API", callback_data: "menu:api" }, { text: "\u{2753} Help", callback_data: "menu:help" }],
    [{ text: "\u{2699} Settings", callback_data: "menu:settings" }, { text: "\u{1F310} Language", callback_data: "menu:language" }]
  );
  const lastRow = [] as Array<{ text: string; callback_data?: string; url?: string }>;
  lastRow.push(contactUrl ? { text: "\u{1F4AC} Contact", url: contactUrl } : { text: "\u{1F4AC} Contact", callback_data: "menu:contact" });
  lastRow.push(groupUrl ? { text: "\u{1F465} Join Group", url: groupUrl } : { text: "\u{1F465} Join Group", callback_data: "menu:group" });
  keyboard.push(lastRow);
  return { inline_keyboard: keyboard };
}

function publicUserFromTelegram(from: TelegramUser): PublicUserIdentity {
  return {
    telegramUserId: String(from.id),
    telegramUsername: from.username || null,
  };
}

function formatMoney(value: number) {
  return Number(value || 0).toFixed(2);
}

function publicErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  if (/cdk/i.test(message)) {
    const normalized = message.toLowerCase();
    if (normalized.includes("not found") || normalized.includes("???")) return "CDK not found.";
    if (normalized.includes("expired") || normalized.includes("??")) return "CDK has expired.";
    if (normalized.includes("redeemed") || normalized.includes("??")) return "CDK has already been redeemed.";
    if (normalized.includes("disabled") || normalized.includes("??")) return "CDK is disabled or unavailable.";
  }
  return message;
}
async function sendPublicBalance(chatId: number | string, user: PublicUserIdentity) {
  const wallet = await getPublicUserWalletSummary(user);
  await sendTelegramMessage(chatId, [
    "Wallet balance",
    "",
    `Available: ${formatMoney(wallet.availableBalance)} USDT`,
    `Frozen: ${formatMoney(wallet.frozenBalance)} USDT`,
    `Total deposited: ${formatMoney(wallet.totalDeposited)} USDT`,
    `Total spent: ${formatMoney(wallet.totalSpent)} USDT`,
  ].join("\n"));
}

async function handleRedeemCommand(chatId: number | string, user: PublicUserIdentity, text: string) {
  const match = text.match(/^\/redeem(?:@\w+)?\s+(.+)$/i);
  if (!match) {
    await sendTelegramMessage(chatId, "Usage: /redeem YOUR_CDK_CODE");
    return;
  }
  try {
    const result = await redeemRechargeCdk(user, { code: match[1].trim() });
    await sendTelegramMessage(chatId, [
      "CDK redeemed successfully.",
      "",
      `Code: ${result.code}`,
      `Added: ${formatMoney(result.amount)} USDT`,
      `Available balance: ${formatMoney(result.wallet.availableBalance)} USDT`,
    ].join("\n"));
  } catch (error) {
    await sendTelegramMessage(chatId, `Redeem failed: ${publicErrorMessage(error)}`);
  }
}

type TelegramFileResult = {
  file_id: string;
  file_path?: string;
  file_size?: number;
};

async function getTelegramDocumentText(document: NonNullable<TelegramMessage["document"]>) {
  if (document.file_size && document.file_size > 2_000_000) {
    throw new Error("File is too large. Please send a session.json/text file under 2 MB.");
  }
  const file = await callTelegramMethod<TelegramFileResult>("getFile", { file_id: document.file_id });
  if (!file.file_path) throw new Error("Telegram did not return a downloadable file path.");
  configureTelegramProxy();
  const token = getTelegramBotToken();
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Failed to download Telegram file: HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error("File is too large. Please send a smaller session file.");
  return text.trim();
}

function qrDataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/png;base64,([\s\S]+)$/i);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

async function waitForPublicExtractResult(jobId: string) {
  const startedAt = Date.now();
  const timeoutMs = Math.max(20_000, Math.min(240_000, Number(process.env.TELEGRAM_UPI_WAIT_MS || 180_000)));
  let latest = await getPublicUpiExtractJob(jobId);
  while (Date.now() - startedAt < timeoutMs) {
    latest = await getPublicUpiExtractJob(jobId);
    if (latest?.status === "completed" || latest?.status === "failed") return latest;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return latest;
}

async function handlePublicSessionCredential(chatId: number | string, user: PublicUserIdentity, credential: string) {
  const trimmed = credential.trim();
  if (!hasRecognizedSessionCredential(trimmed)) {
    await sendTelegramMessage(chatId, "No valid session token/session JSON was recognized. Send one account per message.");
    return;
  }

  try {
    await sendTelegramMessage(chatId, "Session received. Generating UPI QR now...");
    const credentialInfo = await validateCredentialForUpiExtraction(trimmed);
    const job = await createPublicUpiExtractJob({
      credential: trimmed,
      issueGuardCreateToken: false,
      source: "direct",
      channel: "public",
      extractMethod: "upi",
      publicUserTelegramId: user.telegramUserId,
      publicUserTelegramName: user.telegramUsername ? `@${user.telegramUsername}` : null,
      accountEmail: credentialInfo.accountEmail || null,
      accountPhone: credentialInfo.accountPhone || null,
      autoPublishScanOrder: false,
      untilSuccess: false,
      approvalParallelism: 1,
      checkoutProxyUrl: "",
      providerProxyUrl: "",
    });

    const latest = await waitForPublicExtractResult(job.jobId);
    if (!latest) {
      await sendTelegramMessage(chatId, "Task disappeared before it finished. Please submit again.");
      return;
    }
    if (latest.status !== "completed" || !latest.result) {
      await sendTelegramMessage(chatId, `Extraction failed: ${latest.error || "UPI QR generation failed. Please try another account."}`);
      return;
    }

    const result = latest.result;
    const caption = [
      "UPI QR ready.",
      credentialInfo.accountEmail ? `Account: ${credentialInfo.accountEmail}` : null,
      `Expires: ${new Date(result.expiresAt).toLocaleString("en-US")}`,
      result.paymentUrl ? `Payment link: ${result.paymentUrl}` : null,
    ].filter(Boolean).join("\n");
    const qrBuffer = qrDataUrlToBuffer(result.qrImageUrl);
    if (qrBuffer) {
      await sendTelegramPhoto(chatId, qrBuffer, caption);
    } else {
      await sendTelegramMessage(chatId, caption);
    }
  } catch (error) {
    if (error instanceof EmailBoundError) {
      await sendTelegramMessage(chatId, `Extraction failed for ${error.email}: ${error.message}`);
      return;
    }
    await sendTelegramMessage(chatId, `Extraction failed: ${publicErrorMessage(error)}`);
  }
}

async function registerWorkerByTelegram(actor: TelegramLoginActor, telegramUsername: string, unitPrice: string) {
  if (!isAllowedAdmin(actor)) {
    return "This Telegram account is not allowed to register workers.";
  }

  const existing = await prisma.worker.findFirst({
    where: {
      OR: [
        { username: telegramUsername },
        { telegramUsername },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.worker.update({
      where: { id: existing.id },
      data: {
        username: telegramUsername,
        displayName: `@${telegramUsername}`,
        telegramUsername,
        unitPrice,
      },
    });
  } else {
    const passwordHash = await bcrypt.hash(randomBytes(24).toString("base64url"), 10);
    await prisma.worker.create({
      data: {
        username: telegramUsername,
        displayName: `@${telegramUsername}`,
        passwordHash,
        telegramUsername,
        unitPrice,
      },
    });
  }

  return `Worker @${telegramUsername} has been registered/updated with unit price $${Number(unitPrice).toFixed(2)} per order. Ask them to open /worker and send the 8-character login code shown on the page to this bot.`;
}

async function callTelegramMethod<T>(method: string, payload: unknown, timeoutMs = 8000): Promise<T> {
  configureTelegramProxy();
  const token = getTelegramBotToken();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(async () => ({
    ok: false,
    description: await response.text().catch(() => ""),
  })) as { ok: boolean; result?: T; description?: string };

  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${data.description || JSON.stringify(data)}`);
  }

  return data.result as T;
}

export async function sendTelegramMessage(chatId: number | string, text: string, replyMarkup?: unknown) {
  await callTelegramMethod("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function editTelegramMessageText(chatId: number | string, messageId: number, text: string, replyMarkup?: unknown) {
  await callTelegramMethod("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await callTelegramMethod("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export async function setTelegramBotCommands() {
  await callTelegramMethod("deleteWebhook", { drop_pending_updates: false });
  await callTelegramMethod("setMyCommands", { commands: TELEGRAM_BOT_COMMANDS });
  const adminId = process.env.TELEGRAM_ADMIN_ID;
  if (adminId) {
    await callTelegramMethod("setMyCommands", {
      commands: TELEGRAM_ADMIN_BOT_COMMANDS,
      scope: { type: "chat", chat_id: adminId },
    });
  }
}

async function sendTelegramPhotoRequest(chatId: number | string, photo: Buffer | Uint8Array, caption?: string) {
  configureTelegramProxy();
  const token = getTelegramBotToken();
  const form = new FormData();
  const bytes = new Uint8Array(Buffer.from(photo));
  form.set("chat_id", String(chatId));
  form.set("photo", new Blob([bytes], { type: "image/png" }), "upi-qr.png");
  if (caption) form.set("caption", caption.slice(0, 1024));

  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    body: form,
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(`Telegram sendPhoto failed: ${response.status} ${payload}`);
  }
}

export async function sendTelegramPhoto(chatId: number | string, photo: Buffer | Uint8Array, caption?: string) {
  await sendTelegramPhotoRequest(chatId, photo, caption);
}

function parseTaskFilter(value?: string | null): PublicUpiExtractUserHistoryFilter {
  const normalized = String(value || "").trim().toLowerCase();
  return TASK_FILTERS.includes(normalized as PublicUpiExtractUserHistoryFilter)
    ? normalized as PublicUpiExtractUserHistoryFilter
    : "all";
}

function taskStatusLabel(status: PublicUpiExtractActivity["status"]) {
  if (status === "completed") return "Success";
  if (status === "failed") return "Failed";
  if (status === "running") return "Running";
  return "Queued";
}

function shortJobId(jobId: string) {
  return jobId.length <= 12 ? jobId : `${jobId.slice(0, 8)}…${jobId.slice(-6)}`;
}

function formatTaskTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTaskLine(item: PublicUpiExtractActivity, index: number) {
  const account = item.accountEmail || item.accountPhone || "account hidden";
  const subscription = item.subscriptionIsPlus === true
    ? "Plus"
    : item.subscriptionIsPlus === false
      ? (item.subscriptionPlan || "Free")
      : "Unknown";
  const error = item.error ? `\n   Reason: ${item.error.slice(0, 120)}` : "";
  return [
    `${index}. ${shortJobId(item.jobId)} · ${taskStatusLabel(item.status)}`,
    `   ${account}`,
    `   Subscription: ${subscription}`,
    `   Updated: ${formatTaskTime(item.updatedAt)}`,
    error,
  ].join("\n");
}

function taskFilterTitle(filter: PublicUpiExtractUserHistoryFilter) {
  if (filter === "active") return "Active";
  if (filter === "completed") return "Success";
  if (filter === "failed") return "Failed";
  return "All";
}

function buildTaskListKeyboard(filter: PublicUpiExtractUserHistoryFilter, page: number, totalPages: number) {
  const filterRow = TASK_FILTERS.map((item) => ({
    text: `${item === filter ? "● " : ""}${taskFilterTitle(item)}`,
    callback_data: `tasks:${item}:1`,
  }));
  const navRow = [
    {
      text: "‹ Prev",
      callback_data: `tasks:${filter}:${Math.max(1, page - 1)}`,
    },
    {
      text: `${page}/${totalPages}`,
      callback_data: `tasks:${filter}:${page}`,
    },
    {
      text: "Next ›",
      callback_data: `tasks:${filter}:${Math.min(totalPages, page + 1)}`,
    },
  ];
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");
  return {
    inline_keyboard: [
      filterRow,
      navRow,
      [{ text: "Open web page", url: `${appUrl}/` }],
    ],
  };
}

async function buildTaskListMessage(telegramUserId: string, filter: PublicUpiExtractUserHistoryFilter, page: number) {
  const history = await getPublicUpiExtractUserHistoryPage({
    telegramUserId,
    status: filter,
    page,
    pageSize: TASKS_PAGE_SIZE,
  });
  const safePage = history.pagination.page;
  const totalPages = history.pagination.totalPages;
  const lines = history.items.map((item, index) => formatTaskLine(item, (safePage - 1) * history.pagination.pageSize + index + 1));
  const text = [
    `UPI extraction tasks · ${taskFilterTitle(history.filter)}`,
    `Page ${safePage}/${totalPages} · ${history.pagination.total} total`,
    "",
    lines.length > 0 ? lines.join("\n\n") : "No tasks in this filter.",
  ].join("\n");

  return {
    text,
    keyboard: buildTaskListKeyboard(history.filter, safePage, totalPages),
  };
}

async function sendTaskList(chatId: number | string, telegramUserId: string, filter = "all", page = 1) {
  const parsedFilter = parseTaskFilter(filter);
  const message = await buildTaskListMessage(telegramUserId, parsedFilter, page);
  await sendTelegramMessage(chatId, message.text, message.keyboard);
}

async function handleMainMenuCallback(update: NonNullable<TelegramUpdate["callback_query"]>) {
  const data = String(update.data || "");
  if (!data.startsWith("menu:")) return false;
  const chatId = update.message?.chat.id;
  if (!chatId) return false;
  const user = publicUserFromTelegram(update.from);
  const action = data.slice("menu:".length);
  await answerCallbackQuery(update.id);

  if (action === "balance") {
    await sendPublicBalance(chatId, user);
    return true;
  }
  if (action === "tasks") {
    await sendTaskList(chatId, user.telegramUserId, "all", 1);
    return true;
  }
  if (action === "help") {
    await sendTelegramMessage(chatId, getHelpText(isAllowedAdmin({ id: user.telegramUserId, username: update.from.username, firstName: update.from.first_name })));
    return true;
  }
  if (action === "credits") {
    await sendTelegramMessage(chatId, "Buy or create a CDK from the admin panel, then redeem it here with: /redeem YOUR_CDK_CODE");
    return true;
  }
  if (action === "api") {
    await sendTelegramMessage(chatId, "API access is managed by the admin. Use this bot by sending a session token or session.json file.");
    return true;
  }
  if (action === "stop") {
    await sendTelegramMessage(chatId, "Stop-all from Telegram is not enabled yet. Use /tasks to view jobs, or manage jobs from the admin panel.");
    return true;
  }
  if (action === "settings" || action === "language") {
    await sendTelegramMessage(chatId, "Settings are managed from the web admin panel.");
    return true;
  }
  await sendTelegramMessage(chatId, "No link is configured for this button yet.");
  return true;
}

async function handleTaskListCallback(update: NonNullable<TelegramUpdate["callback_query"]>) {
  const data = String(update.data || "");
  const match = data.match(/^tasks:(all|active|completed|failed):(\d+)$/);
  if (!match || !update.message) return false;
  const filter = parseTaskFilter(match[1]);
  const page = Math.max(1, Math.floor(Number(match[2]) || 1));
  const chatId = update.message.chat.id;
  const messageId = update.message.message_id;
  const telegramUserId = String(update.from.id);
  const message = await buildTaskListMessage(telegramUserId, filter, page);
  await editTelegramMessageText(chatId, messageId, message.text, message.keyboard);
  await answerCallbackQuery(update.id);
  return true;
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  if (update.callback_query) {
    if (await handleMainMenuCallback(update.callback_query)) return { handled: true };
    if (await handleTaskListCallback(update.callback_query)) return { handled: true };
    await answerCallbackQuery(update.callback_query.id).catch(() => undefined);
    return { handled: false };
  }

  const message = update.message;
  if (!message?.from) return { handled: false };

  const rawText = message.text || message.caption || "";
  const text = rawText.trim();
  const chatId = message.chat.id;
  const actor: TelegramLoginActor = {
    id: String(message.from.id),
    username: message.from.username,
    firstName: message.from.first_name,
  };
  const publicUser = publicUserFromTelegram(message.from);

  if (message.document) {
    try {
      const documentText = await getTelegramDocumentText(message.document);
      await handlePublicSessionCredential(chatId, publicUser, documentText);
    } catch (error) {
      await sendTelegramMessage(chatId, `File failed: ${publicErrorMessage(error)}`);
    }
    return { handled: true };
  }

  if (!text) return { handled: false };

  if (/^\/balance(?:@\w+)?$/i.test(text)) {
    await sendPublicBalance(chatId, publicUser);
    return { handled: true };
  }

  if (/^\/redeem(?:@\w+)?(?:\s|$)/i.test(text)) {
    await handleRedeemCommand(chatId, publicUser, text);
    return { handled: true };
  }

  const regCommand = parseRegCommand(text);
  if (regCommand) {
    if (!isAllowedAdmin(actor)) {
      await sendTelegramMessage(chatId, "This command is not available.");
      return { handled: true };
    }
    const reply = regCommand.ok
      ? await registerWorkerByTelegram(actor, regCommand.telegramUsername, regCommand.unitPrice)
      : regCommand.message;
    await sendTelegramMessage(chatId, reply);
    return { handled: true };
  }

  const tasksMatch = text.match(/^\/tasks(?:@\w+)?(?:\s+(all|active|completed|failed))?(?:\s+(\d+))?$/i);
  if (tasksMatch) {
    await sendTaskList(chatId, actor.id, tasksMatch[1] || "all", Number(tasksMatch[2] || 1));
    return { handled: true };
  }

  const code = extractLoginCode(text);

  if (!code) {
    if (/^\/start(?:@\w+)?$/i.test(text)) {
      await sendTelegramMessage(chatId, getStartText(), buildMainMenuKeyboard());
      return { handled: true };
    }
    if (/^\/(?:help|worker|admin|reg|tasks)(?:@\w+)?$/i.test(text)) {
      await sendTelegramMessage(chatId, getHelpText(isAllowedAdmin(actor)));
      return { handled: true };
    }
    if (hasRecognizedSessionCredential(text)) {
      await handlePublicSessionCredential(chatId, publicUser, text);
      return { handled: true };
    }
    await sendTelegramMessage(chatId, "Send a ChatGPT session token/session.json file, or use /help.");
    return { handled: true };
  }

  const result = await approveTelegramLoginCode(code, actor);
  await sendTelegramMessage(chatId, result.message);
  return { handled: true, result };
}
