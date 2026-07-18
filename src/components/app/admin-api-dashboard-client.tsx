"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRightIcon, KeyRoundIcon, Loader2Icon, RefreshCwIcon, TicketIcon, WalletCardsIcon } from "lucide-react";
import { toast } from "sonner";

import { AppFrame } from "@/components/app/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, formatMoney } from "@/lib/api-client";

type KeyStatus = {
  index?: number;
  maskedKey?: string;
  ok?: boolean;
  enabled?: boolean;
  remaining?: number | null;
  used?: number | null;
  limit?: number | null;
  message?: string | null;
};

type KeyPayload = {
  keys?: string[];
  maskedKeys?: string[];
  statuses?: KeyStatus[];
};

type Cdk = {
  amount?: number | string | null;
  status?: string | null;
  redeemedAt?: string | null;
};

function rows(payload: KeyPayload | null): KeyStatus[] {
  if (!payload) return [];
  const statuses = Array.isArray(payload.statuses) ? payload.statuses : [];
  if (statuses.length) return statuses;
  const masked = Array.isArray(payload.maskedKeys) ? payload.maskedKeys : [];
  return masked.map((maskedKey, index) => ({ index, maskedKey, ok: false, enabled: true }));
}

export function AdminApiDashboardClient() {
  const [keysPayload, setKeysPayload] = useState<KeyPayload | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [cdks, setCdks] = useState<Cdk[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [keyData, cdkData] = await Promise.allSettled([
        apiFetch<KeyPayload>("/api/admin/pluspay-keys"),
        apiFetch<Cdk[]>("/api/admin/cdks"),
      ]);

      if (keyData.status === "fulfilled") {
        setKeysPayload(keyData.value || {});
        setKeyDraft(Array.isArray(keyData.value?.keys) ? keyData.value.keys.join("\n") : "");
      } else {
        toast.error(keyData.reason instanceof Error ? keyData.reason.message : "Could not load API keys.");
      }

      if (cdkData.status === "fulfilled") setCdks(Array.isArray(cdkData.value) ? cdkData.value : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const keyRows = useMemo(() => rows(keysPayload), [keysPayload]);
  const liveKeys = keyRows.filter((key) => key.ok && key.enabled !== false).length;
  const remaining = keyRows.reduce((sum, key) => sum + Math.max(0, Number(key.remaining ?? 0)), 0);
  const unusedCdks = cdks.filter((cdk) => !cdk.redeemedAt && String(cdk.status || "").toUpperCase() !== "REDEEMED");
  const unusedValue = unusedCdks.reduce((sum, cdk) => sum + Number(cdk.amount || 0), 0);

  async function saveKeys() {
    setSaving(true);
    try {
      const keys = keyDraft.split(/\r?\n/).map((key) => key.trim()).filter(Boolean);
      const saved = await apiFetch<KeyPayload>("/api/admin/pluspay-keys", {
        method: "PUT",
        body: JSON.stringify({ keys }),
      });
      setKeysPayload(saved || {});
      setKeyDraft(Array.isArray(saved?.keys) ? saved.keys.join("\n") : keys.join("\n"));
      toast.success("API keys saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save API keys.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppFrame
      audience="admin"
      language="en"
      title="Admin Dashboard"
      subtitle="Fresh API-only control panel for UPI QR extraction. No Telegram admin flow, no old translated UI."
      onRefresh={refresh}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRoundIcon className="size-4 text-brand" />API Keys</CardTitle>
            <CardDescription>Working PlusPay keys.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{loading ? "..." : liveKeys}</div>
            <p className="mt-1 text-sm text-muted-foreground">{keyRows.length} saved keys</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><WalletCardsIcon className="size-4 text-brand" />Credits</CardTitle>
            <CardDescription>Total remaining quota.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{loading ? "..." : remaining}</div>
            <p className="mt-1 text-sm text-muted-foreground">Auto fallback uses the next key.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TicketIcon className="size-4 text-brand" />CDK Stock</CardTitle>
            <CardDescription>Unused recharge codes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{loading ? "..." : unusedCdks.length}</div>
            <p className="mt-1 text-sm text-muted-foreground">{formatMoney(unusedValue)} available</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>PlusPay API Key Pool</CardTitle>
            <CardDescription>Paste one API key per line. The system will try keys in order.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} rows={7} className="font-mono text-xs" placeholder="ppk_live_..." />
            <div className="flex gap-2">
              <Button onClick={saveKeys} disabled={saving}>{saving ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}Save Keys</Button>
              <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCwIcon className={loading ? "animate-spin" : ""} />Refresh</Button>
            </div>
            <div className="space-y-2">
              {keyRows.length ? keyRows.map((key, index) => (
                <div key={`${key.maskedKey || index}`} className="flex items-center justify-between rounded-lg border bg-muted/25 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs">{key.maskedKey || `Key ${index + 1}`}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Remaining {key.remaining ?? "-"} · Used {key.used ?? "-"} · Limit {key.limit ?? "-"}</div>
                  </div>
                  <Badge variant={key.ok ? "default" : "secondary"}>{key.ok ? "Ready" : "Saved"}</Badge>
                </div>
              )) : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No API keys saved yet.</div>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next Pages</CardTitle>
            <CardDescription>We will rebuild these one by one.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {[
              ["/admin/users", "Users"],
              ["/admin/cdks", "Recharge CDK"],
              ["/admin/upi-extract", "Jobs"],
              ["/admin/proxies", "Proxies"],
              ["/admin/billing", "Billing"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className={buttonVariants({ variant: "outline", className: "justify-between" })}>
                {label}<ArrowRightIcon className="size-4" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppFrame>
  );
}