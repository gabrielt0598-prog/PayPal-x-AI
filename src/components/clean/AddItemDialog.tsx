"use client";

// "Add an item": paste a product link, Stella reads the page (server side) and builds a listing; adding it puts the
// item on the Essentials grid. The listing arrives signed by the server, so the price can't be changed here.

import { useState } from "react";
import type { SignedListing } from "@/lib/services/linkReader";
import { Btn, Modal, money } from "./ui";

export function AddItemDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (l: SignedListing) => void }) {
  const [url, setUrl] = useState("");
  const [listing, setListing] = useState<SignedListing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imgFailed, setImgFailed] = useState(false);

  const build = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError("");
    setListing(null);
    setImgFailed(false);
    try {
      const res = await fetch("/api/essentials/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const data = (await res.json().catch(() => ({}))) as { listing?: SignedListing; error?: string };
      if (!res.ok || !data.listing) throw new Error(data.error ?? "Couldn't read that page");
      setListing(data.listing);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that page");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label="Add an item" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (listing) onAdd(listing);
          else void build();
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-[13px] leading-normal text-muted">Paste a link to any product. Stella reads the page and builds a listing you can pay for with PayPal.</p>
        <label className="flex h-11 items-center gap-2.5 rounded-[10px] border border-border-strong bg-surface-2 px-3.5 focus-within:border-accent/60">
          <span className="text-[13px] text-faint">Link</span>
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setListing(null);
              setError("");
            }}
            placeholder="https://"
            aria-label="Product link"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm !outline-none placeholder:text-faint"
          />
        </label>
        {!url && (
          <button type="button" onClick={() => setUrl(`${window.location.origin}/demo/products/linen-napkins-4`)} className="self-start text-[13px] text-accent hover:underline">
            Use a sample link
          </button>
        )}
        {error && (
          <p role="alert" className="rounded-[10px] bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning">
            {error}
          </p>
        )}
        {listing && (
          <div className="m-pop flex items-center gap-3.5 rounded-[10px] border border-border bg-surface-2 p-3.5">
            <div className="flex size-[88px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-surface-3">
              {listing.imageUrl && !imgFailed ? (
                // eslint-disable-next-line @next/next/no-img-element -- product photo from the store's own page
                <img src={listing.imageUrl} alt="" onError={() => setImgFailed(true)} className="size-full object-cover" />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[15px] font-semibold leading-snug">{listing.title}</span>
              <span className="truncate text-xs text-faint">{listing.store} · read from the page</span>
              <span className="num text-lg font-semibold">{money(listing.price)}</span>
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" type="submit" disabled={busy || !url.trim()}>
            {busy ? "Reading the page…" : listing ? "Add to Essentials" : "Build listing"}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
