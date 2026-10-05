import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../../lib/i18n.tsx";
import { get, post } from "../../lib/api.ts";
import { toast, toastErr, Spinner } from "../../components/ui.tsx";
import { Icon } from "../../components/Icon.tsx";
import { useMe, useCan } from "../../lib/auth.ts";
import { catalogFromSnapshot } from "../../lib/catalog.ts";
import { QuoteBadge } from "../../lib/format.tsx";
import { translate, fmtDate } from "@dentaflow/core/i18n";
import type { Catalog } from "@dentaflow/core/engine";
import { QuoteDoc } from "./QuoteDoc.tsx";
import { buildDoc } from "./StepPricing.tsx";

export function snapshotToDoc(q: any) {
  const s = q.snapshot;
  return { number: q.number, version: q.version, created: q.createdAt, lang: s.lang, currency: s.currency, pricesHidden: s.pricesHidden, note: s.note, depositBps: s.depositBps, visits: s.visits,
    validUntil: q.validUntil ?? s.validUntil, patient: s.patient, clinic: s.clinic, staff: s.staff, situation: s.situation, gap: s.gap, options: s.options };
}
export function printDoc() { setTimeout(() => window.print(), 50); }
export function shareText(q: any, url: string, kind: "wa" | "mail") {
  const s = q.snapshot, L = s.lang;
  return translate(L, kind === "mail" ? "mail_body" : "wa_body", { name: s.patient.name.split(" ")[0], clinic: s.clinic.name, link: url, date: fmtDate(q.validUntil ?? s.validUntil, L) });
}

