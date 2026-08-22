import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

type Props = {
  compact?: boolean;
  className?: string;
};

/** The ledger spine is the brand mark; the rising final rule hints at equity. */
export function BrandLogo({ compact = false, className }: Props) {
  const { t } = useI18n();

  return (
    <div
      className={cn("brand-logo", compact ? "brand-logo-compact" : "", className)}
      aria-label={compact ? t("nav.appName") : undefined}
      role={compact ? "img" : undefined}
    >
      <svg
        aria-hidden="true"
        className="brand-logo-mark"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M7 4.5V27.5"
          stroke="var(--primary)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M12 6.5H26V25.5H12"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path d="M16 12H22" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <path d="M16 16.5H24" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        <path
          d="M16 21H20.5L24 17.5"
          stroke="var(--primary)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {!compact && (
        <span className="brand-logo-wordmark">
          <span>{t("nav.appNameLine1")}</span>
          <span>{t("nav.appNameLine2")}</span>
        </span>
      )}
    </div>
  );
}
