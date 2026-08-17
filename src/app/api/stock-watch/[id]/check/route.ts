import { NextResponse } from "next/server";
import { checkWatchTarget } from "@/lib/stockWatch";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await checkWatchTarget(id);
  return NextResponse.json(result);
}
