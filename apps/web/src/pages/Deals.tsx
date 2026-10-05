import { useT } from "../lib/i18n.tsx";
import { Empty, PageHead } from "../components/ui.tsx";
export default function Deals() { const { t } = useT(); return <><PageHead title={t("nav_deals")} /><div className="card"><Empty icon="deal" text={t("loading")} /></div></>; }
