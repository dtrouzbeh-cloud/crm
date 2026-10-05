import { useT } from "../lib/i18n.tsx";
import { Empty, PageHead } from "../components/ui.tsx";
export default function Soon() { const { t } = useT(); return <><PageHead title={t("soon")} /><div className="card"><Empty icon="spark" text={t("soon_text")} /></div></>; }
