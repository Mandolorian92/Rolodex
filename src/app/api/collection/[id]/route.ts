import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Condition } from "@/generated/prisma/client";
import { getSessionUserId } from "@/lib/session";

const UpdateSchema = z.object({
  quantity: z.number().int().positive().optional(),
  condition: z.nativeEnum(Condition).optional(),
  purchasePrice: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.collectionItem.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const item = await prisma.collectionItem.update({
    where: { id },
    data: parsed.data,
    include: { card: true },
  });
  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.collectionItem.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.collectionItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
