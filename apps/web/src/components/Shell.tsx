import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "./Icon.tsx";
import { Avatar } from "./ui.tsx";
import { useT } from "../lib/i18n.tsx";
import { useMe, useCan } from "../lib/auth.ts";
import { useRealtime } from "../lib/realtime.ts";
import { registerSalesStages } from "../lib/format.tsx";
import { get, post, qs } from "../lib/api.ts";
import { LANG_NAMES } from "@dentaflow/core/i18n";
import { StageBadge, flag } from "../lib/format.tsx";
import type { PermKey } from "@dentaflow/core/permissions";

type NavItem = { sec?: string; id?: string; ic?: string; to?: string; perm?: PermKey; soon?: boolean; badge?: number };

export function Shell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useT();
  const { data: me } = useMe();
  const can = useCan();
  const [loc, nav] = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: tc } = useQuery({ queryKey: ["taskcounts"], queryFn: () => get("/api/tasks/counts"), refetchInterval: 60_000 });
  const { data: cc } = useQuery({ queryKey: ["casecounts"], queryFn: () => get("/api/cases?limit=1"), enabled: can("case.read"), refetchInterval: 120_000 });
  const { data: ib } = useQuery({ queryKey: ["inboxunread"], queryFn: () => get("/api/inbox/unread"), enabled: can("inbox.use"), refetchInterval: 120_000 });
  const { data: bill } = useQuery({ queryKey: ["billing"], queryFn: () => get("/api/billing"), staleTime: 10 * 60_000 });
  const [theme, setTheme] = useState(() => localStorage.getItem("df_theme") || "auto");
  useEffect(() => { const r = document.documentElement; if (theme === "auto") delete r.dataset.theme; else r.dataset.theme = theme; localStorage.setItem("df_theme", theme); }, [theme]);
  useEffect(() => { if (me?.clinic?.brandColor) { const r = document.documentElement; r.style.setProperty("--brand", me.clinic.brandColor); r.style.setProperty("--brand-soft", `color-mix(in srgb, ${me.clinic.brandColor} 13%, var(--card))`); } }, [me?.clinic?.brandColor]);
  useEffect(() => setOpen(false), [loc]);
  useRealtime(nav);
  const { data: pls } = useQuery({ queryKey: ["pipelines"], queryFn: () => get<any[]>("/api/pipelines"), enabled: can("lead.read"), staleTime: 60_000 });
  useEffect(() => { const sales = pls?.find((p) => p.kind === "sales"); if (sales) registerSalesStages(sales.stages); }, [pls]);

  const NAV: NavItem[] = [
    { sec: "sec_work" }, { id: "dash", ic: "dash", to: "/" }, { id: "tasks", ic: "tasks", to: "/tasks", badge: tc?.today }, { id: "inbox", ic: "inbox", to: "/inbox", perm: "inbox.use", badge: ib?.n },
    { sec: "sec_sales" }, { id: "leads", ic: "users", to: "/leads", perm: "lead.read" }, { id: "pipelines", ic: "kanban", to: "/pipelines", perm: "lead.read" }, { id: "sequences", ic: "spark", to: "/sequences", perm: "lead.read" }, { id: "quotes", ic: "file", to: "/quotes", perm: "case.read" }, { id: "deals", ic: "deal", to: "/deals", perm: "deal.read" }, { id: "finance", ic: "card", to: "/finance", perm: (can("finance.view") ? "finance.view" : "payment.record") as any },
    { sec: "sec_clinic" }, { id: "cases", ic: "tooth", to: "/cases", perm: "case.read", badge: cc?.counts?.pool }, { id: "reception", ic: "desk", to: "/reception", perm: "appointment.read" }, { id: "trips", ic: "plane", to: "/trips", perm: "trip.manage" }, { id: "interpreter", ic: "globe", to: "/interpreter", perm: "appointment.read" }, { id: "clinical", ic: "tooth", to: "/clinical", perm: "case.read" },
    { sec: "sec_setup" }, { id: "catalog", ic: "book", to: "/catalog", perm: "catalog.manage" }, { id: "analytics", ic: "chart", to: "/reports", perm: "reports.view" }, { id: "settings", ic: "gear", to: "/settings", perm: "settings.manage" },
  ];
  const active = (to?: string) => to && (to === "/" ? loc === "/" : loc.startsWith(to));
  const switchClinic = async (id: string) => { await post("/api/auth/switch-clinic", { clinicId: id }); qc.clear(); nav("/"); };
  const logout = async () => { await post("/api/auth/logout"); qc.clear(); location.href = "/login"; };

  return <div className="app">
    {open && <div className="scrim" style={{ zIndex: 29 }} onClick={() => setOpen(false)} />}
    <aside className={"side" + (open ? " open" : "")}>
      <div className="logo"><i><Icon n="tooth" /></i><span>Denta<b>Flow</b></span></div>
      {me && me.clinics.length > 1 ? <div style={{ padding: "0 12px 6px" }}><select className="inp sm" value={me.clinic?.id} onChange={(e) => switchClinic(e.target.value)}>{me.clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        : <div className="small muted" style={{ padding: "0 18px 6px", fontWeight: 600 }}>{me?.clinic?.name}</div>}
      <nav className="nav">{me?.user?.isPlatformAdmin && <Link href="/admin" className={loc.startsWith("/admin") ? "on" : ""}><Icon n="shield" /><span>{t("platform_admin")}</span></Link>}{NAV.map((n, i) => n.sec ? <div key={i} className="sec">{t(n.sec)}</div> : (n.perm && !can(n.perm)) ? null :
        <Link key={n.id} href={n.to!} className={active(n.to) ? "on" : ""}><Icon n={n.ic!} /><span>{t("nav_" + n.id)}</span>{n.badge ? <span className="bdg n">{n.badge}</span> : null}</Link>)}</nav>
      <div className="me"><Avatar name={me?.user?.name} /><div className="grow" style={{ minWidth: 0 }}><Link href="/profile" style={{ color: "inherit" }}><div style={{ fontWeight: 600, fontSize: 13 }}>{me?.user?.name}</div></Link>
        <div className="tiny muted">{me?.role ? t("role_" + me.role) : ""}</div></div><button className="btn ghost icon sm" title={t("logout")} onClick={logout}><Icon n="logout" /></button></div>
    </aside>
    <main className="main">
      <div className="top">
        <button className="btn ghost icon burger" onClick={() => setOpen(true)} aria-label="menu"><Icon n="menu" /></button>
        <GlobalSearch />
        <div className="grow" />
        <select className="inp sm" id="langSel" style={{ width: "auto" }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="language">{Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn ghost icon" title={t("theme")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Icon n={theme === "dark" ? "sun" : "moon"} /></button>
        <Notifications />
      </div>
      {bill?.subscription?.status === "trialing" && bill.subscription.trialEndsAt && <div className="alert warn" style={{ borderRadius: 0, justifyContent: "center" }}><Icon n="clock" /><span>{t("trial_left", { n: Math.max(0, Math.ceil((new Date(bill.subscription.trialEndsAt).getTime() - Date.now()) / 86400000)) })}</span>{can("billing.manage") && <Link href="/settings/billing" style={{ fontWeight: 650 }}>{t("choose_plan")} →</Link>}</div>}
      <div className="page fade-in">{children}</div>
    </main>
  </div>;
}

function GlobalSearch() {
  const { t } = useT(); const [, nav] = useLocation();
  const [q, setQ] = useState(""); const [idx, setIdx] = useState(0); const ref = useRef<HTMLInputElement>(null);
  const { data } = useQuery({ queryKey: ["search", q], queryFn: () => get<any[]>("/api/search" + qs({ q })), enabled: q.trim().length > 0 });
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) { e.preventDefault(); ref.current?.focus(); } }; addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  const go = (r: any) => { setQ(""); nav(r.leadId ? `/leads/${r.leadId}` : "/leads"); };
  return <div className="search"><Icon n="search" /><input ref={ref} value={q} placeholder={t("search_ph")} autoComplete="off" onChange={(e) => { setQ(e.target.value); setIdx(0); }}
    onKeyDown={(e) => { const n = data?.length ?? 0; if (e.key === "ArrowDown") { setIdx(Math.min(idx + 1, n - 1)); e.preventDefault(); } if (e.key === "ArrowUp") { setIdx(Math.max(idx - 1, 0)); e.preventDefault(); } if (e.key === "Enter" && data?.[idx]) go(data[idx]); if (e.key === "Escape") setQ(""); }}
    onBlur={() => setTimeout(() => setQ(""), 200)} /><span className="kbd">/</span>
    {q && <div className="sres">{data?.length ? data.map((r, i) => <a key={r.patientId} className={i === idx ? "on" : ""} onMouseDown={() => go(r)}><Avatar name={r.fullName} sm /><span className="grow">{r.fullName}<div className="tiny muted">{flag(r.country)} {r.phone} {r.number ? `· #${r.number}` : ""}</div></span>{r.stage && <StageBadge s={r.stage} />}</a>) : <div className="empty small">{t("no_results")}</div>}</div>}</div>;
}

