"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ActivityIcon,
  ArrowLeftIcon,
  BotIcon,
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  ShieldAlertIcon,
  TimerIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/app/app-frame";
import { AdminListPagination } from "@/components/app/admin-list-pagination";
import { MetricCard } from "@/components/app/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, formatDateTime } from "@/lib/api-client";
import type { AdminPaginationMeta } from "@/lib/types/app";

type ExtractStatus = "queued" | "running" | "completed" | "failed";
type ExtractSource = "direct" | "storage";
type ExtractChannel = "public" | "premium";

type ExtractProgress = {
  stage: string;
  percent: number;
  proxy?: string;
  updatedAt?: string;
};

type AdminExtractJob = {
  jobId: string;
  status: ExtractStatus;
  source: ExtractSource;
  channel: ExtractChannel;
  createdAt: string;
  updatedAt: string;
  progress?: ExtractProgress;
  error?: string;
  hasPayload: boolean;
  hasResult: boolean;
  canStart: boolean;
  canStop: boolean;
};

type ExtractActivity = {
  jobId: string;
  seq: number;
  status: ExtractStatus;
  source: ExtractSource;
  channel: ExtractChannel;
  createdAt: string;
  updatedAt: string;
};

type ExtractCounts = Record<ExtractStatus, number>;

type AdminExtractState = {
  paused: boolean;
  pausedByChannel?: Record<ExtractChannel, boolean>;
  maxConcurrent: number;
  maxConcurrentByChannel?: Record<ExtractChannel, number>;
  activeExtractionCount: number;
  activeExtractionCountByChannel?: Record<ExtractChannel, number>;
  queuedCount: number;
  queuedCountByChannel?: Record<ExtractChannel, number>;
  liveJobCount: number;
  jobs: AdminExtractJob[];
  items: ExtractActivity[];
  jobsPagination?: AdminPaginationMeta;
  itemsPagination?: AdminPaginationMeta;
  counts: ExtractCounts;
  storageActiveCount: number;
  changed?: number;
};

const emptyCounts: ExtractCounts = { completed: 0, queued: 0, running: 0, failed: 0 };
const ADMIN_PAGE_SIZE = 20;

function adminExtractUrl(input: { page: number; search?: string }) {
  const params = new URLSearchParams();
  params.set("paged", "1");
  params.set("page", String(input.page));
  params.set("pageSize", String(ADMIN_PAGE_SIZE));
  if (input.search?.trim()) params.set("search", input.search.trim());
  return `/api/admin/upi-extract?${params.toString()}`;
}

