import Link from "next/link";
import { prisma } from "@/lib/prisma";
import TrendBadge from "@/components/TrendBadge";
import AcknowledgeAlertButton from "@/components/AcknowledgeAlertButton";
import NotifyStatus from "@/components/NotifyStatus";
import { isNotifyConfigured } from "@/lib/notify";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const alerts = await prisma.alert.findMany({
    include: { card: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-zinc-100">Alerts</h1>

      <NotifyStatus configured={isNotifyConfigured()} />

      {alerts.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No alerts yet. Alerts fire automatically when a card&apos;s price trends sharply, hits a new high, or
          looks like it&apos;s time to sell — run a sync to check for the latest signals.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
                alert.acknowledged ? "border-zinc-800 opacity-50" : "border-zinc-700"
              }`}
            >
              <div className="flex items-center gap-3">
                <TrendBadge type={alert.type} />
                <div>
                  <Link href={`/cards/${alert.cardId}`} className="font-medium text-zinc-100 hover:underline">
                    {alert.card.name}
                  </Link>
                  <p className="text-zinc-400">{alert.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-600">{alert.createdAt.toLocaleString()}</span>
                {!alert.acknowledged && <AcknowledgeAlertButton alertId={alert.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
