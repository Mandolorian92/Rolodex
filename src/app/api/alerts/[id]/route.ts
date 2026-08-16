import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await prisma.alert.update({
    where: { id },
    data: { acknowledged: true },
  });
  return NextResponse.json({ alert });
}
