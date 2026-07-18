"use client";

import { useEffect, useMemo, useState } from "react";
import { CopyIcon, Loader2Icon, RefreshCwIcon, SearchIcon, TicketIcon, Trash2Icon, WandSparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { AppFrame } from "@/components/app/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, formatMoney } from "@/lib/api-client";
import type { PublicCdk } from "@/lib/types/app";

type BatchResponse = { batch: unknown; cdks: PublicCdk[] };

function isUnused(cdk: PublicCdk) {
  return cdk.status === "ACTIVE" && !cdk.redeemedAt && cdk.availableCount > 0;
}

function statusLabel(cdk: PublicCdk) {
  if (cdk.redeemedAt || cdk.usedCount > 0) return "Redeemed";
  if (cdk.status === "DISABLED") return "Disabled";
  if (cdk.status === "EXPIRED") return "Expired";
  return "Unused";
}

function statusVariant(cdk: PublicCdk): "default" | "secondary" | "destructive" {
  if (isUnused(cdk)) return "default";
  if (cdk.status === "DISABLED" || cdk.status === "EXPIRED") return "destructive";
  return "secondary";
}

export function AdminCdksFreshClient() {
  const [cdks, setCdks] = useState<PublicCdk[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("1.8");
  const [count, setCount] = useState("10");
  const [name, setName] = useState("");
  const [remark, setRemark] = useState("");
  const [lastCodes, setLastCodes] = useState<string[]>([]);

  async function refresh() {
    setLoading(true);
    try {
      const data = await apiFetch<PublicCdk[]>("/api/admin/cdks");
      setCdks(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load CDKs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = cdks.filter((cdk) => {
    const text = `${cdk.code} ${cdk.batchId || ""} ${cdk.remark || ""} ${cdk.redeemedByTelegramName || ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });
  const unused = cdks.filter(isUnused);
  const redeemed = cdks.filter((cdk) => cdk.redeemedAt || cdk.usedCount > 0);
  const stockValue = unused.reduce((sum, cdk) => sum + Number(cdk.amount || 0), 0);

  const generatedText = useMemo(() => lastCodes.join("\n"), [lastCodes]);

  async function createBatch() {
    setSaving(true);
    try {
      const result = await apiFetch<BatchResponse>("/api/admin/cdks/batches", {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), count: Number(count), name, remark }),
      });
      const codes = Array.isArray(result.cdks) ? result.cdks.map((cdk) => cdk.code) : [];
      setLastCodes(codes);
      toast.success(`Generated ${codes.length} CDKs.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate CDKs.");
    } finally {
      setSaving(false);
    }
  }

  async function copyGenerated() {
    await navigator.clipboard.writeText(generatedText);
    toast.success("Generated CDKs copied.");
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    toast.success("CDK copied.");
  }


  async function deleteAllUnusedCdks() {
    if (!window.confirm("Delete all unused CDKs? Used or order-linked CDKs will be kept.")) return;
    try {
      const result = await apiFetch<{ deletedCount: number }>("/api/admin/cdks", { method: "DELETE" });
      toast.success(`Deleted ${result.deletedCount} unused CDKs.`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete unused CDKs.");
    }
  }
  async function deleteCdk(cdk: PublicCdk) {
    if (!window.confirm(`Delete CDK ${cdk.code}?`)) return;
    try {
      await apiFetch(`/api/admin/cdks/${encodeURIComponent(cdk.id)}`, { method: "DELETE" });
      toast.success("CDK deleted.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete CDK.");
    }
  }
  return (
    <AppFrame audience="admin" language="en" title="Recharge CDK" subtitle="Fresh CDK manager for creating, copying, and tracking wallet recharge codes." onRefresh={refresh}>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TicketIcon className="size-4 text-brand" />Total CDKs</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : cdks.length}</div><p className="text-sm text-muted-foreground">All generated codes</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Unused Stock</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : unused.length}</div><p className="text-sm text-muted-foreground">{formatMoney(stockValue)} available</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Redeemed</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : redeemed.length}</div><p className="text-sm text-muted-foreground">Used by customers</p></CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><WandSparklesIcon className="size-4 text-brand" />Generate CDKs</CardTitle>
            <CardDescription>Create a batch of recharge codes with any custom USDT amount.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">Amount (USDT)
                <Input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0.01" max="10000" step="0.01" placeholder="Any amount" />
              </label>
              <label className="space-y-1 text-sm font-medium">Count
                <Input value={count} onChange={(event) => setCount(event.target.value)} type="number" min="1" max="1000" />
              </label>
            </div>
            <label className="space-y-1 text-sm font-medium">Batch name
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional" />
            </label>
            <label className="space-y-1 text-sm font-medium">Remark
              <Input value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="Optional note" />
            </label>
            <Button onClick={createBatch} disabled={saving} className="w-full">
              {saving ? <Loader2Icon className="animate-spin" /> : <WandSparklesIcon />}Generate Batch
            </Button>
            {lastCodes.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Last generated ({lastCodes.length})</div>
                  <Button variant="outline" size="sm" onClick={copyGenerated}><CopyIcon />Copy all</Button>
                </div>
                <Textarea value={generatedText} readOnly rows={6} className="font-mono text-xs" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>CDK List</CardTitle>
                <CardDescription>Search, copy, and check redeem status.</CardDescription>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code or batch" className="pl-9 md:w-64" />
                </div>
                <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCwIcon className={loading ? "animate-spin" : ""} />Refresh</Button><Button variant="destructive" onClick={deleteAllUnusedCdks} disabled={unused.length === 0}><Trash2Icon />Delete All Unused</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Batch</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                    <th className="sticky right-0 bg-muted/50 px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length ? filtered.slice(0, 200).map((cdk) => (
                    <tr key={cdk.id} className="border-t">
                      <td className="px-3 py-3 font-mono text-xs">{cdk.code}</td>
                      <td className="px-3 py-3">{cdk.amount} USDT</td>
                      <td className="px-3 py-3"><Badge variant={statusVariant(cdk)}>{statusLabel(cdk)}</Badge></td>
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{cdk.batchId || "-"}</td>
                      <td className="px-3 py-3 text-muted-foreground">{new Date(cdk.createdAt).toLocaleDateString()}</td>
                      <td className="sticky right-0 bg-card px-3 py-3"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => copyCode(cdk.code)}><CopyIcon />Copy</Button><Button variant="destructive" size="sm" onClick={() => deleteCdk(cdk)} disabled={!isUnused(cdk)}><Trash2Icon />Delete</Button></div></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No CDKs found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 200 && <p className="mt-2 text-xs text-muted-foreground">Showing first 200 results. Use search to narrow the list.</p>}
          </CardContent>
        </Card>
      </div>
    </AppFrame>
  );
}