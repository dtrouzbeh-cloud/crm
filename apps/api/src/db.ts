import postgres from "postgres";
import { config } from "./config.ts";

// app: RLS'e tabi uygulama rolü. owner: migration, kimlik doğrulama ve platform işleri.
export const sql = postgres(config.databaseUrl, { max: 10, idle_timeout: 30, transform: postgres.camel });
export const ownerSql = postgres(config.databaseOwnerUrl, { max: 4, idle_timeout: 30, transform: postgres.camel });

export type Tx = postgres.TransactionSql<Record<string, unknown>>;

/** Klinik bağlamında transaction: RLS için app.clinic_id atanır. */
export async function withClinic<T>(clinicId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.clinic_id', ${clinicId}, true)`;
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}
