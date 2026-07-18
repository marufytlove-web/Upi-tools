"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLineIcon, ArrowUpFromLineIcon, DatabaseIcon, RefreshCwIcon, SearchIcon, WalletIcon } from "lucide-react";
import { toast } from "sonner";

import { AppFrame } from "@/components/app/app-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api-client";

type BillingTab = "deposits" | "ledgers" | "withdrawals" | "chain";

type Summary = {
  walletCount: number;
  ledgerCount: number;
  chainDepositCount: number;
  availableBalance: number;
  frozenBalance: number;
  totalDeposited: number;
  totalSpent: number;
  depositOrderCount: number;
  pendingDepositOrderCount: number;
  pendingDepositOrderAmount: number;
  paidDepositOrderCount: number;
  paidDepositOrderAmount: number;
  withdrawalCount: number;
  pendingWithdrawalCount: number;
  pendingWithdrawalAmount: number;
};

type Deposit = { id: string; orderNo: string; telegramUserId: string; telegramUsername?: string | null; payAmount: number; status: string; chain: string; tokenSymbol: string; depositAddress?: string | null; txHash?: string | null; createdAt: string; paidAt?: string | null };
type Ledger = { id: string; telegramUserId: string; telegramUsername?: string | null; type: string; availableDelta: number; frozenDelta: number; referenceId?: string | null; note?: string | null; createdAt: string };
type Withdrawal = { id: string; telegramUserId: string; telegramUsername?: string | null; amount: number; fee: number; totalFrozen: number; status: string; chain: string; tokenSymbol: string; withdrawalAddress?: string | null; requestedAt: string; processedAt?: string | null };
type ChainDeposit = { id: string; telegramUserId: string; telegramUsername?: string | null; amount: number; status: string; chain: string; tokenSymbol: string; txHash: string; fromAddress?: string | null; toAddress?: string | null; blockNumber?: number | null; confirmations?: number | null; createdAt: string; creditedAt?: string | null };

type BillingData = {
  summary: Summary;
  depositOrders: Deposit[];
  ledgers: Ledger[];
  withdrawals: Withdrawal[];
  chainDeposits: ChainDeposit[];
  activeTab: BillingTab;
};

const tabs: { value: BillingTab; label: string }[] = [
  { value: "deposits", label: "Deposits" },
  { value: "ledgers", label: "Ledger" },
  { value: "withdrawals", label: "Withdrawals" },
  { value: "chain", label: "Chain" },
];

function usdt(value: unknown) {
  const n = Number(value ?? 0);
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"} USDT`;
}

function short(value?: string | null, size = 18) {
  if (!value) return "-";
  return value.length > size ? `${value.slice(0, size)}...` : value;
}

function statusBadge(status: string) {
  const upper = status.toUpperCase();
  if (["PAID", "CONFIRMED", "COMPLETED"].includes(upper)) return <Badge className="bg-emerald-600 text-white">{upper}</Badge>;
  if (["PENDING"].includes(upper)) return <Badge className="bg-amber-500 text-white">{upper}</Badge>;
  if (["REJECTED", "CANCELLED", "EXPIRED", "IGNORED"].includes(upper)) return <Badge variant="destructive">{upper}</Badge>;
  return <Badge variant="secondary">{upper}</Badge>;
}

function searchable(row: unknown) {
  return JSON.stringify(row ?? {}).toLowerCase();
}

export function AdminBillingFreshClient() {
  const [data, setData] = useState<BillingData | null>(null);
  const [tab, setTab] = useState<BillingTab>("deposits");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh(nextTab = tab) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab: nextTab });
      const result = await apiFetch<BillingData>(`/api/admin/billing?${params.toString()}`);
      setData(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load billing data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh("deposits"), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchTab(value: BillingTab) {
    setTab(value);
    setSearch("");
    void refresh(value);
  }

  const summary = data?.summary;
  const rows = useMemo(() => {
    const raw = tab === "deposits" ? data?.depositOrders : tab === "ledgers" ? data?.ledgers : tab === "withdrawals" ? data?.withdrawals : data?.chainDeposits;
    return (raw || []).filter((item) => searchable(item).includes(search.toLowerCase())).slice(0, 250);
  }, [data, tab, search]);

  return (
    <AppFrame audience="admin" language="en" title="Billing" subtitle="Fresh billing center for wallets, deposits, withdrawals, ledger records, and chain deposits." onRefresh={() => refresh(tab)}>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><WalletIcon className="size-4 text-brand" />Wallets</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : summary?.walletCount ?? 0}</div><p className="text-sm text-muted-foreground">Available {usdt(summary?.availableBalance)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ArrowDownToLineIcon className="size-4 text-brand" />Paid Deposits</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : usdt(summary?.paidDepositOrderAmount)}</div><p className="text-sm text-muted-foreground">{summary?.paidDepositOrderCount ?? 0} paid orders</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pending Deposits</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : summary?.pendingDepositOrderCount ?? 0}</div><p className="text-sm text-muted-foreground">{usdt(summary?.pendingDepositOrderAmount)} waiting</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ArrowUpFromLineIcon className="size-4 text-brand" />Withdrawals</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : summary?.pendingWithdrawalCount ?? 0}</div><p className="text-sm text-muted-foreground">{usdt(summary?.pendingWithdrawalAmount)} pending</p></CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><DatabaseIcon className="size-4 text-brand" />Billing Records</CardTitle>
              <CardDescription>Search deposits, ledger entries, withdrawals, and chain transactions.</CardDescription>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Tabs value={tab} onValueChange={(value) => switchTab(value as BillingTab)}>
                <TabsList>{tabs.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}</TabsList>
              </Tabs>
              <div className="flex gap-2">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search billing" className="pl-9 md:w-64" />
                </div>
                <Button variant="outline" onClick={() => refresh(tab)} disabled={loading}><RefreshCwIcon className={loading ? "animate-spin" : ""} />Refresh</Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            {tab === "deposits" && <DepositTable rows={rows as Deposit[]} />}
            {tab === "ledgers" && <LedgerTable rows={rows as Ledger[]} />}
            {tab === "withdrawals" && <WithdrawalTable rows={rows as Withdrawal[]} />}
            {tab === "chain" && <ChainTable rows={rows as ChainDeposit[]} />}
          </div>
        </CardContent>
      </Card>
    </AppFrame>
  );
}

