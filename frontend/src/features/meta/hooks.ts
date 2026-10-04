import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { ChallengePhase, ChallengeStatus } from "@/features/accounts/types";

/**
 * Enum §1 do backend cấp. FE KHÔNG được chép lại các chuỗi tiếng Việt này:
 * chúng là key chấm điểm, đổi một ký tự là đổi kết quả của toàn bộ lịch sử
 * (CLAUDE.md quy tắc 5).
 */
export type MetaEnums = {
  directions: string[];
  timeframes: string[];
  entry_qualities: string[];
  in_trade_qualities: string[];
  exit_qualities: string[];
  psychologies: string[];
  trade_classes: string[];
  cash_flow_types: string[];
  account_types: string[];
  challenge_phases: ChallengePhase[];
  challenge_statuses: ChallengeStatus[];
  weekdays: string[];
  default_setup: string;
};

/**
 * `enabled: false` để component luôn được mount (như nút mở dialog) không
 * gọi /meta/enums cho tới khi thật sự cần.
 */
export function useMetaEnums({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.metaEnums,
    queryFn: () => api.get<MetaEnums>("/meta/enums"),
    // Dữ liệu tham chiếu tĩnh: tải một lần cho cả phiên.
    staleTime: Infinity,
    enabled,
  });
}
