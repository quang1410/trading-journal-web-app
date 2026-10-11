import { useI18n, type TranslationKey } from "@/i18n";

const STEPS: [TranslationKey, boolean][] = [
  ["landing.features.noteStep1", true],
  ["landing.features.noteStep2", true],
  ["landing.features.noteStep3", true],
  ["landing.features.noteStep4", false],
];

export function NotePreview() {
  const { t } = useI18n();
  return (
    <div className="rounded-md border bg-card px-3 py-2.5 text-[13px]">
      <span className="inline-flex items-center gap-1.5 rounded border border-input bg-card px-2 py-0.5 text-[12.5px]">
        {t("noteTemplate.insert")} · <b>HTF PDA - FVG - H1</b>
      </span>
      <ul className="mt-2 grid list-none gap-1.5 p-0">
        {STEPS.map(([key, done]) => (
          <li key={key} className={`flex items-baseline gap-2 ${done ? "text-muted-foreground line-through decoration-input" : ""}`}>
            <span
              aria-hidden="true"
              className={`size-[13px] flex-none translate-y-0.5 rounded-[3px] border-[1.5px] ${
                done ? "border-primary bg-primary shadow-[inset_0_0_0_2px_var(--surface-base)]" : "border-input"
              }`}
            />
            {t(key)}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 border-t border-dashed border-input pt-2.5">{t("landing.features.noteComment")}</p>
    </div>
  );
}