export default function StepReview({ data, cat, reload }: { data: any; cat: Catalog; reload: () => void }) {
  const { t, rel, date } = useT(); const can = useCan(); const { data: me } = useMe(); const qc = useQueryClient();
  const k = data.case;
  const { data: pre, refetch } = useQuery({ queryKey: ["presend", k.id, k.updatedAt], queryFn: () => get(`/api/cases/${k.id}/presend`) });
  const lastId = data.quotes?.[0]?.id;
  const { data: last } = useQuery({ queryKey: ["quote", lastId], queryFn: () => get(`/api/quotes/${lastId}`), enabled: !!lastId });
  const [busy, setBusy] = useState(false);
  const fresh = last && last.status !== "superseded" && k.status === "quoted";
  const draftDoc = useMemo(() => k.pricing ? buildDoc(cat, k, data.patient, me!.clinic, k.pricing) : null, [k, cat]);
  const doc = fresh ? snapshotToDoc(last) : draftDoc;
  const docCat = fresh ? catalogFromSnapshot(last.snapshot) : cat;
  const ready = pre?.checks?.every((c: any) => c.ok || c.warn);
  const create = async () => { setBusy(true); try { await post(`/api/cases/${k.id}/quotes`); toast(t("quote_created")); qc.invalidateQueries({ queryKey: ["quotes"] }); reload(); } catch (e: any) { toastErr(e); refetch(); } finally { setBusy(false); } };
  const shared = (ch: string) => post(`/api/quotes/${last.id}/sent-via`, { channel: ch }).catch(() => {});
  const phone = String(data.patient?.phone ?? "").replace(/\D/g, "");
  const chk: Record<string, string> = { rules: "chk_rules_ok", approval: "chk_appr_ok", banned: "chk_banned_ok", prices: "chk_prices_ok", sync: "chk_sync_ok" };
  const bad: Record<string, string> = { rules: "chk_blocks", approval: "chk_appr", banned: "chk_banned", prices: "chk_missing", sync: "plan_changed" };
  if (!doc) return <Spinner />;
  return <div className="grid ws2" style={{ gridTemplateColumns: "minmax(0,1fr) 360px", alignItems: "start" }}>
    <div className="docwrap" id="printable"><QuoteDoc d={{ ...doc, draft: !fresh }} cat={docCat} print /></div>
    <div className="col noprint" style={{ gap: 12, position: "sticky", top: 70 }}>
      {!fresh && <div className="card"><div className="hd"><h2 className="grow">{t("pre_send")}</h2></div><div className="bd col" style={{ gap: 8 }}>
        {pre?.checks?.map((c: any) => <div key={c.key} className="row small" style={{ alignItems: "flex-start" }}><span style={{ color: c.ok ? "var(--ok)" : c.warn ? "var(--warn)" : "var(--err)" }}><Icon n={c.ok ? "ok" : c.warn ? "alert" : "ban"} size={16} /></span>
          <span>{c.ok ? t(chk[c.key]!) : t(bad[c.key]!, { n: Array.isArray(c.data) ? (c.data.join(", ") || c.data.length) : c.data, w: c.data })}</span></div>)}</div></div>}
      {fresh ? <div className="card" style={{ borderColor: "var(--ok)" }}><div className="hd"><h2 className="grow" style={{ color: "var(--ok)" }}><Icon n="ok" size={18} /> {t("quote_ready", { v: last.version })}</h2><QuoteBadge s={last.status} /></div><div className="bd col">
        <div className="row"><input className="inp sm" readOnly value={last.url ?? ""} onFocus={(e) => e.target.select()} /><button className="btn sm icon" title={t("copy")} onClick={() => { navigator.clipboard.writeText(last.url); toast(t("copied")); shared("copy"); }}><Icon n="copy" /></button></div>
        <div className="grid g2">
          <a className="btn" style={{ color: "#16A34A" }} target="_blank" rel="noopener" href={`https://wa.me/${phone}?text=${encodeURIComponent(shareText(last, last.url, "wa"))}`} onClick={() => shared("whatsapp")}><Icon n="wa" />WhatsApp</a>
          <a className="btn" href={`mailto:${data.patient?.email ?? ""}?subject=${encodeURIComponent(translate(last.snapshot.lang, "mail_subj", { clinic: last.snapshot.clinic.name }))}&body=${encodeURIComponent(shareText(last, last.url, "mail"))}`} onClick={() => shared("email")}><Icon n="mail" />E-mail</a>
          <button className="btn" onClick={() => { shared("pdf"); printDoc(); }}><Icon n="print" />PDF</button>
          <a className="btn" href={last.url + "?preview=1"} target="_blank" rel="noopener"><Icon n="eye" />{t("preview")}</a></div>
        <div className="tiny muted">{t("preview_no_count")} · {t("viewed")}: {last.viewedAt ? rel(last.viewedAt) + ` (${last.viewCount}×)` : "—"} · {t("valid_until")}: {date(last.validUntil)}</div>
        <div className="row"><button className="btn sm" onClick={async () => { await post(`/api/quotes/${last.id}/extend`, { days: 7 }); qc.invalidateQueries({ queryKey: ["quote", lastId] }); toast(t("saved")); }}>{t("extend")} +7</button>
          <Link href={`/cases/${k.id}/price`} className="btn sm">{t("revise")}</Link></div>
      </div></div>
        : can("quote.send") && <div className="card"><div className="bd col"><div className="small muted">{t("send_to", { name: data.patient?.fullName })}</div>
          <button className="btn pri" style={{ height: 42 }} disabled={!ready || busy} onClick={create}><Icon n="send" />{t("create_quote")}</button>
          {!ready && pre && <div className="tiny" style={{ color: "var(--err)" }}>{t("fix_first")}</div>}<Link href={`/cases/${k.id}/price`} className="btn">← {t("step_price")}</Link></div></div>}
      {data.quotes?.length > 0 && <div className="card"><div className="hd"><h3 className="grow">{t("versions")}</h3></div><div className="bd col">{data.quotes.map((q: any) => <Link key={q.id} href={`/quotes/${q.id}`} className="row small" style={{ color: "inherit" }}><b>v{q.version}</b><span className="grow muted">{date(q.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span><QuoteBadge s={q.status} /></Link>)}</div></div>}
    </div></div>;
}
