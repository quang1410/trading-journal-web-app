import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { BareCard } from "./ChartCard";
import { prepareHeatmap, type OLich } from "./heatmap";
import type { HeatmapMonth } from "./types";

const WEEKDAY_LABELS: Record<number, string> = { 0: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7" };

/**
 * Lịch nhiệt MỘT lưới liên tục kiểu GitHub, không phải mỗi tháng một khung
 * (spec 4b §2.2). Vẽ bằng CSS grid thường — Recharts không có heatmap, và
 * ResponsiveContainer đo bằng ResizeObserver mà jsdom không có (4a §2.5).
 * Grid thường thì KHÔNG có giới hạn đó: đây là biểu đồ DUY NHẤT của trang vẽ
 * ra thật trong jsdom.
 *
 * Mỗi ô mang `data-trangthai` để test bám vào mà không cần đoán chuỗi style —
 * ngoaiDai không render gì cả (return null), nên không có "ô trong suốt"
 * thừa trong DOM.
 */
export function HeatmapChart({ months, currency }: { months: HeatmapMonth[]; currency: string }) {
  const { locale, t } = useI18n();
  const { col, monthLabel } = prepareHeatmap(months);

  const cellTitle = (o: OLich): string => {
    if (o.status === "khongGiaoDich") return `${o.day} — ${t("dashboard.noTradeDay")}`;
    return `${o.day} ${formatMoney(o.sumNetGoc ?? "0", currency, locale)}`;
  };

  const realRow = col.flat().filter((o): o is OLich & { day: string } => o.status !== "ngoaiDai");

  return (
    <BareCard title={t("dashboard.heatmap")} empty={col.length === 0}>

      <figure aria-label={`${t("dashboard.heatmap")} — ${t("dashboard.chartOf")}`} className="overflow-x-auto">
        <div
          className="grid w-max gap-[2px]"
          style={{
            gridTemplateColumns: `20px repeat(${col.length}, 11px)`,
            gridTemplateRows: `14px repeat(7, 11px)`,
          }}
        >
          {monthLabel.map((n) => (
            <span
              key={n.col}
              className="text-[10px] leading-[14px] text-muted-foreground"
              style={{ gridColumn: n.col + 2, gridRow: 1 }}
            >
              {n.month}
            </span>
          ))}

          {([0, 1, 2, 3, 4, 5, 6] as const).map((r) => (
            <span
              key={r}
              className="text-[9px] leading-[11px] text-muted-foreground"
              style={{ gridColumn: 1, gridRow: r + 2 }}
            >
              {WEEKDAY_LABELS[r]}
            </span>
          ))}

          {col.flatMap((vertical, ci) =>
            vertical.map((o, ri) => {
              if (o.status === "ngoaiDai") return null;
              return (
                <div
                  key={o.day}
                  title={cellTitle(o)}
                  data-trangthai={o.status}
                  className="rounded-[2px]"
                  style={{ gridColumn: ci + 2, gridRow: ri + 2, backgroundColor: o.color }}
                />
              );
            }),
          )}
        </div>
      </figure>

      <table className="sr-only">
        <caption>{t("dashboard.heatmap")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("dashboard.day")}</th>
            <th scope="col">{t("dashboard.net")}</th>
            <th scope="col">{t("dashboard.tradeCount")}</th>
          </tr>
        </thead>
        <tbody>
          {realRow.map((o) => (
            <tr key={o.day}>
              <th scope="row">{o.day}</th>
              <td>{o.status === "khongGiaoDich" ? "—" : formatMoney(o.sumNetGoc ?? "0", currency, locale)}</td>
              <td>{o.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </BareCard>
  );
}
