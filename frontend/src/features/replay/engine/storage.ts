import type { Drawing, HLine } from "./drawings";
import type { Zone } from "./time";
import type { Contract, OrderType, Pending, Position, Trade } from "./trading";
import type { Bars } from "./types";

/**
 * Phiên replay lưu trong trình duyệt (IndexedDB), không gửi lên backend.
 *
 *   - `sessions`: thời điểm replay, lệnh, vị thế, hình vẽ, layout và ô nhập của từng phiên.
 *   - `datasets`: nến 1m của file CSV người dùng tự mở (data mặc định không cần lưu: nó nằm
 *     sẵn trong public/replay-data).
 *
 * Ghi vào IndexedDB có thể bị cắt ngang khi đóng tab, nên lúc rời trang còn có một bản sao chép
 * đồng bộ vào localStorage; lần mở sau bản sao đó được dời vào IndexedDB (flushBackups).
 */

export const DB_NAME = "journal-replay";
const BACKUP_PREFIX = "journal.replay.session:";

export interface OrderForm {
  contract: Contract;
  type: OrderType;
  price: string;
  qty: string;
  slPts: string;
  tpPts: string;
  riskUsd: string;
  comm: string;
  balance0: string;
}

export interface PaneConfig {
  tf: number;
  ds: string | null;
}

export interface SessionSettings {
  zone: Zone;
  layout: 1 | 2;
  stepTf: number;
  speed: number;
  panes: PaneConfig[];
  active: number;
  form: OrderForm;
}

export interface SessionRecord {
  id: string;
  title: string;
  created: number;
  updated: number;
  dataNames: string[];
  /** thời điểm replay (giây UTC) */
  t: number;
  nTrades: number;
  net: number;
  trades: Trade[];
  pos: Position | null;
  pending: Pending | null;
  hlines: HLine[];
  drawings: Drawing[];
  settings: SessionSettings;
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("datasets");
      r.result.createObjectStore("sessions", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      dbPromise = null;
      reject(r.error);
    };
  });
  return dbPromise;
}

async function run<T>(store: "sessions" | "datasets", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export const listSessions = async (): Promise<SessionRecord[]> =>
  ((await run<SessionRecord[]>("sessions", "readonly", (s) => s.getAll() as IDBRequest<SessionRecord[]>)) ?? []).sort((a, b) => b.updated - a.updated);
export const getSession = (id: string) => run<SessionRecord | undefined>("sessions", "readonly", (s) => s.get(id) as IDBRequest<SessionRecord | undefined>);
export const putSession = (rec: SessionRecord) => run("sessions", "readwrite", (s) => void s.put(rec));
export const removeSession = (id: string) => run("sessions", "readwrite", (s) => void s.delete(id));
export const getDataset = (name: string) => run<Bars | undefined>("datasets", "readonly", (s) => s.get(name) as IDBRequest<Bars | undefined>);
export const putDataset = (name: string, d: Bars) =>
  run("datasets", "readwrite", (s) => void s.put({ n: d.n, T: d.T, O: d.O, H: d.H, L: d.L, C: d.C, V: d.V }, name));
export const removeDataset = (name: string) => run("datasets", "readwrite", (s) => void s.delete(name));

/** Bản sao đồng bộ lúc rời trang (IndexedDB có thể không kịp ghi). */
export function backupSession(rec: SessionRecord): void {
  try {
    localStorage.setItem(BACKUP_PREFIX + rec.id, JSON.stringify(rec));
  } catch {
    // hết chỗ hoặc bị chặn: bản trong IndexedDB vẫn còn
  }
}
export function dropBackup(id: string): void {
  try {
    localStorage.removeItem(BACKUP_PREFIX + id);
  } catch {
    // localStorage bị chặn
  }
}

/** Dời các bản sao lúc rời trang vào IndexedDB (chỉ khi mới hơn bản đang có). */
export async function flushBackups(): Promise<void> {
  let keys: string[];
  try {
    keys = Object.keys(localStorage).filter((k) => k.startsWith(BACKUP_PREFIX));
  } catch {
    return;
  }
  for (const k of keys) {
    try {
      const rec = JSON.parse(localStorage.getItem(k) ?? "null") as SessionRecord | null;
      if (rec) {
        const old = await getSession(rec.id);
        if (!old || old.updated <= rec.updated) await putSession(rec);
      }
      localStorage.removeItem(k);
    } catch {
      // bản sao hỏng: để lại, lần sau thử tiếp
    }
  }
}

/** Đọc / ghi một giá trị JSON nhỏ trong localStorage (cài đặt, vị trí thanh nổi…), không bao giờ ném lỗi. */
export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`journal.replay.${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
export function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`journal.replay.${key}`, JSON.stringify(value));
  } catch {
    // localStorage bị chặn: cài đặt chỉ sống trong phiên
  }
}
