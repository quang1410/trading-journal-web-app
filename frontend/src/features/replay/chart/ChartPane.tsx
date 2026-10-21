import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createChart, type IChartApi, type IPriceLine, type ISeriesApi, type Time, type UTCTimestamp } from "lightweight-charts";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { makeProjector, type Projector } from "../engine/projector";
import { symbolLabel } from "../engine/csvExport";
import { tfLabel } from "../engine/tf";
import { openPnl } from "../engine/trading";
import { useReplay, useReplayStore } from "../store/context";
import type { PaneIndex } from "../store/ReplayStore";
import { luminance, resolveColor } from "./colors";
import { PaneInput } from "./interaction";
import { chartOptions, priceLines, seriesOptions, styleCandle, tradeMarkers } from "./lwModel";
import { Overlay } from "./Overlay";
import { useAppTheme } from "./useAppTheme";
import { formatUsd } from "../components/format";

interface Lw {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  lines: Map<string, IPriceLine>;
  needFit: boolean;
}

/**
 * Một chart (lightweight-charts) cùng lớp phủ của nó. Nến tới từ store qua kênh onCandles, không
 * qua React; phần còn lại (kiểu, đường giá, marker) bám theo trạng thái.
 */
export function ChartPane({ k, children }: { k: PaneIndex; children?: (proj: Projector | null) => ReactNode }) {
  const store = useReplayStore();
  const { t } = useI18n();
  const theme = useAppTheme();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chartElRef = useRef<HTMLDivElement | null>(null);
  const lwRef = useRef<Lw | null>(null);
  const [proj, setProj] = useState<Projector | null>(null);
  const [selX, setSelX] = useState<number | null>(null);

  const style = useReplay((s) => s.chartStyle);
  const pane = useReplay((s) => s.panes[k]);
  const zone = useReplay((s) => s.zone);
  const active = useReplay((s) => s.active);
  const layout = useReplay((s) => s.layout);
  const pos = useReplay((s) => s.pos);
  const pending = useReplay((s) => s.pending);
  const hlines = useReplay((s) => s.hlines);
  const trades = useReplay((s) => s.trades);
  const candleVer = useReplay((s) => s.candleVer[k]);
  const tool = useReplay((s) => s.tool);
  const selectMode = useReplay((s) => s.selectMode);
  useReplay((s) => s.now); // giá ở chú thích đổi theo đồng hồ replay

  // theme có trong deps để giải lại var(--replay-*) khi người dùng đổi giao diện sáng/tối
  const color = useCallback((c: string) => resolveColor(c), []);
  const styled = useCallback(
    () => store.candles[k].map((c, i, a) => ({ ...styleCandle(c, a[i - 1], style, color), time: c.time as UTCTimestamp })),
    [store, k, style, color, theme],
  );

  const fit = useCallback(() => {
    const lw = lwRef.current;
    if (!lw) return;
    const ts = lw.chart.timeScale();
    if (ts.width() === 0) {
      lw.needFit = true; // chart vừa hiện, chưa có chiều rộng: chờ resize
      return;
    }
    lw.needFit = false;
    const n = store.candles[k].length;
    ts.setVisibleLogicalRange({ from: n - 150, to: n + store.getState().chartStyle.rightBars });
  }, [store, k]);

  const buildProjector = useCallback((): Projector | null => {
    const lw = lwRef.current;
    const el = rootRef.current;
    if (!lw || !el) return null;
    const ts = lw.chart.timeScale();
    const a = ts.logicalToCoordinate(0 as never);
    const b = ts.logicalToCoordinate(1 as never);
    if (a == null || b == null || a === b) return null;
    const st = store.getState();
    return makeProjector({
      candles: store.candles[k], tf: st.panes[k].tf, zone: st.zone, axis: { a, sp: b - a },
      plotW: el.clientWidth - lw.chart.priceScale("right").width(), plotH: el.clientHeight - ts.height(),
      priceToY: (p) => lw.series.priceToCoordinate(p), yToPrice: (y) => lw.series.coordinateToPrice(y),
    });
  }, [store, k]);

  // ---------- tạo chart ----------
  useEffect(() => {
    const el = chartElRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      localization: { locale: "en-US", dateFormat: "yyyy-MM-dd" },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    const series = chart.addCandlestickSeries();
    const lw: Lw = { chart, series, lines: new Map(), needFit: false };
    lwRef.current = lw;
    series.setData(styled());
    fit();
    const off = store.onCandles(k, (e) => {
      if (e.kind === "reset") {
        series.setData(styled());
        if (e.fit) fit();
      } else {
        const cs = store.candles[k];
        const s = store.getState().chartStyle;
        series.update({ ...styleCandle(e.candle, cs[cs.length - 2], s, resolveColor), time: e.candle.time as UTCTimestamp });
      }
    });
    const ro = new ResizeObserver(() => {
      if (lw.needFit && el.clientWidth > 0) requestAnimationFrame(fit);
    });
    ro.observe(el);
    return () => {
      off();
      ro.disconnect();
      chart.remove();
      lwRef.current = null;
    };
    // tạo một lần cho mỗi chart; kiểu chart đi qua effect bên dưới
  }, [store, k]);

  // ---------- kiểu chart ----------
  const watermark = style.watermark === "replay" ? t("replay.watermark") : style.watermark === "symbol" ? symbolLabel(pane.ds ?? "") : "";
  useEffect(() => {
    const lw = lwRef.current;
    if (!lw) return;
    lw.chart.applyOptions(chartOptions(style, color, watermark));
    lw.series.applyOptions(seriesOptions(style, color));
    lw.series.setData(styled());
  }, [style, color, watermark, theme, styled]);

  // ---------- đường giá: vào lệnh, SL, TP, lệnh chờ, kẻ ngang ----------
  useEffect(() => {
    const lw = lwRef.current;
    if (!lw) return;
    const specs = priceLines(pane.ds, pos, pending, hlines, style, color);
    const keep = new Set(specs.map((s) => s.key));
    for (const [key, line] of lw.lines) {
      if (!keep.has(key)) {
        lw.series.removePriceLine(line);
        lw.lines.delete(key);
      }
    }
    for (const s of specs) {
      const opts = { price: s.price, color: s.color, title: s.title, lineStyle: s.style };
      const cur = lw.lines.get(s.key);
      if (cur) cur.applyOptions(opts);
      else lw.lines.set(s.key, lw.series.createPriceLine({ ...opts, lineWidth: 1, axisLabelVisible: true }));
    }
  }, [pane.ds, pos, pending, hlines, style, color, theme]);

  // ---------- marker vào / ra lệnh ----------
  useEffect(() => {
    const lw = lwRef.current;
    const d = pane.ds ? store.ds[pane.ds] : undefined;
    if (!lw) return;
    const ms = d ? tradeMarkers(d, store.candles[k], pane.tf, zone, trades, pos, color, formatUsd) : [];
    lw.series.setMarkers(ms.map((m) => ({ ...m, time: m.time as Time })));
  }, [store, k, pane.ds, pane.tf, zone, trades, pos, candleVer, color, theme]);

  // ---------- khung nhìn: dựng lại bộ đổi toạ độ mỗi khi chart cuộn / zoom / đổi cỡ ----------
  useEffect(() => {
    let raf = 0;
    let sig = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const lw = lwRef.current;
      const el = rootRef.current;
      if (!lw || !el) return;
      const ts = lw.chart.timeScale();
      const a = ts.logicalToCoordinate(0 as never);
      const b = ts.logicalToCoordinate(1 as never);
      const cs = store.candles[k];
      const ref = cs.length ? cs[cs.length - 1].close : 1;
      const next = [
        a?.toFixed(2), b?.toFixed(3), lw.series.priceToCoordinate(ref)?.toFixed(2), lw.series.priceToCoordinate(ref + 1)?.toFixed(3),
        el.clientWidth, el.clientHeight, lw.chart.priceScale("right").width(), cs.length, cs[0]?.time, store.getState().candleVer[k],
      ].join("|");
      if (next !== sig) {
        sig = next;
        setProj(buildProjector());
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [store, k, buildProjector]);

  // ---------- chuột ----------
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const input = new PaneInput({
      store, k, el,
      projector: buildProjector,
      lock: (on) => lwRef.current?.chart.applyOptions({ handleScroll: !on, handleScale: !on }),
      timeAt: (x) => {
        const v = lwRef.current?.chart.timeScale().coordinateToTime(x);
        return typeof v === "number" ? v : null;
      },
      onSelectHover: setSelX,
      onPress: () => window.dispatchEvent(new CustomEvent("replay:pane-press")),
    });
    return input.attach();
  }, [store, k, buildProjector]);

  // đường dọc của chế độ chọn nến: bám vào nến dưới chuột, phần bên phải là phần sẽ bị ẩn
  let guide: ReactNode = null;
  if (selectMode && selX != null && proj && lwRef.current) {
    const ts = lwRef.current.chart.timeScale();
    const tm = ts.coordinateToTime(selX);
    const x = tm != null ? (ts.timeToCoordinate(tm) ?? selX) : selX;
    guide = (
      <>
        <div className="pointer-events-none absolute top-0 z-[4] h-full border-l border-dashed border-primary" style={{ left: x }} />
        <div className="pointer-events-none absolute top-0 z-[4] h-full bg-primary/10" style={{ left: x, width: Math.max(0, proj.plotW - x) }} />
      </>
    );
  }

  const fg = useMemo(() => (luminance(resolveColor(style.bg)) > 140 ? "var(--replay-fg-on-light)" : "var(--replay-fg-on-dark)"), [style.bg, theme]);
  const d = pane.ds ? store.ds[pane.ds] : undefined;
  const price = d && d.cur >= 0 ? d.C[d.cur] : null;
  const upnl = pos && pos.sym === pane.ds ? openPnl(pos, price) : null;

  return (
    <div
      ref={rootRef}
      data-pane={k}
      className={cn(
        "replay-pane relative min-w-0 overflow-hidden",
        tool && "is-tooling",
        selectMode && "is-selecting",
        layout === 2 && active === k && "outline outline-2 -outline-offset-2 outline-primary",
      )}
      style={{ background: resolveColor(style.bg) }}
    >
      <div ref={chartElRef} className="absolute inset-0" />
      <Overlay k={k} proj={proj} fg={fg} />
      {/* chú thích kiểu TradingView: mã + khung đậm, giá; giờ replay nằm ở thanh replay nên không lặp
          lại ở đây. Bề rộng chặn ở vùng vẽ để không đè lên trục giá. */}
      <div
        className="pointer-events-none absolute top-2 left-2 z-[3] flex items-baseline gap-x-3 overflow-hidden text-xs whitespace-nowrap"
        style={{ color: fg, maxWidth: proj ? proj.plotW - 12 : undefined }}
        data-testid={`replay-info-${k}`}
      >
        <span className="text-sm font-semibold">
          {symbolLabel(pane.ds ?? "")} <span className="font-medium opacity-70">{tfLabel(pane.tf)}</span>
        </span>
        <span>
          <span className="opacity-70">{t("replay.info.price")}</span> <b className="num">{price == null ? "—" : price.toFixed(2)}</b>
        </span>
        {upnl != null && (
          <span>
            <span className="opacity-70">{t("replay.info.openPnl")}</span> <b className={cn("num", upnl >= 0 ? "text-profit" : "text-loss")}>{formatUsd(upnl)}</b>
          </span>
        )}
        {layout === 2 && active === k && <span className="sr-only">{t("replay.info.selected")}</span>}
      </div>
      {guide}
      {children?.(proj)}
    </div>
  );
}
