import { useEffect, useMemo, useRef } from "react";
import { chartSVG, legendHTML } from "@dentaflow/core/chart";
import type { ToothState, Span } from "@dentaflow/core/engine";
import { useT } from "../lib/i18n.tsx";

/** Şematik diş şeması. onTooth verilirse dokunma + sürükleyerek boyama/seçme etkin olur. */
export function Chart({ states, sel, preview, spans, numbering, onStroke, dots = true, legend = true, lang }: {
  states: Record<number, ToothState>; sel?: Set<number>; preview?: Set<number> | null; spans?: Span[]; numbering?: string; dots?: boolean; legend?: boolean; lang?: string;
  onStroke?: (t: number, first: boolean, mode: "paint" | "erase" | null) => "paint" | "erase" | void;
}) {
  const { t } = useT();
  const svg = useMemo(() => chartSVG(states, { sel: sel ?? new Set(), preview: preview ?? new Set(), spans, numbering, dots }), [states, sel, preview, spans, numbering, dots]);
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef<{ down: boolean; mode: "paint" | "erase" | null; touched: Set<number> }>({ down: false, mode: null, touched: new Set() });
  useEffect(() => {
    const box = ref.current; if (!box || !onStroke) return;
    const hit = (e: PointerEvent) => { const el = (e.pointerType === "mouse" ? e.target : document.elementFromPoint(e.clientX, e.clientY)) as Element | null; const g = el?.closest?.("[data-t]"); return g && box.contains(g) ? Number(g.getAttribute("data-t")) : null; };
    const apply = (tt: number) => { const s = st.current; if (s.touched.has(tt)) return; s.touched.add(tt); const m = onStroke(tt, s.touched.size === 1, s.mode); if (m) s.mode = m; };
    const down = (e: PointerEvent) => { const tt = hit(e); if (tt == null) return; st.current = { down: true, mode: null, touched: new Set() }; apply(tt); e.preventDefault(); };
    const move = (e: PointerEvent) => { if (!st.current.down) return; const tt = hit(e); if (tt != null) apply(tt); };
    const up = () => { st.current.down = false; };
    box.addEventListener("pointerdown", down); box.addEventListener("pointermove", move); addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
    return () => { box.removeEventListener("pointerdown", down); box.removeEventListener("pointermove", move); removeEventListener("pointerup", up); box.removeEventListener("pointercancel", up); };
  }, [onStroke]);
  const lg = useMemo(() => legend ? legendHTML(states, (k: string) => t(k)) : "", [states, legend, t, lang]);
  return <>
    <div className="chartbox" style={{ touchAction: onStroke ? "none" : undefined }}>
      <div className="cw" ref={ref} dangerouslySetInnerHTML={{ __html: svg }} />
      <span className="jawlbl" style={{ top: 14 }}>{t("jaw_u").toUpperCase()}</span><span className="jawlbl" style={{ bottom: 12 }}>{t("jaw_l").toUpperCase()}</span>
    </div>
    {legend && <div className="legend" dangerouslySetInnerHTML={{ __html: lg }} />}
  </>;
}
