import { randomUUID } from "node:crypto";
import { pgTable, text, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { users } from "./users";

export const locations = pgTable("Location", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  accuracy: doublePrecision("accuracy"),
  speed: doublePrecision("speed"),
  heading: doublePrecision("heading"),
  altitude: doublePrecision("altitude"),
  createdAt: timestamp("createdAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
});

export const trackingSessions = pgTable("TrackingSession", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("startedAt", { precision: 3, mode: "date" }).notNull().defaultNow(),
  stoppedAt: timestamp("stoppedAt", { precision: 3, mode: "date" }),
  source: text("source").notNull().default("web"),
});
