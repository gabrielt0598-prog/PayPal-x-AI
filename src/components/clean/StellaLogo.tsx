// The Stella app mark (navy tile, four-point star with an orbit ring). Replaces the old PayPal "P" tile.

export function StellaLogo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static logo
    <img src="/stella-logo.png" alt="" aria-hidden width={size} height={size} className={className ?? "shrink-0"} style={{ width: size, height: size }} />
  );
}
