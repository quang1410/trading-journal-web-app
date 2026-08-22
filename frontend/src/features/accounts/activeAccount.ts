import { useCallback, useEffect, useSyncExternalStore } from "react";
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
 * Id đang chọn là state CHUNG của cả app, nên nó sống ở cấp module chứ không
 * trong useState của hook.
 *
 * Đây là chuyện đúng/sai, không phải tối ưu: useActiveAccount được gọi ở HAI
 * nơi cùng lúc — AccountSwitcher trên sidebar và trang đang mở. Mỗi useState
 * là một bản sao riêng, nên bấm đổi tài khoản ở sidebar chỉ đổi bản sao của
 * sidebar; bảng lệnh vẫn nằm ở tài khoản cũ cho tới khi F5. Một store dùng
 * chung + useSyncExternalStore làm mọi nơi đọc CÙNG một giá trị.
 *
 * localStorage chỉ đọc một lần rồi giữ trong biến: getItem là I/O đồng bộ,
 * mà getSnapshot thì React gọi lại ở mỗi lần render.
 */
const nguoiNghe = new Set<() => void>();
let daDoc = false;
let idHienTai: number | null = null;

function docId(): number | null {
  if (!daDoc) {
    idHienTai = readActiveAccountId();
    daDoc = true;
  }
  return idHienTai;
}

function datId(id: number): void {
  daDoc = true;
  if (idHienTai === id) return;
  idHienTai = id;
  storeActiveAccountId(id);
  for (const f of nguoiNghe) f();
}

function dangKy(f: () => void): () => void {
  nguoiNghe.add(f);
  return () => {
    nguoiNghe.delete(f);
  };
}

/** Chỉ dùng trong test: quên giá trị đã nhớ giữa các case. */
export function __resetActiveAccountForTest(): void {
  daDoc = false;
  idHienTai = null;
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

// Hằng số cấp module chứ không phải `data ?? []` viết thẳng trong thân hook:
// một literal `[]` là mảng MỚI ở mỗi lần render, và nó đi thẳng vào deps của
// effect bên dưới lẫn prop `accounts` của AccountSwitcher.
const RONG: Account[] = [];

export function useActiveAccount() {
  const { data, isPending } = useAccounts();
  const id = useSyncExternalStore(dangKy, docId, docId);

  const list = data ?? RONG;
  const account = resolveActiveAccount(list, id);

  // Giữ store khớp với thứ đang thực sự hiển thị, kể cả khi vừa rơi về
  // account đầu tiên vì id cũ không còn hợp lệ.
  useEffect(() => {
    if (account && account.id !== id) datId(account.id);
  }, [account, id]);

  const choose = useCallback((chon: number) => datId(chon), []);

  return { account, accounts: list, isPending, choose };
}
