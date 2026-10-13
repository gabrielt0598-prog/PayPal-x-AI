// The design's AI icon: a single four-point star (design/clean Icon "sparkle"), centred in its box.
// Replaces lucide's Sparkles, which draws a big and a small star.

export function Sparkles({ size = 18, strokeWidth = 1.8, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* The design's path (M12 3 … z) sits 2 units high in its box; shifted down so the star is centred. */}
      <path d="M12 5l1.8 5.4L19 12l-5.2 1.6L12 19l-1.8-5.4L5 12l5.2-1.6z" />
    </svg>
  );
}
