import { Prisma } from "@prisma/client";
import { requireAdminSession } from "@/lib/server/auth";
import { parseRechargeCdkAmount } from "@/lib/cdk-recharge";
import { generateUniqueCdkCodes } from "@/lib/server/cdk-generator";
import { containsInsensitive, paginatedPayload, parseAdminPagination } from "@/lib/server/admin-pagination";
import { prisma } from "@/lib/server/prisma";
import { fail, handleRouteError, ok } from "@/lib/server/responses";
import { serializeCdk, serializeCdkBatch } from "@/lib/server/serializers";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 1000;

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const { isPaged, page, pageSize, skip, take, search } = parseAdminPagination(request);
    const where: Prisma.CdkBatchWhereInput = search
      ? {
          OR: [
            { id: containsInsensitive(search) },
            { name: containsInsensitive(search) },
            { remark: containsInsensitive(search) },
          ],
        }
      : {};
    if (!isPaged) {
      const batches = await prisma.cdkBatch.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { _count: { select: { cdks: true } } },
      });
      return ok(batches.map(serializeCdkBatch));
    }

    const [total, batches] = await Promise.all([
      prisma.cdkBatch.count({ where }),
      prisma.cdkBatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { _count: { select: { cdks: true } } },
      }),
    ]);
    return ok(paginatedPayload(batches.map(serializeCdkBatch), { page, pageSize, total, search }));
  } catch (error) {
    if (error instanceof Response) return fail("æœªç™»å½•ç®¡ç†å‘˜", 401);
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const body = await request.json();
    const count = Number(body.count || 0);
    const amount = parseRechargeCdkAmount(body.amount);
    const name = String(body.name || "").trim().slice(0, 80) || null;
    const remark = String(body.remark || "").trim().slice(0, 200) || null;

    if (!Number.isInteger(count) || count <= 0) return fail("ç”Ÿæˆæ•°é‡å¿…é¡»æ˜¯æ­£æ•´æ•°");
    if (count > MAX_BATCH_SIZE) return fail(`å•æ‰¹æœ€å¤šç”Ÿæˆ ${MAX_BATCH_SIZE} ä¸ª CDK`);
    if (!amount) return fail("Please enter a valid CDK amount between 0.01 and 10000 USDT.");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const codes = await generateUniqueCdkCodes(count);
      try {
        const result = await prisma.$transaction(async (tx) => {
          const batch = await tx.cdkBatch.create({
            data: {
              name,
              keyCount: count,
              amount,
              totalCount: 1,
              remark,
            },
          });

          await tx.cdk.createMany({
            data: codes.map((code) => ({
              code,
              batchId: batch.id,
              amount,
              totalCount: 1,
              remark,
            })),
          });

          const [batchWithCount, cdks] = await Promise.all([
            tx.cdkBatch.findUniqueOrThrow({
              where: { id: batch.id },
              include: { _count: { select: { cdks: true } } },
            }),
            tx.cdk.findMany({
              where: { batchId: batch.id },
              orderBy: { createdAt: "asc" },
            }),
          ]);

          return {
            batch: serializeCdkBatch(batchWithCount),
            cdks: cdks.map(serializeCdk),
          };
        });

        return ok(result);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && attempt < 2) {
          continue;
        }
        throw error;
      }
    }

    return fail("ç”Ÿæˆ CDK å¤±è´¥ï¼Œè¯·é‡è¯•");
  } catch (error) {
    if (error instanceof Response) return fail("æœªç™»å½•ç®¡ç†å‘˜", 401);
    return handleRouteError(error);
  }
}
