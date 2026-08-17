import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await prisma.stockAlert.update({ where: { id }, data: { acknowledged: true } });
  return NextResponse.json({ alert });
}
