import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkForHigherValueVariants } from "@/lib/variants";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const card = await prisma.card.findUniqueOrThrow({ where: { id } });
    const matches = await checkForHigherValueVariants(card);
    return NextResponse.json({ matches });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Variant check failed" },
      { status: 502 }
    );
  }
}
