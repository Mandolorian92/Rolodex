import { NextRequest, NextResponse } from "next/server";
import { importManaboxCsv } from "@/lib/manabox";
import { getSessionUserId } from "@/lib/session";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded — expected a CSV file." }, { status: 400 });
  }

  const csvText = await file.text();

  try {
    const summary = await importManaboxCsv(csvText, userId);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 502 }
    );
  }
}
