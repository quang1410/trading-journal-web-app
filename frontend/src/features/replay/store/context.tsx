import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { ReplayState, ReplayStore } from "./ReplayStore";

const StoreContext = createContext<ReplayStore | null>(null);

export function ReplayProvider({ store, children }: { store: ReplayStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useReplayStore(): ReplayStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useReplayStore must be used inside <ReplayProvider>");
  return store;
}

/**
 * Đọc một phần trạng thái. `select` phải trả về giá trị có sẵn trong state (hoặc giá trị nguyên
 * thuỷ), không dựng object mới mỗi lần gọi — useSyncExternalStore so sánh bằng ===, object mới mỗi
 * lần sẽ làm component render lại vô hạn. Cần giá trị suy ra thì dùng useMemo ở component.
 */
export function useReplay<T>(select: (s: ReplayState) => T): T {
  const store = useReplayStore();
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
