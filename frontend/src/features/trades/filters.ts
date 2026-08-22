// Bộ lọc sống trên URL chứ không trong state của component: F5 không mất,
// gửi link được, nút Back trả về bộ lọc trước.
//
// Tên bảy trường trùng ĐÚNG tên backend nhận (filterFromQuery trong
// trade_handler.go), nên không có tầng ánh xạ nào ở giữa để lệch.

export type TradeFilter = {
  from: string;
  to: string;
  setup: string;
  symbol: string;
  timeframe: string;
  direction: string;
  trade_class: string;
};

export const EMPTY_FILTER: TradeFilter = {
  from: "",
  to: "",
  setup: "",
  symbol: "",
  timeframe: "",
  direction: "",
  trade_class: "",
};

// Một chỗ duy nhất liệt kê bảy khoá, để thêm ô lọc thứ tám không phải sửa
// bốn hàm.
const KHOA = Object.keys(EMPTY_FILTER) as (keyof TradeFilter)[];

export function readFilter(sp: URLSearchParams): TradeFilter {
  const f = { ...EMPTY_FILTER };
  for (const k of KHOA) f[k] = sp.get(k) ?? "";
  return f;
}

/**
 * Số trang từ URL. Chỉ nhận chuỗi toàn chữ số dương; mọi thứ khác về 1.
 *
 * Các hàm ép kiểu sẵn của JS hỏng ở đây theo kiểu im lặng: "1.5" thành 1,
 * "abc" thành NaN, "2e3" thành 2000 — đều là số trang sai mà không báo gì.
 * Cổng canh trong src/test/styleguard.test.ts cấm chúng, nên chỗ này dùng
 * +v sau khi regex đã bảo đảm, giống readActiveAccountId.
 */
export function readPage(sp: URLSearchParams): number {
  const v = sp.get("page");
  return v !== null && /^[1-9]\d*$/.test(v) ? +v : 1;
}

/** Bộ lọc thành tham số cho URL. Bỏ ô rỗng, bỏ page = 1. */
export function writeParams(f: TradeFilter, page: number): URLSearchParams {
  const sp = new URLSearchParams();
  for (const k of KHOA) {
    const v = f[k].trim();
    if (v !== "") sp.set(k, v);
  }
  if (page > 1) sp.set("page", String(page));
  return sp;
}

/**
 * Bộ lọc thành query string cho API — có dấu `?` sẵn, hoặc rỗng.
 *
 * KHÔNG gửi `size`: nó cố định 50, đúng bằng DefaultPageSize của backend.
 */
export function toQuery(f: TradeFilter, page: number): string {
  const s = writeParams(f, page).toString();
  return s === "" ? "" : `?${s}`;
}
