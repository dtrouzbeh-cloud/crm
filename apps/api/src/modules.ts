// Faz faz eklenen modüller burada kaydedilir
import type { FastifyInstance } from "fastify";
import { catalogRoutes } from "./routes/catalog.ts";
import { caseRoutes } from "./routes/cases.ts";
import { quoteRoutes } from "./routes/quotes.ts";
import { publicRoutes } from "./routes/public.ts";
import { dealRoutes } from "./routes/deals.ts";
import { paymentRoutes } from "./routes/payments.ts";
import { opsRoutes } from "./routes/ops.ts";
import { fileRoutes } from "./routes/files.ts";
export async function registerModules(app: FastifyInstance): Promise<void> {
  catalogRoutes(app); caseRoutes(app); quoteRoutes(app); publicRoutes(app); dealRoutes(app); paymentRoutes(app); opsRoutes(app); await fileRoutes(app);
}
