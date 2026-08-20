import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const onlyUnacknowledged = req.nextUrl.searchParams.get("unacknowledged") === "true";
  const alerts = await prisma.alert.findMany({
    where: { userId, ...(onlyUnacknowledged ? { acknowledged: false } : {}) },
    include: { card: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ alerts });
}
