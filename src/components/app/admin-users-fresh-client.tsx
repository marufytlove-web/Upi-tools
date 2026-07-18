"use client";

import { useEffect, useMemo, useState } from "react";
import { CrownIcon, RefreshCwIcon, SearchIcon, UsersRoundIcon, WalletIcon } from "lucide-react";
import { toast } from "sonner";

import { AppFrame } from "@/components/app/app-frame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";

type UserRow = {
  id?: string;
  telegramUserId?: string;
  telegramUsername?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  balance?: number | string | null;
  availableBalance?: number | string | null;
  frozenBalance?: number | string | null;
  premiumUntil?: string | null;
  createdAt?: string | null;
};

type UsersResponse = {
  users?: UserRow[];
  items?: UserRow[];
  data?: UserRow[];
  summary?: {
    userCount?: number;
    walletCount?: number;
    availableBalance?: number | string;
    frozenBalance?: number | string;
    premiumUserCount?: number;
  };
};

function money(value: unknown) {
  const n = Number(value ?? 0);
  return `${Number.isFinite(n) ? n.toFixed(2) : "0.00"} USDT`;
}

function displayName(user: UserRow) {
  return user.telegramUsername || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || user.telegramUserId || "Unknown user";
}

function extractUsers(payload: UsersResponse | UserRow[] | null) {
  if (Array.isArray(payload)) return payload;
  if (!payload) return [];
  if (Array.isArray(payload.users)) return payload.users;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

export function AdminUsersFreshClient() {
  const [payload, setPayload] = useState<UsersResponse | UserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const data = await apiFetch<UsersResponse | UserRow[]>("/api/admin/public-users");
      setPayload(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load users.");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const users = useMemo(() => extractUsers(payload), [payload]);
  const filtered = users.filter((user) => {
    const text = `${displayName(user)} ${user.telegramUserId || ""} ${user.email || ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const summary = !Array.isArray(payload) ? payload?.summary : undefined;
  const totalUsers = summary?.userCount ?? users.length;
  const available = summary?.availableBalance ?? users.reduce((sum, user) => sum + Number(user.availableBalance ?? user.balance ?? 0), 0);
  const frozen = summary?.frozenBalance ?? users.reduce((sum, user) => sum + Number(user.frozenBalance ?? 0), 0);
  const premium = summary?.premiumUserCount ?? users.filter((user) => user.premiumUntil && new Date(user.premiumUntil) > new Date()).length;

  return (
    <AppFrame audience="admin" language="en" title="Users" subtitle="Fresh user management page for the API-only admin system." onRefresh={refresh}>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><UsersRoundIcon className="size-4 text-brand" />Users</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : totalUsers}</div><p className="text-sm text-muted-foreground">Registered users</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><WalletIcon className="size-4 text-brand" />Available</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : money(available)}</div><p className="text-sm text-muted-foreground">Wallet balance</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><WalletIcon className="size-4 text-brand" />Frozen</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : money(frozen)}</div><p className="text-sm text-muted-foreground">Locked balance</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CrownIcon className="size-4 text-brand" />Premium</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{loading ? "..." : premium}</div><p className="text-sm text-muted-foreground">Active premium users</p></CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>User List</CardTitle>
              <CardDescription>Search and review site users. Edit actions will be added next.</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search user, email, TG ID" className="pl-9 md:w-72" />
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
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">TG ID</th>
                  <th className="px-3 py-2 font-medium">Balance</th>
                  <th className="px-3 py-2 font-medium">Premium</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? filtered.map((user, index) => (
                  <tr key={user.id || user.telegramUserId || index} className="border-t">
                    <td className="px-3 py-3 font-medium">{displayName(user)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{user.telegramUserId || "-"}</td>
                    <td className="px-3 py-3">{money(user.availableBalance ?? user.balance)}</td>
                    <td className="px-3 py-3"><Badge variant={user.premiumUntil ? "default" : "secondary"}>{user.premiumUntil ? "Premium" : "Free"}</Badge></td>
                    <td className="px-3 py-3 text-muted-foreground">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </AppFrame>
  );
}