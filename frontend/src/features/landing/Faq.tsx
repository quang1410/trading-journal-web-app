import { useI18n, type TranslationKey } from "@/i18n";
import { useMetaEnums } from "@/features/meta/hooks";
import { SectionTitle } from "./SectionTitle";
import { bandsDesc } from "./ticket";

function Item({ q, a }: { q: string; a: string }) {
  return (
    <details className="border-t py-4 last:border-b">
      <summary className="flex cursor-pointer list-none justify-between gap-4 text-[17px] font-semibold [&::-webkit-details-marker]:hidden after:font-mono after:text-muted-foreground after:content-['+'] [[open]>&]:after:content-['−']">
        {q}
      </summary>
      <p className="mt-2.5 max-w-[40em] text-muted-foreground">{a}</p>
    </details>
  );
}

export function Faq() {
  const { t } = useI18n();
  const { data: enums } = useMetaEnums();
  // Ngưỡng lấy từ backend (scoring.ClassBands), không gõ cứng. Chưa có thì
  // ẩn câu này thay vì hiện một câu trả lời thiếu số.
  const bands = enums ? bandsDesc(enums.class_bands) : [];
  const plain: [TranslationKey, TranslationKey][] = [
    ["landing.faq.whenQ", "landing.faq.whenA"],
    ["landing.faq.excelQ", "landing.faq.excelA"],
  ];

  return (
    <section id="faq" className="border-t py-[72px]">
      <SectionTitle>
        {t("landing.faq.title")}
      </SectionTitle>
      <div className="mt-8 grid max-w-3xl">
        {plain.map(([q, a]) => (
          <Item key={q} q={t(q)} a={t(a)} />
        ))}
        {bands.length >= 3 && (
          <Item
            q={t("landing.faq.scoreQ")}
            a={t("landing.faq.scoreA", { good: bands[0].min, warn: bands[1].min, bad: bands[2].min })}
          />
        )}
        <Item q={t("landing.faq.priceQ")} a={t("landing.faq.priceA")} />
      </div>
    </section>
  );
}
