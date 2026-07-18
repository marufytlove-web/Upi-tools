"use client";

import { useEffect, useState } from "react";
import { Loader2Icon, PlusIcon, RefreshCwIcon, SearchIcon, UsersRoundIcon, WalletIcon } from "lucide-react";
import { toast } from "sonner";

import { AppFrame } from "@/components/app/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, formatMoney } from "@/lib/api-client";
import type { PublicWorker, WorkerWalletSummary } from "@/lib/types/app";

type AdminWorker = PublicWorker & {
  completedCount?: number;
  totalAmount?: number;
  unsettledCompleted?: number;
  unsettledAmount?: number;
  settledCompleted?: number;
  settledAmount?: number;
  activeOrder?: { orderId: string; orderNo: string; createdAt: string } | null;
  activeOrders?: { orderId: string; orderNo: string; createdAt: string }[];
  wallet?: WorkerWalletSummary;
};

function statusBadge(worker: AdminWorker) {
  if (worker.isDisabled) return <Badge variant="destructive">Disabled</Badge>;
  if (worker.status === "ONLINE") return <Badge className="bg-emerald-600 text-white">Online</Badge>;
  return <Badge variant="secondary">Offline</Badge>;
}

export function AdminWorkersFreshClient() {
  const [workers, setWorkers] = useState<AdminWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [telegramUserId, setTelegramUserId] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [binanceUserId, setBinanceUserId] = useState("");
  const [unitPrice, setUnitPrice] = useState("0.60");
  const [payoutMode, setPayoutMode] = useState("POSTPAID");

  async function refresh() {
    setLoading(true);
    try {
      const data = await apiFetch<AdminWorker[]>("/api/admin/workers");
      setWorkers(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load workers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = workers.filter((worker) => {
    const text = `${worker.username} ${worker.displayName} ${worker.telegramUserId || ""} ${worker.telegramUsername || ""} ${worker.binanceUserId || ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const online = workers.filter((worker) => worker.status === "ONLINE" && !worker.isDisabled).length;
  const activeOrders = workers.reduce((sum, worker) => sum + (worker.activeOrders?.length ?? (worker.activeOrder ? 1 : 0)), 0);
  const unsettled = workers.reduce((sum, worker) => sum + Number(worker.unsettledAmount || 0), 0);

  async function createWorker() {
    setSaving(true);
    try {
      if (!username.trim()) throw new Error("Username is required.");
      if (!telegramUserId.trim() && !telegramUsername.trim()) throw new Error("Telegram ID or username is required.");
      await apiFetch<AdminWorker>("/api/admin/workers", {
        method: "POST",
        body: JSON.stringify({
          username,
          displayName,
          telegramUserId,
          telegramUsername,
          binanceUserId,
          unitPrice: Number(unitPrice),
          payoutMode,
        }),
      });
      toast.success("Worker created.");
      setUsername("");
      setDisplayName("");
      setTelegramUserId("");
      setTelegramUsername("");
      setBinanceUserId("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create worker.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppFrame audience="admin" language="en" title="Workers" subtitle="Fresh worker management page for legacy/manual operations." onRefresh={refresh}>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><UsersRoundIcon className="size-4 text-brand" />Workers</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : workers.length}</div><p className="text-sm text-muted-foreground">Total accounts</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Online</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : online}</div><p className="text-sm text-muted-foreground">Ready workers</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Active Orders</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : activeOrders}</div><p className="text-sm text-muted-foreground">Currently assigned</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><WalletIcon className="size-4 text-brand" />Unsettled</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : formatMoney(unsettled)}</div><p className="text-sm text-muted-foreground">Worker earnings</p></CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PlusIcon className="size-4 text-brand" />Create Worker</CardTitle>
            <CardDescription>Add a worker account for old manual order handling.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" />
            <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Display name" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={telegramUserId} onChange={(event) => setTelegramUserId(event.target.value)} placeholder="Telegram ID" />
              <Input value={telegramUsername} onChange={(event) => setTelegramUsername(event.target.value)} placeholder="Telegram username" />
            </div>
            <Input value={binanceUserId} onChange={(event) => setBinanceUserId(event.target.value)} placeholder="Binance user ID (optional)" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} type="number" min="0" step="0.01" placeholder="Unit price" />
              <select value={payoutMode} onChange={(event) => setPayoutMode(event.target.value)} className="h-9 rounded-lg border bg-background px-3 text-sm">
                <option value="POSTPAID">Postpaid</option>
                <option value="PREPAID">Prepaid</option>
              </select>
            </div>
            <Button onClick={createWorker} disabled={saving} className="w-full">
              {saving ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}Create Worker
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Worker List</CardTitle>
                <CardDescription>Search and review worker status, payout mode, and earnings.</CardDescription>
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search worker" className="pl-9 md:w-64" />
                </div>
                <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCwIcon className={loading ? "animate-spin" : ""} />Refresh</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Worker</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Unit Price</th>
                    <th className="px-3 py-2 font-medium">Payout</th>
                    <th className="px-3 py-2 font-medium">Completed</th>
                    <th className="px-3 py-2 font-medium">Unsettled</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length ? filtered.map((worker) => (
                    <tr key={worker.id} className="border-t">
                      <td className="px-3 py-3">
                        <div className="font-medium">{worker.displayName || worker.username}</div>
                        <div className="text-xs text-muted-foreground">@{worker.telegramUsername || worker.username} · {worker.telegramUserId || "no TG ID"}</div>
                      </td>
                      <td className="px-3 py-3">{statusBadge(worker)}</td>
                      <td className="px-3 py-3">{formatMoney(worker.unitPrice)}</td>
                      <td className="px-3 py-3"><Badge variant="secondary">{worker.payoutMode}</Badge></td>
                      <td className="px-3 py-3">{worker.completedCount ?? 0}</td>
                      <td className="px-3 py-3">{formatMoney(worker.unsettledAmount)}</td>
                      <td className="px-3 py-3">{worker.activeOrders?.length ?? (worker.activeOrder ? 1 : 0)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No workers found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppFrame>
  );
}