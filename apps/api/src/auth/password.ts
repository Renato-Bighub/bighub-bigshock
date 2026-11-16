import { hash, verify } from "@node-rs/argon2";

// Argon2id (default). Hash de equalização de tempo quando o utilizador não existe.
let dummy: Promise<string> | undefined;

export const hashPassword = (password: string) => hash(password);

export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (!stored) {
    dummy ??= hash("dummy-password-for-timing");
    await verify(await dummy, password).catch(() => false);
    return false;
  }
  return verify(stored, password).catch(() => false);
}
