import {
  draftAnchor, handleAnchor, hitDrawing, NOTE_TYPES, pickPoint, shiftPoints, type Drawing, type Modifiers,
} from "../engine/drawings";
import type { Projector, Pt } from "../engine/projector";
import { TICK } from "../engine/trading";
import type { PaneIndex, ReplayStore } from "../store/ReplayStore";

/**
 * Chuột trên một chart. Thứ tự ưu tiên khi nhấn chuột:
 * chọn nến / kẻ ngang → hình đang vẽ dở → công cụ vẽ → đường SL/TP/lệnh chờ → hình vẽ có sẵn → chart.
 *
 * Nghe `pointerdown` ở pha capture trên khung chart rồi chặn lan truyền, để lightweight-charts
 * không cuộn chart trong lúc vẽ hay kéo. Không dùng sự kiện click của chart vì nó nuốt mất các
 * cú click nhanh liên tiếp (coi là double-click).
 */

export interface PaneEnv {
  store: ReplayStore;
  k: PaneIndex;
  el: HTMLElement;
  projector(): Projector | null;
  /** khoá cuộn / zoom của chart trong lúc kéo */
  lock(on: boolean): void;
  /** giờ local của nến tại x (null = ngoài vùng nến) */
  timeAt(x: number): number | null;
  /** đổi vị trí đường dọc của chế độ chọn nến (null = ẩn) */
  onSelectHover(x: number | null): void;
  /** nhấn chuột vào chart (để đóng bảng màu đang mở…) */
  onPress(): void;
}

type LineKey = "sl" | "tp" | "pend";

/** Sự kiện bắt đầu trong một widget nằm trên chart (thanh hình đang chọn, hộp ghi chú…): không phải việc của chart. */
const fromWidget = (e: Event) => e.target instanceof Element && !!e.target.closest("[data-pane-widget]");
type PointerLike = { clientX: number; clientY: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean };

export class PaneInput {
  private drag: { key: LineKey; orig: number | null } | null = null;
  private ddrag: { d: Drawing; handle: number; x0: number; y0: number; orig: Pt[]; moved: boolean } | null = null;
  private lastPtr: { clientX: number; clientY: number } | null = null;
  private cleanup: (() => void)[] = [];

  constructor(private env: PaneEnv) {}

  attach(): () => void {
    const { el } = this.env;
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: boolean | AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(el, "pointerdown", (e) => this.down(e), true);
    on(window, "pointermove", (e) => this.move(e));
    on(window, "pointerup", (e) => this.up(e));
    on(el, "mousemove", (e) => this.hover(e));
    on(el, "mouseleave", () => this.env.onSelectHover(null));
    on(el, "dblclick", (e) => this.dblclick(e));
    // Ctrl+click trên Mac mở menu chuột phải: không muốn thế khi đang vẽ với nam châm
    on(el, "contextmenu", (e) => {
      if (e.ctrlKey) e.preventDefault();
    });
    // nhấn / nhả Shift hoặc Ctrl mà không rê chuột vẫn áp lại ngay cho hình đang vẽ
    const remod = (e: KeyboardEvent) => {
      if (!["Shift", "Control", "Meta"].includes(e.key) || !this.lastPtr) return;
      const fake: PointerLike = { ...this.lastPtr, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey };
      const dr = this.env.store.getState().draft;
      if (dr && dr.pane === this.env.k) this.draftMove(fake);
      else if (this.ddrag?.moved) this.moveDrawing(fake);
    };
    on(window, "keydown", remod);
    on(window, "keyup", remod);
    return () => {
      this.cleanup.forEach((f) => f());
      this.cleanup = [];
    };
  }

