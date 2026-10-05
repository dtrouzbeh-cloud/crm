import { Link, useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../../lib/i18n.tsx";
import { get, patch, post } from "../../lib/api.ts";
import { Spinner, ErrorBox, Avatar, toast, toastErr } from "../../components/ui.tsx";
import { Icon } from "../../components/Icon.tsx";
import { useCan } from "../../lib/auth.ts";
import { useCatalog } from "../../lib/catalog.ts";
import { CaseBadge, flag } from "../../lib/format.tsx";
import StepSituation from "./StepSituation.tsx";
import StepPlan from "./StepPlan.tsx";
import StepPricing from "./StepPricing.tsx";
import StepReview from "./StepReview.tsx";

const STEPS = ["situation", "plan", "price", "send"] as const;

export default function CaseWorkspace() {
  const { id, step: stepParam } = useParams<{ id: string; step?: string }>(); const { t } = useT(); const can = useCan(); const [, nav] = useLocation(); const qc = useQueryClient();
  const { data, error, refetch } = useQuery({ queryKey: ["case", id], queryFn: () => get(`/api/cases/${id}`) });
  const { cat } = useCatalog();
  const { data: team } = useQuery({ queryKey: ["team"], queryFn: () => get("/api/team") });
  if (error) return <ErrorBox error={error} retry={refetch} />;
  if (!data || !cat) return <Spinner />;
  const k = data.case, p = data.patient, med = data.medical;
  const priced = !["pool", "awaiting_info"].includes(k.status);
  const lock = (s: string) => (s === "price" || s === "send") && (!priced || !can("quote.price"));
  let step = (STEPS as readonly string[]).includes(stepParam ?? "") ? stepParam! : k.situationDone ? (priced && can("quote.price") ? (k.status === "quoted" ? "send" : "price") : "plan") : "situation";
  if (lock(step)) step = "plan";
  const go = (s: string) => nav(`/cases/${id}/${s}`);
  const reload = () => qc.invalidateQueries({ queryKey: ["case", id] });
  const setDentist = async (v: string) => { try { await patch(`/api/cases/${id}`, { dentistId: v || null }); reload(); toast(t("saved")); } catch (e) { toastErr(e); } };
  const claim = async () => { try { await post(`/api/cases/${id}/claim`); reload(); toast(t("claimed")); } catch (e) { toastErr(e); } };
  return <>
    <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
      <Link href="/cases" className="btn ghost sm"><Icon n="back" className="flip" />{t("nav_cases")}</Link>
      <div className="grow row wrap" style={{ gap: 10 }}><Avatar name={p?.fullName} /><div><div className="row"><h1 style={{ fontSize: 19 }}>{p?.fullName}</h1><CaseBadge s={k.status} /><span className="tiny faint">#{k.number}</span></div>
        <div className="tiny muted row wrap" style={{ gap: 8 }}><Link href={`/leads/${p?.leadId}`}>{t("lead")} #{p?.leadNumber}</Link><span>{flag(p?.country)} {med?.age ? med.age + " " + t("yrs") : ""}</span>
          {med?.flags?.length ? <span className="bdg err"><Icon n="alert" size={12} /> {med.flags.map((f: string) => t("med_" + f)).join(", ")}{med.medications ? " · " + med.medications : ""}</span> : null}
          {data.deal && <Link href={`/deals/${data.deal.id}`} className="bdg ok">{t("deal")} #{data.deal.number}</Link>}</div></div></div>
      <label className="row small muted" style={{ gap: 6 }}>{t("dentist")}<select className="inp sm" style={{ width: "auto" }} value={k.dentistId ?? ""} disabled={!can("case.write")} onChange={(e) => setDentist(e.target.value)}>
        <option value="">—</option>{team?.members?.filter((m: any) => m.active && ["dentist", "admin"].includes(m.role)).map((m: any) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label>
      {!k.dentistId && can("case.diagnose") && <button className="btn sm" onClick={claim}>{t("take_case")}</button>}
    </div>
    <div className="stepper" style={{ marginBottom: 14 }}>{STEPS.map((s, i) => {
      const done = (s === "situation" && k.situationDone) || (s === "plan" && priced) || (s === "price" && ["quoted", "accepted"].includes(k.status));
      return <a key={s} onClick={() => !lock(s) && go(s)} className={(s === step ? "on " : "") + (done ? "done " : "") + (lock(s) ? "lock" : "")} style={{ cursor: "pointer" }}><i>{done && s !== step ? "✓" : i + 1}</i>{t("step_" + (s === "price" ? "price" : s === "send" ? "send" : s === "plan" ? "plan" : "sit"))}</a>; })}</div>
    {step === "situation" && <StepSituation data={data} cat={cat} onDone={() => { reload(); go("plan"); }} />}
    {step === "plan" && <StepPlan key={k.planRevision} data={data} cat={cat} onDiagnosed={() => { reload(); qc.invalidateQueries({ queryKey: ["cases"] }); if (can("quote.price")) go("price"); }} reload={reload} />}
    {step === "price" && k.pricing && <StepPricing data={data} cat={cat} reload={reload} onNext={() => go("send")} />}
    {step === "send" && <StepReview data={data} cat={cat} reload={reload} />}
  </>;
}
