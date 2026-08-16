import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const onlyUnacknowledged = req.nextUrl.searchParams.get("unacknowledged") === "true";
  const alerts = await prisma.alert.findMany({
    where: onlyUnacknowledged ? { acknowledged: false } : undefined,
    include: { card: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ alerts });
}