export function AdminUpiExtractClient() {
  const [state, setState] = useState<AdminExtractState | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [concurrencyDraft, setConcurrencyDraft] = useState<Record<ExtractChannel, string>>({ public: "10", premium: "5" });
  const [concurrencyDirty, setConcurrencyDirty] = useState<Record<ExtractChannel, boolean>>({ public: false, premium: false });
  const [telegramToken, setTelegramToken] = useState("");

  const refresh = useCallback(async (silent = false) => {
    try {
      setLoading(true);
      const next = await apiFetch<AdminExtractState>(adminExtractUrl({ page, search: deferredSearch }));
      setState(next);
      setConcurrencyDraft((current) => ({
        public: concurrencyDirty.public ? current.public : String(channelMaxConcurrent(next, "public")),
        premium: concurrencyDirty.premium ? current.premium : String(channelMaxConcurrent(next, "premium")),
      }));
      if (!silent) toast.success("Extraction jobs refreshed");
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Failed to refresh extraction jobs");
    } finally {
      setLoading(false);
    }
  }, [concurrencyDirty.premium, concurrencyDirty.public, deferredSearch, page]);

  const control = useCallback(async (action: "pause" | "resume" | "start" | "stop" | "stopAll", jobId?: string, channel?: ExtractChannel) => {
    try {
      setActing(jobId ? `${action}:${jobId}` : channel ? `${action}:${channel}` : action);
      const next = await apiFetch<AdminExtractState>("/api/admin/upi-extract", {
        method: "POST",
        body: JSON.stringify({ action, jobId, channel }),
      });
      setState(next);
      if (action === "pause") toast.success(`${channelLabel(channel)} extraction paused`);
      else if (action === "resume") toast.success(`${channelLabel(channel)} extraction resumed`);
      else if (action === "stopAll") toast.success(`Moved ${next.changed ?? 0} jobs back to queued`);
      else if (action === "stop") toast.success("Task moved back to queued");
      else toast.success("Task started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setActing(null);
    }
  }, []);

  const saveConcurrency = useCallback(async (channel: ExtractChannel) => {
    try {
      setActing(`setConcurrency:${channel}`);
      const next = await apiFetch<AdminExtractState>("/api/admin/upi-extract", {
        method: "POST",
        body: JSON.stringify({ action: "setConcurrency", channel, concurrency: Number(concurrencyDraft[channel]) }),
      });
      setState(next);
      setConcurrencyDirty((current) => ({ ...current, [channel]: false }));
      toast.success(`${channelLabel(channel)} concurrency limit saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save concurrency limit");
    } finally {
      setActing(null);
    }
  }, [concurrencyDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(true), 0);
    const interval = window.setInterval(() => void refresh(true), 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const counts = state?.counts || emptyCounts;
  const jobsById = useMemo(() => new Map((state?.jobs || []).map((job) => [job.jobId, job])), [state?.jobs]);
  const recentItems = state?.items || [];
  const isBusy = loading || Boolean(acting);
  const appUrl = typeof window === "undefined" ? "" : window.location.origin;
  const telegramWebhookUrl = `${appUrl}/api/telegram/webhook`;
  const sanitizedTelegramToken = telegramToken.trim();
  const setWebhookUrl = sanitizedTelegramToken
    ? `https://api.telegram.org/bot${encodeURIComponent(sanitizedTelegramToken)}/setWebhook?url=${encodeURIComponent(telegramWebhookUrl)}&drop_pending_updates=true`
    : "";
  const webhookInfoUrl = sanitizedTelegramToken
    ? `https://api.telegram.org/bot${encodeURIComponent(sanitizedTelegramToken)}/getWebhookInfo`
    : "";

  const copyTelegramWebhookUrl = useCallback(async () => {
    await navigator.clipboard.writeText(telegramWebhookUrl);
    toast.success("Webhook URL copied");
  }, [telegramWebhookUrl]);

  return (
    <AppFrame audience="admin" title="UPI Extract Jobs" subtitle="Monitor extraction jobs, pause channels, and move running jobs back to the queue." onRefresh={() => refresh()}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeftIcon data-icon="inline-start" />Back to Dashboard
        </Link>
        <div className="flex flex-wrap gap-2">
          <div className="relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search job ID, status, or error" className="pl-9" />
          </div>
          <Button variant="outline" onClick={() => refresh()} disabled={isBusy}>
            <RefreshCwIcon data-icon="inline-start" />Refresh
          </Button>
          <ChannelPauseButton channel="public" paused={Boolean(state?.pausedByChannel?.public ?? state?.paused)} disabled={isBusy} acting={acting} onControl={control} />
          <ChannelPauseButton channel="premium" paused={Boolean(state?.pausedByChannel?.premium)} disabled={isBusy} acting={acting} onControl={control} />
          <Button variant="outline" onClick={() => control("stopAll")} disabled={isBusy}>
            <RotateCcwIcon data-icon="inline-start" />Stop All to Queue
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <MetricCard title="Channel Status" value={pauseSummary(state)} description="Public and Premium can be paused separately. Queued jobs can be started manually." icon={isAnyChannelPaused(state) ? ShieldAlertIcon : CheckCircle2Icon} tone={isAnyChannelPaused(state) ? "warning" : "success"} />
        <MetricCard title="Running" value={state?.activeExtractionCount ?? 0} description={`Public ${state?.activeExtractionCountByChannel?.public ?? 0}/${channelMaxConcurrent(state, "public")} / Premium ${state?.activeExtractionCountByChannel?.premium ?? 0}/${channelMaxConcurrent(state, "premium")}`} icon={ActivityIcon} tone="info" />
        <MetricCard title="Queued" value={state?.queuedCount ?? counts.queued} description={`Public ${state?.queuedCountByChannel?.public ?? 0} / Premium ${state?.queuedCountByChannel?.premium ?? 0}`} icon={TimerIcon} tone="warning" />
        <MetricCard title="Success / Failed" value={`${counts.completed} / ${counts.failed}`} description="Counted from all saved activity records" icon={CheckCircle2Icon} tone="brand" />
        <MetricCard title="Storage Active" value={state?.storageActiveCount ?? 0} description="Active temporary storage IDs" icon={RotateCcwIcon} tone="brand" />
      </div>

      <Card className="mt-4 rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>Channel Concurrency</CardTitle>
          <CardDescription>Set how many Public and Premium jobs can run at the same time. Changes apply immediately without interrupting running jobs.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {(["public", "premium"] as const).map((channel) => {
              const active = state?.activeExtractionCountByChannel?.[channel] ?? 0;
              const queued = state?.queuedCountByChannel?.[channel] ?? 0;
              const isSaving = acting === `setConcurrency:${channel}`;
              return (
                <div key={channel} className="rounded-3xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{channelLabel(channel)} Channel</div>
                      <div className="mt-1 text-xs text-muted-foreground">Running {active}, queued {queued}</div>
                    </div>
                    <Badge variant={channel === "premium" ? "default" : "outline"}>Current limit {channelMaxConcurrent(state, channel)}</Badge>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={concurrencyDraft[channel]}
                      onChange={(event) => {
                        setConcurrencyDraft((current) => ({ ...current, [channel]: event.target.value }));
                        setConcurrencyDirty((current) => ({ ...current, [channel]: true }));
                      }}
                      className="h-10 rounded-xl"
                    />
                    <Button type="button" onClick={() => void saveConcurrency(channel)} disabled={isBusy || isSaving || !concurrencyDirty[channel]} className="rounded-xl">
                      {isSaving ? "Saving" : "Save"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>Live Extraction Jobs</CardTitle>
          <CardDescription>Only jobs still controllable in the current process are shown here. Stop moves a job back to the queue instead of marking it failed.</CardDescription>
          <CardAction>
            <div className="flex flex-wrap gap-2">
              <Badge variant={state?.pausedByChannel?.public ? "secondary" : "default"}>Public {state?.pausedByChannel?.public ? "Paused" : "Running"}</Badge>
              <Badge variant={state?.pausedByChannel?.premium ? "secondary" : "default"}>Premium {state?.pausedByChannel?.premium ? "Paused" : "Running"}</Badge>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-3xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(state?.jobs || []).map((job) => (
                  <TableRow key={job.jobId}>
                    <TableCell>
                      <div className="font-mono text-xs">{shortJobId(job.jobId)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{job.hasPayload ? "Recoverable" : "No temporary data"}{job.hasResult ? " / has result" : ""}</div>
                    </TableCell>
                    <TableCell><ChannelBadge channel={job.channel} /></TableCell>
                    <TableCell><SourceBadge source={job.source} /></TableCell>
                    <TableCell><StatusBadge status={job.status} /></TableCell>
                    <TableCell>
                      <div className="min-w-[140px]">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{stageText(job.progress?.stage)}</span>
                          <span>{Math.round(Number(job.progress?.percent || 0))}%</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, Number(job.progress?.percent || 0)))}%` }} />
                        </div>
                        {job.progress?.proxy ? <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">{job.progress.proxy}</div> : null}
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(job.createdAt)}</TableCell>
                    <TableCell>{formatDateTime(job.updatedAt)}</TableCell>
                    <TableCell className="max-w-[280px]">
                      {job.error ? <div className="truncate text-sm text-destructive" title={job.error}>{job.error}</div> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => control("start", job.jobId)} disabled={isBusy || !job.canStart}>
                          <PlayCircleIcon data-icon="inline-start" />Start
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => control("stop", job.jobId)} disabled={isBusy || !job.canStop}>
                          <PauseCircleIcon data-icon="inline-start" />Stop
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!state?.jobs || state.jobs.length === 0) && (
                  <TableRow><TableCell colSpan={9} className="h-28 text-center text-muted-foreground">No controllable live jobs right now.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <AdminListPagination pagination={state?.jobsPagination} loading={loading} onPageChange={setPage} className="mt-4" />
        </CardContent>
      </Card>

      <Card className="mt-4 rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>Recent Extraction Records</CardTitle>
          <CardDescription>Use this to check recent job status. User credentials and QR contents are not shown.</CardDescription>
          <CardAction>{recentItems.length} records</CardAction>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-3xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentItems.map((item) => {
                  const liveJob = jobsById.get(item.jobId);
                  const canStart = item.status === "queued" && Boolean(liveJob?.canStart);
                  return (
                    <TableRow key={`${item.seq}-${item.jobId}`}>
                      <TableCell>{item.seq}</TableCell>
                      <TableCell className="font-mono text-xs">{shortJobId(item.jobId)}</TableCell>
                      <TableCell><ChannelBadge channel={item.channel} /></TableCell>
                      <TableCell><SourceBadge source={item.source} /></TableCell>
                      <TableCell><StatusBadge status={item.status} /></TableCell>
                      <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                      <TableCell>{formatDateTime(item.updatedAt)}</TableCell>
                      <TableCell className="text-right">
                        {item.status === "queued" ? (
                          <Button variant="outline" size="sm" onClick={() => control("start", item.jobId)} disabled={isBusy || !canStart} title={canStart ? "Start this queued job" : "This record has no recoverable temporary payload."}>
                            <PlayCircleIcon data-icon="inline-start" />Start
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {recentItems.length === 0 && <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground">No extraction records yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <AdminListPagination pagination={state?.itemsPagination} loading={loading} onPageChange={setPage} className="mt-4" />
        </CardContent>
      </Card>

      <Card className="mt-4 rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BotIcon className="size-5 text-primary" />Telegram Bot Setup</CardTitle>
          <CardDescription>Connect your own Telegram bot to this site. Users can send /start, /balance, /redeem CODE, or a session.json file directly to the bot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-border p-4">
              <div className="font-semibold">1. Add Vercel environment variable</div>
              <div className="mt-2 text-sm text-muted-foreground">Add this in Vercel, then redeploy the latest production build.</div>
              <div className="mt-3 rounded-2xl bg-muted p-3 font-mono text-xs leading-6">
                <div>TELEGRAM_BOT_TOKEN=your_botfather_token</div>
                <div>TELEGRAM_UPI_WAIT_MS=180000</div>
              </div>
            </div>
            <div className="rounded-3xl border border-border p-4">
              <div className="font-semibold">2. Webhook URL</div>
              <div className="mt-2 break-all rounded-2xl bg-muted p-3 font-mono text-xs">{telegramWebhookUrl}</div>
              <Button type="button" variant="outline" className="mt-3 rounded-xl" onClick={copyTelegramWebhookUrl}>
                <CopyIcon data-icon="inline-start" />Copy URL
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-border p-4">
            <div className="font-semibold">3. Set webhook from here</div>
            <div className="mt-2 text-sm text-muted-foreground">Paste the BotFather token only to generate Telegram setup links. The token is not saved in this page.</div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row">
              <Input value={telegramToken} onChange={(event) => setTelegramToken(event.target.value)} placeholder="123456789:AA..." className="h-10 rounded-xl font-mono" />
              <Button type="button" className="rounded-xl" disabled={!setWebhookUrl} onClick={() => window.open(setWebhookUrl, "_blank", "noopener,noreferrer")}>
                <ExternalLinkIcon data-icon="inline-start" />Set Webhook
              </Button>
              <Button type="button" variant="outline" className="rounded-xl" disabled={!webhookInfoUrl} onClick={() => window.open(webhookInfoUrl, "_blank", "noopener,noreferrer")}>
                <ExternalLinkIcon data-icon="inline-start" />Check Status
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["/start", "Open bot menu"],
              ["/balance", "Check wallet"],
              ["/redeem CODE", "Add CDK credit"],
              ["session.json", "Generate UPI QR"],
            ].map(([command, description]) => (
              <div key={command} className="rounded-2xl border border-border p-3">
                <div className="font-mono text-sm font-semibold">{command}</div>
                <div className="mt-1 text-xs text-muted-foreground">{description}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AppFrame>
  );
}

function ChannelPauseButton({
  channel,
  paused,
  disabled,
  acting,
  onControl,
}: {
  channel: ExtractChannel;
  paused: boolean;
  disabled: boolean;
  acting: string | null;
  onControl: (action: "pause" | "resume" | "start" | "stop" | "stopAll", jobId?: string, channel?: ExtractChannel) => void;
}) {
  const label = channelLabel(channel);
  const isActing = acting === `pause:${channel}` || acting === `resume:${channel}`;
  return paused ? (
    <Button onClick={() => onControl("resume", undefined, channel)} disabled={disabled || isActing}>
      <PlayCircleIcon data-icon="inline-start" />Resume {label}
    </Button>
  ) : (
    <Button variant="outline" onClick={() => onControl("pause", undefined, channel)} disabled={disabled || isActing}>
      <PauseCircleIcon data-icon="inline-start" />Pause {label}
    </Button>
  );
}

function ChannelBadge({ channel }: { channel?: ExtractChannel }) {
  return <Badge variant={channel === "premium" ? "default" : "outline"}>{channel === "premium" ? "Premium" : "Public"}</Badge>;
}

function channelLabel(channel?: ExtractChannel) {
  if (channel === "premium") return "Premium";
  if (channel === "public") return "Public";
  return "Public";
}

function channelMaxConcurrent(state: AdminExtractState | null, channel: ExtractChannel) {
  return state?.maxConcurrentByChannel?.[channel] ?? state?.maxConcurrent ?? (channel === "premium" ? 5 : 10);
}

function isAnyChannelPaused(state: AdminExtractState | null) {
  return Boolean(state?.pausedByChannel?.public || state?.pausedByChannel?.premium || state?.paused);
}

function pauseSummary(state: AdminExtractState | null) {
  const publicPaused = Boolean(state?.pausedByChannel?.public ?? state?.paused);
  const premiumPaused = Boolean(state?.pausedByChannel?.premium);
  if (publicPaused && premiumPaused) return "All Paused";
  if (publicPaused) return "Public Paused";
  if (premiumPaused) return "Premium Paused";
  return "Running";
}

function StatusBadge({ status }: { status: ExtractStatus }) {
  const meta: Record<ExtractStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    completed: { label: "Completed", variant: "default" },
    queued: { label: "Queued", variant: "secondary" },
    running: { label: "Running", variant: "outline" },
    failed: { label: "Failed", variant: "destructive" },
  };
  return <Badge variant={meta[status].variant}>{meta[status].label}</Badge>;
}

function SourceBadge({ source }: { source: ExtractSource }) {
  return <Badge variant={source === "storage" ? "secondary" : "outline"}>{source === "storage" ? "Storage" : "Direct"}</Badge>;
}

function shortJobId(jobId: string) {
  if (!jobId) return "-";
  return `${jobId.slice(0, 8)}...${jobId.slice(-6)}`;
}

function stageText(stage?: string) {
  const map: Record<string, string> = {
    queued: "Preparing",
    validating: "Validating",
    checkout: "Create checkout",
    stripe_init: "Initialize Stripe",
    stripe_confirm: "Confirm payment",
    approval: "Approve stage",
    waiting_qr: "Wait for QR",
    hydrating: "Read QR",
    rendering_qr: "Render QR",
    completed: "Completed",
  };
  return map[stage || "queued"] || stage || "Preparing";
}