function DepositTable({ rows }: { rows: Deposit[] }) {
  return <table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Chain</th><th className="px-3 py-2">Tx</th><th className="px-3 py-2">Created</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-3 font-medium">{row.orderNo}</td><td className="px-3 py-3">{row.telegramUsername || row.telegramUserId}</td><td className="px-3 py-3">{usdt(row.payAmount)}</td><td className="px-3 py-3">{statusBadge(row.status)}</td><td className="px-3 py-3">{row.chain} {row.tokenSymbol}</td><td className="px-3 py-3 font-mono text-xs">{short(row.txHash)}</td><td className="px-3 py-3 text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</td></tr>) : <EmptyRows colSpan={7} />}</tbody></table>;
}

function LedgerTable({ rows }: { rows: Ledger[] }) {
  return <table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Available</th><th className="px-3 py-2">Frozen</th><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Note</th><th className="px-3 py-2">Created</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-3">{row.telegramUsername || row.telegramUserId}</td><td className="px-3 py-3"><Badge variant="secondary">{row.type}</Badge></td><td className="px-3 py-3">{usdt(row.availableDelta)}</td><td className="px-3 py-3">{usdt(row.frozenDelta)}</td><td className="px-3 py-3 font-mono text-xs">{short(row.referenceId)}</td><td className="px-3 py-3">{short(row.note, 28)}</td><td className="px-3 py-3 text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</td></tr>) : <EmptyRows colSpan={7} />}</tbody></table>;
}

function WithdrawalTable({ rows }: { rows: Withdrawal[] }) {
  return <table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Fee</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Address</th><th className="px-3 py-2">Requested</th><th className="px-3 py-2">Processed</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-3">{row.telegramUsername || row.telegramUserId}</td><td className="px-3 py-3">{usdt(row.amount)}</td><td className="px-3 py-3">{usdt(row.fee)}</td><td className="px-3 py-3">{statusBadge(row.status)}</td><td className="px-3 py-3 font-mono text-xs">{short(row.withdrawalAddress)}</td><td className="px-3 py-3 text-muted-foreground">{new Date(row.requestedAt).toLocaleString()}</td><td className="px-3 py-3 text-muted-foreground">{row.processedAt ? new Date(row.processedAt).toLocaleString() : "-"}</td></tr>) : <EmptyRows colSpan={7} />}</tbody></table>;
}

function ChainTable({ rows }: { rows: ChainDeposit[] }) {
  return <table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Tx</th><th className="px-3 py-2">From</th><th className="px-3 py-2">Confirmations</th><th className="px-3 py-2">Created</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.id} className="border-t"><td className="px-3 py-3">{row.telegramUsername || row.telegramUserId}</td><td className="px-3 py-3">{usdt(row.amount)}</td><td className="px-3 py-3">{statusBadge(row.status)}</td><td className="px-3 py-3 font-mono text-xs">{short(row.txHash)}</td><td className="px-3 py-3 font-mono text-xs">{short(row.fromAddress)}</td><td className="px-3 py-3">{row.confirmations ?? 0}</td><td className="px-3 py-3 text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</td></tr>) : <EmptyRows colSpan={7} />}</tbody></table>;
}

function EmptyRows({ colSpan }: { colSpan: number }) {
  return <tr><td colSpan={colSpan} className="px-3 py-10 text-center text-muted-foreground">No billing records found.</td></tr>;
}
