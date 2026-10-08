"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, cx } from "./ui";

type Mode = "live" | "mock" | "unknown";

const SERVICES = [
  { key: "anthropic", label: "Claude" },
  { key: "jev", label: "Jev" },
  { key: "paypal", label: "PayPal" },
  { key: "zapier", label: "Zapier" },
  { key: "kernel", label: "Kernel" },
] as const;

function normalise(v: unknown): Mode {
  if (v === true) return "live";
  if (v === false) return "mock";
  if (typeof v === "string") return /live|connected|on|ok/i.test(v) ? "live" : /mock|off|demo|sim/i.test(v) ? "mock" : "unknown";
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return normalise(o.mode ?? o.status ?? o.live);
  }
  return "unknown";
}

export function IntegrationsStatus() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Record<string, unknown>) => !cancelled && setData(j))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader title="Integrations" subtitle={failed ? "Status unavailable" : undefined} />
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {SERVICES.map((s) => {
          const mode = data && !failed ? normalise(data[s.key]) : "unknown";
          return (
            <li key={s.key} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-2">
                <span
                  className={cx("h-2 w-2 rounded-full", mode === "live" ? "bg-positive" : mode === "mock" ? "bg-warning" : "bg-faint")}
                  aria-hidden
                />
                {s.label}
              </span>
              <span className="text-faint">{mode === "unknown" ? (data || failed ? "n/a" : "…") : mode}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
