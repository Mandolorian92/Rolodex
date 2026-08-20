import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.stockAlert.findUnique({ where: { id }, include: { watchTarget: true } });
  if (!existing || existing.watchTarget.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const alert = await prisma.stockAlert.update({ where: { id }, data: { acknowledged: true } });
  return NextResponse.json({ alert });
}
