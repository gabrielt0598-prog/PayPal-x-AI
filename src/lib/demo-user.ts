// The demo user's delivery address: the sandbox buyer account's profile (John Doe, San Jose).
export const SHIP_TO = { name: "John Doe", line1: "2211 N First St", city: "San Jose", state: "CA", postalCode: "95131", country: "US" } as const;

// Essentials orders: sales tax estimate and free-shipping threshold (shared by the order sheet and the PayPal order).
export const TAX_RATE = 0.08625;
export const FREE_SHIPPING_OVER = 35;
export const SHIPPING_FEE = 5.99;

/** Items subtotal (USD) -> tax, shipping and total, rounded to cents. */
export function priceOrder(sub: number) {
  const subtotal = Math.round(sub * 100) / 100;
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  const ship = subtotal <= 0 || subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FEE;
  return { sub: subtotal, tax, ship, total: Math.round((subtotal + tax + ship) * 100) / 100 };
}
