"use client";

import { useEffect, useState } from "react";
import { NAV_ITEMS } from "./nav";

export function useActiveSection() {
  const [active, setActive] = useState(NAV_ITEMS[0].id);
  useEffect(() => {
    const els = NAV_ITEMS.map((n) => document.getElementById(n.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return [active, setActive] as const;
}
