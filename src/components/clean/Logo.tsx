// React port of design/clean/Logo.dc.html: round SVG marks for the design's merchants.

const MARKS: Record<string, React.ReactNode> = {
  thistle: (
    <>
      <circle cx="24" cy="24" r="24" fill="#d94a3d" /><circle cx="24" cy="24" r="14" stroke="#fff" strokeWidth="3" /><path d="M17 18.5h14M24 18.5V32" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
    </>
  ),
  ember: (
    <>
      <circle cx="24" cy="24" r="24" fill="#1e3a2f" /><ellipse cx="24" cy="24" rx="9" ry="14" transform="rotate(35 24 24)" fill="#f6e7c8" /><path d="M16.5 31c5-2 9-6 15-14" stroke="#1e3a2f" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  plateful: (
    <>
      <circle cx="24" cy="24" r="24" fill="#f2542d" /><circle cx="24" cy="24" r="13" stroke="#fff" strokeWidth="3" /><circle cx="24" cy="24" r="6" fill="#fff" />
    </>
  ),
  corevale: (
    <>
      <circle cx="24" cy="24" r="24" fill="#0d4f8b" /><path d="M24 10 38 24 24 38 10 24z" fill="#fff" /><path d="M24 17 31 24 24 31 17 24z" fill="#0d4f8b" />
    </>
  ),
  hopline: (
    <>
      <circle cx="24" cy="24" r="24" fill="#111" /><circle cx="15" cy="33" r="4" fill="#fff" /><circle cx="33" cy="15" r="4" stroke="#fff" strokeWidth="3" /><path d="M15 29c0-9 18-3 18-10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  acme: (
    <>
      <circle cx="24" cy="24" r="24" fill="#2f6f6f" /><path d="M14 34 24 12l10 22" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M18.5 27h11" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
    </>
  ),
  parkside: (
    <>
      <circle cx="24" cy="24" r="24" fill="#566a7c" /><rect x="12" y="21" width="11" height="16" fill="#fff" /><rect x="25" y="13" width="11" height="24" fill="#cfd8e0" /><path d="M15.5 25h4M15.5 30h4M28.5 18h4M28.5 23h4M28.5 28h4" stroke="#566a7c" strokeWidth="2" />
    </>
  ),
  sonora: (
    <>
      <circle cx="24" cy="24" r="24" fill="#6d3df5" /><rect x="12" y="22" width="5.5" height="13" rx="2.75" fill="#fff" /><rect x="21.2" y="13" width="5.5" height="22" rx="2.75" fill="#fff" /><rect x="30.5" y="18" width="5.5" height="17" rx="2.75" fill="#fff" />
    </>
  ),
  copper: (
    <>
      <circle cx="24" cy="24" r="24" fill="#b8662e" /><path d="M9 35 20 16l5.5 8.5L30 18l9 17z" fill="#fff" />
    </>
  ),
  brightgrid: (
    <>
      <circle cx="24" cy="24" r="24" fill="#f5b400" /><path d="M27 8 14 26h9l-2 14 13-19h-9z" fill="#1b1b1b" />
    </>
  ),
  greenfold: (
    <>
      <circle cx="24" cy="24" r="24" fill="#2f8f4e" /><path d="M24 38V21" stroke="#fff" strokeWidth="3" strokeLinecap="round" /><path d="M24 23c-9 0-12-5-12-11 9 0 12 5 12 11z" fill="#fff" /><path d="M24 28c8 0 11-4 11-10-8 0-11 4-11 10z" fill="#cdeccf" />
    </>
  ),
  lilia: (
    <>
      <circle cx="24" cy="24" r="24" fill="#6b3a2a" /><path d="M24 36c-6-4-7-12-3-22 4 10 3 18 3 22z" fill="#fff" /><path d="M24 36c6-4 7-12 3-22-4 10-3 18-3 22z" fill="#f1d9c8" /><path d="M13 24c4 1 8 5 11 12M35 24c-4 1-8 5-11 12" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  tidyloop: (
    <>
      <circle cx="24" cy="24" r="24" fill="#1d9b7a" /><path d="M35 24a11 11 0 1 1-3.4-7.9" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" /><path d="M33 11v8h-8" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  kitebird: (
    <>
      <circle cx="24" cy="24" r="24" fill="#1c2e8a" /><path d="M24 8 35 21 24 32 13 21z" fill="#fff" /><path d="M24 8v24" stroke="#1c2e8a" strokeWidth="1.6" /><path d="M24 32c0 4-4 4-4 8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  vantage: (
    <>
      <circle cx="24" cy="24" r="24" fill="#5b2bd0" /><path d="M12 15l12 20 12-20" stroke="#fff" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  parlo: (
    <>
      <circle cx="24" cy="24" r="24" fill="#5cc12b" /><path d="M12 13h24v17H26l-8 7v-7h-6z" fill="#fff" /><circle cx="19" cy="21.5" r="2.1" fill="#5cc12b" /><circle cx="29" cy="21.5" r="2.1" fill="#5cc12b" />
    </>
  ),
  pixelforge: (
    <>
      <circle cx="24" cy="24" r="24" fill="#c01b2c" /><rect x="11" y="11" width="12" height="12" fill="#fff" /><rect x="25" y="25" width="12" height="12" fill="#fff" /><rect x="25" y="11" width="12" height="12" fill="#fff" fillOpacity=".45" /><rect x="11" y="25" width="12" height="12" fill="#fff" fillOpacity=".45" />
    </>
  ),
  sable: (
    <>
      <circle cx="24" cy="24" r="24" fill="#1f1f23" /><path d="M31 12a13 13 0 1 0 0 24 10 10 0 0 1 0-24z" fill="#fff" />
    </>
  ),
  frameline: (
    <>
      <circle cx="24" cy="24" r="24" fill="#8b5cf6" /><path d="M13 20v-7h7M35 20v-7h-7M13 28v7h7M35 28v7h-7" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="24" cy="24" r="3.4" fill="#fff" />
    </>
  ),
  forge: (
    <>
      <circle cx="24" cy="24" r="24" fill="#1a1a2e" /><rect x="8" y="20" width="5" height="8" rx="1.5" fill="#ff8a3d" /><rect x="35" y="20" width="5" height="8" rx="1.5" fill="#ff8a3d" /><rect x="14" y="16" width="5" height="16" rx="1.5" fill="#ff8a3d" /><rect x="29" y="16" width="5" height="16" rx="1.5" fill="#ff8a3d" /><rect x="19" y="22.5" width="10" height="3" fill="#ff8a3d" />
    </>
  ),
  reelhouse: (
    <>
      <circle cx="24" cy="24" r="24" fill="#d61f1f" /><circle cx="24" cy="24" r="14" fill="#fff" /><circle cx="24" cy="16" r="3.2" fill="#d61f1f" /><circle cx="32" cy="24" r="3.2" fill="#d61f1f" /><circle cx="24" cy="32" r="3.2" fill="#d61f1f" /><circle cx="16" cy="24" r="3.2" fill="#d61f1f" /><circle cx="24" cy="24" r="2.4" fill="#d61f1f" />
    </>
  ),
  cinebox: (
    <>
      <circle cx="24" cy="24" r="24" fill="#0f172a" /><rect x="11" y="21" width="26" height="16" rx="2" fill="#fff" /><path d="M11 15l26-4 1 7-26 4z" fill="#ff4d4f" /><path d="M18 13.8l4 5.8M26 12.6l4 5.8" stroke="#0f172a" strokeWidth="2" />
    </>
  ),
  cartly: (
    <>
      <circle cx="24" cy="24" r="24" fill="#f08a24" /><path d="M13 17h22l-2.2 17H15.2z" fill="#fff" /><path d="M19 17a5 5 0 0 1 10 0" stroke="#fff" strokeWidth="3" strokeLinecap="round" /><path d="M18.5 26c3.5 3 7.5 3 11 0" stroke="#f08a24" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
  paypal: (
    <>
      <circle cx="24" cy="24" r="24" fill="#0070e0" /><path d="M17 36V12h8.5a7 7 0 0 1 0 14H20" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  various: (
    <>
      <circle cx="24" cy="24" r="24" fill="#3a3b42" /><circle cx="14" cy="24" r="3.2" fill="#fff" /><circle cx="24" cy="24" r="3.2" fill="#fff" /><circle cx="34" cy="24" r="3.2" fill="#fff" />
    </>
  ),
  unknown: (
    <>
      <circle cx="24" cy="24" r="24" fill="#4b5563" /><path d="M19 19a5 5 0 1 1 7 4.6c-1.4.8-2 1.8-2 3.4M24 33h.01" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
    </>
  ),
};

const BY_NAME: Record<string, string> = {
  Thistle: "thistle", "Ember Roast": "ember", Plateful: "plateful", Corevale: "corevale", Hopline: "hopline", "Acme Inc. payroll": "acme",
  "Parkside Apartments": "parkside", Sonora: "sonora", "SQ *COPPER PEAK 0412": "copper", "Brightgrid Energy": "brightgrid",
  Greenfold: "greenfold", Lilia: "lilia", Tidyloop: "tidyloop", "Kitebird+": "kitebird", Vantage: "vantage", Parlo: "parlo",
  Pixelforge: "pixelforge", Sable: "sable", Frameline: "frameline", "Forge Fitness": "forge", "Reelhouse Premium": "reelhouse", Cinebox: "cinebox",
  Cartly: "cartly", PayPal: "paypal", "PayPal Offers": "paypal", "PayPal Rewards": "paypal", Various: "various",
};

/** The design's logo mark for a merchant name, or null when it has none. */
export const logoMark = (merchant: string): string | null => BY_NAME[merchant] ?? null;

export function Logo({ mark = "unknown", size = 34 }: { mark?: string; size?: number }) {
  return (
    <span role="img" aria-label={`${mark} logo`} style={{ display: "inline-flex", width: size, height: size, flexShrink: 0 }}>
      <svg width="100%" height="100%" viewBox="0 0 48 48" fill="none" aria-hidden>
        {MARKS[mark] ?? MARKS.unknown}
      </svg>
    </span>
  );
}
