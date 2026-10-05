// Anlık güncelleme: SSE (/api/rt) — olaylarda ilgili sorguları yeniler, bildirimde tost + (tercihe göre) tarayıcı bildirimi ve ses
import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { get } from "./api.ts";
import { toast } from "../components/ui.tsx";

// olay türü öneki → yenilenecek sorgu anahtarları
const MAP: [RegExp, string[][]][] = [
  [/^lead\./, [["leads"], ["leadstats"], ["lead"], ["dashboard"]]],
  [/^case\./, [["cases"], ["dashboard"]]],
  [/^quote\./, [["quotes"], ["quote"], ["cases"], ["lead"], ["dashboard"], ["quotes-live"], ["engagement"], ["call-list"]]],
  [/^(deal|payment)\./, [["deals"], ["deal"], ["fin-summary"], ["commissions"], ["my-commissions"]]],
  [/^wa\.|^message\.|^chat\.|^ai\./, [["convs"], ["conv"], ["inboxunread"], ["conv-ai"], ["conv-coach"], ["call-list"]]],
  [/^task\./, [["tasks"], ["taskcounts"]]],
  [/^form\./, [["forms"], ["lead"]]],
  [/^visit\./, [["deals"], ["interp"]]],
];

let prefsCache: { browser?: boolean; sound?: boolean } | null = null;
export const setRtPrefs = (p: { browser?: boolean; sound?: boolean }) => { prefsCache = p; };

function beep() {
  try { const ctx = new AudioContext(); const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.setValueAtTime(0.08, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35); o.start(); o.stop(ctx.currentTime + 0.35); } catch { /* yok */ }
}

function handle(qc: QueryClient, m: any, nav: (to: string) => void) {
  if (m.k === "n") {
    qc.invalidateQueries({ queryKey: ["notifs"] });
    toast("🔔 " + m.title);
    if (prefsCache?.sound) beep();
    if (prefsCache?.browser && document.hidden && "Notification" in window && Notification.permission === "granted") {
      const n = new Notification("DentaFlow", { body: m.title, tag: m.id });
      n.onclick = () => { window.focus(); if (m.link) nav(m.link); n.close(); };
    }
  } else if (m.k === "e") {
    for (const [re, keys] of MAP) if (re.test(m.t)) for (const k of keys) qc.invalidateQueries({ queryKey: k });
  }
}

export function useRealtime(nav: (to: string) => void) {
  const qc = useQueryClient();
  useEffect(() => {
    get("/api/me/notify-prefs").then((r) => setRtPrefs(r.prefs ?? {})).catch(() => {});
    let es: EventSource | null = null, stop = false, retry = 1000;
    const open = () => {
      if (stop) return;
      es = new EventSource("/api/rt", { withCredentials: true });
      es.onmessage = (ev) => { retry = 1000; try { handle(qc, JSON.parse(ev.data), nav); } catch { /* bozuk */ } };
      // bağlantı koptuğunda: kaçırılanlar için listeleri yenile, artan beklemeyle yeniden bağlan
      es.onerror = () => { es?.close(); if (stop) return; setTimeout(() => { qc.invalidateQueries(); open(); }, retry); retry = Math.min(retry * 2, 30_000); };
    };
    open();
    return () => { stop = true; es?.close(); };
  }, []);
}
