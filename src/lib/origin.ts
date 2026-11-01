type OriginEnvironment = {
  APP_ORIGIN?: string;
  NODE_ENV?: string;
  VERCEL?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
};
function configuredOrigin(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
export function allowedOrigins(
  environment: OriginEnvironment,
  host: string | null,
): Set<string> {
  const result = new Set<string>();
  const configured = configuredOrigin(environment.APP_ORIGIN);
  if (configured) result.add(configured);
  if (environment.VERCEL) {
    for (const name of [
      environment.VERCEL_URL,
      environment.VERCEL_BRANCH_URL,
      environment.VERCEL_PROJECT_PRODUCTION_URL,
    ]) {
      if (!name || name.includes("/") || name.includes("@")) continue;
      const origin = configuredOrigin(`https://${name}`);
      if (origin) result.add(origin);
    }
  } else if (environment.NODE_ENV !== "production" && host) {
    const local = configuredOrigin(`http://${host}`);
    if (
      local &&
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(local).hostname)
    )
      result.add(local);
  }
  return result;
}
export function assertRequestOrigin(
  origin: string | null,
  host: string | null,
  environment: OriginEnvironment,
) {
  if (
    !origin ||
    configuredOrigin(origin) !== origin ||
    !allowedOrigins(environment, host).has(origin)
  )
    throw new Error("Invalid request origin");
}
