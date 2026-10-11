import { useI18n } from "@/i18n";
import { formatPlain } from "../format";

export function ImportPreview() {
  const { t, locale } = useI18n();
  const [header, ...rows] = t("landing.features.importCsv").split("\n");
  return (
    <div className="grid gap-2.5 rounded-md border bg-card px-3 py-2.5">
      <pre className="m-0 overflow-x-auto font-mono text-xs leading-[1.7] text-muted-foreground">
        {header}
        {"\n"}
        <b className="font-semibold text-foreground">{rows[0]}</b>
        {"\n"}
        {rows[1]}
      </pre>
      <div className="grid w-max grid-cols-[3.5rem_auto_auto] gap-x-3 gap-y-1 font-mono text-[12.5px]">
        <span>BUY</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-profit">Long</span>
        <span>SELL</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-loss">Short</span>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-[13px]">
        <span>{t("landing.features.importOk", { n: formatPlain(128, locale) })}</span>
        <span className="text-loss">{t("landing.features.importErrors", { n: formatPlain(2, locale) })}</span>
      </div>
    </div>
  );
}
