import { FIB_DEFAULT_LEVELS, FIB_GRAY, fibLevel, styleSnapshot, type Drawing, type DrawTool, type FibLevel } from "./drawings";
import { readPref, writePref } from "./storage";

/**
 * Mẫu hình vẽ (nút Mẫu hình vẽ ở thanh nổi và nút Mẫu ở cửa sổ Cài đặt, như TradingView): một bộ kiểu
 * dáng đặt tên, theo từng công cụ.
 *
 * Trình duyệt chỉ lưu phần của người dùng: mẫu tự lưu (kể cả mẫu ghi đè lên một mẫu dựng sẵn cùng tên)
 * và tên các mẫu dựng sẵn đã xoá. Mẫu dựng sẵn ghép vào lúc đọc, nên sửa mẫu dựng sẵn trong code thì
 * người dùng vẫn nhận được, và "Khôi phục mẫu dựng sẵn" chỉ cần bỏ phần ghi đè / đã xoá.
 */
export interface DrawTemplate {
  name: string;
  style: Partial<Drawing>;
}

interface Stored {
  /** mẫu tự lưu, theo thứ tự lưu; tên trùng một mẫu dựng sẵn là ghi đè lên mẫu đó */
  user: DrawTemplate[];
  /** tên các mẫu dựng sẵn đã xoá */
  removed: string[];
}

const key = (tool: DrawTool) => `drawTemplates.v2.${tool}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Đủ 24 ô mức như TradingView: các mức của mẫu trước, sau đó các mức mặc định còn lại (tắt). */
function padLevels(levels: FibLevel[]): readonly FibLevel[] {
  const rest = FIB_DEFAULT_LEVELS.filter((l) => !levels.some((x) => x.v === l.v)).map((l) => fibLevel(l.v, l.color, false));
  return Object.freeze([...levels, ...rest].slice(0, Math.max(levels.length, FIB_DEFAULT_LEVELS.length)));
}
const tv = (n: number) => `var(--replay-tv-${n})`;

/**
 * Mẫu Fibonacci dựng sẵn:
 * - OTE (ICT Optimal Trade Entry): vùng 0.62 · 0.705 · 0.79, cân bằng 0.5, mục tiêu -0.27 · -0.62 · -1.
 * - STD (ICT standard deviation): chiếu -1 · -2 · -2.5 · -4 · -4.5 từ chân thao túng; -1.5 · -3 · -3.5 tắt sẵn.
 * - FIBO: thoái lui cổ điển 0 → 1, không có mức mở rộng.
 */
export const BUILTIN_TEMPLATES: Partial<Record<DrawTool, readonly DrawTemplate[]>> = {
  fib: [
    {
      name: "OTE",
      style: {
        fibBg: false,
        fibLevels: padLevels([
          fibLevel(1, FIB_GRAY), fibLevel(0.79, tv(14)), fibLevel(0.705, tv(11)), fibLevel(0.62, tv(14)), fibLevel(0.5, tv(4)),
          fibLevel(0, FIB_GRAY), fibLevel(-0.27, tv(16)), fibLevel(-0.62, tv(16)), fibLevel(-1, tv(18)),
        ]),
      },
    },
    {
      name: "STD",
      style: {
        fibBg: false,
        fibLevels: padLevels([
          fibLevel(1, FIB_GRAY), fibLevel(0, FIB_GRAY), fibLevel(-1, tv(11)), fibLevel(-1.5, tv(11), false), fibLevel(-2, tv(10)),
          fibLevel(-2.5, tv(10)), fibLevel(-3, tv(18), false), fibLevel(-3.5, tv(18), false), fibLevel(-4, tv(16)), fibLevel(-4.5, tv(16)),
        ]),
      },
    },
    {
      name: "FIBO",
      style: { fibLevels: Object.freeze(FIB_DEFAULT_LEVELS.map((l) => fibLevel(l.v, l.color, l.on && l.v <= 1))) },
    },
  ],
};

const builtins = (tool: DrawTool) => BUILTIN_TEMPLATES[tool] ?? [];
const load = (tool: DrawTool): Stored => {
  const s = readPref<Partial<Stored> | null>(key(tool), null);
  return { user: Array.isArray(s?.user) ? s.user : [], removed: Array.isArray(s?.removed) ? s.removed : [] };
};
const store = (tool: DrawTool, s: Stored) => writePref(key(tool), s);

/** Mẫu dựng sẵn (trừ mẫu đã xoá; mẫu bị ghi đè hiện bản của người dùng, giữ chỗ cũ), rồi mẫu tự lưu. */
export function listTemplates(tool: DrawTool): DrawTemplate[] {
  const { user, removed } = load(tool);
  const own = builtins(tool)
    .filter((b) => !removed.some((n) => same(n, b.name)))
    .map((b) => user.find((u) => same(u.name, b.name)) ?? b);
  return [...own, ...user.filter((u) => !builtins(tool).some((b) => same(b.name, u.name)))];
}

/** Lưu kiểu của hình `d` thành mẫu `name`; trùng tên (không phân biệt hoa thường) thì ghi đè. */
export function saveTemplate(d: Drawing, name: string): DrawTemplate[] {
  const s = load(d.type);
  // trùng tên mẫu dựng sẵn thì giữ đúng tên của nó, để mẫu ghi đè nằm đúng chỗ mẫu cũ
  const canonical = builtins(d.type).find((b) => same(b.name, name))?.name ?? name;
  const tpl = { name: canonical, style: styleSnapshot(d) };
  const i = s.user.findIndex((u) => same(u.name, canonical));
  store(d.type, {
    user: i >= 0 ? s.user.map((u, j) => (j === i ? tpl : u)) : [...s.user, tpl],
    removed: s.removed.filter((n) => !same(n, canonical)),
  });
  return listTemplates(d.type);
}

export function deleteTemplate(tool: DrawTool, name: string): DrawTemplate[] {
  const s = load(tool);
  const builtin = builtins(tool).some((b) => same(b.name, name));
  store(tool, {
    user: s.user.filter((u) => !same(u.name, name)),
    removed: builtin && !s.removed.some((n) => same(n, name)) ? [...s.removed, name] : s.removed,
  });
  return listTemplates(tool);
}

/** Có mẫu dựng sẵn nào đã bị xoá hoặc ghi đè không (để hiện "Khôi phục mẫu dựng sẵn"). */
export function builtinsChanged(tool: DrawTool): boolean {
  const s = load(tool);
  return s.removed.length > 0 || s.user.some((u) => builtins(tool).some((b) => same(b.name, u.name)));
}

/** Đưa các mẫu dựng sẵn về bản gốc; mẫu tự lưu tên khác vẫn giữ. */
export function restoreBuiltins(tool: DrawTool): DrawTemplate[] {
  const s = load(tool);
  store(tool, { user: s.user.filter((u) => !builtins(tool).some((b) => same(b.name, u.name))), removed: [] });
  return listTemplates(tool);
}

/**
 * Bản vá áp mẫu (hoặc `null` = "Áp mẫu mặc định"): xoá mọi kiểu dáng đang có của hình rồi đặt kiểu của
 * mẫu, để trường nào mẫu không có thì về mặc định của công cụ chứ không giữ giá trị cũ.
 */
export function templatePatch(d: Drawing, tpl: DrawTemplate | null): Partial<Drawing> {
  const clear = Object.fromEntries(Object.keys(styleSnapshot(d)).map((k) => [k, undefined])) as Partial<Drawing>;
  return { ...clear, ...structuredClone(tpl?.style ?? {}) };
}
