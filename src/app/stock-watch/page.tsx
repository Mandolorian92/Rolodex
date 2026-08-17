import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Retailer } from "@/generated/prisma/client";
import AddWatchTargetForm from "@/components/AddWatchTargetForm";
import WatchTargetRowActions from "@/components/WatchTargetRowActions";
import CheckAllStockButton from "@/components/CheckAllStockButton";
import AcknowledgeStockAlertButton from "@/components/AcknowledgeStockAlertButton";
import NotifyStatus from "@/components/NotifyStatus";
import { isStockNotifyConfigured } from "@/lib/stockNotify";

export const dynamic = "force-dynamic";

const RETAILER_LABEL: Record<Retailer, string> = {
  GAMESTOP: "GameStop",
  WALMART: "Walmart",
  TARGET: "Target",
  BESTBUY: "Best Buy",
};

function StatusBadge({ inStock, lastError }: { inStock: boolean | null; lastError: string | null }) {
  if (lastError) {
    return (
      <span
        title={lastError}
        className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400"
      >
        Check failed
      </span>
    );
  }
  if (inStock === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-500">
        Not checked yet
      </span>
    );
  }
  return inStock ? (
    <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
      In stock
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-500">
      Out of stock
    </span>
  );
}

export default async function StockWatchPage() {
  const targets = await prisma.watchTarget.findMany({ orderBy: { createdAt: "desc" } });
  const recentAlerts = await prisma.stockAlert.findMany({
    include: { watchTarget: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Stock watch</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Get notified the moment a watched listing comes back in stock — this only watches
            and alerts, it never adds to cart or checks out for you.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CheckAllStockButton />
          <AddWatchTargetForm />
        </div>
      </div>

      <NotifyStatus configured={isStockNotifyConfigured()} />

      {targets.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nothing watched yet. Add a product page URL (e.g. an Elite Trainer Box listing marked
          &ldquo;Sold Out&rdquo; or &ldquo;Coming Soon&rdquo;) to get an alert the moment it flips to purchasable.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Listing</th>
                <th className="px-4 py-3 font-medium">Retailer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last checked</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {targets.map((target) => (
                <tr key={target.id} className={`hover:bg-zinc-900/60 ${!target.active ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <a
                      href={target.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-zinc-100 hover:underline"
                    >
                      {target.label}
                    </a>
                    {target.lastPriceCents != null && (
                      <div className="font-mono text-xs text-zinc-500">
                        ${(target.lastPriceCents / 100).toFixed(2)}
                      </div>
                    )}
                    {target.kind === "SEARCH" && (
                      <div className="text-xs text-zinc-600">Watching for: &ldquo;{target.keyword}&rdquo;</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{RETAILER_LABEL[target.retailer]}</td>
                  <td className="px-4 py-3">
                    <StatusBadge inStock={target.inStock} lastError={target.lastError} />
                    {!target.active && <div className="mt-1 text-xs text-zinc-600">Paused</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {target.lastCheckedAt ? target.lastCheckedAt.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <WatchTargetRowActions id={target.id} active={target.active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent alerts</h2>
        {recentAlerts.length === 0 ? (
          <p className="text-sm text-zinc-500">No alerts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentAlerts.map((alert) => (
              <li
                key={alert.id}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
                  alert.acknowledged ? "border-zinc-800 opacity-50" : "border-zinc-700"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      {RETAILER_LABEL[alert.watchTarget.retailer]}
                    </span>
                    <Link href={alert.url} target="_blank" className="font-medium text-zinc-100 hover:underline">
                      {alert.watchTarget.label}
                    </Link>
                  </div>
                  <p className="mt-0.5 text-zinc-400">{alert.message}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600">{alert.createdAt.toLocaleString()}</span>
                  {!alert.acknowledged && <AcknowledgeStockAlertButton alertId={alert.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
