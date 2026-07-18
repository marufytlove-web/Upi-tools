"use client";

import { FormEvent, useState } from "react";
import { KeyRoundIcon, Loader2Icon, LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";

export function AdminPasswordLoginClient() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setLoading(true);
      await apiFetch("/api/admin/password-login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      toast.success("Admin login successful");
      window.location.href = "/admin";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-5 py-10">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-slate-950 text-white">
            <ShieldCheckIcon className="size-5" />
          </div>
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-500">API Only</div>
            <div className="text-xl font-bold">UPI Admin</div>
          </div>
        </div>

        <section className="grid gap-6 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <h1 className="max-w-2xl text-4xl font-black tracking-tight md:text-6xl">
              Simple control panel for QR API keys and CDK.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              No Telegram confirmation needed. Log in with the admin password, manage PlusPay keys, check quota, and keep the extraction site running from one clean panel.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {["API key pool", "Quota fallback", "CDK manager"].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold shadow-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <Card className="rounded-3xl border-slate-200 bg-white shadow-xl shadow-slate-200/70">
            <CardContent className="p-6">
              <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-orange-500/10 text-orange-600">
                <LockKeyholeIcon className="size-6" />
              </div>
              <h2 className="text-2xl font-bold">Admin Login</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Enter the password configured in `ADMIN_PASSWORD`.
              </p>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Admin password"
                  className="h-12 rounded-2xl"
                  autoFocus
                />
                <Button type="submit" className="h-12 w-full rounded-2xl" disabled={loading || !password.trim()}>
                  {loading ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <KeyRoundIcon data-icon="inline-start" />}
                  {loading ? "Checking..." : "Open Admin Panel"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
