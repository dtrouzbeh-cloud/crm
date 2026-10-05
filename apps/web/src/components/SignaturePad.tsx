// El yazısı imza alanı (dokunmatik + fare), PNG data URL döner
import { useEffect, useRef } from "react";

export function SignaturePad({ onChange, label, clear }: { onChange: (v: string | null) => void; label: string; clear: string }) {
  const ref = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const dirty = useRef(0);
  useEffect(() => {
    const c = ref.current!; const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr; const g = c.getContext("2d")!; g.scale(dpr, dpr); g.lineWidth = 2.2; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#0b2540";
  }, []);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  return <div>
    <div style={{ position: "relative", border: "1.5px dashed #B8C4CC", borderRadius: 12, background: "#FCFDFD", touchAction: "none" }}>
      <canvas ref={ref} style={{ width: "100%", height: 170, display: "block", cursor: "crosshair" }}
        onPointerDown={(e) => { drawing.current = true; (e.target as Element).setPointerCapture(e.pointerId); const g = ref.current!.getContext("2d")!; const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); }}
        onPointerMove={(e) => { if (!drawing.current) return; const g = ref.current!.getContext("2d")!; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); dirty.current++; }}
        onPointerUp={() => { drawing.current = false; if (dirty.current > 8) onChange(ref.current!.toDataURL("image/png")); }} />
      <span style={{ position: "absolute", insetInlineStart: 12, bottom: 8, fontSize: 12, color: "#8A99A4", pointerEvents: "none" }}>✍️ {label}</span>
    </div>
    <button type="button" className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); dirty.current = 0; onChange(null); }}>{clear}</button>
  </div>;
}
