import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../lib/i18n.tsx";
import { get, patch, post, qs } from "../lib/api.ts";
import { PageHead, Empty, Drawer, toast, toastErr, Avatar } from "../components/ui.tsx";
import { Icon } from "../components/Icon.tsx";
import { useMe, useCan } from "../lib/auth.ts";

export function TaskRow({ task }: { task: any }) {
  const { t, date } = useT(); const qc = useQueryClient();
  const over = !task.doneAt && new Date(task.dueAt) < new Date();
  const toggle = async () => { await patch(`/api/tasks/${task.id}`, { done: !task.doneAt }); qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["taskcounts"] });
    if (!task.doneAt) toast(t("task_done"), async () => { await patch(`/api/tasks/${task.id}`, { done: false }); qc.invalidateQueries({ queryKey: ["tasks"] }); }); };
  const snooze = async (m: number) => { await patch(`/api/tasks/${task.id}`, { snoozeMinutes: m }); qc.invalidateQueries({ queryKey: ["tasks"] }); };
  return <div className="titem"><span className={"check" + (task.doneAt ? " on" : "")} role="checkbox" aria-checked={!!task.doneAt} onClick={toggle}>{task.doneAt && <Icon n="ok" />}</span>
    <div className="grow"><div style={{ fontWeight: 550, ...(task.doneAt ? { textDecoration: "line-through", color: "var(--faint)" } : {}) }}>{task.title}</div>
      <div className="tiny muted row wrap" style={{ gap: 6, marginTop: 2 }}><span style={{ color: over ? "var(--err)" : undefined }}><Icon n="clock" size={12} /> {date(task.snoozedUntil ?? task.dueAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        {task.leadId && <>· <Link href={`/leads/${task.leadId}`}>{task.patientName ?? "#" + task.leadNumber}</Link></>}
        <span className={"bdg " + (task.priority === "high" ? "err" : task.priority === "med" ? "warn" : "")}>{t("p_" + task.priority)}</span>{task.auto && <span className="bdg info">{t("auto")}</span>}
        {!task.doneAt && over && <button className="btn xs ghost" onClick={() => snooze(60)}>+1s</button>}{!task.doneAt && <button className="btn xs ghost" onClick={() => snooze(60 * 24)}>+1g</button>}</div></div>
    {task.assigneeName && <Avatar name={task.assigneeName} sm />}</div>;
}

export function NewTaskDrawer({ leadId, onClose }: { leadId?: string; onClose: () => void }) {
  const { t } = useT(); const qc = useQueryClient(); const { data: me } = useMe();
  const { data: team } = useQuery({ queryKey: ["team"], queryFn: () => get("/api/team") });
  const d = new Date(Date.now() + 86400000); d.setHours(10, 0, 0, 0);
  const [f, setF] = useState({ title: "", dueAt: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16), priority: "med", assigneeId: me?.user?.id ?? "", type: "general" });
  const save = async () => { if (!f.title.trim()) return; try { await post("/api/tasks", { ...f, dueAt: new Date(f.dueAt).toISOString(), leadId: leadId ?? null }); qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["lead"] }); toast(t("saved")); onClose(); } catch (e) { toastErr(e); } };
  return <Drawer title={t("new_task")} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t("cancel")}</button><button className="btn pri" onClick={save}>{t("save")}</button></>}>
    <label className="f">{t("title")}<input className="inp" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} /></label>
    <div className="grid g2"><label className="f">{t("due")}<input className="inp" type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></label>
      <label className="f">{t("priority")}<select className="inp" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{["high", "med", "low"].map((p) => <option key={p} value={p}>{t("p_" + p)}</option>)}</select></label></div>
    <div className="grid g2"><label className="f">{t("owner")}<select className="inp" value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: e.target.value })}>{team?.members?.filter((m: any) => m.active).map((m: any) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label>
      <label className="f">Tip<select className="inp" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{["general", "call", "follow_up", "whatsapp", "email", "payment", "meeting"].map((x) => <option key={x}>{x}</option>)}</select></label></div>
  </Drawer>;
}

export default function Tasks() {
  const { t, date } = useT(); const can = useCan();
  const [who, setWho] = useState("mine"); const [view, setView] = useState<"list" | "week">("list"); const [adding, setAdding] = useState(false);
  const { data } = useQuery({ queryKey: ["tasks", who, "all"], queryFn: () => get<any[]>("/api/tasks" + qs({ who, status: "all", limit: 500 })) });
  const now = Date.now(), eod = new Date().setHours(23, 59, 59, 999);
  const due = (x: any) => new Date(x.snoozedUntil ?? x.dueAt).getTime();
  const groups: [string, (x: any) => boolean][] = [["overdue", (x) => !x.doneAt && due(x) < now], ["today", (x) => !x.doneAt && due(x) >= now && due(x) <= eod], ["upcoming", (x) => !x.doneAt && due(x) > eod], ["done", (x) => !!x.doneAt]];
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const start = d0.getTime() - ((d0.getDay() + 6) % 7) * 86400000;
  return <>
    <PageHead title={t("nav_tasks")} sub={t("tasks_sub")} actions={<>
      {can("lead.read") && <div className="seg"><button className={who === "mine" ? "on" : ""} onClick={() => setWho("mine")}>{t("mine")}</button><button className={who === "all" ? "on" : ""} onClick={() => setWho("all")}>{t("all")}</button></div>}
      <div className="seg"><button className={view === "list" ? "on" : ""} onClick={() => setView("list")}><Icon n="list" /></button><button className={view === "week" ? "on" : ""} onClick={() => setView("week")}><Icon n="cal" /></button></div>
      <button className="btn pri" onClick={() => setAdding(true)}><Icon n="plus" />{t("new_task")}</button></>} />
    {view === "list" ? (groups.map(([k, f]) => { const ls = (data ?? []).filter(f); if (!ls.length) return null;
      return <div key={k} className="card" style={{ marginBottom: 12 }}><div className="hd"><h3 className="grow" style={k === "overdue" ? { color: "var(--err)" } : undefined}>{t("g_" + k)} <span className="bdg">{ls.length}</span></h3></div>
        <div className="bd" style={{ paddingTop: 0, paddingBottom: 0 }}><div className="tlist">{ls.slice(0, k === "done" ? 30 : 200).map((x) => <TaskRow key={x.id} task={x} />)}</div></div></div>; }))
      : <div className="week">{Array.from({ length: 7 }, (_, i) => start + i * 86400000).map((ds) => <div key={ds} className={"day" + (ds === d0.getTime() ? " today" : "")}>
        <div className="small" style={{ fontWeight: 650 }}>{date(ds, { weekday: "short", day: "numeric" })}</div>
        {(data ?? []).filter((x) => due(x) >= ds && due(x) < ds + 86400000).map((x) => <div key={x.id} className="ev" style={x.doneAt ? { opacity: 0.5 } : undefined}>{x.title}<div className="tiny muted">{date(due(x), { hour: "2-digit", minute: "2-digit" })}</div></div>)}</div>)}</div>}
    {data && !data.length && <div className="card"><Empty icon="ok" text={t("no_tasks")} /></div>}
    {adding && <NewTaskDrawer onClose={() => setAdding(false)} />}
  </>;
}
