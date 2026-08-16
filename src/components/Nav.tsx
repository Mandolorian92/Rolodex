import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SyncButton from "@/components/SyncButton";

export default async function Nav() {
  const unacknowledgedCount = await prisma.alert.count({ where: { acknowledged: false } });

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-zinc-50">Rolodex</span>
          <span className="text-xs text-zinc-500">card price ticker</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-zinc-400">
          <Link href="/" className="hover:text-zinc-50">
            Dashboard
          </Link>
          <Link href="/collection" className="hover:text-zinc-50">
            Collection
          </Link>
          <Link href="/alerts" className="relative hover:text-zinc-50">
            Alerts
            {unacknowledgedCount > 0 && (
              <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-zinc-950">
                {unacknowledgedCount}
              </span>
            )}
          </Link>
          <SyncButton />
        </nav>
      </div>
    </header>
  );
}
