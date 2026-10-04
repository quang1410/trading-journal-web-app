// Luật hiển thị của tài khoản quỹ. Thuần, không React, để test được không cần
// render — cùng lý do với identity.ts.
//
// Giá trị "funded", "passed", "in_progress", "failed" chép ở đây là hợp đồng
// ASCII của API (như "deposit"), không phải key chấm điểm; danh sách ĐẦY ĐỦ và
// thứ tự vẫn lấy từ /meta/enums qua tham số `phases`/`statuses`.
import { compareDecimal, fractionFromPercent, isPositiveNumber, roundDecimal, shiftDecimal } from "@/lib/decimal";
import type { Account, ChallengePhase, ChallengeStatus } from "./types";

export type StepState = "done" | "current" | "failed" | "upcoming";
export type Step = { phase: ChallengePhase; state: StepState };

/**
 * Trạng thái của từng nút trên thanh vòng thi.
 *
 * Vòng trước vòng hiện tại luôn là "done": muốn tới Vòng 2 thì phải qua Vòng 1.
 * Vòng lạ (không có trong `phases`) cho cả thanh "upcoming" — vẽ sai một vòng
 * "đã qua" còn tệ hơn không vẽ gì.
 */
export function phaseSteps(
  phases: readonly ChallengePhase[],
  phase: ChallengePhase | null,
  status: ChallengeStatus | null,
): Step[] {
  const at = phase ? phases.indexOf(phase) : -1;
  return phases.map((p, i): Step => {
    if (at < 0 || i > at) return { phase: p, state: "upcoming" };
    if (i < at) return { phase: p, state: "done" };
    if (status === "failed") return { phase: p, state: "failed" };
    if (status === "passed") return { phase: p, state: "done" };
    return { phase: p, state: "current" };
  });
}

export function nextPhase(phases: readonly ChallengePhase[], phase: ChallengePhase | null): ChallengePhase | null {
  const i = phase ? phases.indexOf(phase) : -1;
  return i >= 0 && i < phases.length - 1 ? phases[i + 1] : null;
}

/** Funded là vòng cuối: không còn vòng nào phía sau để "qua" (CHECK của migration 0006). */
export function statusOptionsFor(statuses: readonly ChallengeStatus[], phase: ChallengePhase): ChallengeStatus[] {
  return phase === "funded" ? statuses.filter((s) => s !== "passed") : [...statuses];
}

/**
 * Trạng thái form hiện ra sau khi người dùng bấm sang vòng `next`.
 *
 * Cùng luật với backend (service.Update): sang vòng khác là một lượt thi mới,
 * trạng thái về Đang thi. Quay về đúng vòng đang lưu thì trả lại trạng thái
 * đang lưu — bấm qua rồi bấm lại không được hồi sinh account thất bại. Form
 * chạy luật này TRƯỚC để người dùng thấy thứ sẽ lưu, rồi gửi kèm trạng thái
 * đó lên: không có gì xảy ra ngầm sau lưng thứ đang hiện trên màn hình.
 */
export function statusAfterPhaseChange(
  next: ChallengePhase,
  saved: { phase: ChallengePhase; status: ChallengeStatus },
): ChallengeStatus {
  return next === saved.phase ? saved.status : "in_progress";
}

export type ChallengeAction =
  | { kind: "pass"; patch: { challenge_status: "passed" } }
  | { kind: "advance"; patch: { challenge_phase: ChallengePhase } }
  | { kind: "fail"; patch: { challenge_status: "failed" } };

/**
 * Thao tác nhanh trên hàng quỹ. Mỗi thao tác là PATCH đúng MỘT khoá.
 *
 * "advance" chỉ gửi challenge_phase và để backend tự đưa trạng thái về
 * in_progress (service.Update). Khác form Sửa (statusAfterPhaseChange): menu
 * không có ô trạng thái nào đang hiện để phải giữ cho khớp, nên không có lý
 * do gì gửi thêm khoá thứ hai.
 */
