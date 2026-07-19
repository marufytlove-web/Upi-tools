"use client";

import { useCallback, useState } from "react";
import { BotIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/app/app-frame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function AdminTelegramBotClient() {
  const [telegramToken, setTelegramToken] = useState("");
  const appUrl = typeof window === "undefined" ? "" : window.location.origin;
  const webhookUrl = `${appUrl}/api/telegram/webhook`;
  const token = telegramToken.trim();
  const setWebhookUrl = token
    ? `https://api.telegram.org/bot${encodeURIComponent(token)}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`
    : "";
  const webhookInfoUrl = token
    ? `https://api.telegram.org/bot${encodeURIComponent(token)}/getWebhookInfo`
    : "";

  const copyWebhook = useCallback(async () => {
    await navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook URL copied");
  }, [webhookUrl]);

  return (
    <AppFrame audience="admin" title="Bot Control" subtitle="Connect and manage your Telegram bot webhook from one place.">
      <Card className="rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BotIcon className="size-5 text-primary" />
            Telegram Bot Setup
          </CardTitle>
          <CardDescription>
            Paste your BotFather token to set webhook or check status. The token is not saved in this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-border p-4">
              <div className="font-semibold">Vercel environment</div>
              <div className="mt-2 text-sm text-muted-foreground">Make sure this env exists, then redeploy.</div>
              <div className="mt-3 rounded-2xl bg-muted p-3 font-mono text-xs leading-6">
                <div>TELEGRAM_BOT_TOKEN=your_botfather_token</div>
                <div>TELEGRAM_UPI_WAIT_MS=180000</div>
              </div>
            </div>
            <div className="rounded-3xl border border-border p-4">
              <div className="font-semibold">Webhook URL</div>
              <div className="mt-2 break-all rounded-2xl bg-muted p-3 font-mono text-xs">{webhookUrl}</div>
              <Button type="button" variant="outline" className="mt-3 rounded-xl" onClick={copyWebhook}>
                <CopyIcon data-icon="inline-start" />
                Copy URL
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-border p-4">
            <div className="font-semibold">Bot token</div>
            <div className="mt-2 text-sm text-muted-foreground">Use Set Webhook after each production redeploy if needed.</div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row">
              <Input
                value={telegramToken}
                onChange={(event) => setTelegramToken(event.target.value)}
                placeholder="123456789:AA..."
                className="h-10 rounded-xl font-mono"
              />
              <Button type="button" className="rounded-xl" disabled={!setWebhookUrl} onClick={() => window.open(setWebhookUrl, "_blank", "noopener,noreferrer")}>
                <ExternalLinkIcon data-icon="inline-start" />
                Set Webhook
              </Button>
              <Button type="button" variant="outline" className="rounded-xl" disabled={!webhookInfoUrl} onClick={() => window.open(webhookInfoUrl, "_blank", "noopener,noreferrer")}>
                <ExternalLinkIcon data-icon="inline-start" />
                Check Status
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["/start", "Open menu"],
              ["/balance", "Check wallet"],
              ["/redeem CODE", "Redeem CDK"],
              ["session.json", "Generate QR"],
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
