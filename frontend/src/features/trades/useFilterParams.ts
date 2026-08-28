import { useDeferredValue, useMemo } from "react";
import { useSearchParams } from "react-router";
import { readFilter, writeParams, type TradeFilter } from "./filters";

/**
 * Bộ lọc đọc từ URL, kèm bản hoãn để gõ phím không giật.
 *
 * TradesPage và DashboardPage từng chép nguyên khối này — kể cả đoạn comment
 * giải thích, tức là cùng một lý lẽ được viết lại hai lần thay vì được gói lại
 * một lần.
 *
 * useMemo vì readFilter dựng object MỚI mỗi lần render, mà object đó là đầu
 * vào của useDeferredValue ngay bên dưới — so bằng Object.is thì "mới mỗi lần"
 * nghĩa là "luôn khác", và cơ chế hoãn không bao giờ bắt kịp.
 *
 * `replace` chứ không `push`: gõ mười ký tự vào ô mã sản phẩm mà đẩy mười mục
 * vào history thì nút Back phải bấm mười lần mới rời khỏi trang.
 */
export function useFilterParams(): {
  filter: TradeFilter;
  deferredFilter: TradeFilter;
  setFilter: (f: TradeFilter) => void;
  hasFilter: boolean;
  sp: URLSearchParams;
  setSp: ReturnType<typeof useSearchParams>[1];
} {
  const [sp, setSp] = useSearchParams();
  const filter = useMemo(() => readFilter(sp), [sp]);
  const deferredFilter = useDeferredValue(filter);

  return {
    filter,
    deferredFilter,
    setFilter: (f: TradeFilter) => setSp(writeParams(f, 1), { replace: true }),
    hasFilter: Object.values(filter).some((v) => v !== ""),
    sp,
    setSp,
  };
}
