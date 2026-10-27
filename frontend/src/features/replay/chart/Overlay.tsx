import { useEffect, useMemo, type ReactNode } from "react";
import { useI18n } from "@/i18n";
import { DASH, ictEmpty, ictModel, LABEL_PX, type IctModel, type IctSettings, type LineStyle } from "../engine/ict";
import { fibLayout, handlesOf, textPlacement, withDefaults, type Drawing, type EndCap } from "../engine/drawings";
import { extendSegment, trendStats, visibleOnTf, type StatKey } from "../engine/drawStyle";
import { luminance } from "./colors";
import { fmtLocal, toLocal, type Zone } from "../engine/time";
import { TICK } from "../engine/trading";
import type { Projector, XY } from "../engine/projector";
import { freshSmt, pickOther, smtModel, type SmtLine } from "../engine/smt";
import { useReplay, useReplayStore } from "../store/context";
import type { PaneIndex } from "../store/ReplayStore";

/**
 * Lớp SVG phủ trên chart: indicator My ICT, SMT, hình vẽ, hình đang vẽ và chấm tròn của hình đang chọn.
 * Vẽ lại khi trạng thái đổi hoặc khi khung nhìn của chart đổi (`proj` mới).
 */

const DRAW = "var(--replay-draw)";
const markerKey = (k: number, c: string) => `replay-arrow-${k}-${c.replace(/[^0-9a-z]/gi, "")}`;

export function Overlay({ k, proj, fg }: { k: PaneIndex; proj: Projector | null; fg: string }) {
  const store = useReplayStore();
  const { t } = useI18n();
  const pane = useReplay((s) => s.panes[k]);
  const drawings = useReplay((s) => s.drawings);
  const selected = useReplay((s) => s.selected);
  const draft = useReplay((s) => s.draft);
  const ict = useReplay((s) => s.ict);
  const ictVer = useReplay((s) => s.ictVer);
  const zone = useReplay((s) => s.zone);
  const names = useReplay((s) => s.names);
  const candleVer = useReplay((s) => s.candleVer[k]);
  const now = useReplay((s) => s.now);
  const digits = useReplay((s) => s.chartStyle.precision);

  const d = pane.ds ? store.ds[pane.ds] : undefined;
  // ICT: tính lại khi tới nến mới, đổi khung / múi giờ / cài đặt
  const im = useMemo<IctModel | null>(
    () => (d ? ictModel(d, pane.tf, zone, ict, (start) => t("replay.ict.macroLabel", { start })) : null),
    [d, d?.cur, now, pane.tf, zone, ictVer, ict, t],
  );
  const otherName = pane.ds ? pickOther(pane.ds, names, ict.smt.other) : null;
  const other = otherName ? store.ds[otherName] : undefined;
  const smt = useMemo<SmtLine[]>(
    () => (ict.on && ict.smt.on && other ? smtModel(store.candles[k], other, pane.tf, zone, ict.smt) : []),
    [candleVer, other, other?.cur, pane.tf, zone, ictVer, ict, k, store],
  );
  const nw = freshSmt(smt, store.candles[k].length, ict.smt.len);
  useEffect(() => {
    if (nw && otherName) store.noticeSmt(k, nw, otherName);
  }, [nw, otherName, k, store]);

  if (!proj) return null;
  const items = drawings.filter((x) => x.sym === pane.ds && !x.hidden && visibleOnTf(x.vis, pane.tf));
  if (draft && draft.pane === k) items.push({ ...store.lastStyle(draft.d.type), ...draft.d });
  if (!items.length && ictEmpty(im) && !smt.length) return null;
  const XYs = items.map((it) => {
    const P = it.pts.map((pt) => proj.toXY(pt));
    return P.some((q) => !q) ? null : (P as XY[]);
  });
  // mũi tên ở đầu đường: một marker cho mỗi màu đang dùng
  const arrowColors = [
    ...new Set(items.map(withDefaults).filter((x) => (x.type === "path" || x.type === "trend") && (x.endL === "arrow" || x.endR === "arrow")).map((x) => x.color ?? DRAW)),
  ];

  return (
    <svg className="pointer-events-none absolute inset-0 z-[1]" width="100%" height="100%" aria-hidden data-testid={`replay-overlay-${k}`}>
      <defs>
        <clipPath id={`replay-clip-${k}`}>
          <rect width={Math.max(0, proj.plotW)} height={Math.max(0, proj.plotH)} />
        </clipPath>
        {arrowColors.map((c) => (
          <marker key={c} id={markerKey(k, c)} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c} />
          </marker>
        ))}
      </defs>
      <g clipPath={`url(#replay-clip-${k})`}>
        {(im || smt.length > 0) && (
          <g className="ict">
            {im && <IctLayer m={im} proj={proj} fg={fg} ict={ict} />}
            <SmtLayer lines={smt} proj={proj} ict={ict} />
          </g>
        )}
        {items.map((it, i) => {
          const P = XYs[i];
          if (!P) return null;
          return <Shape key={it.id || "draft"} k={k} d={it} P={P} proj={proj} fg={fg} sel={it.id === selected} t={t} tf={pane.tf} digits={digits} />;
        })}
      </g>
      <AxisMarks items={items} P={XYs} selected={selected} proj={proj} digits={digits} zone={zone} />
    </svg>
  );
}

