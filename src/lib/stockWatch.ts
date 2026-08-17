import { prisma } from "@/lib/prisma";
import { WatchKind, type WatchTarget } from "@/generated/prisma/client";
import { checkProductStock, searchNewListings } from "@/lib/retailers";
import { notifyStockAlerts, type StockAlertWithTarget } from "@/lib/stockNotify";

export interface WatchCheckResult {
  watchTargetId: string;
  label: string;
  ok: boolean;
  alerts: StockAlertWithTarget[];
  error?: string;
}

function formatPrice(cents?: number): string {
  return cents != null ? ` at $${(cents / 100).toFixed(2)}` : "";
}

/**
 * PRODUCT-kind target: check the one page, and alert only on a genuine transition into
 * stock (was false/unknown, is now true) — not on the first check finding it already
 * out of stock, and not repeatedly while it stays in stock.
 */
async function checkProductTarget(target: WatchTarget): Promise<WatchCheckResult> {
  const result: WatchCheckResult = { watchTargetId: target.id, label: target.label, ok: true, alerts: [] };

  try {
    const check = await checkProductStock(target.retailer, target.url, target.sku);
    const wasInStock = target.inStock;

    await prisma.watchTarget.update({
      where: { id: target.id },
      data: {
        inStock: check.inStock,
        lastTitle: check.title ?? target.lastTitle,
        lastPriceCents: check.priceCents ?? target.lastPriceCents,
        lastCheckedAt: new Date(),
        lastError: null,
      },
    });

    if (check.inStock && wasInStock !== true) {
      const alert = await prisma.stockAlert.create({
        data: {
          watchTargetId: target.id,
          message: `${target.label} is back in stock${formatPrice(check.priceCents)}.`,
          url: target.url,
        },
        include: { watchTarget: true },
      });
      result.alerts.push(alert);
    }
  } catch (err) {
    result.ok = false;
    result.error = err instanceof Error ? err.message : String(err);
    await prisma.watchTarget.update({
      where: { id: target.id },
      data: { lastCheckedAt: new Date(), lastError: result.error },
    });
  }

  return result;
}

/**
 * SEARCH-kind target: diff the current listings against SeenProduct. The first-ever check
 * just establishes the baseline (no alerts — otherwise every existing listing would look
 * "new"); every check after that alerts on anything that wasn't seen before.
 */
async function checkSearchTarget(target: WatchTarget): Promise<WatchCheckResult> {
  const result: WatchCheckResult = { watchTargetId: target.id, label: target.label, ok: true, alerts: [] };

  try {
    const listings = await searchNewListings(target.retailer, target.keyword!);
    const seen = await prisma.seenProduct.findMany({
      where: { watchTargetId: target.id },
      select: { externalId: true },
    });
    const seenIds = new Set(seen.map((s) => s.externalId));
    const isFirstCheck = seenIds.size === 0;
    const freshListings = listings.filter((l) => !seenIds.has(l.externalId));

    for (const listing of freshListings) {
      await prisma.seenProduct.create({
        data: {
          watchTargetId: target.id,
          externalId: listing.externalId,
          title: listing.title,
          url: listing.url,
        },
      });
    }

    if (!isFirstCheck) {
      for (const listing of freshListings) {
        const alert = await prisma.stockAlert.create({
          data: {
            watchTargetId: target.id,
            message: `New listing for "${target.keyword}": ${listing.title}${formatPrice(listing.priceCents)}.`,
            url: listing.url,
          },
          include: { watchTarget: true },
        });
        result.alerts.push(alert);
      }
    }

    await prisma.watchTarget.update({
      where: { id: target.id },
      data: { lastCheckedAt: new Date(), lastError: null },
    });
  } catch (err) {
    result.ok = false;
    result.error = err instanceof Error ? err.message : String(err);
    await prisma.watchTarget.update({
      where: { id: target.id },
      data: { lastCheckedAt: new Date(), lastError: result.error },
    });
  }

  return result;
}

/** Check every active watch target, then send one summary email for anything that fired. */
export async function checkAllWatchTargets(): Promise<WatchCheckResult[]> {
  const targets = await prisma.watchTarget.findMany({ where: { active: true } });

  const results: WatchCheckResult[] = [];
  for (const target of targets) {
    // Sequential on purpose: avoid hammering retailer sites with concurrent requests, which
    // makes bot-protection triggers more likely.
    results.push(target.kind === WatchKind.SEARCH ? await checkSearchTarget(target) : await checkProductTarget(target));
  }

  const allAlerts = results.flatMap((r) => r.alerts);
  try {
    await notifyStockAlerts(allAlerts);
  } catch (err) {
    console.error("[stockWatch] Failed to send alert notification email:", err);
  }

  return results;
}

/** Check a single watch target on demand (e.g. a "Check now" button). */
export async function checkWatchTarget(watchTargetId: string): Promise<WatchCheckResult> {
  const target = await prisma.watchTarget.findUniqueOrThrow({ where: { id: watchTargetId } });
  const result = target.kind === WatchKind.SEARCH ? await checkSearchTarget(target) : await checkProductTarget(target);
  try {
    await notifyStockAlerts(result.alerts);
  } catch (err) {
    console.error("[stockWatch] Failed to send alert notification email:", err);
  }
  return result;
}
