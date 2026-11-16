import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 5 * 60 * 1000;

function secret(): string {
  const s = process.env.DOWNLOAD_URL_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("DOWNLOAD_URL_SECRET is required in production");
  return "dev-only-download-secret";
}

export interface DownloadClaims {
  g: string; // grant id
  o: string; // organization id
  u: string; // user id
  e: number; // expiry (ms epoch)
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** URL de download assinado, de curta validade (5 min). */
export function signDownload(claims: Omit<DownloadClaims, "e">, now = Date.now()): { token: string; expiresAt: Date } {
  const e = now + TTL_MS;
  const payload = Buffer.from(JSON.stringify({ ...claims, e })).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(e) };
}

export function verifyDownload(token: string, now = Date.now()): DownloadClaims | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DownloadClaims;
    return claims.e > now ? claims : null;
  } catch {
    return null;
  }
}
