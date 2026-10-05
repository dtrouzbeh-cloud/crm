import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon.tsx";
import { useT } from "../lib/i18n.tsx";

// ── Toast (global) ──
type Toast = { id: number; msg: string; undo?: () => void; kind?: "ok" | "err" };
let push: (t: Omit<Toast, "id">) => void = () => {};
export const toast = (msg: string, undo?: () => void) => push({ msg, undo, kind: "ok" });
export const toastErr = (e: unknown) => push({ msg: (e as Error)?.message || String(e), kind: "err" });
export function Toasts() {
  const [items, set] = useState<Toast[]>([]);
  const { t } = useT();
  useEffect(() => { push = (x) => { const id = Date.now() + Math.random(); set((a) => [...a, { ...x, id }]); setTimeout(() => set((a) => a.filter((i) => i.id !== id)), x.kind === "err" ? 6000 : 3800); }; }, []);
  return <div className="toasts">{items.map((i) => <div key={i.id} className="toast" style={i.kind === "err" ? { background: "#7f1d1d" } : undefined}>
    <Icon n={i.kind === "err" ? "alert" : "ok"} /><span>{i.msg}</span>{i.undo && <button onClick={() => { i.undo!(); set((a) => a.filter((x) => x.id !== i.id)); }}>{t("undo")}</button>}</div>)}</div>;
}

// ── Çekmece ve modal ──
export function Drawer({ title, onClose, children, footer, width }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  return createPortal(<><div className="scrim" onClick={onClose} /><div className="drawer" role="dialog" style={width ? { width: `min(${width}px,100%)` } : undefined}>
    <div className="hd"><h2 className="grow">{title}</h2><button className="btn ghost icon" onClick={onClose} aria-label="close"><Icon n="x" /></button></div>
    <div className="bd">{children}</div>{footer && <div className="ft">{footer}</div>}</div></>, document.body);
}
export function Modal({ children, onClose, width }: { children: ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  return createPortal(<div className="modal"><div className="scrim" style={{ position: "absolute" }} onClick={onClose} /><div className="box" role="dialog" style={{ position: "relative", ...(width ? { width: `min(${width}px,100%)` } : {}) }}>{children}</div></div>, document.body);
}

// ── Onay penceresi (promise) ──
let askFn: (o: { title: string; text?: string; ok?: string; danger?: boolean }) => Promise<boolean> = async () => false;
export const confirmBox = (title: string, text?: string, ok?: string, danger?: boolean) => askFn({ title, text, ok, danger });
export function ConfirmHost() {
  const [s, set] = useState<null | { title: string; text?: string; ok?: string; danger?: boolean; res: (v: boolean) => void }>(null);
  const { t } = useT();
  useEffect(() => { askFn = (o) => new Promise((res) => set({ ...o, res })); }, []);
  if (!s) return null;
  const done = (v: boolean) => { s.res(v); set(null); };
  return <Modal onClose={() => done(false)}><div className="hd"><div className="grow"><h2>{s.title}</h2>{s.text && <p className="muted" style={{ margin: "6px 0 0" }}>{s.text}</p>}</div></div>
    <div className="ft"><button className="btn" onClick={() => done(false)}>{t("cancel")}</button><button className={"btn " + (s.danger ? "danger" : "pri")} autoFocus onClick={() => done(true)}>{s.ok ?? t("ok")}</button></div></Modal>;
}

export const Empty = ({ icon = "info", text, action }: { icon?: string; text: ReactNode; action?: ReactNode }) =>
  <div className="empty"><Icon n={icon} /><div>{text}</div>{action && <div style={{ marginTop: 12 }}>{action}</div>}</div>;
export const Spinner = () => { const { t } = useT(); return <div className="empty small">{t("loading")}</div>; };
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useT();
  return <div className="alert err"><Icon n="alert" /><span className="grow">{(error as Error)?.message || t("error_generic")}</span>{retry && <button className="btn sm" onClick={retry}>{t("retry")}</button>}</div>;
}
export const PageHead = ({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) =>
  <div className="phead"><div className="grow"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{actions && <div className="row wrap">{actions}</div>}</div>;
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return <label className="row small" style={{ gap: 8, cursor: "pointer" }}><span className="switch"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span /></span>{label}</label>;
}
const avColor = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 45% 45%)`; };
export const initials = (n?: string | null) => String(n || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export const Avatar = ({ name, sm, size }: { name?: string | null; sm?: boolean; size?: number }) =>
  <span className={"av" + (sm ? " sm" : "")} style={{ background: avColor(name || "?"), ...(size ? { width: size, height: size, fontSize: size / 3 } : {}) }} title={name ?? ""}>{initials(name)}</span>;