export function challengeActions(
  phases: readonly ChallengePhase[],
  phase: ChallengePhase | null,
  status: ChallengeStatus | null,
): ChallengeAction[] {
  if (!phase || !status) return [];
  const out: ChallengeAction[] = [];
  const next = nextPhase(phases, phase);
  if (status === "in_progress" && phase !== "funded") {
    out.push({ kind: "pass", patch: { challenge_status: "passed" } });
  }
  if (status === "passed" && next) {
    out.push({ kind: "advance", patch: { challenge_phase: next } });
  }
  if (status === "in_progress") {
    out.push({ kind: "fail", patch: { challenge_status: "failed" } });
  }
  return out;
}

/**
 * Độ rộng CSS của thanh đo từ một tỷ lệ phân số, kẹp trong [0, 100%].
 *
 * Làm hoàn toàn trên chuỗi: styleguard cấm ép tiền sang số ngoài
 * dashboard/prepare.ts, và độ rộng CSS nhận chuỗi "42.5%" là đủ.
 * Lãi âm → 0% (thanh rỗng, con số âm vẫn hiện bằng chữ bên cạnh).
 */
export function meterWidth(ratio: string | null | undefined): string {
  if (ratio == null) return "0%";
  const clamped = compareDecimal(ratio, "0") < 0 ? "0" : compareDecimal(ratio, "1") > 0 ? "1" : ratio;
  return `${roundDecimal(shiftDecimal(clamped, 2), 1)}%`;
}

export type DrawdownTone = "calm" | "warning" | "danger";

/**
 * Màu thanh drawdown theo mức đã dùng của giới hạn. Không dùng --primary ở
 * đây: teal có nghĩa "lãi", một thanh drawdown màu teal đọc ra là tin tốt.
 */
export function drawdownTone(usage: string | null): DrawdownTone {
  if (usage == null) return "calm";
  if (compareDecimal(usage, "0.8") >= 0) return "danger";
  if (compareDecimal(usage, "0.5") >= 0) return "warning";
  return "calm";
}

export function isReached(ratio: string | null): boolean {
  return ratio != null && compareDecimal(ratio, "1") >= 0;
}

const STATUS_RANK: Record<string, number> = { in_progress: 0, passed: 1, failed: 2 };

/**
 * Chia hai nhóm. Nhóm quỹ xếp đang thi → đã qua → thất bại: người thi quỹ
 * tích nhiều account chết theo thời gian, và chúng không được đẩy account
 * đang sống xuống dưới màn hình.
 */
export function splitByType(accounts: Account[]): { prop: Account[]; personal: Account[] } {
  const rank = (a: Account) => STATUS_RANK[a.challenge_status ?? ""] ?? 3;
  const prop = accounts
    .filter((a) => a.account_type === "prop")
    .sort((a, b) => rank(a) - rank(b) || a.id - b.id);
  return { prop, personal: accounts.filter((a) => a.account_type !== "prop") };
}

export const TYPE_FILTERS = ["all", "prop", "personal"] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

export function readTypeFilter(sp: URLSearchParams): TypeFilter {
  const v = sp.get("type");
  return v === "prop" || v === "personal" ? v : "all";
}

/** Ô phần trăm tuỳ chọn: trống, hoặc số trong (0, 100]. */
export function isOptionalPercent(v: string): boolean {
  const s = v.trim();
  return s === "" || (isPositiveNumber(s) && compareDecimal(s, "100") <= 0);
}

/**
 * Số chữ số thập phân tối đa của một ô phần trăm. Khớp NUMERIC(6,4) của
 * migration 0006 qua luật fitsRatioScale của backend: 4 chữ số của phân số
 * là 2 chữ số của phần trăm. Gõ thừa thì chặn ngay ở đây, không đợi 400.
 */
export const PERCENT_PLACES = 2;

export function fitsPercentScale(v: string): boolean {
  const dot = v.trim().indexOf(".");
  return dot < 0 || v.trim().length - dot - 1 <= PERCENT_PLACES;
}

/** Ô trống gửi null (xoá luật), còn lại đổi % sang phân số. */
export function percentOrNull(v: string): string | null {
  const s = v.trim();
  return s === "" ? null : fractionFromPercent(s);
}
