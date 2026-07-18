import { requireAdminSession } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { fail, handleRouteError, ok } from "@/lib/server/responses";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ cdkId: string }> }) {
  try {
    await requireAdminSession();
    const { cdkId } = await params;
    const cdk = await prisma.cdk.findUnique({
      where: { id: cdkId },
      include: { _count: { select: { orders: true } } },
    });

    if (!cdk) return fail("CDK not found", 404);
    if (cdk.usedCount > 0 || cdk.redeemedAt || cdk._count.orders > 0) {
      return fail("This CDK is already used or has orders, so it cannot be deleted safely.", 400);
    }

    await prisma.cdk.delete({ where: { id: cdkId } });
    return ok({ deleted: true, id: cdkId });
  } catch (error) {
    if (error instanceof Response) return fail("Unauthorized", 401);
    return handleRouteError(error);
  }
}