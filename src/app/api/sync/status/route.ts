import { NextResponse } from "next/server";
import { getSyncProgress } from "@/lib/syncProgress";

// Polled by SyncButton so "Sync now" shows real progress on a large collection instead of a
// static spinner indistinguishable from hung — also reflects a sync triggered by the
// background auto-sync scheduler, not just one started by clicking the button.
export async function GET() {
  return NextResponse.json(getSyncProgress());
}
