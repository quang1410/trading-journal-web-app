// Mọi trường tiền là CHUỖI. Backend marshal decimal ra chuỗi JSON chính vì
// float làm mất chữ số; khai kiểu number ở đây là ném đi điều đó ngay tại
// ranh giới.
export type AccountType = "personal" | "prop";
// Giá trị ASCII của hợp đồng API (khớp CHECK của migration 0006), không phải
// key chấm điểm. Danh sách để HIỂN THỊ (và thứ tự của nó) vẫn lấy từ
// /meta/enums; hai mảng này chỉ để đúc kiểu và cho zod kiểm form.
export const CHALLENGE_PHASES = ["phase_1", "phase_2", "funded"] as const;
export const CHALLENGE_STATUSES = ["in_progress", "passed", "failed"] as const;
export type ChallengePhase = (typeof CHALLENGE_PHASES)[number];
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

export type Account = {
  id: number;
  code: string;
  name: string;
  initial_balance: string;
  risk_per_trade: string; // phân số: "0.01" là 1%
  currency: string;
  timezone: string;
  one_r: string; // suy diễn, backend tính

  account_type: AccountType;
  prop_firm: string; // "" với tài khoản cá nhân
  // Giá trị lấy từ /meta/enums (challenge_phases, challenge_statuses).
  // null với tài khoản cá nhân.
  challenge_phase: ChallengePhase | null;
  challenge_status: ChallengeStatus | null;
  profit_target: string | null; // phân số: "0.1" là 10%
  max_drawdown_limit: string | null; // phân số
};

export type AccountCreate = {
  code: string;
  name: string;
  currency: string;
  timezone: string;
  initial_balance: string;
  risk_per_trade: string;

  account_type: AccountType;
  prop_firm?: string;
  challenge_phase?: ChallengePhase;
  challenge_status?: ChallengeStatus;
  // null = xoá luật này (PATCH); vắng mặt = không đổi.
  profit_target?: string | null;
  max_drawdown_limit?: string | null;
};

export type AccountPatch = Partial<AccountCreate>;
