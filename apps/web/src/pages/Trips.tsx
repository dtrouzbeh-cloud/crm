import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, patch } from "../lib/api.ts";
import { PageHead, Spinner, Empty, Avatar } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { flag } from "../lib/format.tsx";

export default function Trips() {
  const { t, date } = useT(); const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["tripsboard"], queryFn: () => get("/api/trips/board?days=60"), refetchInterval: 60_000 });
  if (!data) return <Spinner />;
  const now = Date.now(), d7 = now + 7 * 86400000;
  const groups: [string, (v: any) => boolean][] = [["g_today", (v) => v.arrivalAt && new Date(v.arrivalAt).toDateString() === new Date().toDateString()], ["next7", (v) => v.arrivalAt && new Date(v.arrivalAt).getTime() > now && new Date(v.arrivalAt).getTime() < d7 && new Date(v.arrivalAt).toDateString() !== new Date().toDateString()], ["later", (v) => v.arrivalAt && new Date(v.arrivalAt).getTime() >= d7], ["no_date", (v) => !v.arrivalAt]];
  return <><PageHead title={t("nav_trips")} sub={t("trips_sub")} />
    <div className="grid ws2" style={{ gridTemplateColumns: "minmax(0,1fr) 340px", alignItems: "start" }}>
      <div className="col" style={{ gap: 12 }}>{groups.map(([k, f]) => { const ls = data.visits.filter(f); if (!ls.length) return null;
        return <div key={k} className="card"><div className="hd"><h3 className="grow">{t(k)}</h3><span className="bdg">{ls.length}</span></div><div className="twrap"><table className="tbl"><tbody>{ls.map((v: any) => <tr key={v.dealId + v.visitNo}>
          <td><div className="row"><Avatar name={v.fullName} sm /><div><Link href={`/deals/${v.dealId}`}><b>{v.fullName}</b></Link><div className="tiny muted">{flag(v.country)} {v.language ?? ""} · {v.phone ?? ""}{v.companions ? ` · +${v.companions}` : ""}</div></div></div></td>
          <td className="small"><span className="bdg">V{v.visitNo}</span> {v.arrivalAt ? date(v.arrivalAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
          <td className="small">{v.flight?.outbound?.no ? `✈ ${v.flight.outbound.no}` : ""} {v.hotel?.name ? `🏨 ${v.hotel.name}` : ""}</td>
          <td>{v.missing.length ? v.missing.map((m: string) => <span key={m} className="bdg warn" style={{ marginInlineEnd: 4 }}>{t("miss_" + m)}</span>) : <span className="bdg ok">✓ {t("ready")}</span>}</td></tr>)}</tbody></table></div></div>; })}
        {!data.visits.length && <div className="card"><Empty icon="plane" text={t("no_trips")} /></div>}</div>
      <div className="card"><div className="hd"><h3 className="grow">🚐 {t("transfers")}</h3><span className="bdg">{data.runs.length}</span></div><div className="bd col">{data.runs.length ? data.runs.map((r: any) => <div key={r.id} className="row small" style={{ alignItems: "flex-start" }}>
        <b className="num" style={{ minWidth: 92 }}>{date(r.runAt, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</b><div className="grow">{r.fullName}<div className="tiny muted">{t("leg_" + r.leg)} · {r.driverName ?? "—"} {r.driverPhone ?? ""}</div></div>
        <button className={"btn xs " + (r.status === "done" ? "" : "ghost")} onClick={async () => { await patch(`/api/runs/${r.id}`, { status: r.status === "done" ? "planned" : "done" }); qc.invalidateQueries({ queryKey: ["tripsboard"] }); }}>{r.status === "done" ? "✓" : t("mark_done")}</button></div>) : <div className="empty small">—</div>}</div></div>
    </div></>;
}