function IctLayer({ m, proj, fg, ict }: { m: IctModel; proj: Projector; fg: string; ict: IctSettings }) {
  const X = (time: number) => proj.xOfTime(time);
  const Y = (p: number) => proj.priceToY(p);
  const out: ReactNode[] = [];
  m.boxes.forEach((b, i) => {
    const x0 = X(b.t0);
    const x1 = X(b.t1);
    const y0 = Y(b.hi);
    const y1 = Y(b.lo);
    if (x0 == null || x1 == null || y0 == null || y1 == null) return;
    out.push(<rect key={`b${i}`} x={x0} y={Math.min(y0, y1)} width={Math.max(1, x1 - x0)} height={Math.max(1, Math.abs(y1 - y0))} fill={b.color} fillOpacity={(100 - ict.boxAlpha) / 100} />);
    if (b.text) {
      out.push(<text key={`bt${i}`} x={(x0 + x1) / 2} y={(y0 + y1) / 2} textAnchor="middle" dominantBaseline="central" fill={b.color} fontSize={12}>{b.text}</text>);
    }
  });
  m.vlines.forEach((v, i) => {
    const x = X(v.t);
    if (x != null) out.push(<line key={`v${i}`} x1={x} y1={0} x2={x} y2={proj.plotH} stroke={v.color} strokeWidth={v.w} strokeDasharray={v.dash || undefined} />);
  });
  m.macros.forEach((mc, i) => {
    const x0 = X(mc.t0);
    const x1 = X(mc.t1);
    if (x0 == null || x1 == null) return;
    const yt = mc.top != null ? Y(mc.top) : null;
    const yb = mc.bot != null ? Y(mc.bot) : null;
    if (yt != null && yb != null) out.push(<rect key={`mb${i}`} x={x0} y={yt} width={Math.max(1, x1 - x0)} height={Math.max(1, yb - yt)} fill={fg} fillOpacity={0.05} />);
    [yt, yb].forEach((y, j) => {
      if (y != null) out.push(<line key={`ml${i}-${j}`} x1={x0} y1={y} x2={x1} y2={y} stroke={fg} strokeWidth={1} />);
    });
    const yl = yt ?? yb;
    if (yl != null) out.push(<text key={`mt${i}`} x={x0} y={yl - 4} fill={fg} fontSize={10}>{mc.label}</text>);
  });
  m.lines.forEach((ln, i) => {
    const x0 = X(ln.t0);
    const x1 = X(ln.t1);
    const y = Y(ln.p);
    if (x0 == null || x1 == null || y == null) return;
    out.push(<line key={`l${i}`} x1={x0} y1={y} x2={x1} y2={y} stroke={ln.color} strokeWidth={ln.w} strokeDasharray={ln.dash || undefined} />);
    // nhãn nằm bên phải đầu đường; tràn khỏi vùng chart thì đặt bên trái, ngay trên đường
    const fits = x1 + 4 + ln.label.length * ln.size * 0.6 <= proj.plotW;
    out.push(
      fits ? (
        <text key={`lt${i}`} x={x1 + 4} y={y} dominantBaseline="central" fill={ln.color} fontSize={ln.size}>{ln.label}</text>
      ) : (
        <text key={`lt${i}`} x={Math.min(x1, proj.plotW) - 4} y={y - 3} textAnchor="end" fill={ln.color} fontSize={ln.size}>{ln.label}</text>
      ),
    );
  });
  return <>{out}</>;
}

