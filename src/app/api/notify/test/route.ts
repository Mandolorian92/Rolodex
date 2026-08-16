import { NextResponse } from "next/server";
import { sendTestEmail } from "@/lib/notify";

export async function POST() {
  try {
    await sendTestEmail();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send test email" },
      { status: 502 }
    );
  }
}
