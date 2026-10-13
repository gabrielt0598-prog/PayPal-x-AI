"use client";

import { useState } from "react";
import { ArrowDown, ChevronLeft, ChevronRight, Trophy, Wallet } from "lucide-react";
import { REWARD_CATS, useClean } from "../AppState";
import { Logo, logoMark } from "../Logo";
import { Card, cx, money, Pill, Section, shortDate } from "../ui";

const markFor = (merchant: string) => logoMark(merchant) ?? "unknown";

const PG = 10;
const COLS = "grid grid-cols-[minmax(0,1.7fr)_minmax(72px,0.7fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(88px,0.6fr)] items-center gap-4 px-5";
const nb = "flex size-9 items-center justify-center rounded-full bg-white/[0.08] text-text transition disabled:cursor-default disabled:opacity-35";

export function RewardsPage() {
  const { rewards } = useClean();
  const [input, setInput] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);

  const raw = parseInt(input.replace(/[^0-9]/g, ""), 10) || 0;
  const over = raw > rewards.pts;
  const amt = over ? 0 : raw;
  const usd = amt / 100;

  const pages = Math.max(1, Math.ceil(rewards.log.length / PG));
  const cur = Math.min(page, pages - 1);
  const rows = rewards.log.slice(cur * PG, (cur + 1) * PG);
  const from = rewards.log.length ? cur * PG + 1 : 0;
  const to = Math.min(rewards.log.length, (cur + 1) * PG);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-[var(--sec-gap,32px)]">
      <header className="-mb-3.5 flex items-center">
        <span className="flex items-center gap-3">
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-strong text-lg font-bold italic text-white">
            P
          </span>
          <h1 className="text-2xl font-semibold leading-tight">Rewards</h1>
        </span>
      </header>

      <div className="grid grid-cols-1 gap-y-[var(--sec-gap,32px)] @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] @3xl:grid-rows-[auto_1fr_auto] @3xl:gap-x-8 @3xl:gap-y-0">
        <div className="flex min-w-0 flex-col gap-3 @3xl:row-span-3 @3xl:grid @3xl:grid-rows-subgrid">
          <div className="flex min-h-7 items-center">
            <h2 className="text-lg font-semibold">Your points</h2>
          </div>
          <Card className="flex-1 gap-5">
            <section aria-label="Your points" className="contents">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="num whitespace-nowrap text-[40px] font-semibold leading-[1.1] tracking-[-0.02em]">
                    {rewards.pts.toLocaleString("en-US")} <span className="text-lg font-medium text-muted">pts</span>
                  </span>
                </div>
                <span className="text-sm text-muted">100 pts = $1</span>
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className={cx("flex flex-1 items-center gap-3 rounded-2xl border bg-surface-2 px-4 py-[18px]", over ? "border-negative" : "border-transparent")}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-bg text-accent">
                    <Trophy size={18} />
                  </span>
                  <span className="text-base font-semibold">Points</span>
                  <span className={cx("flex min-w-0 flex-1 items-center justify-end gap-1.5 text-lg font-semibold tracking-[-0.01em]", raw ? "text-text" : "text-faint")}>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="Points to redeem"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="0"
                      className="field-sizing-content min-w-[1.5ch] max-w-full border-0 bg-transparent p-0 text-right outline-none"
                    />
                  </span>
                </label>
                <span aria-hidden className="relative z-[1] mx-auto -my-[15px] flex size-[34px] items-center justify-center rounded-full border-4 border-surface bg-black text-accent">
                  <ArrowDown size={16} />
                </span>
                <div className="flex flex-1 items-center gap-3 rounded-2xl bg-surface-2 px-4 py-[18px]">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-positive-bg text-positive">
                    <Wallet size={18} />
                  </span>
                  <span className="text-base font-semibold">PayPal balance</span>
                  <span className={cx("num flex-1 text-right text-lg font-semibold tracking-[-0.01em]", amt ? "text-positive" : "text-faint")}>
                    {amt ? "+" : ""}
                    {money(usd)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={!amt || busy}
                onClick={async () => {
                  setBusy(true);
                  await rewards.redeem("cash", amt);
                  setInput("");
                  setBusy(false);
                }}
                className="inline-flex h-[46px] w-full items-center justify-center whitespace-nowrap rounded-full bg-white px-3.5 text-sm font-medium text-[#0a0a0a] transition hover:bg-white/90 disabled:cursor-default disabled:opacity-40"
              >
                {over ? "Not enough points" : `Redeem ${money(usd)}`}
              </button>
            </section>
          </Card>
          <span className="text-xs leading-normal text-faint">Points expire if you earn fewer than 10 points, or make fewer than 3 eligible PayPal transactions, in any 365 days.</span>
        </div>

        <div className="flex min-w-0 flex-col gap-3 @3xl:row-span-3 @3xl:grid @3xl:grid-rows-subgrid">
          <div className="flex min-h-7 items-center">
            <h2 className="text-lg font-semibold">5% category</h2>
          </div>
          <Card className="flex-1">
            <span className="text-sm leading-normal text-muted">Pick one category a month. Debit Card purchases there earn 5% back in points.</span>
            <div role="radiogroup" aria-label="Category" className="flex flex-1 flex-col gap-2">
              {REWARD_CATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={rewards.cat === c}
                  onClick={() => rewards.setCat(c)}
                  className={cx("flex min-h-11 flex-1 items-center gap-2 rounded-xl border px-3.5 text-left text-sm font-medium", rewards.cat === c ? "border-accent bg-accent-bg" : "border-border-strong bg-transparent")}
                >
                  <span className="flex-1">{c}</span>
                  <span className="text-accent">{rewards.cat === c ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Section title="Activity">
        <section aria-label="Points activity" className="overflow-hidden rounded-[20px] bg-surface py-1">
          <div role="row" className={cx(COLS, "py-2.5 text-[13px] text-faint")}>
            <span>Merchant</span>
            <span>Date</span>
            <span>Category</span>
            <span>Status</span>
            <span>Points</span>
          </div>
          {rows.map((r, i) => (
            <div key={`${cur}-${i}`} role="row" className={cx(COLS, "py-[13px]", i > 0 && "border-t border-border")}>
              <span className="flex min-w-0 items-center gap-3">
                <Logo mark={markFor(r.merchant)} size={34} />
                <span className="truncate text-[15px]">{r.merchant}</span>
              </span>
              <span className="whitespace-nowrap text-sm">{shortDate(r.date)}</span>
              <span className="truncate text-sm">{r.cat}</span>
              <span>
                <Pill tone={r.status === "Earned" ? "pos" : "neu"}>{r.status}</Pill>
              </span>
              <span className={cx("num text-[15px]", r.pts > 0 ? "text-positive" : "text-text")}>
                {r.pts > 0 ? "+" : "−"}
                {Math.abs(r.pts).toLocaleString("en-US")}
              </span>
            </div>
          ))}
        </section>
        {rewards.log.length > PG && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-faint">
            <span>
              Showing {from} to {to} of {rewards.log.length.toLocaleString("en-US")}
            </span>
            <div className="flex items-center gap-3">
              <span>
                Page {cur + 1} of {pages}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPage(cur - 1)} disabled={cur === 0} aria-label="Previous page" className={nb}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} aria-label="Next page" className={nb}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
