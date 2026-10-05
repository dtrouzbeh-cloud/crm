import { useRef, useState } from "react";
import { useT } from "../lib/i18n.tsx";
import { toastErr } from "./ui.tsx";
import { Icon } from "./Icon.tsx";

/** Çoklu dosya yükleme + küçük resim galerisi */
export function Upload({ kind, entity, entityId, files, onDone, accept = "image/*,application/pdf", label }: { kind: string; entity: string; entityId: string; files: any[]; onDone: () => void; accept?: string; label?: string }) {
  const { t } = useT(); const ref = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [view, setView] = useState<string | null>(null);
  const up = async (list: FileList | null) => {
    if (!list?.length) return; setBusy(true);
    try { const fd = new FormData(); [...list].forEach((f) => fd.append("file", f));
      const r = await fetch(`/api/files?kind=${kind}&entity=${entity}&entityId=${entityId}`, { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).message); onDone(); } catch (e) { toastErr(e); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };
  const mine = files.filter((f) => f.kind === kind);
  return <div>
    <div className="row wrap" style={{ gap: 8 }}>
      {mine.map((f) => f.mime.startsWith("image/") ? <img key={f.id} src={`/api/files/${f.id}`} alt={f.name} loading="lazy" onClick={() => setView(f.id)} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)", cursor: "zoom-in" }} />
        : <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noopener" className="chip"><Icon n="file" size={14} />{f.name.slice(0, 18)}</a>)}
      <button className="btn" style={{ width: 72, height: 72, flexDirection: "column", gap: 2, fontSize: 11 }} disabled={busy} onClick={() => ref.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); up(e.dataTransfer.files); }}><Icon n="upload" />{busy ? "…" : label ?? t("upload")}</button>
      <input ref={ref} type="file" accept={accept} multiple hidden onChange={(e) => up(e.target.files)} />
    </div>
    {view && <div className="modal" onClick={() => setView(null)}><div className="scrim" style={{ position: "absolute" }} /><img src={`/api/files/${view}`} style={{ position: "relative", maxWidth: "92vw", maxHeight: "88vh", borderRadius: 12 }} /></div>}
  </div>;
}
