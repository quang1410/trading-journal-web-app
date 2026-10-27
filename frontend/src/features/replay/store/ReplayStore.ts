import type { TranslationKey } from "@/i18n/strings";
import { fetchBundleBars, fetchManifest } from "../engine/bundle";
import { parseCsv } from "../engine/csv";
import { DEMO_NAMES, makeDemoBars } from "../engine/demo";
import { styleSnapshot, type Drawing, type DrawTool, type HLine } from "../engine/drawings";
import { defaultIct, mergeDeep, type IctSettings } from "../engine/ict";
import { fetchLiveBars, isLive, liveKey, type LiveBars } from "../engine/liveFeed";
import { actionItems, DEFAULT_NAV_ACTION, isNavAction, nextJump, sanitizeNav, type NavAction, type NavSettings } from "../engine/nav";
import { buildCandles, firstBucketAfter, lowerBound, makeDataset, mergeBars, pushBar, stepTarget, upperIdx } from "../engine/series";
import type { SmtLine } from "../engine/smt";
import {
  backupSession, dropBackup, flushBackups, getDataset, getSession, listSessions, putDataset, putSession, readPref, removeDataset,
  removeSession, writePref, type OrderForm, type PaneConfig, type SessionRecord,
} from "../engine/storage";
import { chartTemplate, type ChartStyle, type ChartTemplate } from "../engine/style";
import { DEFAULT_SPEED_INDEX, SPEEDS, tfLabel } from "../engine/tf";
import { computeLocal, fmtLocalZone, parseInputValue, toLocal, type Zone } from "../engine/time";
import {
  calcQty, closePosition, contractFor, lineError, openPosition, pendingError, processBar, type Contract, type Pending, type Position, type Trade,
} from "../engine/trading";
import type { Bars, Candle, Dataset, Side } from "../engine/types";

/**
 * Bộ não của trang replay: một đồng hồ replay chung (giờ UTC) cho mọi mã, lệnh, hình vẽ, cài đặt
 * và việc lưu phiên. Không biết gì về React hay lightweight-charts:
 *
 *   - React đọc trạng thái qua `subscribe` / `getState` (useSyncExternalStore).
 *   - Chart nhận nến qua kênh riêng `onCandles`, để lúc phát 120 bước/giây không phải dựng lại cây React.
 *
 * Chuỗi hiển thị không nằm ở đây: thông báo là KHOÁ của strings.ts kèm tham số.
 */

export type Screen = "loading" | "sessions" | "chart";
export type PaneIndex = 0 | 1;

export interface Notice {
  id: number;
  key: TranslationKey;
  params?: Record<string, string | number>;
}

export interface Draft {
  pane: PaneIndex;
  d: Drawing;
  /** chuột vẫn đang giữ */
  down: boolean;
  x0: number;
  y0: number;
  /** vẽ kiểu click – click: chờ lần click thứ hai */
  wait: boolean;
}

export interface TextEdit {
  pane: PaneIndex;
  x: number;
  y: number;
  pt: { t: number; p: number };
  existingId: number | null;
}

export interface DefaultInfo {
  names: string[];
  from: number;
  to: number;
}

export interface ReplayState {
  screen: Screen;
  /** khoá trạng thái đang tải (hiện ở thanh trên), null = không tải gì */
  loading: TranslationKey | null;
  names: string[];
  counts: Record<string, number>;
  now: number;
  zone: Zone;
  layout: 1 | 2;
  panes: [PaneConfig, PaneConfig];
  active: PaneIndex;
  playing: boolean;
  speed: number;
  stepTf: number;
  form: OrderForm;
  pos: Position | null;
  pending: Pending | null;
  trades: Trade[];
  drawings: Drawing[];
  hlines: HLine[];
  selected: number | null;
  tool: DrawTool | null;
  drawMode: boolean;
  selectMode: boolean;
  draft: Draft | null;
  textEdit: TextEdit | null;
  /** hình đang mở cửa sổ Cài đặt */
  drawDialog: number | null;
  magnet: boolean;
  chartStyle: ChartStyle;
  ict: IctSettings;
  /** tăng mỗi khi cài đặt indicator đổi */
  ictVer: number;
  /** tăng mỗi khi nến của chart k đổi */
  candleVer: [number, number];
  settingsOpen: boolean;
  /** cài đặt điều hướng nhanh (Next Session / Silver Bullet / Day Open) */
  nav: NavSettings;
  /** hành động của nút điều hướng trên thanh replay: lần chọn gần nhất */
  navAction: NavAction;
  /** cửa sổ Custom Settings của điều hướng đang mở */
  navOpen: boolean;
  session: { id: string; title: string; created: number } | null;
  sessions: SessionRecord[] | null;
  sessionsBlocked: boolean;
  defaultInfo: DefaultInfo | null;
  /** đang kéo nến CME mới nhất (nút Cập nhật) */
  updating: boolean;
  notice: Notice | null;
}

export type CandleEvent = { kind: "reset"; fit: boolean } | { kind: "update"; candle: Candle };

export const DEFAULT_FORM: OrderForm = {
  contract: "NQ", type: "market", price: "", qty: "1", slPts: "20", tpPts: "40", riskUsd: "", comm: "4", balance0: "50000",
};

/** Bước lớn (nhiều nến 1m hơn mức này) thì dựng lại chart một lần thay vì cập nhật từng nến. */
const LIVE_LIMIT = 300;
const SAVE_DELAY = 1500;

/**
 * Phiên chỉ dùng data mặc định thì nhận luôn các mã mặc định thêm vào sau (như NQ, ES của CME), để ô
 * chọn mã có đủ mã. Phiên có mã từ CSV tự mở thì giữ nguyên danh sách của nó.
 */
const withNewDefaults = (dataNames: string[], defaults: string[]): string[] =>
  dataNames.every((n) => defaults.includes(n)) ? [...dataNames, ...defaults.filter((n) => !dataNames.includes(n))] : dataNames;

const num = (s: string) => {
  const v = +s;
  return Number.isFinite(v) ? v : 0;
};

export interface StoreDeps {
  fetcher?: typeof fetch;
  /** giao diện sáng/tối của app lúc chưa có cài đặt chart riêng */
  appTheme?: () => ChartTemplate;
  now?: () => number;
  /** kéo nến 1m của một mã NQ / ES qua backend, `last` = giờ nến cuối đang có (nút Cập nhật); test thay bằng hàm giả */
  liveFetch?: (name: string, last?: number) => Promise<LiveBars>;
}

