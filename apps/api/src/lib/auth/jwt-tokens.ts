/**
 * @deprecated Import from {@link ./refresh-token-jwt} or {@link ./token-digest} instead.
 * Barrel kept for a small import surface during refactors.
 */
export { signRefreshToken, verifyRefreshToken } from "@/lib/auth/refresh-token-jwt";
export { digestRefreshToken } from "@/lib/auth/token-digest";
