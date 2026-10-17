// Reads a product page from a pasted link and returns a listing (title, photo, price, store).
//
// The price is what a PayPal order will charge, so it must come from the server, never from the browser. The listing
// is therefore HMAC-signed here and verified again when the order is created; the browser only carries it around.
//
// Fetching a user-supplied URL is an SSRF risk, so: http(s) only, no credentials, standard ports, every address the
// host resolves to must be public (re-checked on each redirect, at most 3), a short timeout and a size cap.

import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";

export interface Listing {
  url: string;
  host: string;
  store: string;
  title: string;
  /** USD, per unit. */
  price: number;
  imageUrl?: string;
}
export interface SignedListing extends Listing {
  sig: string;
}
export type ReadResult = { ok: true; listing: SignedListing } | { ok: false; error: string };

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const MAX_PRICE = 2_000;

function secret() {
  return process.env.LISTING_SECRET || process.env.PAYPAL_CLIENT_SECRET || "stella-demo-listing-secret";
}
function sign(l: Listing) {
  return createHmac("sha256", secret()).update(JSON.stringify([l.url, l.store, l.title, l.price, l.imageUrl ?? ""])).digest("hex");
}
/** True only for a listing this server produced and nobody changed. */
export function verifyListing(l: SignedListing): boolean {
  if (!l || typeof l.sig !== "string" || !Number.isFinite(l.price) || l.price <= 0 || l.price > MAX_PRICE) return false;
  const expected = Buffer.from(sign(l));
  const got = Buffer.from(l.sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

function isPrivateIPv4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}
function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
}

/** Throws a user-facing Error unless `u` is safe to fetch. `allowHost` (this app's own host) skips the public-address rule. */
async function assertFetchable(u: URL, allowHost?: string) {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only web links (http or https) are supported");
  if (u.username || u.password) throw new Error("Links with a username or password are not supported");
  if (allowHost && u.host === allowHost) return;
  if (u.port && u.port !== "80" && u.port !== "443") throw new Error("That link uses an unusual port");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("That address isn't reachable from here");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error("Couldn't find that website");
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error("That address isn't reachable from here");
}

async function fetchHtml(start: URL, allowHost?: string): Promise<{ html: string; finalUrl: URL }> {
  let u = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertFetchable(u, allowHost);
    const res = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "StellaBot/1.0 (product link reader)", accept: "text/html,application/xhtml+xml" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      u = new URL(res.headers.get("location")!, u);
      continue;
    }
    if (!res.ok) throw new Error(`The store answered ${res.status}. Try another link`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(type)) throw new Error("That link isn't a product page");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("The page was empty");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break; // the product data is near the top; a truncated page is fine
      }
      chunks.push(value);
    }
    return { html: Buffer.concat(chunks).toString("utf8"), finalUrl: u };
  }
  throw new Error("Too many redirects");
}

// ---- parsing -------------------------------------------------------------------------------------------------

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function metaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const val = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && val !== undefined && !(key in out)) out[key] = decode(val);
  }
  return out;
}

function jsonLdProducts(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const visit = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    const t = o["@type"];
    if (t === "Product" || (Array.isArray(t) && t.includes("Product"))) found.push(o);
    if (o["@graph"]) visit(o["@graph"]);
  };
  for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]));
    } catch {
      /* ignore malformed blocks */
    }
  }
  return found;
}

const asNumber = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const firstString = (v: unknown): string | undefined => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return firstString(v[0]);
  if (v && typeof v === "object") return firstString((v as Record<string, unknown>).url ?? (v as Record<string, unknown>).contentUrl);
  return undefined;
};

function offerOf(product: Record<string, unknown>): { price?: number; currency?: string } {
  const offers = product.offers;
  const o = (Array.isArray(offers) ? offers[0] : offers) as Record<string, unknown> | undefined;
  if (!o) return {};
  const spec = o.priceSpecification as Record<string, unknown> | undefined;
  return {
    price: asNumber(o.price ?? o.lowPrice ?? spec?.price),
    currency: (o.priceCurrency ?? spec?.priceCurrency) as string | undefined,
  };
}

/** Pure parser, exported for tests. */
export function parseProduct(html: string, pageUrl: URL): Omit<Listing, "url" | "host"> | { error: string } {
  const meta = metaTags(html);
  const ld = jsonLdProducts(html)[0];
  const offer = ld ? offerOf(ld) : {};
  const price = offer.price ?? asNumber(meta["product:price:amount"] ?? meta["og:price:amount"] ?? meta["price"]);
  const currency = (offer.currency ?? meta["product:price:currency"] ?? meta["og:price:currency"] ?? "USD").toUpperCase();
  const rawTitle = (typeof ld?.name === "string" ? ld.name : undefined) ?? meta["og:title"] ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const title = rawTitle ? decode(rawTitle).replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (!title) return { error: "Couldn't find a product name on that page" };
  if (price === undefined) return { error: "Couldn't read a price on that page. Try a link to a single product" };
  if (currency !== "USD") return { error: `That price is in ${currency}; only US dollars are supported` };
  if (price > MAX_PRICE) return { error: `That item is over $${MAX_PRICE}, which is more than Stella will order from a link` };
  let imageUrl: string | undefined;
  const img = firstString(ld?.image) ?? meta["og:image"] ?? meta["twitter:image"];
  if (img) {
    try {
      const abs = new URL(decode(img), pageUrl);
      if (abs.protocol === "https:" || abs.protocol === "http:") imageUrl = abs.toString();
    } catch {
      /* no image */
    }
  }
  const store = (meta["og:site_name"] ? decode(meta["og:site_name"]) : pageUrl.hostname.replace(/^www\./, "")).slice(0, 60);
  return { title, price: Math.round(price * 100) / 100, store, ...(imageUrl ? { imageUrl } : {}) };
}

export async function readProductLink(raw: string, opts: { allowHost?: string } = {}): Promise<ReadResult> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "That doesn't look like a link" };
  }
  try {
    const { html, finalUrl } = await fetchHtml(url, opts.allowHost);
    const parsed = parseProduct(html, finalUrl);
    if ("error" in parsed) return { ok: false, error: parsed.error };
    const listing: Listing = { url: finalUrl.toString(), host: finalUrl.hostname.replace(/^www\./, ""), ...parsed };
    return { ok: true, listing: { ...listing, sig: sign(listing) } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return { ok: false, error: "The store took too long to answer" };
    // Our own, user-facing errors pass through; anything else (network details) stays generic.
    const friendly = /^(Only web|Links with|That |Couldn't|The |Too many|Only )/.test(msg);
    return { ok: false, error: friendly ? msg : "Couldn't open that page" };
  }
}
