import { Kind, type TObject } from "@sinclair/typebox";
import { createInsertSchema, createSelectSchema } from "drizzle-typebox";
import type { Table } from "drizzle-orm";

type SchemaLike = TObject | Table;

const isTypeBoxObject = (schema: SchemaLike): schema is TObject =>
  typeof schema === "object" && schema !== null && Kind in schema;

/**
 * Retorna sempre um schema TypeBox completo.
 * Se receber tabela Drizzle, converte via createInsertSchema/createSelectSchema.
 */
export const toSchema = <T extends SchemaLike>(schema: T, mode: "insert" | "select"): TObject => {
  if (isTypeBoxObject(schema)) return schema;
  return mode === "insert"
    ? (createInsertSchema(schema as Table) as TObject)
    : (createSelectSchema(schema as Table) as TObject);
};

export const toSchemas = <T extends Record<string, SchemaLike>>(
  models: T,
  mode: "insert" | "select",
): { [K in keyof T]: TObject } => {
  const mapped = {} as { [K in keyof T]: TObject };
  for (const key of Object.keys(models) as Array<keyof T>) {
    mapped[key] = toSchema(models[key], mode);
  }
  return mapped;
};