/**
 * Shared fetch helper for retailer product pages. GameStop/Walmart/Target all run
 * bot-protection (Akamai, PerimeterX, etc.) in front of their storefronts, which a plain
 * server-side fetch can trip even with reasonable headers — a realistic User-Agent buys
 * some headroom but isn't a guarantee. If a checker starts getting consistent 403s/empty
 * bodies, that's the bot protection kicking in, not a bug in the parsing logic.
 */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function fetchHtml(url: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
    if (!res.ok) {
      throw new Error(
        `${url} responded ${res.status}. If this persists, the retailer's bot protection is likely blocking the request.`
      );
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}
