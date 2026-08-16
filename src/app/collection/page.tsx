import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { pickPrimarySeries } from "@/lib/cardStats";
import { formatCents, formatPriceType } from "@/lib/format";
import CollectionRowActions from "@/components/CollectionRowActions";
import ImportCollectionForm from "@/components/ImportCollectionForm";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const items = await prisma.collectionItem.findMany({
    include: {
      card: { include: { priceSnapshots: { orderBy: { capturedAt: "asc" } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">Your collection</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/collection/add"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            + Add card
          </Link>
        </div>
      </div>

      <ImportCollectionForm />

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing here yet. Add a card to get started.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Card</th>
                <th className="px-4 py-3 font-medium">Condition</th>
                <th className="px-4 py-3 font-medium">Latest price</th>
                <th className="px-4 py-3 font-medium">Purchase price</th>
                <th className="px-4 py-3 font-medium">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {items.map((item) => {
                const primary = pickPrimarySeries(item.card.priceSnapshots, item.condition);
                return (
                  <tr key={item.id} className="hover:bg-zinc-900/60">
                    <td className="px-4 py-3">
                      <Link href={`/cards/${item.card.id}`} className="font-medium text-zinc-100 hover:underline">
                        {item.card.name}
                      </Link>
                      {item.card.consoleName && (
                        <div className="text-xs text-zinc-500">{item.card.consoleName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{item.condition.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 font-mono text-zinc-100">
                      {primary ? (
                        <>
                          {formatCents(primary.stats.latest.price)}{" "}
                          <span className="text-xs text-zinc-500">({formatPriceType(primary.priceType)})</span>
                        </>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-400">
                      {item.purchasePrice !== null ? formatCents(item.purchasePrice) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <CollectionRowActions itemId={item.id} initialQuantity={item.quantity} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
