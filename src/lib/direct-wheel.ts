import { API_BASE, statusSchema, wheelWithFreshness } from "./squeekchain";
// The documented, public CORS endpoint is read directly for display only.
// Nothing from this module is submitted as a prediction or race outcome.
export async function fetchDirectWheel(signal: AbortSignal) {
  const response = await fetch(`${API_BASE}/status`, {
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`Public wheel feed HTTP ${response.status}`);
  return wheelWithFreshness(statusSchema.parse(await response.json()));
}
