import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Condition } from "@/generated/prisma/client";

const UpdateSchema = z.object({
  quantity: z.number().int().positive().optional(),
  condition: z.nativeEnum(Condition).optional(),
  purchasePrice: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await prisma.collectionItem.update({
    where: { id },
    data: parsed.data,
    include: { card: true },
  });
  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.collectionItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
