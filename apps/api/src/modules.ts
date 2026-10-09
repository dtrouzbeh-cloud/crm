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
import { reportRoutes, salesReportRoutes } from "./routes/reports.ts";
import { formRoutes } from "./routes/forms.ts";
import { financeRoutes, referralRoutes } from "./routes/finance.ts";
import { amendmentRoutes } from "./routes/amendments.ts";
import { interpreterRoutes } from "./routes/interpreter.ts";
import { recordRoutes } from "./routes/records.ts";
import { realtimeRoutes } from "./routes/realtime.ts";
import { pipelineRoutes } from "./routes/pipelines.ts";
import { sequenceRoutes } from "./routes/sequences.ts";
import { recallRoutes } from "./routes/recalls.ts";
import { clinicalRoutes } from "./routes/clinical.ts";
import { aiRoutes } from "./routes/ai.ts";
import { widgetRoutes, metaMessagingRoutes } from "./routes/widget.ts";
import { adsRoutes } from "./routes/ads.ts";
import { campaignRoutes } from "./routes/campaigns.ts";
import { landingRoutes } from "./routes/landing.ts";
import { aiPlusRoutes } from "./routes/aiplus.ts";
import { voiceRoutes } from "./routes/voice.ts";
export async function registerModules(app: FastifyInstance): Promise<void> {
  catalogRoutes(app); caseRoutes(app); quoteRoutes(app); publicRoutes(app); dealRoutes(app); paymentRoutes(app); opsRoutes(app); await fileRoutes(app); inboxRoutes(app); integrationRoutes(app); saasRoutes(app); reportRoutes(app); salesReportRoutes(app); formRoutes(app); financeRoutes(app); referralRoutes(app); amendmentRoutes(app); interpreterRoutes(app); recordRoutes(app); realtimeRoutes(app); pipelineRoutes(app); sequenceRoutes(app); recallRoutes(app); clinicalRoutes(app); aiRoutes(app); widgetRoutes(app); metaMessagingRoutes(app); adsRoutes(app); campaignRoutes(app); landingRoutes(app); aiPlusRoutes(app); voiceRoutes(app);
}
