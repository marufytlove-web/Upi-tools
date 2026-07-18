"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2Icon, KeyRoundIcon, Loader2Icon, RefreshCwIcon, ShieldCheckIcon, Trash2Icon, WalletCardsIcon } from "lucide-react";
import { toast } from "sonner";

import { AppFrame } from "@/components/app/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";

type ApiKeyStatus = {
  index?: number;
  maskedKey?: string;
  enabled?: boolean;
  ok?: boolean;
  balance?: number | null;
  used?: number | null;
  limit?: number | null;
  remaining?: number | null;
  status?: string | null;
  message?: string | null;
};

type ApiKeyPayload = {
  keys?: string[];
  maskedKeys?: string[];
  statuses?: ApiKeyStatus[];
};

function rows(payload: ApiKeyPayload | null): ApiKeyStatus[] {
  if (!payload) return [];
  const statuses = Array.isArray(payload.statuses) ? payload.statuses : [];
  if (statuses.length) return statuses;
  const masked = Array.isArray(payload.maskedKeys) ? payload.maskedKeys : [];
  return masked.map((maskedKey, index) => ({ index, maskedKey, enabled: true, ok: false }));
}

function keyBadge(key: ApiKeyStatus) {
  if (key.ok && key.enabled !== false) return <Badge className="bg-emerald-600 text-white">Ready</Badge>;
  if (key.enabled === false) return <Badge variant="secondary">Disabled</Badge>;
  return <Badge variant="secondary">Saved</Badge>;
}

export function AdminApiKeysFreshClient() {
  const [payload, setPayload] = useState<ApiKeyPayload | null>(null);
  const [draft, setDraft] = useState("");
  const [singleKey, setSingleKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const data = await apiFetch<ApiKeyPayload>("/api/admin/pluspay-keys");
      setPayload(data || {});
      setDraft(Array.isArray(data?.keys) ? data.keys.join("\n") : "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load API keys.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const keyRows = useMemo(() => rows(payload), [payload]);
  const totalRemaining = keyRows.reduce((sum, key) => sum + Math.max(0, Number(key.remaining ?? 0)), 0);
  const liveKeys = keyRows.filter((key) => key.ok && key.enabled !== false).length;

  function cleanKeys(value = draft) {
    return value.split(/\r?\n/).map((key) => key.trim()).filter(Boolean);
  }

  async function saveKeys(keys = cleanKeys()) {
    setSaving(true);
    try {
      const saved = await apiFetch<ApiKeyPayload>("/api/admin/pluspay-keys", {
        method: "PUT",
        body: JSON.stringify({ keys }),
      });
      setPayload(saved || {});
      setDraft(Array.isArray(saved?.keys) ? saved.keys.join("\n") : keys.join("\n"));
      toast.success("API key pool saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save API keys.");
    } finally {
      setSaving(false);
    }
  }

  async function addSingleKey() {
    const next = singleKey.trim();
    if (!next) return;
    const keys = [...cleanKeys(), next];
    setSingleKey("");
    await saveKeys(keys);
  }

  async function removeKey(index: number) {
    const keys = cleanKeys().filter((_, itemIndex) => itemIndex !== index);
    await saveKeys(keys);
  }

  return (
    <AppFrame audience="admin" language="en" title="API Key Pool" subtitle="Add multiple bot/API keys. The extractor will automatically move to the next key when one key has no balance or quota." onRefresh={refresh}>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><KeyRoundIcon className="size-4 text-brand" />Saved Keys</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : keyRows.length}</div><p className="text-sm text-muted-foreground">Total keys in pool</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheckIcon className="size-4 text-brand" />Ready Keys</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : liveKeys}</div><p className="text-sm text-muted-foreground">Healthy keys</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><WalletCardsIcon className="size-4 text-brand" />Remaining</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : totalRemaining}</div><p className="text-sm text-muted-foreground">Total available quota</p></CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle>Add API Key</CardTitle>
            <CardDescription>Paste one new key and add it to the pool.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={singleKey} onChange={(event) => setSingleKey(event.target.value)} placeholder="ppk_live_..." className="font-mono text-xs" />
            <Button onClick={addSingleKey} disabled={saving || !singleKey.trim()} className="w-full">
              {saving ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />}Add Key
            </Button>
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              You can also paste many keys in the bulk editor. One key per line.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bulk Key Editor</CardTitle>
            <CardDescription>One API key per line. Saving replaces the full pool.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={8} placeholder="ppk_live_..." className="font-mono text-xs" />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => saveKeys()} disabled={saving}>{saving ? <Loader2Icon className="animate-spin" /> : <CheckCircle2Icon />}Save Pool</Button>
              <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCwIcon className={loading ? "animate-spin" : ""} />Refresh Status</Button>
              <Button variant="destructive" onClick={() => saveKeys([])} disabled={saving || cleanKeys().length === 0}><Trash2Icon />Delete All</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>API Credits by Key</CardTitle>
          <CardDescription>See exactly which API key has how many credits/quota left.</CardDescription>
        </CardHeader>
        <CardContent>
          {keyRows.length ? (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">API Key</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Remaining</th>
                    <th className="px-3 py-2 font-medium">Used</th>
                    <th className="px-3 py-2 font-medium">Limit</th>
                    <th className="px-3 py-2 font-medium">Balance</th>
                    <th className="px-3 py-2 font-medium">Message</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {keyRows.map((key, index) => (
                    <tr key={`${key.maskedKey || index}`} className="border-t">
                      <td className="px-3 py-3 font-mono text-xs">{key.maskedKey || `Key ${index + 1}`}</td>
                      <td className="px-3 py-3">{keyBadge(key)}</td>
                      <td className="px-3 py-3 text-lg font-semibold">{key.remaining ?? "-"}</td>
                      <td className="px-3 py-3">{key.used ?? "-"}</td>
                      <td className="px-3 py-3">{key.limit ?? "-"}</td>
                      <td className="px-3 py-3">{key.balance ?? "-"}</td>
                      <td className="max-w-72 truncate px-3 py-3 text-xs text-muted-foreground" title={key.message || ""}>{key.message || "-"}</td>
                      <td className="px-3 py-3">
                        <Button variant="outline" size="sm" onClick={() => removeKey(index)} disabled={saving}><Trash2Icon />Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No API keys saved yet.</div>
          )}
        </CardContent>
      </Card>
    </AppFrame>
  );
}