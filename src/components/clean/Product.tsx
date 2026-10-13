// React port of design/clean/Product.dc.html: SVG artwork for the sample Store Sync catalog.

export type ProductKind = "tp" | "sponge" | "bodywash" | "toothpaste" | "soap" | "filter";

export function Product({ kind = "tp", size = 150 }: { kind?: ProductKind | "brita"; size?: number }) {
  const k = kind === "brita" ? "filter" : kind;
  return (
    <span role="img" aria-label={`${kind} product image`} style={{ display: "inline-flex", width: size, height: size, flexShrink: 0 }}>
      <svg width="100%" height="100%" viewBox="0 0 200 200" fill="none" fontFamily="Inter, system-ui, sans-serif">
        {k === "tp" && (
          <>
            <ellipse cx="100" cy="176" rx="82" ry="8" fill="#000" fillOpacity=".25" />
            <rect x="100" y="76" width="64" height="86" fill="#f1eee6" />
            <ellipse cx="132" cy="162" rx="32" ry="9" fill="#e4e0d6" />
            <ellipse cx="132" cy="76" rx="32" ry="9" fill="#fbfaf6" />
            <ellipse cx="132" cy="76" rx="11" ry="3.5" fill="#b9a384" />
            <rect x="36" y="88" width="64" height="86" fill="#f6f3ec" />
            <ellipse cx="68" cy="174" rx="32" ry="9" fill="#e9e5db" />
            <ellipse cx="68" cy="88" rx="32" ry="9" fill="#fdfcf9" />
            <ellipse cx="68" cy="88" rx="11" ry="3.5" fill="#b9a384" />
            <rect x="36" y="118" width="64" height="20" fill="#4f9fe6" />
            <text x="68" y="132" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">Cloudsoft</text>
            <rect x="100" y="106" width="64" height="20" fill="#4f9fe6" fillOpacity=".85" />
          </>
        )}
        {k === "sponge" && (
          <>
            <ellipse cx="100" cy="162" rx="76" ry="8" fill="#000" fillOpacity=".25" />
            <rect x="34" y="96" width="132" height="62" rx="12" fill="#f2c94c" />
            <rect x="34" y="74" width="132" height="30" rx="12" fill="#3fa564" />
            <g fill="#2c8049">
              <circle cx="54" cy="86" r="2.4" /><circle cx="76" cy="92" r="2" /><circle cx="100" cy="84" r="2.4" /><circle cx="124" cy="92" r="2" /><circle cx="146" cy="85" r="2.4" /><circle cx="64" cy="98" r="1.8" /><circle cx="136" cy="98" r="1.8" />
            </g>
            <g fill="#d3a431">
              <circle cx="52" cy="122" r="3" /><circle cx="78" cy="136" r="2.6" /><circle cx="106" cy="124" r="3" /><circle cx="132" cy="140" r="2.6" /><circle cx="152" cy="124" r="2.4" /><circle cx="66" cy="148" r="2" /><circle cx="118" cy="150" r="2" />
            </g>
            <text x="100" y="134" textAnchor="middle" fontSize="12" fontWeight="700" fill="#8a6414">Scrubwell</text>
          </>
        )}
        {k === "bodywash" && (
          <>
            <ellipse cx="100" cy="182" rx="50" ry="7" fill="#000" fillOpacity=".25" />
            <rect x="92" y="52" width="16" height="22" fill="#14485c" />
            <rect x="90" y="30" width="20" height="24" rx="4" fill="#26303a" />
            <rect x="98" y="26" width="34" height="10" rx="5" fill="#26303a" />
            <path d="M66 96c0-14 10-24 24-24h20c14 0 24 10 24 24v72c0 9-7 14-14 14H80c-7 0-14-5-14-14z" fill="#1f7592" />
            <path d="M66 96c0-14 10-24 24-24h8v110H80c-7 0-14-5-14-14z" fill="#fff" fillOpacity=".1" />
            <rect x="72" y="106" width="56" height="52" rx="8" fill="#f4f8fa" />
            <path d="M76 140c6-6 10-6 14 0s10 6 14 0 10-6 14 0 6 4 8 2" stroke="#1f7592" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <text x="100" y="124" textAnchor="middle" fontSize="10" fontWeight="800" fill="#14485c">Tideline</text>
            <text x="100" y="134" textAnchor="middle" fontSize="7" fontWeight="600" letterSpacing="1.5" fill="#14485c">MEN</text>
          </>
        )}
        {k === "toothpaste" && (
          <>
            <ellipse cx="100" cy="184" rx="40" ry="6" fill="#000" fillOpacity=".25" />
            <path d="M64 52h72l-18 112H82z" fill="#f5f8fc" />
            <path d="M64 52h20l-10 112H82z" fill="#fff" fillOpacity=".6" />
            <path d="M72 98h56l-3 24H75z" fill="#1d3f94" />
            <rect x="64" y="38" width="72" height="16" rx="3" fill="#d8dfeb" />
            <path d="M72 41v10M82 41v10M92 41v10M102 41v10M112 41v10M122 41v10" stroke="#b5c0d2" strokeWidth="2" />
            <rect x="80" y="162" width="40" height="20" rx="4" fill="#1d3f94" />
            <text x="100" y="114" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">Calmwhite</text>
            <path d="M78 80c8-8 14 6 22-2s14 6 22-2" stroke="#2fb8a0" strokeWidth="3" strokeLinecap="round" fill="none" />
          </>
        )}
        {k === "soap" && (
          <>
            <ellipse cx="100" cy="184" rx="58" ry="7" fill="#000" fillOpacity=".25" />
            <path d="M54 74c0-10 8-16 18-16h56c10 0 18 6 18 16l10 98c1 9-5 12-12 12H56c-7 0-13-3-12-12z" fill="#87cdee" />
            <path d="M54 74c0-10 8-16 18-16h14l-6 126H56c-7 0-13-3-12-12z" fill="#fff" fillOpacity=".18" />
            <rect x="82" y="44" width="36" height="16" rx="4" fill="#2a8cbc" />
            <rect x="86" y="32" width="28" height="14" rx="4" fill="#1d6f96" />
            <rect x="62" y="92" width="76" height="62" rx="10" fill="#f2fbff" />
            <g fill="#fff" stroke="#87cdee"><circle cx="76" cy="104" r="4" /><circle cx="126" cy="146" r="3" /><circle cx="120" cy="102" r="2.5" /></g>
            <text x="100" y="124" textAnchor="middle" fontSize="11" fontWeight="800" fill="#1d6f96">Purelather</text>
            <text x="100" y="138" textAnchor="middle" fontSize="7" fontWeight="600" letterSpacing="1" fill="#1d6f96">HAND SOAP REFILL</text>
          </>
        )}
        {k === "filter" && (
          <>
            <ellipse cx="100" cy="182" rx="46" ry="6" fill="#000" fillOpacity=".25" />
            <rect x="68" y="60" width="64" height="112" rx="10" fill="#f1f4f8" stroke="#cbd3dc" strokeWidth="2" />
            <rect x="60" y="46" width="80" height="20" rx="8" fill="#1f86e8" />
            <rect x="92" y="36" width="16" height="12" rx="3" fill="#176bbd" />
            <rect x="62" y="162" width="76" height="14" rx="6" fill="#1f86e8" />
            <path d="M76 74v80M86 74v80M114 74v80M124 74v80" stroke="#dde3ea" strokeWidth="2" />
            <rect x="68" y="98" width="64" height="30" fill="#1f86e8" />
            <text x="100" y="117" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">Clearpour</text>
          </>
        )}
      </svg>
    </span>
  );
}
