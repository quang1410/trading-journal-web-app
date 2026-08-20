import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";

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
  weekdays: string[];
  default_setup: string;
};

export function useMetaEnums() {
  return useQuery({
    queryKey: qk.metaEnums,
    queryFn: () => api.get<MetaEnums>("/meta/enums"),
    // Dữ liệu tham chiếu tĩnh: tải một lần cho cả phiên.
    staleTime: Infinity,
  });
}
