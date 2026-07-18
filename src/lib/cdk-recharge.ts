export const RECHARGE_CDK_AMOUNTS = [1.8, 5, 10] as const;

export type RechargeCdkAmount = number;

export function parseRechargeCdkAmount(value: unknown): RechargeCdkAmount | null {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  if (amount <= 0) return null;
  if (amount > 10000) return null;
  return Math.round(amount * 100) / 100;
}

export function formatRechargeCdkAmount(value: number) {
  return `${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}U`;
}