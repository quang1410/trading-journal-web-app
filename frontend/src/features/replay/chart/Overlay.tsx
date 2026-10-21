import { useEffect, useMemo, type ReactNode } from "react";
import { useI18n } from "@/i18n";
import { DASH, ictEmpty, ictModel, LABEL_PX, type IctModel, type IctSettings } from "../engine/ict";
import { FIB_LEVELS, fibPrice, handlesOf, noteAnchor, type Drawing } from "../engine/drawings";
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
  const items = drawings.filter((x) => x.sym === pane.ds);
  if (draft && draft.pane === k) items.push(draft.d);
  if (!items.length && ictEmpty(im) && !smt.length) return null;
  const pathColors = [...new Set(items.filter((x) => x.type === "path").map((x) => x.color ?? DRAW))];

  return (
    <svg className="pointer-events-none absolute inset-0 z-[1]" width="100%" height="100%" aria-hidden data-testid={`replay-overlay-${k}`}>
      <defs>
        <clipPath id={`replay-clip-${k}`}>
          <rect width={Math.max(0, proj.plotW)} height={Math.max(0, proj.plotH)} />
        </clipPath>
        {pathColors.map((c) => (
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
        {items.map((it) => {
          const P = it.pts.map((pt) => proj.toXY(pt));
          if (P.some((q) => !q)) return null;
          return <Shape key={it.id || "draft"} k={k} d={it} P={P as XY[]} proj={proj} fg={fg} sel={it.id === selected} t={t} />;
        })}
      </g>
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

function Shape({ k, d, P, proj, fg, sel, t }: { k: number; d: Drawing; P: XY[]; proj: Projector; fg: string; sel: boolean; t: T }) {
  const c = d.color ?? DRAW;
  const W = proj.plotW;
  const stroke = (def: number) => ({ stroke: c, strokeWidth: d.width ?? def, strokeDasharray: d.dash && DASH[d.dash] ? DASH[d.dash] : undefined });
  const pts = P.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");
  let body: ReactNode = null;
  switch (d.type) {
    case "trend":
      body = <line x1={P[0].x} y1={P[0].y} x2={P[1].x} y2={P[1].y} {...stroke(2)} />;
      break;
    case "rect":
      body = <rect x={Math.min(P[0].x, P[1].x)} y={Math.min(P[0].y, P[1].y)} width={Math.abs(P[1].x - P[0].x)} height={Math.abs(P[1].y - P[0].y)} fill={c} fillOpacity={0.12} {...stroke(1.5)} />;
      break;
    case "hray":
      body = <line x1={P[0].x} y1={P[0].y} x2={W} y2={P[0].y} {...stroke(2)} />;
      break;
    case "brush":
      body = <polyline points={pts} fill="none" {...stroke(2)} strokeLinecap="round" strokeLinejoin="round" />;
      break;
    case "path":
      body = <polyline points={pts} fill="none" {...stroke(2)} strokeLinejoin="round" markerEnd={`url(#${markerKey(k, c)})`} />;
      break;
    case "fib": {
      const x1 = Math.min(P[0].x, P[1].x);
      const x2 = Math.max(P[0].x, P[1].x);
      body = (
        <>
          <line x1={P[0].x} y1={P[0].y} x2={P[1].x} y2={P[1].y} stroke="var(--replay-fib-0)" strokeWidth={1} strokeDasharray="4 4" />
          {FIB_LEVELS.map((lv, i) => {
            const pr = fibPrice(d, lv);
            const y = proj.priceToY(pr);
            if (y == null) return null;
            const col = `var(--replay-fib-${i})`;
            return (
              <g key={lv}>
                <line x1={x1} y1={y} x2={x2} y2={y} stroke={col} strokeWidth={1.5} />
                <text x={x1 + 4} y={y - 4} fill={col} fontSize={11}>{`${lv} (${pr.toFixed(2)})`}</text>
              </g>
            );
          })}
        </>
      );
      break;
    }
    case "long":
    case "short": {
      const L = Math.min(P[0].x, P[1].x);
      const R = Math.max(P[0].x, P[1].x);
      const [yE, yT, yS] = [P[0].y, P[1].y, P[2].y];
      const tp = Math.abs(d.pts[1].p - d.pts[0].p);
      const sl = Math.abs(d.pts[0].p - d.pts[2].p);
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
          {lab(yE + (yT < yE ? 14 : -14), t(d.type === "long" ? "replay.draw.longRr" : "replay.draw.shortRr", { rr: sl ? (tp / sl).toFixed(2) : "—" }), "var(--replay-neutral)")}
        </>
      );
      break;
    }
    case "text":
      body = (
        <text x={P[0].x} y={P[0].y} fill={d.color ?? fg} fontSize={14} fontWeight={500}>
          {d.text}
        </text>
      );
      break;
  }
  let note: ReactNode = null;
  if (d.note) {
    const a = noteAnchor(d, P, W);
    note = (
      <text
        className="note" x={a.x} y={a.y - 5} textAnchor="end" fill={d.noteColor ?? "var(--replay-palette-1)"} fontSize={d.noteSize ?? 14}
        fontWeight={d.noteB ? 700 : undefined} fontStyle={d.noteI ? "italic" : undefined}
        transform={a.ang ? `rotate(${a.ang.toFixed(2)} ${a.x.toFixed(1)} ${a.y.toFixed(1)})` : undefined}
      >
        {d.note}
      </text>
    );
  }
  return (
    <g data-shape={d.type} data-id={d.id}>
      {body}
      {note}
      {sel && handlesOf(d, P).map((h, i) => <circle key={i} cx={h.x} cy={h.y} r={5} fill="var(--replay-handle)" stroke={c} strokeWidth={1.5} />)}
    </g>
  );
}
