import { useCallback, useEffect, useState } from "react";
import { useAccounts } from "./hooks";
import type { Account } from "./types";

export const ACTIVE_ACCOUNT_KEY = "journal.active_account";

type Doc = Pick<Storage, "getItem">;
type Ghi = Pick<Storage, "setItem">;

export function readActiveAccountId(store: Doc = localStorage): number | null {
  const v = store.getItem(ACTIVE_ACCOUNT_KEY);
  // Chỉ chấp nhận chuỗi toàn chữ số. Các hàm ép kiểu sẵn của JS đều hỏng ở
  // đây theo kiểu im lặng: "1.5" thành 1, "abc" thành NaN — cả hai đều là id
  // sai mà không báo gì. Cổng canh trong src/test/styleguard.test.ts cấm
  // chúng trong mã của dự án, nên chỗ này dùng +v sau khi regex đã bảo đảm.
  return v !== null && /^\d+$/.test(v) ? +v : null;
}

export function storeActiveAccountId(id: number, store: Ghi = localStorage): void {
  store.setItem(ACTIVE_ACCOUNT_KEY, String(id));
}

/**
 * Chọn account đang hoạt động từ danh sách VỪA TẢI.
 *
 * Id lưu sẵn luôn phải đối chiếu lại: nó có thể là của user khác, hoặc của
 * một account đã biến mất. Tin nó mà không kiểm sẽ làm Phase 3 gọi vào
 * account không thuộc mình và ăn 403 khó hiểu.
 */
export function resolveActiveAccount(list: Account[], storedId: number | null): Account | null {
  if (list.length === 0) return null;
  return list.find((a) => a.id === storedId) ?? list[0];
}

export function useActiveAccount() {
  const { data, isPending } = useAccounts();
  const [id, setId] = useState<number | null>(() => readActiveAccountId());

  const list = data ?? [];
  const account = resolveActiveAccount(list, id);

  // Giữ localStorage khớp với thứ đang thực sự hiển thị, kể cả khi vừa rơi
  // về account đầu tiên vì id cũ không còn hợp lệ.
  useEffect(() => {
    if (account && account.id !== id) {
      setId(account.id);
      storeActiveAccountId(account.id);
    }
  }, [account, id]);

  const choose = useCallback((chon: number) => {
    setId(chon);
    storeActiveAccountId(chon);
  }, []);

  return { account, accounts: list, isPending, choose };
}
