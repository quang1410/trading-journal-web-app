import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { EMPTY_FILTER, type TradeFilter } from "@/features/trades/filters";
import { FilterBar } from "./FilterBar";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

// Danh sách enum ĐI TỪ BACKEND, không phải hằng số trong FE.
const enums = {
  directions: ["Long", "Short"],
  timeframes: ["M15", "H1", "H4"],
  entry_qualities: ["Đúng kế hoạch", "Quá sớm"],
  in_trade_qualities: ["Tuân thủ kế hoạch"],
  exit_qualities: ["Chạm Chốt lời"],
  psychologies: ["Không lỗi", "SỢ BỎ LỠ (FOMO)"],
  trade_classes: ["CHƯA ĐÁNH GIÁ", "Đúng kế hoạch", "Cần cải thiện"],
  cash_flow_types: ["deposit", "withdraw"],
  weekdays: ["Mon"],
  default_setup: "KHÔNG CÓ SETUP",
};

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
  server.use(http.get(`${BASE}/meta/enums`, () => envelope(enums)));
});

function renderPage(value: TradeFilter = EMPTY_FILTER) {
  const changed: TradeFilter[] = [];
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FilterBar value={value} onChange={(f) => changed.push(f)} />
    </QueryClientProvider>,
  );
  return changed;
}

test("gõ mã sản phẩm thì báo lên bộ lọc mới", async () => {
  const u = userEvent.setup();
  const changed = renderPage();

  await u.type(screen.getByLabelText("Mã sản phẩm"), "X");

  expect(changed.at(-1)).toEqual({ ...EMPTY_FILTER, symbol: "X" });
});

// Chuỗi trong dropdown phải ĐẾN TỪ /meta/enums. Chép cứng chúng vào FE là
// tạo bản sao thứ hai của key chấm điểm — cổng styleguard ở Task 6 canh việc
// đó, còn test này canh rằng dropdown thật sự đọc dữ liệu tải về.
test("dropdown phân loại lấy danh sách từ backend", async () => {
  const u = userEvent.setup();
  const changed = renderPage();

  await u.click(await screen.findByLabelText("Phân loại"));
  await u.click(await screen.findByRole("option", { name: "Cần cải thiện" }));

  expect(changed.at(-1)).toEqual({ ...EMPTY_FILTER, trade_class: "Cần cải thiện" });
});

test("dropdown chiều lệnh cũng lấy từ backend", async () => {
  const u = userEvent.setup();
  const changed = renderPage();

  await u.click(await screen.findByLabelText("Chiều"));
  await u.click(await screen.findByRole("option", { name: "Short" }));

  expect(changed.at(-1)).toEqual({ ...EMPTY_FILTER, direction: "Short" });
});

// Không có mục "tất cả" thì người dùng lọc rồi không bỏ lọc được nữa.
test("chọn 'Tất cả' xoá điều kiện đó", async () => {
  const u = userEvent.setup();
  const changed = renderPage({ ...EMPTY_FILTER, direction: "Short" });

  await u.click(await screen.findByLabelText("Chiều"));
  await u.click(await screen.findByRole("option", { name: "Tất cả" }));

  expect(changed.at(-1)).toEqual(EMPTY_FILTER);
});

test("nút Xoá lọc trả về bộ lọc rỗng", async () => {
  const u = userEvent.setup();
  const changed = renderPage({ ...EMPTY_FILTER, symbol: "XAUUSD", direction: "Long" });

  await u.click(screen.getByRole("button", { name: "Xoá lọc" }));

  expect(changed.at(-1)).toEqual(EMPTY_FILTER);
});

// Ngày đi thẳng dạng YYYY-MM-DD, KHÔNG qua phép đổi múi giờ nào. Backend so
// nó với trường `day` vốn đã tính theo timezone account; đổi sang instant rồi
// cắt lại ngày là con đường ngắn nhất để lệch một ngày ở rìa.
test("ô ngày gửi thẳng YYYY-MM-DD", async () => {
  const u = userEvent.setup();
  const changed = renderPage({ ...EMPTY_FILTER, from: "2026-06-01" });

  await u.click(screen.getByLabelText("Từ ngày"));
  await u.click(await screen.findByRole("button", { name: "Chọn ngày 02/06/2026" }));

  expect(changed.at(-1)?.from).toBe("2026-06-02");
});