export class ReplayStore {
  private state: ReplayState;
  private listeners = new Set<() => void>();
  private candleListeners: [Set<(e: CandleEvent) => void>, Set<(e: CandleEvent) => void>] = [new Set(), new Set()];
  /** các mã đang mở; cur của từng mã đổi tại chỗ khi replay tiến */
  readonly ds: Record<string, Dataset> = {};
  /** nến của từng chart, dùng chung cho chart, indicator và hình vẽ */
  readonly candles: [Candle[], Candle[]] = [[], []];
  private defaultBars: Map<string, Bars> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private drawSeq = 0;
  private noticeSeq = 0;
  private settingsSnap: { chartStyle: ChartStyle; ict: IctSettings; zone: Zone } | null = null;
  /** trạng thái trước khi mở cửa sổ Cài đặt của hình: Cancel trả lại, Ok thành một bước hoàn tác */
  private dialogBefore: { before: string; orig: Drawing } | null = null;
  /** hình đã Copy (⌘C), chờ dán */
  private clip: Drawing | null = null;
  private smtSeen = new Set<string>();
  private disposed = false;
  private readonly deps: Required<StoreDeps>;

  constructor(deps: StoreDeps = {}) {
    this.deps = {
      fetcher: deps.fetcher ?? ((...a) => fetch(...a)),
      appTheme: deps.appTheme ?? (() => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark")),
      now: deps.now ?? (() => Date.now()),
      liveFetch: deps.liveFetch ?? fetchLiveBars,
    };
    const template = this.deps.appTheme();
    this.state = {
      screen: "loading", loading: null, names: [], counts: {}, now: 0, zone: "NY", layout: 1,
      panes: [{ tf: 5, ds: null }, { tf: 60, ds: null }], active: 0, playing: false, speed: DEFAULT_SPEED_INDEX, stepTf: 1,
      form: { ...DEFAULT_FORM }, pos: null, pending: null, trades: [], drawings: [], hlines: [], selected: null, tool: null,
      drawMode: false, selectMode: false, draft: null, textEdit: null, drawDialog: null,
      magnet: readPref("magnet", false),
      chartStyle: { ...chartTemplate(template), ...readPref<Partial<ChartStyle>>("chartStyle", {}) },
      ict: mergeDeep(defaultIct(), readPref<unknown>("ict", null)),
      nav: sanitizeNav(readPref<unknown>("nav", null)),
      navAction: ((a: unknown) => (isNavAction(a) ? a : DEFAULT_NAV_ACTION))(readPref<unknown>("navAction", null)),
      navOpen: false,
      ictVer: 0, candleVer: [0, 0], settingsOpen: false, session: null, sessions: null, sessionsBlocked: false, defaultInfo: null, updating: false, notice: null,
    };
  }

  // ---------- đăng ký / trạng thái ----------
  getState = (): ReplayState => this.state;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  onCandles(k: PaneIndex, fn: (e: CandleEvent) => void): () => void {
    this.candleListeners[k].add(fn);
    return () => this.candleListeners[k].delete(fn);
  }
  private set(patch: Partial<ReplayState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private emitCandles(k: PaneIndex, e: CandleEvent): void {
    this.candleListeners[k].forEach((fn) => fn(e));
  }
  notify(key: TranslationKey, params?: Record<string, string | number>): void {
    this.set({ notice: { id: ++this.noticeSeq, key, params } });
  }
  /** Giờ local `lt` kèm múi giờ đang chọn, cho giờ nằm trong thông báo. */
  private fmtAt(lt: number): string {
    return fmtLocalZone(lt, this.state.zone);
  }

  get hasData(): boolean {
    return this.state.names.length > 0;
  }
  activeDs(): Dataset | null {
    const name = this.state.panes[this.state.active].ds;
    return name ? (this.ds[name] ?? null) : null;
  }
  paneDs(k: PaneIndex): Dataset | null {
    const name = this.state.panes[k].ds;
    return name ? (this.ds[name] ?? null) : null;
  }
  visible(): PaneIndex[] {
    return this.state.layout === 2 ? [0, 1] : [0];
  }
  lastPrice(name: string | null | undefined): number | null {
    const d = name ? this.ds[name] : undefined;
    return d && d.cur >= 0 ? d.C[d.cur] : null;
  }

  // ---------- nến ----------
  private rebuildPane(k: PaneIndex, fit: boolean): void {
    const d = this.paneDs(k);
    const cs = d ? buildCandles(d, this.state.panes[k].tf, this.state.zone) : [];
    this.candles[k].length = 0;
    this.candles[k].push(...cs);
    this.emitCandles(k, { kind: "reset", fit });
  }
  private rebuild(fit: boolean, which: PaneIndex[] = this.visible()): void {
    which.forEach((k) => this.rebuildPane(k, fit));
    const v: [number, number] = [...this.state.candleVer];
    which.forEach((k) => v[k]++);
    this.set({ candleVer: v });
  }
  private syncCursors(now: number): void {
    for (const d of Object.values(this.ds)) d.cur = upperIdx(d, now);
  }

  // ---------- mở / lưu phiên ----------
  /** list = các mã của phiên; rec = phiên đã lưu cần khôi phục, không có thì mở phiên mới. */
  openSession(list: { name: string; bars: Bars }[], rec: SessionRecord | null = null): void {
    this.stop();
    this.clearUndo();
    this.smtSeen.clear();
    for (const k of Object.keys(this.ds)) delete this.ds[k];
    const zone = rec?.settings.zone ?? this.state.zone;
    for (const { name, bars } of list) this.ds[name] = makeDataset(name, bars, zone, 0);
    const names = list.map((x) => x.name);
    const pick = (want: string | null | undefined, k: number) => (want && this.ds[want] ? want : names[Math.min(k, names.length - 1)]);
    let patch: Partial<ReplayState>;
    if (rec) {
      const s = rec.settings;
      const idx = (sym: string, t: number) => (this.ds[sym] ? Math.min(this.ds[sym].n - 1, lowerBound(this.ds[sym].T, t)) : -1);
      const panes: [PaneConfig, PaneConfig] = [0, 1].map((k) => ({ tf: s.panes[k]?.tf ?? (k ? 60 : 5), ds: pick(s.panes[k]?.ds, k) })) as [PaneConfig, PaneConfig];
      const layout = s.layout === 2 ? 2 : 1;
      this.syncCursors(rec.t);
      patch = {
        zone, now: rec.t, panes, layout, active: layout === 2 && s.active === 1 ? 1 : 0,
        speed: s.speed ?? DEFAULT_SPEED_INDEX, stepTf: s.stepTf ?? 1, form: { ...DEFAULT_FORM, ...s.form },
        trades: rec.trades.filter((t) => this.ds[t.sym]).map((t) => ({ ...t, i0: idx(t.sym, t.t0), i1: idx(t.sym, t.t1) })),
        pos: rec.pos && this.ds[rec.pos.sym] ? { ...rec.pos, i0: idx(rec.pos.sym, rec.pos.t0) } : null,
        pending: rec.pending && this.ds[rec.pending.sym] ? { ...rec.pending } : null,
        hlines: rec.hlines.map((h) => ({ ...h })),
        drawings: rec.drawings.map((d) => ({ ...d, pts: d.pts.map((q) => ({ ...q })) })),
        session: { id: rec.id, title: rec.title, created: rec.created },
      };
    } else {
      const d0 = this.ds[names[0]];
      // bắt đầu khoảng 20 ngày giao dịch trước cuối data, để có lịch sử trên màn hình
      let c = Math.max(0, d0.n - 1 - 20 * 1380);
      if (c < 500) c = Math.min(d0.n - 1, Math.floor(d0.n * 0.3));
      const now = d0.T[c];
      this.syncCursors(now);
      const tf0 = this.state.panes[0].tf;
      patch = {
        zone, now,
        panes: [{ tf: tf0, ds: names[0] }, { tf: names.length > 1 ? tf0 : this.state.panes[1].tf, ds: pick(names[1], 1) }],
        layout: names.length > 1 ? 2 : 1, active: 0, trades: [], pos: null, pending: null, hlines: [], drawings: [],
        session: { id: this.deps.now().toString(36), title: `${names.map((n) => n.replace(/_m1$/i, "")).join(" + ")} · ${new Date(this.deps.now()).toLocaleString()}`, created: this.deps.now() },
      };
    }
    this.drawSeq = (patch.drawings ?? []).reduce((m, d) => Math.max(m, d.id), 0);
    const active = patch.panes![patch.active ?? 0].ds;
    this.set({
      ...patch, screen: "chart", names, counts: Object.fromEntries(list.map((x) => [x.name, x.bars.n])),
      selected: null, tool: null, drawMode: false, selectMode: false, draft: null, textEdit: null, drawDialog: null, playing: false,
      form: { ...(patch.form ?? this.state.form), contract: contractFor(active ?? "", (patch.form ?? this.state.form).contract) },
    });
    this.rebuild(true, [0, 1]);
    this.noticeNotStarted(this.visible());
    void this.saveSession();
  }

  /** Tải data mặc định (public/replay-data) một lần; null nếu không có. */
  async loadDefault(): Promise<Map<string, Bars> | null> {
    if (this.defaultBars) return this.defaultBars;
    const manifest = await fetchManifest(this.deps.fetcher);
    if (!manifest) return null;
    const out = new Map<string, Bars>();
    for (const e of manifest.symbols) {
      let bars = await fetchBundleBars(e, this.deps.fetcher);
      // NQ / ES: gộp thêm phần đã kéo về trình duyệt bằng nút Cập nhật (có thể mới hơn bundle)
      if (isLive(e.name)) {
        const saved = await getDataset(liveKey(e.name)).catch(() => undefined);
        // bundle thắng ở phút trùng: bundle đóng gói lại (sửa lỗi, data tốt hơn) phải thay được bản
        // cũ đã lưu trong trình duyệt; bản trình duyệt chỉ góp phần nến bundle chưa có
        if (saved?.n) bars = mergeBars(saved, bars);
      }
      out.set(e.name, bars);
    }
    this.defaultBars = out;
    const all = [...out.values()];
    this.set({ defaultInfo: { names: [...out.keys()], from: Math.min(...all.map((b) => b.T[0])), to: Math.max(...all.map((b) => b.T[b.n - 1])) } });
    return out;
  }

  /**
   * Bắt đầu dùng store (mount trang). Gọi nhiều lần vẫn chỉ khởi động một lần: StrictMode của React
   * chạy effect hai lần (mount → unmount → mount) trên cùng một store.
   */
  start(): Promise<void> {
    this.disposed = false;
    this.booting ??= this.boot();
    return this.booting;
  }
  private booting: Promise<void> | null = null;

  /** Khởi động: mở phiên gần nhất dùng data mặc định, chưa có thì mở phiên mới với data đó. */
  async boot(): Promise<void> {
    if (this.hasData) return; // đã có phiên mở sẵn (ví dụ test truyền store vào)
    try {
      await flushBackups();
    } catch {
      // IndexedDB bị chặn: vẫn chạy được, chỉ không nhớ phiên
    }
    this.set({ loading: "replay.status.loadingDefault" });
    let bars: Map<string, Bars> | null = null;
    try {
      bars = await this.loadDefault();
    } catch {
      this.notify("replay.toast.defaultFailed");
    }
    if (this.disposed) return;
    this.set({ loading: null });
    if (!bars) return this.showSessions();
    let recs: SessionRecord[] = [];
    try {
      recs = await listSessions();
    } catch {
      // không đọc được phiên cũ: mở phiên mới
    }
    const names = [...bars.keys()];
    const rec = recs.find((r) => r.dataNames.every((n) => names.includes(n)));
    const list = (rec ? withNewDefaults(rec.dataNames, names) : names).map((name) => ({ name, bars: bars.get(name)! }));
    this.openSession(list, rec ?? null);
  }

  /**
   * Nút Cập nhật: kéo nến 1m của NQ / ES (mã CME đang có trong phiên) mà máy còn thiếu — backend trả
   * cả những tuần cron đã lưu — gộp với data đã có, lưu vào trình duyệt để lần sau mở trang vẫn còn,
   * rồi vẽ lại chart. Kéo lỗi thì giữ data cũ; TradingView lỗi mà DB có nến thì vẫn lấy phần đã lưu.
   */
  async refreshLive(): Promise<void> {
    const names = this.state.names.filter(isLive);
    if (this.state.updating || !names.length) return;
    this.set({ updating: true });
    let added = 0;
    let error: string | null = null;
    let saved = true;
    let stale = false;
    let last = -Infinity;
    for (const name of names) {
      // dataset của phiên lúc bấm; đổi phiên trong lúc chờ thì dataset này không còn trên chart
      const before = this.ds[name];
      try {
        const base = this.defaultBars?.get(name) ?? before;
        const fresh = await this.deps.liveFetch(name, base.n ? base.T[base.n - 1] : undefined);
        stale ||= !!fresh.stale;
        const merged = mergeBars(base, fresh);
        added += merged.n - base.n;
        await putDataset(liveKey(name), merged).catch(() => (saved = false));
        this.defaultBars?.set(name, merged);
        if (!this.disposed && this.ds[name] === before) this.replaceBars(name, merged);
        last = Math.max(last, merged.T[merged.n - 1]);
      } catch (e) {
        error ??= e instanceof Error ? e.message : String(e);
      }
    }
    if (this.disposed) return;
    this.set({ updating: false });
    const to = Number.isFinite(last) ? this.fmtAt(toLocal(last, this.state.zone)) : "";
    if (error) this.notify("replay.toast.liveFailed", { error });
    else if (!saved) this.notify("replay.toast.liveNotSaved");
    else if (stale) this.notify("replay.toast.liveStale", { n: added.toLocaleString(), to });
    else if (added) this.notify("replay.toast.liveUpdated", { n: added.toLocaleString(), to });
    else this.notify("replay.toast.liveUpToDate", { to });
  }

  /** Thay nến của một mã đang mở; chỉ số nến của lệnh tính lại theo giờ vì nến mới có thể chen vào giữa. */
  private replaceBars(name: string, bars: Bars): void {
    const d = makeDataset(name, bars, this.state.zone, this.state.now);
    this.ds[name] = d;
    const at = (t: number) => Math.min(d.n - 1, lowerBound(d.T, t));
    const s = this.state;
    this.set({
      counts: { ...s.counts, [name]: d.n },
      trades: s.trades.map((t) => (t.sym === name ? { ...t, i0: at(t.t0), i1: at(t.t1) } : t)),
      pos: s.pos?.sym === name ? { ...s.pos, i0: at(s.pos.t0) } : s.pos,
      defaultInfo: s.defaultInfo && { ...s.defaultInfo, to: Math.max(s.defaultInfo.to, d.T[d.n - 1]) },
    });
    this.rebuild(false, this.visible().filter((k) => s.panes[k].ds === name));
  }

  async openDefault(): Promise<void> {
    const bars = await this.loadDefault().catch(() => null);
    if (!bars) return this.notify("replay.toast.noDefault");
    await this.saveSession();
    this.openSession([...bars.entries()].map(([name, b]) => ({ name, bars: b })));
  }

  async openDemo(): Promise<void> {
    await this.saveSession();
    const [a, b] = makeDemoBars();
    const list = [{ name: DEMO_NAMES[0], bars: a }, { name: DEMO_NAMES[1], bars: b }];
    this.openSession(list);
    list.forEach((x) => putDataset(x.name, x.bars).catch(() => {}));
  }

  private async readFiles(files: File[]): Promise<{ name: string; bars: Bars }[]> {
    const list: { name: string; bars: Bars }[] = [];
    for (const f of files) {
      this.set({ loading: "replay.status.readingFile" });
      const bars = parseCsv(await f.text());
      if (bars.n) list.push({ name: f.name.replace(/\.csv$/i, ""), bars });
      else this.notify("replay.toast.noBarsInFile", { file: f.name });
    }
    this.set({ loading: null });
    return list;
  }
  private storeDatasets(list: { name: string; bars: Bars }[]): void {
    Promise.all(list.map((x) => putDataset(x.name, x.bars)))
      .then(() => this.notify("replay.toast.dataSaved"))
      .catch(() => this.notify("replay.toast.dataNotSaved"));
  }
  /** "Mở CSV" = phiên mới; "+ Thêm mã" = thêm vào phiên đang mở, mã mới hiện ở chart bên phải. */
  async openFiles(files: File[], mode: "new" | "add"): Promise<void> {
    const list = await this.readFiles(files);
    if (!list.length) return;
    if (mode === "new" || !this.hasData) {
      await this.saveSession();
      this.openSession(list);
    } else {
      let { layout, active, panes } = this.state;
      panes = [{ ...panes[0] }, { ...panes[1] }];
      for (const { name, bars } of list) {
        this.ds[name] = makeDataset(name, bars, this.state.zone, this.state.now);
        if (layout === 1) {
          layout = 2;
          panes[1].tf = panes[0].tf;
          active = 1;
        }
        panes[active].ds = name;
      }
      const names = Object.keys(this.ds);
      this.set({ layout, active, panes, names, counts: { ...this.state.counts, ...Object.fromEntries(list.map((x) => [x.name, x.bars.n])) } });
      this.setContractFor(panes[active].ds);
      this.rebuild(true);
      this.scheduleSave();
    }
    this.storeDatasets(list);
  }

  async showSessions(): Promise<void> {
    this.stop();
    this.set({ selectMode: false, tool: null, drawMode: false });
    if (this.hasData) await this.saveSession();
    try {
      this.set({ screen: "sessions", sessions: await listSessions(), sessionsBlocked: false });
    } catch {
      this.set({ screen: "sessions", sessions: [], sessionsBlocked: true });
    }
  }
  backToChart(): void {
    if (this.hasData) this.set({ screen: "chart" });
  }

  async resume(id: string): Promise<void> {
    try {
      const rec = await getSession(id);
      if (!rec) return this.notify("replay.toast.sessionNotFound");
      const list: { name: string; bars: Bars }[] = [];
      const missing: string[] = [];
      const defaults = this.defaultBars ?? (await this.loadDefault().catch(() => null));
      for (const name of withNewDefaults(rec.dataNames, [...(defaults?.keys() ?? [])])) {
        let bars: Bars | undefined = this.ds[name];
        if (!bars) bars = defaults?.get(name);
        if (!bars) bars = await getDataset(name);
        if (bars) list.push({ name, bars });
        else missing.push(name.replace(/_m1$/i, ""));
      }
      if (!list.length) return this.notify("replay.toast.dataGone", { names: missing.join(", ") });
      this.openSession(list, rec);
      if (missing.length) this.notify("replay.toast.dataMissing", { names: missing.join(", ") });
    } catch (e) {
      this.notify("replay.toast.resumeFailed", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  async deleteSession(id: string): Promise<void> {
    try {
      const rec = await getSession(id);
      await removeSession(id);
      dropBackup(id);
      if (this.state.session?.id === id) this.set({ session: null });
      const rest = await listSessions();
      const defaults = this.state.defaultInfo?.names ?? [];
      // data CSV tự mở mà không còn phiên nào dùng thì xoá luôn khỏi trình duyệt
      for (const name of rec?.dataNames ?? []) {
        if (!defaults.includes(name) && !rest.some((s) => s.dataNames.includes(name))) await removeDataset(name);
      }
      this.set({ sessions: rest });
    } catch (e) {
      this.notify("replay.toast.deleteFailed", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  sessionRecord(): SessionRecord | null {
    const s = this.state;
    if (!s.session || !this.hasData) return null;
    return {
      id: s.session.id, title: s.session.title, created: s.session.created, updated: this.deps.now(), dataNames: Object.keys(this.ds),
      t: s.now, nTrades: s.trades.length, net: s.trades.reduce((a, t) => a + t.pnl, 0),
      trades: s.trades.map((t) => ({ ...t })), pos: s.pos && { ...s.pos }, pending: s.pending && { ...s.pending },
      hlines: s.hlines.map((h) => ({ ...h })), drawings: s.drawings.map((d) => ({ ...d, pts: d.pts.map((q) => ({ ...q })) })),
      settings: { zone: s.zone, layout: s.layout, stepTf: s.stepTf, speed: s.speed, panes: s.panes.map((p) => ({ ...p })), active: s.active, form: { ...s.form } },
    };
  }
  async saveSession(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const rec = this.sessionRecord();
    if (!rec) return;
    try {
      await putSession(rec);
      dropBackup(rec.id);
    } catch {
      // IndexedDB bị chặn: phiên chỉ sống tới khi đóng trang
    }
  }
  scheduleSave(): void {
    if (!this.state.session || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveSession();
    }, SAVE_DELAY);
  }
  /** Rời trang / ẩn tab: chép đồng bộ vào localStorage rồi mới ghi IndexedDB. */
  backup(): void {
    const rec = this.sessionRecord();
    if (rec) backupSession(rec);
    void this.saveSession();
  }
  dispose(): void {
    this.backup();
    this.stop();
    this.disposed = true;
  }

  // ---------- replay ----------
  /** Dời đồng hồ replay chung tới tNew và hiện nến của mọi mã tới đó. */
  advanceTo(tNew: number): void {
    const all = Object.values(this.ds);
    const total = all.reduce((s, d) => s + Math.max(0, upperIdx(d, tNew) - d.cur), 0);
    const live = total <= LIVE_LIMIT;
    let orders = { pos: this.state.pos, pending: this.state.pending };
    const trades: Trade[] = [];
    const { panes, zone } = this.state;
    const vis = this.visible();
    for (const d of all) {
      const end = upperIdx(d, tNew);
      const mine = vis.filter((k) => panes[k].ds === d.name);
      while (d.cur < end) {
        d.cur++;
        const r = processBar(orders, d, d.cur);
        orders = r.state;
        if (r.trade) trades.push(r.trade);
        if (live) for (const k of mine) this.emitCandles(k, { kind: "update", candle: pushBar(this.candles[k], d, d.cur, panes[k].tf, zone) });
      }
    }
    const patch: Partial<ReplayState> = { now: tNew, pos: orders.pos, pending: orders.pending };
    if (trades.length) patch.trades = [...this.state.trades, ...trades];
    if (live) {
      const v: [number, number] = [...this.state.candleVer];
      vis.forEach((k) => v[k]++);
      patch.candleVer = v;
      this.set(patch);
    } else {
      this.set(patch);
      this.rebuild(false);
    }
    this.scheduleSave();
  }
  private stepSize(): number {
    return this.state.stepTf || this.state.panes[this.state.active].tf;
  }
  stepBy(tf: number, k = 1): void {
    const d = this.activeDs();
    if (!d) return;
    const t = stepTarget(d, Object.values(this.ds), tf, k, this.state.zone);
    if (t == null) {
      this.stop();
      this.notify("replay.toast.noMoreData");
      return;
    }
    this.advanceTo(t);
  }
  stepOnce(): void {
    this.stepBy(this.stepSize());
  }
  nextCandle(): void {
    this.stepBy(this.state.panes[this.state.active].tf);
  }
  play(): void {
    if (!this.hasData || this.timer) return;
    this.set({ playing: true, selectMode: false });
    let last = performance.now();
    let acc = 0;
    this.timer = setInterval(() => {
      const t = performance.now();
      acc += ((t - last) / 1000) * SPEEDS[this.state.speed];
      last = t;
      const k = Math.floor(acc);
      if (k > 0) {
        acc -= k;
        this.stepBy(this.stepSize(), k);
      }
    }, 40);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.state.playing) this.set({ playing: false });
  }
  togglePlay(): void {
    if (this.state.playing) this.stop();
    else this.play();
  }
  setSpeed(i: number): void {
    this.set({ speed: Math.max(0, Math.min(SPEEDS.length - 1, i)) });
    this.scheduleSave();
  }
  setStepTf(tf: number): void {
    this.set({ stepTf: tf });
    this.scheduleSave();
  }

  seekTo(t: number): boolean {
    if (!this.hasData) return false;
    if (this.state.pos || this.state.pending) {
      this.notify("replay.toast.closeBeforeSeek");
      return false;
    }
    this.stop();
    this.syncCursors(t);
    this.set({ now: t });
    this.rebuild(true);
    this.scheduleSave();
    return true;
  }
  /** Nhảy tới ngày giờ của ô ngày (giờ local đang chọn). */
  seekDate(value: string): void {
    const d = this.activeDs();
    if (!d) return;
    const lt = value ? parseInputValue(value) : null;
    if (lt == null) return this.notify("replay.toast.pickDate");
    if (!(lt >= d.LT[0] - 86400 && lt <= d.LT[d.n - 1])) {
      return this.notify(DEMO_NAMES.includes(d.name as (typeof DEMO_NAMES)[number]) ? "replay.toast.outOfRangeDemo" : "replay.toast.outOfRange", {
        symbol: d.name.replace(/_m1$/i, ""), from: this.fmtAt(d.LT[0]), to: this.fmtAt(d.LT[d.n - 1]),
      });
    }
    const i = lowerBound(d.LT, lt);
    if (!this.seekTo(d.T[i])) return;
    // cuối tuần / ngày nghỉ: không có nến ở phút đó, nên tới nến kế tiếp
    if (d.LT[i] - lt >= 60) this.notify("replay.toast.noBarAt", { at: this.fmtAt(lt), next: this.fmtAt(d.LT[i]) });
  }
  randomSeek(random: () => number = Math.random): void {
    const d = this.activeDs();
    if (!d) return;
    const lo = Math.min(d.n - 1, 5000);
    const hi = Math.max(lo, d.n - 2000);
    this.seekTo(d.T[lo + Math.floor(random() * (hi - lo))]);
  }
  /**
   * Tua tới lần kế tiếp của mốc điều hướng `action` (giờ NY), tính từ nến replay hiện tại, và nhớ nó
   * làm hành động của nút. Tua tiến như bấm bước: lệnh đang mở / lệnh chờ vẫn chạy qua từng nến
   * (khớp, chạm SL/TP) chứ không bị chặn như khi nhảy ngày.
   */
  jumpNext(action: NavAction = this.state.navAction): void {
    if (action !== this.state.navAction) {
      this.set({ navAction: action });
      writePref("navAction", action);
    }
    const d = this.activeDs();
    if (!d) return;
    this.stop();
    const { slots, skipDays } = this.state.nav;
    const i = nextJump(d.T, d.cur, actionItems(action).map((k) => slots[k].time), slots.dayOpen.time, skipDays);
    if (i == null) return this.notify("replay.toast.noNextNav");
    this.advanceTo(d.T[i]);
  }
  setNavOpen(open: boolean): void {
    if (open) this.stop();
    this.set({ navOpen: open });
  }
  setNav(nav: NavSettings): void {
    this.set({ nav });
    writePref("nav", nav);
  }
  /** Alt+R: đưa các chart về khung nhìn mặc định (150 nến gần nhất). */
  fitCharts(): void {
    this.visible().forEach((k) => this.emitCandles(k, { kind: "reset", fit: true }));
  }
  setZone(zone: Zone): void {
    if (zone === this.state.zone) return;
    for (const d of Object.values(this.ds)) d.LT = computeLocal(d.T, zone);
    this.set({ zone });
    if (this.hasData) this.rebuild(true);
    this.scheduleSave();
  }
  localNow(): number {
    return toLocal(this.state.now, this.state.zone);
  }

  // ---------- chart ----------
  setActive(k: PaneIndex): void {
    if (k === this.state.active || (k === 1 && this.state.layout === 1)) return;
    this.set({ active: k });
    this.setContractFor(this.state.panes[k].ds);
  }
  private setContractFor(name: string | null): void {
    if (name) this.set({ form: { ...this.state.form, contract: contractFor(name, this.state.form.contract) } });
  }
  setPaneSymbol(name: string): void {
    if (!this.ds[name]) return;
    const panes: [PaneConfig, PaneConfig] = [{ ...this.state.panes[0] }, { ...this.state.panes[1] }];
    panes[this.state.active].ds = name;
    this.set({ panes });
    this.setContractFor(name);
    this.rebuild(true, [this.state.active]);
    this.scheduleSave();
    this.noticeNotStarted([this.state.active]);
  }
  /** Mã có data ngắn (NQ, ES chỉ vài tuần 1m) mà thời điểm replay còn sớm hơn: chart trống, nói lý do. */
  private noticeNotStarted(which: PaneIndex[]): void {
    for (const k of which) {
      const d = this.paneDs(k);
      if (d && d.cur < 0) return this.notify("replay.toast.dataStartsLater", { symbol: d.name.replace(/_m1$/i, ""), from: this.fmtAt(d.LT[0]) });
    }
  }
  /** Nút "Tới đầu data" trên chart trống: tua tới nến đầu tiên của mã ở khung `k`. */
  seekDataStart(k: PaneIndex): void {
    const d = this.paneDs(k);
    if (d?.n) this.seekTo(d.T[0]);
  }
  setPaneTf(tf: number): void {
    const panes: [PaneConfig, PaneConfig] = [{ ...this.state.panes[0] }, { ...this.state.panes[1] }];
    panes[this.state.active].tf = tf;
    this.set({ panes });
    if (this.hasData) this.rebuild(true, [this.state.active]);
    this.scheduleSave();
  }
  setLayout(layout: 1 | 2): void {
    if (layout === this.state.layout) return;
    const panes: [PaneConfig, PaneConfig] = [{ ...this.state.panes[0] }, { ...this.state.panes[1] }];
    if (layout === 2 && !(panes[1].ds && this.ds[panes[1].ds])) panes[1].ds = panes[0].ds;
    this.set({ layout, panes, active: layout === 1 ? 0 : this.state.active });
    if (layout === 1) this.setContractFor(panes[0].ds);
    if (layout === 2 && this.hasData) {
      this.rebuild(true, [1]);
      this.noticeNotStarted([1]);
    }
    this.scheduleSave();
  }

  // ---------- chọn nến bắt đầu ----------
  setSelectMode(on: boolean): void {
    if (on && !this.hasData) return;
    if (on && (this.state.pos || this.state.pending)) return this.notify("replay.toast.closeBeforeSelect");
    if (on) {
      this.stop();
      this.set({ selectMode: true, drawMode: false, tool: null, selected: null });
      this.notify("replay.toast.selectHint");
    } else if (this.state.selectMode) this.set({ selectMode: false });
  }
  /** Click vào nến `time` (giờ local của nến) của chart k: replay cắt ở cuối nến đó. */
  selectBar(k: PaneIndex, time: number): void {
    const d = this.paneDs(k);
    this.set({ selectMode: false });
    if (!d) return;
    const i = firstBucketAfter(d, time, this.state.panes[k].tf, this.state.zone) - 1;
    if (i >= 0) this.seekTo(d.T[i]);
  }

  // ---------- lệnh ----------
  setForm(patch: Partial<OrderForm>): void {
    const form = { ...this.state.form, ...patch };
    if (patch.type && patch.type !== "market" && patch.type !== this.state.form.type) {
      const px = this.lastPrice(this.activeDs()?.name);
      if (px != null) form.price = px.toFixed(2);
    }
    this.set({ form });
    if (patch.contract && this.state.pos) this.notify("replay.toast.contractKept");
    this.scheduleSave();
  }
  placeOrder(side: Side): void {
    const d = this.activeDs();
    if (!d) return this.notify("replay.toast.openDataFirst");
    const { pos, pending, form } = this.state;
    if (pos || pending) return this.notify("replay.toast.orderOpen");
    const last = this.lastPrice(d.name);
    if (last == null) return this.notify("replay.toast.noBarYet", { symbol: d.name.replace(/_m1$/i, "") });
    const slPts = Math.max(0, num(form.slPts));
    const tpPts = Math.max(0, num(form.tpPts));
    const contract: Contract = form.contract;
    const qty = calcQty(slPts, contract, num(form.riskUsd), num(form.qty));
    const comm = Math.max(0, num(form.comm));
    if (form.type === "market") {
      // khớp ở giá đóng cửa nến hiện tại; SL/TP được kiểm tra từ nến 1 phút kế tiếp
      this.set({ pos: openPosition(d, { side, price: last, i: d.cur, qty, slPts, tpPts, contract, comm, fresh: false }) });
    } else {
      const price = num(form.price);
      if (!(price > 0)) return this.notify("replay.toast.enterPrice");
      const err = pendingError(side, form.type, price, last);
      if (err) return this.notify(err === "limitSide" ? "replay.toast.limitSide" : "replay.toast.stopSide");
      this.set({ pending: { sym: d.name, contract, side, type: form.type, price, qty, slPts, tpPts, comm } });
    }
    this.scheduleSave();
  }
  closeNow(): void {
    const { pos } = this.state;
    const d = pos && this.ds[pos.sym];
    if (!pos || !d) return;
    this.set({ pos: null, trades: [...this.state.trades, closePosition(pos, d, d.C[d.cur], d.cur, "manual")] });
    this.scheduleSave();
  }
  cancelPending(): void {
    if (!this.state.pending) return;
    this.set({ pending: null });
    this.scheduleSave();
  }
  breakEven(): void {
    const { pos } = this.state;
    if (!pos) return;
    this.set({ pos: { ...pos, sl: pos.entry } });
    this.scheduleSave();
  }
  updateSlTp(sl: number | null, tp: number | null): boolean {
    const { pos } = this.state;
    if (!pos) return false;
    const px = this.lastPrice(pos.sym) ?? pos.entry;
    const err = (sl != null && lineError(pos, "sl", sl, px)) || (tp != null && lineError(pos, "tp", tp, px));
    if (err) {
      this.notify(err === "slSide" ? "replay.toast.slSide" : "replay.toast.tpSide");
      return false;
    }
    this.set({ pos: { ...pos, sl, tp } });
    this.scheduleSave();
    return true;
  }
  /** Giá các đường kéo được (SL, TP, lệnh chờ) của mã `sym`. */
  dragPrices(sym: string | null): { sl: number | null; tp: number | null; pend: number | null } {
    const { pos, pending } = this.state;
    const mine = (o: { sym: string } | null) => !!o && o.sym === sym;
    return { sl: mine(pos) ? pos!.sl : null, tp: mine(pos) ? pos!.tp : null, pend: mine(pending) ? pending!.price : null };
  }
  /** Đang kéo đường: cập nhật giá ngay (chưa kiểm tra). */
  dragLine(key: "sl" | "tp" | "pend", v: number): void {
    const { pos, pending } = this.state;
    if (key === "pend" && pending) this.set({ pending: { ...pending, price: v } });
    else if (key !== "pend" && pos) this.set({ pos: { ...pos, [key]: v } });
  }
  /** Thả đường: sai phía thì trả về giá cũ. */
  endDragLine(key: "sl" | "tp" | "pend", orig: number | null): void {
    const { pos, pending } = this.state;
    let err: TranslationKey | null = null;
    if (key === "pend" && pending) {
      const e = pendingError(pending.side, pending.type, pending.price, this.lastPrice(pending.sym) ?? pending.price);
      if (e) err = e === "limitSide" ? "replay.toast.limitSide" : "replay.toast.stopSide";
    } else if (key !== "pend" && pos) {
      const v = pos[key];
      const e = v == null ? null : lineError(pos, key, v, this.lastPrice(pos.sym) ?? pos.entry);
      if (e) err = e === "slSide" ? "replay.toast.slSide" : "replay.toast.tpSide";
    }
    if (err) {
      if (orig != null) this.dragLine(key, orig);
      this.notify(err);
    }
    this.scheduleSave();
  }
  resetTrades(): void {
    if (this.state.pos || this.state.pending) return this.notify("replay.toast.closeFirst");
    this.set({ trades: [] });
    this.scheduleSave();
  }

  // ---------- hình vẽ ----------
  private drawState = () => JSON.stringify({ drawings: this.state.drawings, hlines: this.state.hlines });
  pushUndo(): void {
    this.undoStack.push(this.drawState());
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  private clearUndo(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
  private restoreDraw(st: string): void {
    const o = JSON.parse(st) as { drawings: Drawing[]; hlines: HLine[] };
    this.set({ drawings: o.drawings, hlines: o.hlines, selected: o.drawings.some((d) => d.id === this.state.selected) ? this.state.selected : null });
    this.scheduleSave();
  }
  undo(): void {
    // cửa sổ Cài đặt đang mở giữ ảnh chụp "trước khi sửa": hoàn tác lúc này làm Ok đẩy ảnh cũ vào lịch sử
    if (this.state.drawDialog != null) return;
    if (this.state.draft) return this.cancelDraft();
    const st = this.undoStack.pop();
    if (!st) return this.notify("replay.toast.nothingToUndo");
    this.redoStack.push(this.drawState());
    this.restoreDraw(st);
  }
  redo(): void {
    if (this.state.drawDialog != null) return;
    const st = this.redoStack.pop();
    if (!st) return this.notify("replay.toast.nothingToRedo");
    this.undoStack.push(this.drawState());
    this.restoreDraw(st);
  }
  setTool(tool: DrawTool | null): void {
    if (tool && !this.hasData) return;
    if (tool) this.stop();
    this.set(tool ? { tool, selectMode: false, drawMode: false, selected: null } : { tool: null });
  }
  setDrawMode(on: boolean): void {
    this.set(on ? { drawMode: true, tool: null, selectMode: false, selected: null } : { drawMode: false });
  }
  setMagnet(on: boolean): void {
    this.set({ magnet: on });
    writePref("magnet", on);
  }
  select(id: number | null): void {
    if (id !== this.state.selected) this.set({ selected: id });
  }
  addHLine(sym: string, price: number): void {
    this.pushUndo();
    this.set({ hlines: [...this.state.hlines, { sym, price }], drawMode: false });
    this.scheduleSave();
  }
  addDrawing(d: Omit<Drawing, "id">): Drawing {
    const full: Drawing = { ...d, id: ++this.drawSeq };
    this.pushUndo();
    this.set({ drawings: [...this.state.drawings, full], selected: full.id, tool: null, draft: null });
    this.scheduleSave();
    return full;
  }
  /** Sửa hình tại chỗ (đang kéo, xem trước ghi chú…). `undo` = lưu trạng thái trước để hoàn tác. */
  updateDrawing(id: number, patch: Partial<Drawing>, opts: { undo?: boolean; save?: boolean } = {}): void {
    if (opts.undo) this.pushUndo();
    this.set({ drawings: this.state.drawings.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
    if (opts.save !== false) this.scheduleSave();
  }
  deleteSelected(): void {
    const id = this.state.selected;
    if (id == null) return this.notify("replay.toast.selectShapeFirst");
    this.pushUndo();
    this.set({ drawings: this.state.drawings.filter((d) => d.id !== id), selected: null, drawDialog: null });
    this.scheduleSave();
  }
  clearDrawings(): void {
    if (this.state.hlines.length || this.state.drawings.length) this.pushUndo();
    this.set({ hlines: [], drawings: [], selected: null, draft: null, drawDialog: null });
    this.scheduleSave();
  }
  setDraft(draft: Draft | null): void {
    this.set({ draft });
  }
  cancelDraft(): void {
    this.set({ draft: null, tool: null });
  }
  finishDraft(): void {
    const dr = this.state.draft;
    if (!dr) return;
    const { id: _id, ...rest } = dr.d;
    this.addDrawing({ ...this.lastStyle(rest.type), ...rest });
  }
  /** Đường mũi tên: bỏ điểm đang rê theo chuột rồi lưu (cần ít nhất 2 điểm). */
  finishPath(): void {
    const dr = this.state.draft;
    if (!dr) return;
    const pts = dr.d.pts.slice(0, -1);
    if (pts.length > 1) {
      this.set({ draft: { ...dr, d: { ...dr.d, pts } } });
      this.finishDraft();
    } else this.cancelDraft();
  }
  openTextEdit(te: TextEdit): void {
    this.set({ textEdit: te, tool: null });
  }
  commitText(value: string, save: boolean): void {
    const te = this.state.textEdit;
    if (!te) return;
    this.set({ textEdit: null });
    const v = value.trim();
    if (!save) return;
    const sym = this.state.panes[te.pane].ds;
    if (te.existingId != null) {
      const cur = this.state.drawings.find((d) => d.id === te.existingId);
      if (!cur || cur.text === v) return;
      this.pushUndo();
      this.set({ drawings: v ? this.state.drawings.map((d) => (d.id === te.existingId ? { ...d, text: v } : d)) : this.state.drawings.filter((d) => d.id !== te.existingId) });
      this.scheduleSave();
    } else if (v && sym) this.addDrawing({ ...this.lastStyle("text"), sym, type: "text", pts: [te.pt], text: v });
  }

  // ---------- tuỳ chỉnh hình: thanh nổi và cửa sổ Cài đặt ----------
  /** Kiểu dùng lần trước của công cụ: hình mới vẽ bằng công cụ đó lấy theo. */
  lastStyle(type: DrawTool): Partial<Drawing> {
    return readPref<Partial<Drawing>>(`drawStyle.${type}`, {});
  }
  private rememberStyle(d: Drawing): void {
    writePref(`drawStyle.${d.type}`, styleSnapshot(d));
  }
  /** Đổi kiểu từ thanh nổi: một bước hoàn tác, và nhớ cho hình mới cùng công cụ. */
  styleDrawing(id: number, patch: Partial<Drawing>): void {
    if (!this.state.drawings.some((x) => x.id === id)) return;
    this.updateDrawing(id, patch, { undo: true });
    this.rememberStyle(this.state.drawings.find((x) => x.id === id)!);
  }
  openDrawDialog(id: number): void {
    const d = this.state.drawings.find((x) => x.id === id);
    if (!d) return;
    if (this.state.drawDialog != null) this.closeDrawDialog(true);
    this.stop();
    this.dialogBefore = { before: this.drawState(), orig: structuredClone(d) };
    this.set({ drawDialog: id, selected: id, textEdit: null });
  }
  /** Sửa trong cửa sổ Cài đặt: chart đổi ngay, chưa lưu, chưa vào lịch sử hoàn tác. */
  previewDrawing(patch: Partial<Drawing>): void {
    if (this.state.drawDialog != null) this.updateDrawing(this.state.drawDialog, patch, { save: false });
  }
  /** Ok (`save`) giữ thay đổi thành một bước hoàn tác; Cancel / Esc trả hình về như lúc mở. */
  closeDrawDialog(save: boolean): void {
    const id = this.state.drawDialog;
    const db = this.dialogBefore;
    this.dialogBefore = null;
    if (id == null) return;
    this.set({ drawDialog: null });
    const cur = this.state.drawings.find((x) => x.id === id);
    if (!db || !cur) return;
    if (!save) {
      this.set({ drawings: this.state.drawings.map((x) => (x.id === id ? db.orig : x)) });
      return;
    }
    const next: Drawing = { ...cur };
    const note = next.note?.trim();
    if (note) next.note = note;
    else delete next.note;
    const gone = next.type === "text" && !(next.text ?? "").trim();
    if (!gone && JSON.stringify(next) === JSON.stringify(db.orig)) return;
    this.undoStack.push(db.before);
    this.redoStack.length = 0;
    if (gone) this.set({ drawings: this.state.drawings.filter((x) => x.id !== id), selected: null });
    else {
      this.set({ drawings: this.state.drawings.map((x) => (x.id === id ? next : x)) });
      this.rememberStyle(next);
    }
    this.scheduleSave();
  }
  toggleLock(id: number): void {
    const d = this.state.drawings.find((x) => x.id === id);
    if (d) this.updateDrawing(id, { locked: !d.locked }, { undo: true });
  }
  hideDrawing(id: number): void {
    if (!this.state.drawings.some((x) => x.id === id)) return;
    // đang sửa trong cửa sổ Cài đặt: giữ phần đã sửa rồi mới ẩn, không thì Cancel sau đó hiện hình lại
    if (this.state.drawDialog === id) this.closeDrawDialog(true);
    this.updateDrawing(id, { hidden: true }, { undo: true });
    this.set({ selected: null });
  }
  /** Hiện lại mọi hình đã ẩn (nút con mắt ở thanh công cụ vẽ). */
  showHidden(): void {
    if (!this.state.drawings.some((d) => d.hidden)) return;
    this.pushUndo();
    this.set({ drawings: this.state.drawings.map((d) => (d.hidden ? { ...d, hidden: false } : d)) });
    this.scheduleSave();
  }
  /** Nhân bản hình tại chỗ; bản mới được chọn (và không bị khoá). */
  cloneDrawing(id: number): Drawing | null {
    const d = this.state.drawings.find((x) => x.id === id);
    if (!d) return null;
    const { id: _id, ...rest } = structuredClone(d);
    return this.addDrawing({ ...rest, locked: false });
  }
  copyDrawing(id: number): void {
    const d = this.state.drawings.find((x) => x.id === id);
    if (d) this.clip = structuredClone(d);
  }
  /** Dán hình đã Copy vào mã `sym`, đúng chỗ cũ như TradingView. */
  pasteDrawing(sym: string | null): void {
    if (!this.clip || !sym) return;
    const { id: _id, ...rest } = structuredClone(this.clip);
    this.addDrawing({ ...rest, sym, locked: false, hidden: false });
  }
  /** Visual order: lên trên cùng, lên một lớp, xuống một lớp, xuống dưới cùng (trong các hình cùng mã). */
  orderDrawing(id: number, op: "front" | "forward" | "backward" | "back"): void {
    const list = [...this.state.drawings];
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    const d = list[i];
    const same = list.map((x, k) => (x.sym === d.sym ? k : -1)).filter((k) => k >= 0);
    const pos = same.indexOf(i);
    const target = op === "front" ? same.length - 1 : op === "back" ? 0 : op === "forward" ? Math.min(same.length - 1, pos + 1) : Math.max(0, pos - 1);
    if (target === pos) return;
    const ids = same.map((k) => list[k]);
    ids.splice(pos, 1);
    ids.splice(target, 0, d);
    same.forEach((k, n) => (list[k] = ids[n]));
    this.pushUndo();
    this.set({ drawings: list });
    this.scheduleSave();
  }

  // ---------- cài đặt ----------
  openSettings(): void {
    this.settingsSnap = { chartStyle: { ...this.state.chartStyle }, ict: structuredClone(this.state.ict), zone: this.state.zone };
    this.stop();
    this.set({ settingsOpen: true });
  }
  closeSettings(save: boolean): void {
    const snap = this.settingsSnap;
    this.settingsSnap = null;
    if (save) {
      writePref("chartStyle", this.state.chartStyle);
      writePref("ict", this.state.ict);
    } else if (snap) {
      this.set({ chartStyle: snap.chartStyle, ict: snap.ict, ictVer: this.state.ictVer + 1 });
      this.setZone(snap.zone);
    }
    this.set({ settingsOpen: false });
  }
  setChartStyle(patch: Partial<ChartStyle>): void {
    this.set({ chartStyle: { ...this.state.chartStyle, ...patch } });
  }
  applyTemplate(t: ChartTemplate): void {
    this.set({ chartStyle: chartTemplate(t) });
  }
  setIct(ict: IctSettings): void {
    this.set({ ict, ictVer: this.state.ictVer + 1 });
  }
  toggleIct(): void {
    const ict = { ...this.state.ict, on: !this.state.ict.on };
    this.setIct(ict);
    writePref("ict", ict);
  }
  resetIct(): void {
    this.setIct(defaultIct());
  }
  /** Một SMT vừa được xác nhận ở chart k: báo một lần (nếu đã bật "Báo khi có SMT mới"). */
  noticeSmt(k: PaneIndex, line: SmtLine, other: string): void {
    const p = this.state.panes[k];
    const key = `${p.ds}|${p.tf}|${line.time}|${line.bull}`;
    if (!this.state.ict.smt.alert || this.smtSeen.has(key)) return;
    this.smtSeen.add(key);
    this.notify(line.bull ? "replay.toast.smtBull" : "replay.toast.smtBear", {
      symbol: (p.ds ?? "").replace(/_m1$/i, ""), other: other.replace(/_m1$/i, ""), tf: tfLabel(p.tf),
    });
  }
}
