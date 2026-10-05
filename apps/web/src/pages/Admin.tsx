import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, patch, post } from "../lib/api.ts";
import { PageHead, Spinner, toast, toastErr } from "../components/ui.tsx";
import { minor } from "../lib/format.tsx";

export default function Admin() {
  const { t, money, rel, date } = useT(); const qc = useQueryClient();
  const { data: st, error } = useQuery({ queryKey: ["admin-stats"], queryFn: () => get("/api/admin/stats"), retry: false });
  const { data: clinics } = useQuery({ queryKey: ["admin-clinics"], queryFn: () => get<any[]>("/api/admin/clinics"), enabled: !!st });
  if (error) return <div className="alert err">{(error as Error).message}</div>;
  if (!st || !clinics) return <Spinner />;
  const upd = async (id: string, b: any) => { try { await patch(`/api/admin/clinics/${id}`, b); qc.invalidateQueries({ queryKey: ["admin-clinics"] }); toast(t("saved")); } catch (e) { toastErr(e); } };
  return <><PageHead title={t("platform_admin")} />
    <div className="grid g4" style={{ marginBottom: 14 }}>{[["clinics", st.clinics], ["active", st.active], ["trial", st.trial], ["new30", st.new30], ["users", st.users], ["leads", st.leads], ["quotes", st.quotes], ["deals", st.deals]].map(([k, v]) => <div key={k} className="card kpi"><span className="l">{t("adm_" + k)}</span><span className="v num">{v}</span></div>)}</div>
    <div className="card pad" style={{ marginBottom: 14 }}><b>MRR:</b> {st.mrr.map((m: any) => money(minor(Number(m.mrr)), m.currency)).join(" + ") || "—"}</div>
    <div className="card"><div className="twrap"><table className="tbl"><thead><tr><th>{t("clinic_name")}</th><th>Plan</th><th>{t("status")}</th><th>{t("seats")}</th><th>{t("adm_leads")}</th><th>{t("nav_quotes")} 30g</th><th>{t("last_login")}</th><th /></tr></thead><tbody>
      {clinics.map((c) => <tr key={c.id}><td><b>{c.name}</b><div className="tiny muted">{c.slug} · {c.country} · {date(c.createdAt)}</div></td>
        <td><select className="inp sm" style={{ width: "auto" }} defaultValue={c.planId} onChange={(e) => upd(c.id, { planId: e.target.value })}>{["starter", "pro", "enterprise"].map((p) => <option key={p}>{p}</option>)}</select><div className="tiny muted">{c.subStatus}{c.trialEndsAt ? " · " + date(c.trialEndsAt) : ""}</div></td>
        <td><select className="inp sm" style={{ width: "auto" }} defaultValue={c.status} onChange={(e) => upd(c.id, { status: e.target.value })}>{["trial", "active", "past_due", "suspended", "canceled"].map((s) => <option key={s}>{s}</option>)}</select></td>
        <td><input className="inp sm num" type="number" defaultValue={c.seats} style={{ width: 64 }} onBlur={(e) => +e.target.value !== c.seats && upd(c.id, { seats: +e.target.value })} /><div className="tiny muted">{c.members} {t("active").toLowerCase()}</div></td>
        <td className="num">{c.leads}</td><td className="num">{c.quotes30}</td><td className="small muted">{c.lastLogin ? rel(c.lastLogin) : "—"}</td>
        <td className="r"><button className="btn xs" onClick={() => upd(c.id, { extendTrialDays: 14 })}>+14g</button>
          <button className="btn xs" onClick={async () => { const reason = prompt(t("impersonate_reason")); if (!reason) return; await post(`/api/admin/impersonate/${c.id}`, { reason }); qc.clear(); location.href = "/"; }}>{t("impersonate")}</button></td></tr>)}</tbody></table></div></div></>;
}
