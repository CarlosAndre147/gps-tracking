import { t, status } from "elysia";
import type { TNumber } from "@sinclair/typebox";
import { drizzleModels } from "../../../drizzle/models";
import { ForbiddenError, type AuthUserPayload } from "@/lib/core";

function assertCanUseTracking(authUser: AuthUserPayload): void {
  if (authUser.role === "USER" || authUser.role === "COMPANY_ADMIN") return;
  throw new ForbiddenError("Tracking is only available for USER or COMPANY_ADMIN");
}

/* Reaproveita schemas drizzle-typebox (lat/lng com bounds derivados do model). */
const locationInsert = drizzleModels.insert.location;
const locationLat = locationInsert.properties.lat as TNumber;
const locationLng = locationInsert.properties.lng as TNumber;

export const startTrackingBody = t.Object({
  companyId: t.Optional(t.String()),
});

export const locationBody = t.Object({
  lat: locationLat,
  lng: locationLng,
  accuracy: t.Optional(t.Number()),
  speed: t.Optional(t.Number()),
  heading: t.Optional(t.Number()),
  altitude: t.Optional(t.Number()),
});

export const trackingHistoryQuery = t.Object({
  page: t.Optional(t.Numeric({ default: 1 })),
  limit: t.Optional(t.Numeric({ default: 20 })),
});

export const trackingAuth = {
  auth: true as const,
  beforeHandle({ authUser }: { authUser?: AuthUserPayload }) {
    if (!authUser) return status(401, "Unauthorized");
    assertCanUseTracking(authUser);
  },
};
