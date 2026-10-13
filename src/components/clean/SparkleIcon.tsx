// The AI icon: Stella's mark as a one-colour glyph, a tall four-point star with its orbit ring (see public/stella-logo.png).
// Keeps the `Sparkles` name and props so every AI button, avatar and badge picks it up.

export function Sparkles({ size = 18, strokeWidth = 1.8, className }: { size?: number; strokeWidth?: number; className?: string }) {
  // The ring stays a hairline so it reads at 14-24px.
  const ring = Math.min(1.2, Math.max(0.8, strokeWidth * 0.6));
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      {/* The top of the ring is cut where it passes behind the star, as in the logo. */}
      <path d="M2 13A10 2.7 0 0 1 5.6 10.9M18.4 10.9A10 2.7 0 0 1 22 13" stroke="currentColor" strokeWidth={ring} strokeLinecap="round" opacity="0.85" />
      <path d="M12 1.8C12.9 7.3 14.6 10.4 19.2 12C14.6 13.6 12.9 16.7 12 22.2C11.1 16.7 9.4 13.6 4.8 12C9.4 10.4 11.1 7.3 12 1.8z" fill="currentColor" />
      <path d="M2 13a10 2.7 0 0 0 20 0" stroke="currentColor" strokeWidth={ring} strokeLinecap="round" />
    </svg>
  );
}
