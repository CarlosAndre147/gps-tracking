import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { getEnv } from "@/config/env";

export function corsPlugin() {
  const env = getEnv();
  const origins = env.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const origin = origins.length === 1 ? origins[0] : origins;

  return new Elysia({ name: "cors" }).use(
    cors({
      origin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
}
