import type { MetaEnums, ScoredField } from "@/features/meta/hooks";

/**
 * 30 lệnh MINH HOẠ cho biểu đồ hero, đơn vị USD, 1R = 100.
 *
 * Dữ liệu tổng hợp, viết tay, không đến từ backend — nên quy tắc "tiền là
 * chuỗi" (CLAUDE.md quy tắc 1) không áp vào đây: không có chữ số nào để mất,
 * và không con số nào là tiền thật của ai. Trang ghi rõ "Dữ liệu minh hoạ".
 *
 * THEORY là kết quả nếu làm đúng kế hoạch ở mọi lệnh.
 */
export const THEORY: readonly number[] = [
  200, -100, 150, -100, 300, -100, 200, -100, -100, 250, 180, -100, -100, 220, -100,
  300, -100, -100, 200, 150, -100, 240, -100, -100, 180, -100, 210, -100, 150, -100,
];

/** Trỏ vào MỘT nhãn enum theo vị trí, vì nhãn không được chép vào frontend. */
export type EnumRef = { field: ScoredField; index: number };
export type Deviation = { actual: number; reason: EnumRef };

/** Lệnh làm khác kế hoạch. Khoá là index 0-based trong THEORY. */
export const DEVIATIONS: Readonly<Record<number, Deviation>> = {
  1: { actual: -180, reason: { field: "in_trade_qualities", index: 2 } },
  4: { actual: 90, reason: { field: "exit_qualities", index: 3 } },
  8: { actual: -250, reason: { field: "psychologies", index: 5 } },
  10: { actual: 60, reason: { field: "entry_qualities", index: 1 } },
  15: { actual: 120, reason: { field: "in_trade_qualities", index: 1 } },
  17: { actual: -200, reason: { field: "in_trade_qualities", index: 2 } },
  21: { actual: 80, reason: { field: "exit_qualities", index: 3 } },
  26: { actual: 70, reason: { field: "entry_qualities", index: 2 } },
};

export const DEVIATION_INDEXES: readonly number[] = Object.keys(DEVIATIONS)
  .map((k) => +k)
  .sort((a, b) => a - b);

export function actualSeries(): number[] {
  return THEORY.map((v, i) => DEVIATIONS[i]?.actual ?? v);
}

/** Lũy kế bắt đầu từ 0, để hai đường cùng xuất phát tại gốc. */
export function cumulative(xs: readonly number[]): number[] {
  const out = [0];
  for (const x of xs) out.push(out[out.length - 1] + x);
  return out;
}

export function sampleTotals() {
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  const theory = sum(THEORY);
  const actual = sum(actualSeries());
  return { theory, actual, gap: actual - theory };
}

/** Index của lệnh mất nhiều nhất so với kế hoạch — chú thích mặc định. */
export function worstDeviation(): number {
  return [...DEVIATION_INDEXES].sort(
    (a, b) => DEVIATIONS[a].actual - THEORY[a] - (DEVIATIONS[b].actual - THEORY[b]),
  )[0];
}

export function reasonLabel(ref: EnumRef, enums: MetaEnums | undefined): string | undefined {
  return enums?.[ref.field][ref.index];
}
