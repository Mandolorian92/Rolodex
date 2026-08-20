import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth, signOut } from "@/auth";
import SyncButton from "@/components/SyncButton";

export default async function Nav() {
  const session = await auth();
  const unacknowledgedCount = session?.user?.id
    ? await prisma.alert.count({ where: { userId: session.user.id, acknowledged: false } })
    : 0;

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
          <Link href="/collection/values" className="hover:text-zinc-50">
            Card values
          </Link>
          <Link href="/portfolio" className="hover:text-zinc-50">
            Portfolio
          </Link>
          <Link href="/stock-watch" className="hover:text-zinc-50">
            Stock watch
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
          {session?.user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">{session.user.username ?? session.user.email}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button type="submit" className="hover:text-zinc-50">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link href="/sign-in" className="hover:text-zinc-50">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
