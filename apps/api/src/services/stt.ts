// Sesli mesaj dökümü: klinik (veya platform) konuşma tanıma anahtarı — OpenAI, Deepgram veya ElevenLabs
import { ownerSql } from "../db.ts";
import { getSecret } from "./secrets.ts";
import { decrypt } from "../lib/crypto.ts";
import { wa } from "./whatsapp.ts";

export async function sttConfig(clinicId: string): Promise<{ provider: string; key: string } | null> {
  if (process.env.STT_PROVIDER === "mock") return { provider: "mock", key: "x" };
  const s = await getSecret(clinicId, "stt"); if (s?.value.key) return { provider: (s.meta.provider as string) ?? "openai", key: s.value.key };
  return process.env.STT_API_KEY ? { provider: process.env.STT_PROVIDER ?? "openai", key: process.env.STT_API_KEY } : null;
}

export async function transcribe(cfg: { provider: string; key: string }, audio: Buffer, mime: string): Promise<string> {
  const ext = /ogg|opus/.test(mime) ? "ogg" : /mpeg|mp3/.test(mime) ? "mp3" : /mp4|m4a|aac/.test(mime) ? "m4a" : /wav/.test(mime) ? "wav" : "ogg";
  const sig = AbortSignal.timeout(60_000);
  if (cfg.provider === "mock") return "Hello, I would like to know the price for implants.";
  if (cfg.provider === "deepgram") {
    const r = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&detect_language=true&smart_format=true", { method: "POST", headers: { Authorization: `Token ${cfg.key}`, "Content-Type": mime.split(";")[0]! }, body: new Uint8Array(audio), signal: sig });
    const j: any = await r.json(); if (!r.ok) throw new Error(`deepgram_${r.status}: ${j?.err_msg ?? ""}`); return j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  }
  const fd = new FormData(); fd.append("file", new Blob([new Uint8Array(audio)], { type: mime.split(";")[0] }), `voice.${ext}`);
  if (cfg.provider === "elevenlabs") {
    fd.append("model_id", "scribe_v1");
    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": cfg.key }, body: fd, signal: sig });
    const j: any = await r.json(); if (!r.ok) throw new Error(`elevenlabs_${r.status}: ${JSON.stringify(j?.detail ?? "").slice(0, 200)}`); return j.text ?? "";
  }
  fd.append("model", process.env.STT_MODEL ?? "whisper-1");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${cfg.key}` }, body: fd, signal: sig });
  const j: any = await r.json(); if (!r.ok) throw new Error(`openai_${r.status}: ${j?.error?.message ?? ""}`); return j.text ?? "";
}

/** İş: WhatsApp sesli mesajını indir → yazıya dök → mesaj gövdesine yaz → AI'ı (koç/cevap) kuyruğa al */
export async function transcribeMessage(messageId: number) {
  const [m] = await ownerSql`select m.id, m.clinic_id, m.conversation_id, m.media, m.body, a.access_token_enc, cv.channel from messages m join conversations cv on cv.id = m.conversation_id join channel_accounts a on a.id = cv.account_id where m.id = ${messageId}`;
  if (!m || m.body) return;
  const cfg = await sttConfig(m.clinicId as string);
  const { queueAi } = await import("./ai/agent.ts");
  if (!cfg) { await queueAi(m.clinicId as string, m.conversationId as string); return; }
  const media = (m.media ?? {}) as { id?: string; mime?: string };
  let buf: Buffer, mime = media.mime ?? "audio/ogg";
  if (cfg.provider === "mock") buf = Buffer.from("x");
  else {
    if (!media.id || !m.accessTokenEnc) return;
    const token = decrypt(m.accessTokenEnc as string); const info: any = await wa.media(token, media.id);
    const r = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) }); if (!r.ok) throw new Error("media_download_" + r.status);
    buf = Buffer.from(await r.arrayBuffer()); mime = info.mime_type ?? mime;
    if (buf.length > 20 * 1024 * 1024) return;
  }
  const text = (await transcribe(cfg, buf, mime)).trim(); if (!text) return;
  await ownerSql`update messages set body = ${"🎤 " + text.slice(0, 3900)}, media = coalesce(media, '{}'::jsonb) || '{"transcribed":true}'::jsonb where id = ${messageId}`;
  await ownerSql`update conversations set last_preview = ${("🎤 " + text).slice(0, 120)} where id = ${m.conversationId}`;
  await ownerSql`insert into outbox_events (clinic_id, type, entity_id, payload) values (${m.clinicId}, 'chat.transcribed', ${m.conversationId}, ${ownerSql.json({ conversationId: m.conversationId } as never)})`;
  await queueAi(m.clinicId as string, m.conversationId as string);
}
