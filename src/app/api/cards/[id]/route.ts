import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Manual correction for category/language — the heuristic in cardMeta.ts is best-effort
// (e.g. it can't catch a Japanese/Korean set whose console name doesn't literally say so),
// so this is the escape hatch when it gets a card wrong. Pass null to explicitly clear back
// to "unset" rather than leaving a wrong guess on file.
const UpdateSchema = z.object({
  category: z.string().min(1).nullable().optional(),
  language: z.string().min(1).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const card = await prisma.card.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ card });
}
