// The AI icon: Stella's mark as a one-colour glyph, a four-point star with its orbit ring (see public/stella-logo.png).
// Keeps the `Sparkles` name and props so every AI button, avatar and badge picks it up.

export function Sparkles({ size = 18, strokeWidth = 1.8, className }: { size?: number; strokeWidth?: number; className?: string }) {
  // The ring scales with the icon's stroke setting but stays a hairline so it reads at 14-24px.
  const ring = Math.min(1.2, Math.max(0.7, strokeWidth * 0.55));
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <ellipse cx="12" cy="12.6" rx="9.4" ry="2.7" stroke="currentColor" strokeWidth={ring} opacity="0.85" />
      <path d="M12 3.6c.9 4.6 2.5 6.9 6.4 8.4-3.9 1.5-5.5 3.8-6.4 8.4-.9-4.6-2.5-6.9-6.4-8.4C9.5 10.5 11.1 8.2 12 3.6z" fill="currentColor" />
      <path d="M2.6 12.6a9.4 2.7 0 0 0 18.8 0" stroke="currentColor" strokeWidth={ring} strokeLinecap="round" />
    </svg>
  );
}
