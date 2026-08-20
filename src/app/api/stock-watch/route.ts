import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Retailer, WatchKind } from "@/generated/prisma/client";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const targets = await prisma.watchTarget.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { stockAlerts: { orderBy: { createdAt: "desc" }, take: 5 } },
  });
  return NextResponse.json({ targets });
}

const CreateSchema = z
  .object({
    retailer: z.nativeEnum(Retailer),
    kind: z.nativeEnum(WatchKind).default(WatchKind.PRODUCT),
    label: z.string().min(1),
    url: z.string().url(),
    sku: z.string().min(1).optional(),
    keyword: z.string().min(1).optional(),
  })
  .refine((data) => data.kind !== WatchKind.PRODUCT || data.retailer !== Retailer.BESTBUY || !!data.sku, {
    message: "Best Buy product watches need a SKU (the number right before \".p\" in the URL).",
    path: ["sku"],
  })
  .refine((data) => data.kind !== WatchKind.SEARCH || !!data.keyword, {
    message: "Search-mode watches need a keyword.",
    path: ["keyword"],
  })
  .refine((data) => data.kind !== WatchKind.SEARCH || data.retailer === Retailer.BESTBUY, {
    message: "Search-mode watching is only available for Best Buy right now — add a specific product URL instead.",
    path: ["kind"],
  });

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { retailer, kind, label, url, sku, keyword } = parsed.data;

  try {
    const target = await prisma.watchTarget.create({
      data: { userId, retailer, kind, label, url, sku, keyword },
    });
    return NextResponse.json({ target }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "That URL is already being watched." }, { status: 409 });
    }
    throw err;
  }
}
