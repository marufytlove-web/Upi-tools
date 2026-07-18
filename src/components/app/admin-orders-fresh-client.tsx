"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, ClockIcon, DatabaseIcon, RefreshCwIcon, SearchIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";

import { AppFrame } from "@/components/app/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api-client";
import type { OrderStatus, PublicOrder } from "@/lib/types/app";

type Filter = "ALL" | "HALL" | "ACTIVE" | "REUPLOAD" | "HISTORY";

const filters: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "HALL", label: "Waiting" },
  { value: "ACTIVE", label: "Active" },
  { value: "REUPLOAD", label: "Reupload" },
  { value: "HISTORY", label: "History" },
];

function inFilter(order: PublicOrder, filter: Filter) {
  if (filter === "ALL") return true;
  if (filter === "HALL") return order.status === "PENDING";
  if (filter === "ACTIVE") return order.status === "ASSIGNED" || order.status === "CHECKING";
  if (filter === "REUPLOAD") return order.status === "NEED_REUPLOAD";
  return ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(order.status);
}

function statusBadge(status: OrderStatus) {
  if (status === "COMPLETED") return <Badge className="bg-emerald-600 text-white">Completed</Badge>;
  if (status === "FAILED" || status === "CANCELLED" || status === "EXPIRED") return <Badge variant="destructive">{status}</Badge>;
  if (status === "ASSIGNED" || status === "CHECKING") return <Badge className="bg-blue-600 text-white">{status}</Badge>;
  if (status === "NEED_REUPLOAD") return <Badge className="bg-amber-500 text-white">Reupload</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

function orderText(order: PublicOrder) {
  return [
    order.orderNo,
    order.publicUserTelegramId,
    order.publicUserTelegramName,
    order.customerNote,
    order.problemReason,
    order.cdk?.code,
    order.assignedWorker?.username,
    order.assignedWorker?.displayName,
    order.paymentUrl,
  ].filter(Boolean).join(" ").toLowerCase();
}

function short(value?: string | null, size = 18) {
  if (!value) return "-";
  return value.length > size ? `${value.slice(0, size)}...` : value;
}

export function AdminOrdersFreshClient() {
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");

  async function refresh() {
    setLoading(true);
    try {
      const data = await apiFetch<PublicOrder[]>("/api/admin/orders");
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => orders.filter((order) => inFilter(order, filter) && orderText(order).includes(search.toLowerCase())), [orders, filter, search]);
  const waiting = orders.filter((order) => order.status === "PENDING").length;
  const active = orders.filter((order) => order.status === "ASSIGNED" || order.status === "CHECKING").length;
  const reupload = orders.filter((order) => order.status === "NEED_REUPLOAD").length;
  const completed = orders.filter((order) => order.status === "COMPLETED").length;

  return (
    <AppFrame audience="admin" language="en" title="Orders" subtitle="Fresh order monitor for waiting, active, returned, and historical extraction orders." onRefresh={refresh}>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ClockIcon className="size-4 text-brand" />Waiting</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : waiting}</div><p className="text-sm text-muted-foreground">Pending pickup</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheckIcon className="size-4 text-brand" />Active</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : active}</div><p className="text-sm text-muted-foreground">Assigned/checking</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangleIcon className="size-4 text-brand" />Reupload</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : reupload}</div><p className="text-sm text-muted-foreground">Needs user action</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2Icon className="size-4 text-brand" />Completed</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : completed}</div><p className="text-sm text-muted-foreground">Finished orders</p></CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><DatabaseIcon className="size-4 text-brand" />Order List</CardTitle>
              <CardDescription>Search by order number, user, CDK, worker, note, or payment link.</CardDescription>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
                <TabsList>
                  {filters.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}
                </TabsList>
              </Tabs>
              <div className="flex gap-2">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders" className="pl-9 md:w-64" />
                </div>
                <Button variant="outline" onClick={refresh} disabled={loading}><RefreshCwIcon className={loading ? "animate-spin" : ""} />Refresh</Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Order</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Worker</th>
                  <th className="px-3 py-2 font-medium">UPI</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? filtered.slice(0, 250).map((order) => (
                  <tr key={order.id} className="border-t align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium">{order.orderNo}</div>
                      <div className="font-mono text-xs text-muted-foreground">{short(order.cdk?.code, 22)}</div>
                    </td>
                    <td className="px-3 py-3">{statusBadge(order.status)}</td>
                    <td className="px-3 py-3"><Badge variant="secondary">{order.source || "CDK"}</Badge></td>
                    <td className="px-3 py-3">
                      <div>{order.publicUserTelegramName || "-"}</div>
                      <div className="font-mono text-xs text-muted-foreground">{order.publicUserTelegramId || "-"}</div>
                    </td>
                    <td className="px-3 py-3">{order.assignedWorker?.displayName || order.assignedWorker?.username || "-"}</td>
                    <td className="px-3 py-3">
                      <div>{order.upiExtractionStatus || "-"}</div>
                      {order.upiExtractError && <div className="max-w-56 truncate text-xs text-destructive" title={order.upiExtractError}>{order.upiExtractError}</div>}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{new Date(order.createdAt).toLocaleString()}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No orders found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 250 && <p className="mt-2 text-xs text-muted-foreground">Showing first 250 orders. Use search or filters to narrow the list.</p>}
        </CardContent>
      </Card>
    </AppFrame>
  );
}