function SmtLayer({ lines, proj, ict }: { lines: SmtLine[]; proj: Projector; ict: IctSettings }) {
  const cfg = ict.smt;
  const size = LABEL_PX[ict.labelSize] ?? 12;
  return (
    <>
      {lines.map((ln) => {
        const y0 = proj.priceToY(ln.p0);
        const y1 = proj.priceToY(ln.p1);
        if (y0 == null || y1 == null) return null;
        const c = ln.bull ? cfg.bullColor : cfg.bearColor;
        const x0 = proj.xOfIndex(ln.k0);
        const x1 = proj.xOfIndex(ln.k1);
        return (
          <g key={`${ln.bull}-${ln.time}`} className="smt" data-kind={ln.bull ? "bull" : "bear"}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={c} strokeWidth={cfg.width} strokeDasharray={DASH[cfg.style] || undefined} />
            {cfg.label && (
              <text x={(x0 + x1) / 2} y={(y0 + y1) / 2 + (ln.bull ? size + 2 : -4)} textAnchor="middle" fill={c} fontSize={size}>
                {cfg.text}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

type T = ReturnType<typeof useI18n>["t"];

const dashOf = (st?: LineStyle) => (st && DASH[st] ? DASH[st] : undefined);

/** Chữ (tab Text) của hình: căn theo textPlacement, xoay theo đường. */
function NoteText({ s, P, W }: { s: Drawing; P: XY[]; W: number }) {
  if (!s.note) return null;
  const tb = textPlacement(s, P, W);
  return (
    <text
      className="note" x={tb.x} y={tb.y + tb.off} textAnchor={tb.anchor} dominantBaseline={tb.base}
      fill={s.noteColor ?? s.color ?? DRAW} fontSize={s.noteSize ?? 14}
      fontWeight={s.noteB ? 700 : undefined} fontStyle={s.noteI ? "italic" : undefined}
      transform={tb.ang ? `rotate(${tb.ang.toFixed(2)} ${tb.x.toFixed(1)} ${tb.y.toFixed(1)})` : undefined}
    >
      {s.note}
    </text>
  );
}

/** Nhãn giá nhỏ (nền màu hình, chữ trắng) cạnh một điểm. */
function PriceTag({ x, y, text, color, side }: { x: number; y: number; text: string; color: string; side: "left" | "right" }) {
  const w = text.length * 6.6 + 10;
  const x0 = side === "right" ? x + 6 : x - 6 - w;
  return (
    <g data-role="price-tag">
      <rect x={x0} y={y - 9} width={w} height={18} rx={3} fill={color} />
      <text x={x0 + w / 2} y={y + 4} fill="var(--replay-handle)" fontSize={11} textAnchor="middle">{text}</text>
    </g>
  );
}

/** Hộp số liệu của đường xu hướng (Stats). */
function StatsBox({ s, P, tf, t, digits }: { s: Drawing; P: XY[]; tf: number; t: T; digits: number }) {
  const keys = s.stats ?? [];
  if (!keys.length) return null;
  const [i0, i1] = s.pts[0].t <= s.pts[1].t ? [0, 1] : [1, 0];
  const st = trendStats(s.pts[i0], s.pts[i1], { tick: TICK, tf, dx: P[i1].x - P[i0].x, dy: P[i1].y - P[i0].y });
  const has = (k: StatKey) => keys.includes(k);
  const sign = (v: number, txt: string) => (v > 0 ? `+${txt}` : txt);
  const lines: string[] = [];
  const first = [
    has("priceRange") ? sign(st.change, st.change.toFixed(digits)) : "",
    has("percent") ? `(${sign(st.percent, st.percent.toFixed(2))}%)` : "",
    has("ticks") ? sign(st.ticks, String(st.ticks)) : "",
  ].filter(Boolean);
  if (first.length) lines.push(first.join(" "));
  const second: string[] = [];
  if (has("bars")) second.push(t("replay.stats.bars", { n: st.bars }));
  if (has("dateRange")) second.push(fmtSpan(st.seconds, t));
  if (second.length) lines.push(second.join(", "));
  const third: string[] = [];
  if (has("distance")) third.push(t("replay.stats.distance", { px: st.distance.toFixed(0) }));
  if (has("angle")) third.push(t("replay.stats.angle", { deg: st.angle.toFixed(2) }));
  if (third.length) lines.push(third.join(", "));
  const pos = s.statsPos === "auto" ? "right" : (s.statsPos ?? "right");
  const anchorPt = pos === "left" ? (P[0].x <= P[1].x ? P[0] : P[1]) : pos === "right" ? (P[0].x <= P[1].x ? P[1] : P[0]) : { x: (P[0].x + P[1].x) / 2, y: (P[0].y + P[1].y) / 2 };
  const w = Math.max(...lines.map((l) => l.length)) * 6.6 + 16;
  const h = lines.length * 16 + 8;
  const x0 = pos === "left" ? anchorPt.x - w - 8 : pos === "right" ? anchorPt.x + 8 : anchorPt.x - w / 2;
  const y0 = anchorPt.y + 10;
  return (
    <g data-role="stats">
      <rect x={x0} y={y0} width={w} height={h} rx={4} fill="var(--replay-stats-bg)" />
      {lines.map((l, i) => (
        <text key={i} x={x0 + 8} y={y0 + 17 + i * 16} fill="var(--replay-stats-fg)" fontSize={12}>{l}</text>
      ))}
    </g>
  );
}

/** "3 ngày 4 giờ 5 phút" — bỏ các phần bằng 0. */
function fmtSpan(sec: number, t: T): string {
  const a = Math.abs(sec);
  const parts: string[] = [];
  const d = Math.floor(a / 86400);
  const h = Math.floor((a % 86400) / 3600);
  const m = Math.floor((a % 3600) / 60);
  if (d) parts.push(t("replay.stats.days", { n: d }));
  if (h) parts.push(t("replay.stats.hours", { n: h }));
  if (m || !parts.length) parts.push(t("replay.stats.minutes", { n: m }));
  return parts.join(" ");
}

interface ShapeProps {
  k: number;
  d: Drawing;
  P: XY[];
  proj: Projector;
  fg: string;
  sel: boolean;
  t: T;
  tf: number;
  digits: number;
}

function Shape({ k, d: raw, P, proj, fg, sel, t, tf, digits }: ShapeProps) {
  const s = withDefaults(raw);
  const c = s.color ?? DRAW;
  const W = proj.plotW;
  const stroke = (def: number) => ({ stroke: c, strokeWidth: s.width ?? def, strokeDasharray: dashOf(s.dash) });
  const pts = P.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");
  const arrow = (end?: EndCap) => (end === "arrow" ? `url(#${markerKey(k, c)})` : undefined);
  let body: ReactNode = null;
  switch (s.type) {
    case "trend": {
      const [a, b] = extendSegment(P[0], P[1], !!s.extL, !!s.extR, W);
      body = (
        <>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...stroke(2)} markerStart={s.extL ? undefined : arrow(s.endL)} markerEnd={s.extR ? undefined : arrow(s.endR)} />
          {s.midPoint && <circle data-role="mid-point" cx={(P[0].x + P[1].x) / 2} cy={(P[0].y + P[1].y) / 2} r={4} fill="var(--replay-handle)" stroke={c} strokeWidth={1.5} />}
          {s.priceLabels &&
            [0, 1].map((i) => (
              <PriceTag key={i} x={P[i].x} y={P[i].y} text={s.pts[i].p.toFixed(digits)} color={c} side={P[i].x >= P[1 - i].x ? "right" : "left"} />
            ))}
          {(sel || s.statsAlways) && <StatsBox s={s} P={P} tf={tf} t={t} digits={digits} />}
        </>
      );
      break;
    }
    case "rect": {
      const L = s.extL ? 0 : Math.min(P[0].x, P[1].x);
      const R = s.extR ? W : Math.max(P[0].x, P[1].x);
      const top = Math.min(P[0].y, P[1].y);
      const bot = Math.max(P[0].y, P[1].y);
      body = (
        <>
          <rect x={L} y={top} width={R - L} height={bot - top} fill={s.fillOn ? (s.fill ?? "none") : "none"} {...stroke(2)} />
          {s.midLine && (
            <line data-role="mid-line" x1={L} y1={(top + bot) / 2} x2={R} y2={(top + bot) / 2} stroke={s.midColor} strokeWidth={s.midWidth ?? 1} strokeDasharray={dashOf(s.midDash)} />
          )}
        </>
      );
      break;
    }
    case "hray":
      body = <line x1={P[0].x} y1={P[0].y} x2={W} y2={P[0].y} {...stroke(2)} />;
      break;
    case "brush":
      body = <polyline points={pts} fill="none" {...stroke(2)} strokeLinecap="round" strokeLinejoin="round" />;
      break;
    case "path":
      body = <polyline points={pts} fill="none" {...stroke(2)} strokeLinejoin="round" markerStart={arrow(s.endL)} markerEnd={arrow(s.endR)} />;
      break;
    case "fib": {
      const g = fibLayout(s, P, W, proj.priceToY, digits);
      body = (
        <>
          {s.fibBg &&
            g.rows.slice(1).map((r, i) => (
              <rect
                key={`bg${r.slot}`} data-role="fib-bg" x={g.left} y={Math.min(r.y, g.rows[i].y)} width={g.right - g.left} height={Math.abs(r.y - g.rows[i].y)}
                fill={r.color} fillOpacity={s.fibBgOpacity ?? 0.15}
              />
            ))}
          {s.fibTrend && <line data-role="fib-trend" x1={P[0].x} y1={P[0].y} x2={P[1].x} y2={P[1].y} {...stroke(1)} />}
          {g.rows.map((r) => (
            <g key={r.slot} data-role="fib-level">
              <line x1={g.left} y1={r.y} x2={g.right} y2={r.y} stroke={r.color} strokeWidth={s.fibLevelWidth ?? 1} strokeDasharray={dashOf(s.fibLevelDash)} />
              {r.label && (
                <text x={g.labelX} y={r.y + g.labelDy} fill={r.color} fontSize={g.fontSize} textAnchor={g.anchor} dominantBaseline={g.baseline}>
                  {r.label}
                </text>
              )}
            </g>
          ))}
        </>
      );
      break;
    }
    case "long":
    case "short": {
      const L = Math.min(P[0].x, P[1].x);
      const R = Math.max(P[0].x, P[1].x);
      const [yE, yT, yS] = [P[0].y, P[1].y, P[2].y];
      const tp = Math.abs(s.pts[1].p - s.pts[0].p);
      const sl = Math.abs(s.pts[0].p - s.pts[2].p);
      const mid = (L + R) / 2;
      const box = (y1: number, y2: number, fill: string) => <rect x={L} y={Math.min(y1, y2)} width={R - L} height={Math.abs(y2 - y1)} fill={fill} />;
      const lab = (y: number, text: string, bg: string) => (
        <g>
          <rect x={mid - 62} y={y - 10} width={124} height={18} rx={3} fill={bg} />
          <text x={mid} y={y + 3} fill="var(--replay-handle)" fontSize={11} textAnchor="middle">{text}</text>
        </g>
      );
      body = (
        <>
          {box(yE, yT, "var(--replay-long-fill)")}
          {box(yE, yS, "var(--replay-short-fill)")}
          <line x1={L} y1={yE} x2={R} y2={yE} stroke="var(--replay-neutral)" strokeWidth={1} />
          {lab(yT + (yT < yE ? 14 : -14), t("replay.draw.tpPoints", { pts: tp.toFixed(2) }), "var(--replay-long)")}
          {lab(yS + (yS > yE ? -14 : 14), t("replay.draw.slPoints", { pts: sl.toFixed(2) }), "var(--replay-short)")}
          {lab(yE + (yT < yE ? 14 : -14), t(s.type === "long" ? "replay.draw.longRr" : "replay.draw.shortRr", { rr: sl ? (tp / sl).toFixed(2) : "—" }), "var(--replay-neutral)")}
        </>
      );
      break;
    }
    case "text":
      body = (
        <text x={P[0].x} y={P[0].y} fill={raw.color ?? fg} fontSize={s.noteSize ?? 14} fontWeight={s.noteB ? 700 : 500} fontStyle={s.noteI ? "italic" : undefined}>
          {s.text}
        </text>
      );
      break;
  }
  return (
    <g data-shape={s.type} data-id={s.id}>
      {body}
      <NoteText s={s} P={P} W={W} />
      {sel && !s.locked && handlesOf(s, P).map((h, i) => <circle key={i} cx={h.x} cy={h.y} r={5} fill="var(--replay-handle)" stroke={c} strokeWidth={1.5} />)}
    </g>
  );
}

/**
 * Phần nằm trên hai trục (ngoài vùng vẽ): nhãn giá của tia ngang, và khi chọn hình thì tô dải giá /
 * dải thời gian của hình trên trục kèm nhãn ở hai đầu, như TradingView.
 */
function AxisMarks({ items, P, selected, proj, digits, zone }: { items: Drawing[]; P: (XY[] | null)[]; selected: number | null; proj: Projector; digits: number; zone: Zone }) {
  const W = proj.plotW;
  const H = proj.plotH;
  const out: ReactNode[] = [];
  // nhãn giá của tia ngang mang màu người dùng chọn: nền sáng (vàng, trắng…) thì chữ đậm cho đọc được
  const ink = (bg: string) => (luminance(bg) > 150 ? "var(--replay-fg-on-light)" : "var(--replay-handle)");
  const tag = (key: string, y: number, text: string, bg: string) => (
    <g key={key} data-role="axis-price">
      <rect x={W + 1} y={y - 9} width={text.length * 7 + 10} height={18} rx={2} fill={bg} />
      <text x={W + 6} y={y + 4} fill={ink(bg)} fontSize={11}>{text}</text>
    </g>
  );
  items.forEach((raw, i) => {
    const pp = P[i];
    if (!pp) return;
    const s = withDefaults(raw);
    const c = s.color ?? DRAW;
    if (s.type === "hray" && s.priceLabel) out.push(tag(`h${s.id}`, pp[0].y, s.pts[0].p.toFixed(digits), c));
    if (s.id !== selected || !["trend", "rect", "hray"].includes(s.type)) return;
    const ys = pp.map((q) => q.y);
    const xs = pp.map((q) => q.x);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    out.push(<rect key={`pb${s.id}`} data-role="axis-band" x={W} y={y0} width={200} height={y1 - y0} fill="var(--replay-axis-band)" />);
    if (s.type !== "hray") {
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      out.push(<rect key={`tb${s.id}`} data-role="axis-band" x={x0} y={H} width={x1 - x0} height={40} fill="var(--replay-axis-band)" />);
      s.pts.forEach((q, j) => {
        const label = fmtLocal(toLocal(q.t, zone));
        out.push(
          <g key={`tl${s.id}-${j}`} data-role="axis-time">
            <rect x={pp[j].x - label.length * 3.4 - 5} y={H + 2} width={label.length * 6.8 + 10} height={18} rx={2} fill="var(--replay-axis-label)" />
            <text x={pp[j].x} y={H + 15} fill="var(--replay-handle)" fontSize={11} textAnchor="middle">{label}</text>
          </g>,
        );
      });
    }
    if (s.type !== "hray") s.pts.forEach((q, j) => out.push(tag(`pl${s.id}-${j}`, pp[j].y, q.p.toFixed(digits), "var(--replay-axis-label)")));
  });
  return <g className="axis-marks">{out}</g>;
}