  private xy(e: { clientX: number; clientY: number }): [number, number] {
    const r = this.env.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  private mods(e: PointerLike): Modifiers {
    return { shift: e.shiftKey, magnet: this.env.store.getState().magnet !== (e.ctrlKey || e.metaKey) };
  }
  private sym(): string | null {
    return this.env.store.getState().panes[this.env.k].ds;
  }
  private mine(): Drawing[] {
    const sym = this.sym();
    return this.env.store.getState().drawings.filter((d) => d.sym === sym);
  }

  /** Đường kéo được (SL, TP, lệnh chờ) ở độ cao y, nếu có. */
  lineAt(y: number, proj: Projector): LineKey | null {
    const prices = this.env.store.dragPrices(this.sym());
    for (const key of ["sl", "tp", "pend"] as const) {
      const v = prices[key];
      if (v == null) continue;
      const ly = proj.priceToY(v);
      if (ly != null && Math.abs(ly - y) <= 6) return key;
    }
    return null;
  }

  down(e: PointerEvent): void {
    if (fromWidget(e)) return;
    const { store, k } = this.env;
    let st = store.getState();
    if (st.noteEditId != null) store.commitNote(true);
    this.env.onPress();
    if (k !== st.active && st.layout > 1) store.setActive(k);
    st = store.getState();
    if (!store.hasData || e.button !== 0) return;
    const proj = this.env.projector();
    if (!proj) return;
    const [x, y] = this.xy(e);
    const swallow = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (st.selectMode || st.drawMode) {
      swallow();
      this.press(x, y, e, proj);
      return;
    }
    if (st.draft) {
      swallow();
      this.draftPress(x, y, e, proj);
      return;
    }
    if (st.tool) {
      if (x <= proj.plotW) {
        swallow();
        this.startDraw(x, y, e, proj);
      }
      return;
    }
    const key = this.lineAt(y, proj);
    if (key) {
      swallow();
      store.stop();
      this.drag = { key, orig: store.dragPrices(this.sym())[key] };
      this.env.lock(true);
      return;
    }
    const hit = hitDrawing(this.mine(), st.selected, proj, x, y);
    if (hit) {
      swallow();
      store.select(hit.d.id);
      this.ddrag = { d: hit.d, handle: hit.k, x0: x, y0: y, orig: hit.d.pts.map((q) => ({ ...q })), moved: false };
      this.env.lock(true);
      return;
    }
    if (st.selected != null) store.select(null);
  }

  /** Chế độ chọn nến bắt đầu, hoặc kẻ ngang. */
  private press(x: number, y: number, e: PointerLike, proj: Projector): void {
    const { store, k } = this.env;
    if (x > proj.plotW) return; // trên thang giá
    if (store.getState().selectMode) {
      const t = this.env.timeAt(x);
      if (t != null) store.selectBar(k, t);
      this.env.onSelectHover(null);
      return;
    }
    const pt = pickPoint(proj, x, y, this.mods(e), null);
    const sym = this.sym();
    if (pt && sym) store.addHLine(sym, pt.p);
    else store.setDrawMode(false);
  }

  private startDraw(x: number, y: number, e: PointerLike, proj: Projector): void {
    const { store, k } = this.env;
    const st = store.getState();
    const pt = pickPoint(proj, x, y, this.mods(e), null);
    const sym = this.sym();
    const tool = st.tool;
    if (!pt || !sym || !tool) return;
    if (tool === "hray") {
      store.addDrawing({ sym, type: "hray", pts: [pt] });
      return;
    }
    if (tool === "text") {
      store.openTextEdit({ pane: k, x, y, pt, existingId: null });
      return;
    }
    if (tool === "long" || tool === "short") {
      // TP/SL mặc định lấy từ ô "Take profit" / "Stop loss", rộng 25 nến
      const side = tool === "long" ? 1 : -1;
      const sl = +st.form.slPts || 20;
      const tp = +st.form.tpPts || 40;
      const right = proj.fromXY(x + 25 * proj.axis.sp, y)?.t ?? pt.t;
      store.addDrawing({ sym, type: tool, pts: [pt, { t: right, p: pt.p + side * tp }, { t: right, p: pt.p - side * sl }] });
      return;
    }
    store.setDraft({ pane: k, d: { id: 0, sym, type: tool, pts: tool === "brush" ? [pt] : [pt, { ...pt }] }, down: true, x0: x, y0: y, wait: false });
  }

  private draftMove(e: PointerLike): void {
    const { store } = this.env;
    const dr = store.getState().draft;
    const proj = this.env.projector();
    if (!dr || !proj) return;
    const [x, y] = this.xy(e);
    const d = dr.d;
    const pt = d.type === "brush" ? proj.fromXY(x, y) : pickPoint(proj, x, y, this.mods(e), draftAnchor(d));
    if (!pt) return;
    let pts: Pt[];
    if (d.type === "brush") {
      if (!dr.down) return;
      const last = proj.toXY(d.pts[d.pts.length - 1]);
      if (last && Math.hypot(x - last.x, y - last.y) < 3) return;
      pts = [...d.pts, pt];
    } else pts = [...d.pts.slice(0, -1), pt];
    store.setDraft({ ...dr, d: { ...d, pts } });
  }

  private draftUp(e: PointerLike): void {
    const { store } = this.env;
    const dr = store.getState().draft;
    if (!dr) return;
    if (dr.d.type === "brush") return dr.d.pts.length > 1 ? store.finishDraft() : store.cancelDraft();
    if (dr.d.type === "path") return store.setDraft({ ...dr, down: false });
    const [x, y] = this.xy(e);
    if (Math.hypot(x - dr.x0, y - dr.y0) > 4) store.finishDraft();
    else store.setDraft({ ...dr, down: false, wait: true }); // vẽ kiểu click – click: điểm thứ hai ở lần click sau
  }

  private draftPress(x: number, y: number, e: PointerLike, proj: Projector): void {
    const { store, k } = this.env;
    const dr = store.getState().draft;
    if (!dr) return;
    const d = dr.d;
    if (dr.pane !== k) return d.type === "path" ? store.finishPath() : store.cancelDraft();
    const pt = pickPoint(proj, x, y, this.mods(e), draftAnchor(d));
    if (!pt) return;
    if (d.type === "path") {
      const prev = d.pts.length > 1 ? proj.toXY(d.pts[d.pts.length - 2]) : null;
      if (prev && Math.hypot(x - prev.x, y - prev.y) <= 6) return store.finishPath(); // click lại điểm cuối = xong
      store.setDraft({ ...dr, d: { ...d, pts: [...d.pts.slice(0, -1), pt, { ...pt }] } });
      return;
    }
    if (dr.wait) {
      store.setDraft({ ...dr, d: { ...d, pts: [...d.pts.slice(0, -1), pt] } });
      store.finishDraft();
    }
  }

  private moveDrawing(e: PointerLike): void {
    const dd = this.ddrag;
    const proj = this.env.projector();
    if (!dd || !proj) return;
    const { store } = this.env;
    const cur = store.getState().drawings.find((d) => d.id === dd.d.id);
    if (!cur) return;
    const [x, y] = this.xy(e);
    let pts: Pt[];
    if (dd.handle >= 0) {
      const pt = pickPoint(proj, x, y, this.mods(e), handleAnchor(cur, dd.handle));
      if (!pt) return;
      pts = cur.pts.map((q) => ({ ...q }));
      pts[dd.handle] = pt;
      // hộp Long/Short: TP và SL luôn cùng mép phải
      if (cur.type === "long" || cur.type === "short") {
        if (dd.handle === 1) pts[2].t = pt.t;
        if (dd.handle === 2) pts[1].t = pt.t;
      }
    } else {
      // Shift: chỉ di chuyển ngang hoặc dọc
      const horiz = e.shiftKey && Math.abs(x - dd.x0) >= Math.abs(y - dd.y0);
      const vert = e.shiftKey && !horiz;
      const a = proj.yToPrice(dd.y0);
      const b = proj.yToPrice(horiz ? dd.y0 : y);
      if (a == null || b == null) return;
      pts = shiftPoints(dd.orig, vert ? 0 : (x - dd.x0) / proj.axis.sp, b - a, proj);
    }
    store.updateDrawing(cur.id, { pts }, { save: false });
  }

  move(e: PointerEvent): void {
    this.lastPtr = { clientX: e.clientX, clientY: e.clientY };
    const { store } = this.env;
    if (this.drag) {
      const proj = this.env.projector();
      const price = proj?.yToPrice(this.xy(e)[1]);
      if (price == null) return;
      store.dragLine(this.drag.key, Math.round(price / TICK) * TICK);
    } else if (this.ddrag) {
      if (!this.ddrag.moved) store.pushUndo();
      this.ddrag.moved = true;
      this.moveDrawing(e);
    } else {
      const dr = store.getState().draft;
      if (dr && dr.pane === this.env.k) this.draftMove(e);
    }
  }

  up(e: PointerEvent): void {
    const { store } = this.env;
    if (this.drag) {
      const { key, orig } = this.drag;
      this.drag = null;
      this.env.lock(false);
      store.endDragLine(key, orig);
      (document.activeElement as HTMLElement | null)?.blur?.();
    } else if (this.ddrag) {
      this.env.lock(false);
      if (this.ddrag.moved) store.scheduleSave();
      this.ddrag = null;
    } else {
      const dr = store.getState().draft;
      if (dr && dr.pane === this.env.k && dr.down) this.draftUp(e);
    }
  }

  /** Con trỏ chuột theo thứ dưới chuột; đường dọc của chế độ chọn nến. */
  hover(e: MouseEvent): void {
    if (fromWidget(e)) return;
    const { store, el } = this.env;
    const st = store.getState();
    if (!store.hasData) return;
    const proj = this.env.projector();
    if (!proj) return;
    const [x, y] = this.xy(e);
    if (st.selectMode) {
      this.env.onSelectHover(Math.min(x, proj.plotW));
      return;
    }
    if (this.drag || this.ddrag) return;
    const idle = !st.tool && !st.draft && !st.drawMode;
    const line = idle ? this.lineAt(y, proj) : null;
    const hit = idle && !line ? hitDrawing(this.mine(), st.selected, proj, x, y) : null;
    el.classList.toggle("hover-line", !!line);
    el.classList.toggle("hover-handle", !!hit && hit.k >= 0);
    el.classList.toggle("hover-move", !!hit && hit.k < 0);
  }

  private dblclick(e: MouseEvent): void {
    if (fromWidget(e)) return;
    const { store, k } = this.env;
    const proj = this.env.projector();
    if (!proj) return;
    const [x, y] = this.xy(e);
    const hit = hitDrawing(this.mine(), store.getState().selected, proj, x, y);
    if (!hit) return;
    if (hit.d.type === "text") {
      const q = proj.toXY(hit.d.pts[0]);
      if (q) store.openTextEdit({ pane: k, x: q.x, y: q.y, pt: hit.d.pts[0], existingId: hit.d.id });
    } else if (NOTE_TYPES.includes(hit.d.type)) store.openNote(hit.d.id);
  }
}
