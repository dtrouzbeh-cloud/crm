// Düz SQL migration çalıştırıcı (owner rolüyle, her dosya tek transaction)
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error("DATABASE_OWNER_URL gerekli");
const db = postgres(url, { max: 1, onnotice: () => {} });
const dir = join(import.meta.dirname, "..", "migrations");

await db`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
const done = new Set((await db`select name from schema_migrations`).map((r) => r.name as string));
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
let n = 0;
for (const f of files) {
  if (done.has(f)) continue;
  const text = await readFile(join(dir, f), "utf8");
  process.stdout.write(`→ ${f} … `);
  await db.begin(async (tx) => {
    await tx.unsafe(text);
    await tx`insert into schema_migrations(name) values (${f})`;
  });
  console.log("ok");
  n++;
}
console.log(n ? `${n} migration uygulandı` : "Şema güncel");
await db.end();
