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
import { inboxRoutes } from "./routes/inbox.ts";
import { integrationRoutes } from "./routes/integrations.ts";
import { saasRoutes } from "./routes/saas.ts";
import { reportRoutes } from "./routes/reports.ts";
import { formRoutes } from "./routes/forms.ts";
import { financeRoutes } from "./routes/finance.ts";
import { amendmentRoutes } from "./routes/amendments.ts";
import { interpreterRoutes } from "./routes/interpreter.ts";
import { recordRoutes } from "./routes/records.ts";
import { realtimeRoutes } from "./routes/realtime.ts";
import { pipelineRoutes } from "./routes/pipelines.ts";
export async function registerModules(app: FastifyInstance): Promise<void> {
  catalogRoutes(app); caseRoutes(app); quoteRoutes(app); publicRoutes(app); dealRoutes(app); paymentRoutes(app); opsRoutes(app); await fileRoutes(app); inboxRoutes(app); integrationRoutes(app); saasRoutes(app); reportRoutes(app); formRoutes(app); financeRoutes(app); amendmentRoutes(app); interpreterRoutes(app); recordRoutes(app); realtimeRoutes(app); pipelineRoutes(app);
}
