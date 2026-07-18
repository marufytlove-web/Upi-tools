# Free Deploy Guide

This app can run on Vercel with a free Neon Postgres database. Keep all API keys and database URLs in environment variables only.

## 1. Create Database

Create a free Neon Postgres project and copy the pooled connection string.

Set it as:

```txt
DATABASE_URL=postgresql://...
```

## 2. Set Vercel Env Vars

Required:

```txt
DATABASE_URL=
JWT_SECRET=
SESSION_TOKEN_ENCRYPTION_KEY=
ADMIN_PASSWORD=
APP_URL=https://your-app.vercel.app
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
PLUSPAY_API_KEY=
PLUSPAY_API_KEYS=
PLUSPAY_API_BASE=https://api.pluspaybot.dpdns.org
PLUSPAY_API_DISABLED=0
LINHTD_UPI_API_DISABLED=1
UPI_EXTRACT_RUNNER=inline
UPI_EXTRACT_FORCE_UNTIL_SUCCESS=1
ENABLE_EXTRACT_METHOD_SELECTION=0
NEXT_PUBLIC_ENABLE_EXTRACT_METHOD_SELECTION=0
BSC_DEPOSIT_WATCHER_DISABLED=1
```

Optional Telegram values can stay blank until the bot is added:

```txt
TELEGRAM_BOT_TOKEN=
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
TELEGRAM_ADMIN_ID=
```

## 3. Initialize Database

After adding `DATABASE_URL`, run once from a machine that has access to the database:

```bash
npx prisma db push
npx prisma db seed
```

Use `prisma db push` because this repo currently has `schema.prisma` but no migration history.

## 4. Deploy

Push the repo to GitHub and import it in Vercel. Vercel will run:

```bash
npm run vercel-build
```

The build command runs `prisma generate` before `next build`.

## 5. Check API Quota

```bash
curl -H "Authorization: Bearer $PLUSPAY_API_KEY" https://api.pluspaybot.dpdns.org/v1/me
```

`quota.remaining` must be above 0 for QR generation to work.

For multiple PlusPay keys, set `PLUSPAY_API_KEYS` as a comma-separated list:

```txt
PLUSPAY_API_KEYS=ppk_live_key1,ppk_live_key2,ppk_live_key3
```

The server tries keys in order. If one key has no quota or is rate-limited, it moves to the next key.
