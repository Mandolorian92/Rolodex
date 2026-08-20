import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkWatchTarget } from "@/lib/stockWatch";
import { getSessionUserId } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const target = await prisma.watchTarget.findUnique({ where: { id } });
  if (!target || target.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await checkWatchTarget(id);
  return NextResponse.json(result);
}
