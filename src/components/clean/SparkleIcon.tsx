// The AI icon: Stella's mark as a one-colour glyph, a tall four-point star with its orbit ring (see public/stella-logo.png).
// Keeps the `Sparkles` name and props so every AI button, avatar and badge picks it up.

export function Sparkles({ size = 18, strokeWidth = 1.8, className }: { size?: number; strokeWidth?: number; className?: string }) {
  // The ring stays a hairline so it reads at 14-24px.
  const ring = Math.min(1.2, Math.max(0.8, strokeWidth * 0.6));
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      {/* The top of the ring is cut where it passes behind the star, as in the logo. */}
      <path d="M2 13A10 2.7 0 0 1 6.3 10.8M17.7 10.8A10 2.7 0 0 1 22 13" stroke="currentColor" strokeWidth={ring} strokeLinecap="round" opacity="0.85" />
      <path d="M12 1.8c.7 5.6 1.9 8.6 4.6 10.2-2.7 1.6-3.9 4.6-4.6 10.2-.7-5.6-1.9-8.6-4.6-10.2C10.1 10.4 11.3 7.4 12 1.8z" fill="currentColor" />
      <path d="M2 13a10 2.7 0 0 0 20 0" stroke="currentColor" strokeWidth={ring} strokeLinecap="round" />
    </svg>
  );
}
