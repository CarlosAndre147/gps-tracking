import { createHash } from "node:crypto";

/** SHA-256 hex digest of the raw refresh JWT (never store the raw token in the database). */
export function digestRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}
