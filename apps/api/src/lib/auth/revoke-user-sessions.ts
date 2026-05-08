import { and, eq, isNull } from "drizzle-orm";
import { refreshTokens } from "../../../drizzle/schema";
import type { DbTransaction } from "@/lib/core/db";

export async function revokeAllUserRefreshTokens(tx: DbTransaction, userId: string): Promise<void> {
  await tx
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
