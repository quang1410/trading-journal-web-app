import type { EnumField } from "@/i18n/enumLabels";
import type { ClassBand, MetaEnums, ScoredField } from "@/features/meta/hooks";

export const SCORED_FIELDS: readonly ScoredField[] = [
  "entry_qualities",
  "in_trade_qualities",
  "exit_qualities",
  "psychologies",
];

/** Tên trường của enumLabel cho từng trục — để hiện nhãn tiếng Anh ở locale en. */
export const ENUM_FIELD_OF: Record<ScoredField, EnumField> = {
  entry_qualities: "entry_quality",
  in_trade_qualities: "in_trade_quality",
  exit_qualities: "exit_quality",
  psychologies: "psychology",
};

/**
 * Điểm của phiếu mẫu: một lệnh LÃI 90 USD mà chỉ được 35/100.
 *
 * Chọn theo ĐIỂM chứ không theo nhãn: nhãn là key chấm điểm và không được
 * chép vào frontend (CLAUDE.md quy tắc 5). Với mỗi trục, lấy nhãn ĐẦU TIÊN
 * trong danh sách của backend có đúng số điểm này.
 */
const DEFAULT_POINTS: Record<ScoredField, number> = {
  entry_qualities: 10,
  in_trade_qualities: 25,
  exit_qualities: 0,
  psychologies: 0,
};

export type Selection = Record<ScoredField, string>;

export function defaultSelection(enums: MetaEnums): Selection {
  const pick = (field: ScoredField) =>
    enums[field].find((label) => enums.score_points[field][label] === DEFAULT_POINTS[field]) ??
    enums[field][0];
  return {
    entry_qualities: pick("entry_qualities"),
    in_trade_qualities: pick("in_trade_qualities"),
    exit_qualities: pick("exit_qualities"),
    psychologies: pick("psychologies"),
  };
}

export function totalScore(sel: Selection, points: MetaEnums["score_points"]): number {
  return SCORED_FIELDS.reduce((sum, f) => sum + (points[f][sel[f]] ?? 0), 0);
}

/**
 * Các bậc xếp theo min GIẢM DẦN. Backend đã sắp sẵn, nhưng thứ tự của một
 * mảng JSON không phải hợp đồng nên mọi chỗ đọc bậc đều đi qua đây.
 */
export function bandsDesc(bands: ClassBand[]): ClassBand[] {
  return [...bands].sort((a, b) => b.min - a.min);
}

/** Bậc đầu tiên (min giảm dần) mà total đạt tới. */
export function classify(total: number, bands: ClassBand[]): ClassBand | undefined {
  return bandsDesc(bands).find((b) => total >= b.min);
}

export type Tone = "good" | "warn" | "bad";

/** Bậc cao nhất là tốt, bậc kế là cần cải thiện, mọi bậc dưới đó là xấu. */
export function toneOf(band: ClassBand | undefined, bands: ClassBand[]): Tone {
  const rank = bandsDesc(bands).findIndex((b) => b === band);
  if (rank === 0) return "good";
  if (rank === 1) return "warn";
  return "bad";
}
