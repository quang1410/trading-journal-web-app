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

export const DEFAULT_PAGE_SIZE = 50;
export const PAGE_SIZES = [25, DEFAULT_PAGE_SIZE, 100, 200] as const;
const MAX_PAGE_SIZE = 200;

// Một chỗ duy nhất liệt kê bảy khoá, để thêm ô lọc thứ tám không phải sửa
// bốn hàm.
const KEYS = Object.keys(EMPTY_FILTER) as (keyof TradeFilter)[];

export function readFilter(sp: URLSearchParams): TradeFilter {
  const f = { ...EMPTY_FILTER };
  for (const k of KEYS) f[k] = sp.get(k) ?? "";
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

/** Đọc số dòng mỗi trang hợp lệ theo giới hạn của backend. */
export function readSize(sp: URLSearchParams): number {
  const v = sp.get("size");
  if (v === null || !/^[1-9]\d*$/.test(v)) return DEFAULT_PAGE_SIZE;
  const size = +v;
  return size <= MAX_PAGE_SIZE ? size : MAX_PAGE_SIZE;
}

/** Bộ lọc thành tham số cho URL. Bỏ ô rỗng, bỏ page/size mặc định. */
export function writeParams(
  f: TradeFilter,
  page: number,
  size = DEFAULT_PAGE_SIZE,
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const k of KEYS) {
    const v = f[k].trim();
    if (v !== "") sp.set(k, v);
  }
  if (page > 1) sp.set("page", String(page));
  if (size !== DEFAULT_PAGE_SIZE) sp.set("size", String(size));
  return sp;
}

/**
 * Bộ lọc thành query string cho API — có dấu `?` sẵn, hoặc rỗng.
 *
 * `size` gửi cùng request để API trả đúng số dòng người dùng đã chọn.
 */
export function toQuery(f: TradeFilter, page: number, size = DEFAULT_PAGE_SIZE): string {
  const s = writeParams(f, page, size).toString();
  return s === "" ? "" : `?${s}`;
}
