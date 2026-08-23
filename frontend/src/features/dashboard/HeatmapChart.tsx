import { formatMoney } from "@/lib/decimal";
import { useI18n } from "@/i18n";
import { chuanBiHeatmap, type OLich } from "./heatmap";
import type { HeatmapMonth } from "./types";

const NHAN_THU: Record<number, string> = { 0: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7" };

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
  const { cot, nhanThang } = chuanBiHeatmap(months);

  if (cot.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-medium">{t("dashboard.heatmap")}</h3>
        <p className="text-sm text-muted-foreground">{t("dashboard.emptyGroup")}</p>
      </section>
    );
  }

  const tieuDeO = (o: OLich): string => {
    if (o.trangThai === "khongGiaoDich") return `${o.day} — ${t("dashboard.noTradeDay")}`;
    return `${o.day} ${formatMoney(o.sumNetGoc ?? "0", currency, locale)}`;
  };

  const hangThat = cot.flat().filter((o): o is OLich & { day: string } => o.trangThai !== "ngoaiDai");

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{t("dashboard.heatmap")}</h3>

      <figure aria-label={`${t("dashboard.heatmap")} — ${t("dashboard.chartOf")}`} className="overflow-x-auto">
        <div
          className="grid w-max gap-[2px]"
          style={{
            gridTemplateColumns: `20px repeat(${cot.length}, 11px)`,
            gridTemplateRows: `14px repeat(7, 11px)`,
          }}
        >
          {nhanThang.map((n) => (
            <span
              key={n.cot}
              className="text-[10px] leading-[14px] text-muted-foreground"
              style={{ gridColumn: n.cot + 2, gridRow: 1 }}
            >
              {n.thang}
            </span>
          ))}

          {([0, 1, 2, 3, 4, 5, 6] as const).map((r) => (
            <span
              key={r}
              className="text-[9px] leading-[11px] text-muted-foreground"
              style={{ gridColumn: 1, gridRow: r + 2 }}
            >
              {NHAN_THU[r]}
            </span>
          ))}

          {cot.flatMap((cotDoc, ci) =>
            cotDoc.map((o, ri) => {
              if (o.trangThai === "ngoaiDai") return null;
              return (
                <div
                  key={o.day}
                  title={tieuDeO(o)}
                  data-trangthai={o.trangThai}
                  className="rounded-[2px]"
                  style={{ gridColumn: ci + 2, gridRow: ri + 2, backgroundColor: o.mau }}
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
          {hangThat.map((o) => (
            <tr key={o.day}>
              <th scope="row">{o.day}</th>
              <td>{o.trangThai === "khongGiaoDich" ? "—" : formatMoney(o.sumNetGoc ?? "0", currency, locale)}</td>
              <td>{o.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
