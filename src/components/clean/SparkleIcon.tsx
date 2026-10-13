// The AI icon: Stella's mark as a one-colour glyph, a tall four-point star with its orbit ring (see public/stella-logo.png).
// Keeps the `Sparkles` name and props so every AI button, avatar and badge picks it up.

export function Sparkles({ size = 18, strokeWidth = 1.8, className }: { size?: number; strokeWidth?: number; className?: string }) {
  // The ring stays a hairline so it reads at 14-24px.
  const ring = Math.min(1.2, Math.max(0.8, strokeWidth * 0.6));
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <ellipse cx="12" cy="13" rx="10" ry="2.7" stroke="currentColor" strokeWidth={ring} opacity="0.85" />
      <path d="M12 1.8c.7 5.6 1.9 8.6 4.6 10.2-2.7 1.6-3.9 4.6-4.6 10.2-.7-5.6-1.9-8.6-4.6-10.2C10.1 10.4 11.3 7.4 12 1.8z" fill="currentColor" />
      <path d="M2 13a10 2.7 0 0 0 20 0" stroke="currentColor" strokeWidth={ring} strokeLinecap="round" />
    </svg>
  );
}