function Notifications() {
  const { t, rel } = useT(); const [open, setOpen] = useState(false); const qc = useQueryClient(); const [, nav] = useLocation();
  const { data } = useQuery({ queryKey: ["notifs"], queryFn: () => get("/api/notifications"), refetchInterval: 180_000 });
  const readAll = async () => { await post("/api/notifications/read"); qc.invalidateQueries({ queryKey: ["notifs"] }); };
  return <div style={{ position: "relative" }}>
    <button className="btn ghost icon" onClick={() => setOpen(!open)} aria-label={t("notifications")}><Icon n="bell" />{data?.unread ? <span className="bdg n" style={{ position: "absolute", top: 2, insetInlineEnd: 0, height: 16, fontSize: 10, minWidth: 16 }}>{data.unread}</span> : null}</button>
    {open && <><div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} /><div className="card" style={{ position: "absolute", insetInlineEnd: 0, top: 42, width: 340, maxHeight: 440, overflow: "auto", zIndex: 41, boxShadow: "var(--sh-lg)" }}>
      <div className="hd"><h3 className="grow">{t("notifications")}</h3>{data?.unread ? <button className="btn xs ghost" onClick={readAll}>{t("mark_all_read")}</button> : null}</div>
      {data?.items?.length ? data.items.map((n: any) => <a key={n.id} className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", color: "inherit", alignItems: "flex-start", cursor: "pointer", background: n.readAt ? undefined : "var(--brand-soft)" }}
        onClick={async () => { setOpen(false); await post("/api/notifications/read", { ids: [n.id] }); qc.invalidateQueries({ queryKey: ["notifs"] }); if (n.link) nav(n.link); }}>
        <div className="grow"><div className="small" style={{ fontWeight: 600 }}>{n.title}</div>{n.body && <div className="tiny muted">{n.body}</div>}<div className="tiny faint">{rel(n.createdAt)}</div></div></a>) : <div className="empty small">{t("no_notifs")}</div>}
    </div></>}
  </div>;
}
