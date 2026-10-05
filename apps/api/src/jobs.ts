// Zamanlanmış/arka plan iş işleyicileri. Modüller kendi işleyicilerini buraya ekler.
export type JobHandler = (payload: Record<string, unknown>, clinicId: string | null) => Promise<void>;
export const handlers: Record<string, JobHandler> = {
  "webhook.dispatch": async () => {},
};
