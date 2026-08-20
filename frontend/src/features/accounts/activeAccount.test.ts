import {
  ACTIVE_ACCOUNT_KEY,
  readActiveAccountId,
  resolveActiveAccount,
  storeActiveAccountId,
} from "./activeAccount";
import type { Account } from "./types";

const tk = (id: number, code: string): Account => ({
  id,
  code,
  name: "",
  initial_balance: "1000",
  risk_per_trade: "0.01",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  one_r: "10",
});

const A = tk(1, "A");
const B = tk(2, "B");

describe("resolveActiveAccount", () => {
  test("chưa có account nào thì không có account đang chọn", () => {
    expect(resolveActiveAccount([], 1)).toBeNull();
    expect(resolveActiveAccount([], null)).toBeNull();
  });

  test("chưa lưu gì thì lấy account đầu tiên", () => {
    expect(resolveActiveAccount([A, B], null)).toBe(A);
  });

  test("id đã lưu có trong danh sách thì dùng nó", () => {
    expect(resolveActiveAccount([A, B], 2)).toBe(B);
  });

  // ĐÂY LÀ NHÁNH QUAN TRỌNG. Id còn sót lại của user khác — hoặc của một
  // account đã biến mất — sẽ làm mọi query của Phase 3 gọi vào account
  // không thuộc mình và ăn 403 mà không ai hiểu vì sao.
  test("id đã lưu KHÔNG có trong danh sách thì rơi về account đầu tiên", () => {
    expect(resolveActiveAccount([A, B], 999)).toBe(A);
  });
});

describe("đọc ghi localStorage", () => {
  test("chưa lưu gì thì trả null", () => {
    expect(readActiveAccountId({ getItem: () => null })).toBeNull();
  });

  test("giá trị rác thì trả null chứ không trả NaN", () => {
    expect(readActiveAccountId({ getItem: () => "linh tinh" })).toBeNull();
    expect(readActiveAccountId({ getItem: () => "" })).toBeNull();
    expect(readActiveAccountId({ getItem: () => "1.5" })).toBeNull();
  });

  test("đọc lại đúng số đã ghi", () => {
    expect(readActiveAccountId({ getItem: () => "42" })).toBe(42);
  });

  test("ghi dưới đúng khoá", () => {
    let khoa = "";
    let giaTri = "";
    storeActiveAccountId(7, {
      setItem: (k: string, v: string) => {
        khoa = k;
        giaTri = v;
      },
    });
    expect(khoa).toBe(ACTIVE_ACCOUNT_KEY);
    expect(giaTri).toBe("7");
  });
});
