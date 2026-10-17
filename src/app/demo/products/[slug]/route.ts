// Sample product pages for the "Add an item from a link" demo: a made-up store, Fernwood Home, with the standard
// product markup (JSON-LD + Open Graph) that real shops publish, so pasting one of these always works.

const STORE = "Fernwood Home";
const PRODUCTS: Record<string, { name: string; price: string; image: string; blurb: string }> = {
  "linen-napkins-4": {
    name: "Linen Napkins, set of 4",
    price: "24.00",
    image: "https://images.unsplash.com/photo-1770731206301-43a9683f3438?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDE3MjIwfDB8MXxzZWFyY2h8MXx8bGluZW4lMjBkaXNoJTIwdG93ZWxzfGVufDB8Mnx8fDE3OTIyNjQzNTF8Mg&ixlib=rb-4.1.0&q=80&w=600",
    blurb: "Stonewashed European linen that softens with every wash.",
  },
  "glass-storage-jars-6": {
    name: "Glass Storage Jars, set of 6",
    price: "32.00",
    image: "https://images.unsplash.com/photo-1586585571612-bbc4176c9bf2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDE3MjIwfDB8MXxzZWFyY2h8MXx8Z2xhc3MlMjBzdG9yYWdlJTIwamFycyUyMHBhbnRyeXxlbnwwfDJ8fHwxNzkyMjY3NDY4fDI&ixlib=rb-4.1.0&q=80&w=600",
    blurb: "Airtight lids for the pantry, in three sizes.",
  },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const p = PRODUCTS[slug];
  if (!p) return new Response("Not found", { status: 404 });
  const url = new URL(req.url).toString();
  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    image: [p.image],
    description: p.blurb,
    brand: { "@type": "Brand", name: STORE },
    offers: { "@type": "Offer", url, priceCurrency: "USD", price: p.price, availability: "https://schema.org/InStock" },
  };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(p.name)} · ${STORE}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:type" content="product"><meta property="og:site_name" content="${STORE}"><meta property="og:title" content="${esc(p.name)}">
<meta property="og:image" content="${esc(p.image)}"><meta property="product:price:amount" content="${p.price}"><meta property="product:price:currency" content="USD">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#faf8f4;color:#2b2a27}main{max-width:720px;margin:48px auto;padding:0 24px;display:flex;gap:32px;flex-wrap:wrap}img{width:300px;height:300px;object-fit:cover;border-radius:12px}h1{font-size:26px;margin:0 0 8px}.price{font-size:22px;font-weight:600}.brand{letter-spacing:.08em;text-transform:uppercase;font-size:12px;color:#7a746a}</style></head>
<body><main><img src="${esc(p.image)}" alt="${esc(p.name)}"><div><div class="brand">${STORE}</div><h1>${esc(p.name)}</h1><p>${esc(p.blurb)}</p><div class="price">$${p.price}</div><p style="color:#7a746a;font-size:13px">Demo product page for Stella. Nothing here is for sale.</p></div></main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
