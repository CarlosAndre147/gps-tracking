import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "@/config/env";

const textEncoder = new TextEncoder();

function getRefreshKey(): Uint8Array {
  return textEncoder.encode(getEnv().REFRESH_SECRET);
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .setJti(crypto.randomUUID())
    .sign(getRefreshKey());
}

export async function verifyRefreshToken(token: string): Promise<{ sub: string; jti: string }> {
  const { payload } = await jwtVerify(token, getRefreshKey(), {
    algorithms: ["HS256"],
  });
  const sub = typeof payload.sub === "string" ? payload.sub : undefined;
  const jti = typeof payload.jti === "string" ? payload.jti : undefined;
  if (!sub || !jti) {
    throw new Error("Invalid refresh token payload");
  }
  return { sub, jti };
}
