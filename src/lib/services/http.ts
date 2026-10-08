// Tiny helpers shared by the integration route handlers (validation + uniform JSON errors).
import type { z } from "zod";

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return Response.json({ error, ...extra }, { status });
}

/** Parse + validate a JSON request body. Returns data, or a ready-to-return 400 Response. */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<{ data: z.infer<T> } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: jsonError(400, "Request body must be valid JSON") };
  }
  return validate(schema, raw);
}

export function validate<T extends z.ZodType>(schema: T, raw: unknown): { data: z.infer<T> } | { response: Response } {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { response: jsonError(400, "Invalid request", { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }) };
  }
  return { data: parsed.data };
}
