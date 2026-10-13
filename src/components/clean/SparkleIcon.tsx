// The AI icon: the four-point star from Stella's mark as a one-colour glyph (the logo's orbit ring is left off at icon sizes).
// Keeps the `Sparkles` name and props so every AI button, avatar and badge picks it up.

export function Sparkles({ size = 18, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 2.6c1 5.2 2.9 7.8 7.4 9.4-4.5 1.6-6.4 4.2-7.4 9.4-1-5.2-2.9-7.8-7.4-9.4C9.1 10.4 11 7.8 12 2.6z" fill="currentColor" />
    </svg>
  );
}
