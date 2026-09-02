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
  server.use(
    http.get(`${BASE}/meta/enums`, () => envelope(enums)),
    // Mã sản phẩm và setup KHÔNG phải enum: chúng là giá trị account đã dùng,
    // nên đến từ /trades/facets chứ không từ /meta/enums.
    http.get(`${BASE}/accounts/1/trades/facets`, () =>
      envelope({ symbols: ["EURUSD", "XAUUSD"], setups: ["Breakout", "Pullback"] }),
    ),
  );
});

function renderPage(value: TradeFilter = EMPTY_FILTER) {
  const changed: TradeFilter[] = [];
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <FilterBar accountId={1} value={value} onChange={(f) => changed.push(f)} />
    </QueryClientProvider>,
  );
  return changed;
}

// Hai ô này từng là ô chữ khớp một phần. Gõ "breakout" trong khi dữ liệu ghi
// "Breakout" cho một bảng trống, mà bảng trống trông y hệt "không có lệnh nào
// khớp" — nên giờ chỉ chọn được giá trị có thật.
test("chọn mã sản phẩm từ danh sách account đã dùng", async () => {
  const u = userEvent.setup();
  const changed = renderPage();

  await u.click(await screen.findByRole("combobox", { name: "Mã sản phẩm" }));
  await u.click(await screen.findByRole("option", { name: "XAUUSD" }));

  expect(changed.at(-1)).toEqual({ ...EMPTY_FILTER, symbol: "XAUUSD" });
});

test("gõ vào ô tìm thu hẹp danh sách mã sản phẩm", async () => {
  const u = userEvent.setup();
  renderPage();

  await u.click(await screen.findByRole("combobox", { name: "Mã sản phẩm" }));
  await u.type(screen.getByRole("searchbox", { name: "Tìm mã sản phẩm" }), "eur");

  expect(screen.getByRole("option", { name: "EURUSD" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "XAUUSD" })).not.toBeInTheDocument();
});

test("chọn setup từ danh sách account đã dùng", async () => {
  const u = userEvent.setup();
  const changed = renderPage();

  await u.click(await screen.findByRole("combobox", { name: "Setup" }));
  await u.click(await screen.findByRole("option", { name: "Pullback" }));

  expect(changed.at(-1)).toEqual({ ...EMPTY_FILTER, setup: "Pullback" });
});

// Ô chọn cũng phải bỏ lọc được tại chỗ, y như dropdown enum.
test("chọn 'Tất cả' trong ô mã sản phẩm xoá điều kiện đó", async () => {
  const u = userEvent.setup();
  const changed = renderPage({ ...EMPTY_FILTER, symbol: "XAUUSD" });

  await u.click(await screen.findByRole("combobox", { name: "Mã sản phẩm" }));
  await u.click(await screen.findByRole("option", { name: "Tất cả" }));

  expect(changed.at(-1)).toEqual(EMPTY_FILTER);
});

// Mục "Tất cả" không nằm trong danh sách được lọc: người gõ để thu hẹp vẫn
// phải bỏ chọn được mà không phải xoá hết những gì vừa gõ.
test("mục 'Tất cả' vẫn còn khi đang gõ tìm kiếm", async () => {
  const u = userEvent.setup();
  const changed = renderPage({ ...EMPTY_FILTER, symbol: "XAUUSD" });

  await u.click(await screen.findByRole("combobox", { name: "Mã sản phẩm" }));
  await u.type(screen.getByRole("searchbox", { name: "Tìm mã sản phẩm" }), "eur");
  await u.click(screen.getByRole("option", { name: "Tất cả" }));

  expect(changed.at(-1)).toEqual(EMPTY_FILTER);
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

// Diff này bỏ ô gõ tay dự phòng, nên khi /facets hỏng thì dropdown là đường
// DUY NHẤT để lọc theo mã sản phẩm hay setup. Bản đầu dùng `facets?.x ?? []`
// cho cả ba trạng thái, nên lỗi mạng hiện ra thành "Không tìm thấy mã sản
// phẩm": người dùng đọc thành "account mình trống" và đi tìm bug ở dữ liệu,
// trong khi thứ hỏng là cuộc gọi mạng và việc cần làm là tải lại trang.
test("gọi /facets hỏng thì nói là hỏng, không nói là không tìm thấy", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/trades/facets`, () => HttpResponse.json({}, { status: 500 })),
  );
  const u = userEvent.setup();
  renderPage();

  await u.click(await screen.findByRole("combobox", { name: "Mã sản phẩm" }));
  expect(
    await screen.findByText("Không tải được danh sách — thử tải lại trang"),
  ).toBeInTheDocument();
  expect(screen.queryByText("Không tìm thấy mã sản phẩm")).not.toBeInTheDocument();
});

// Account thật sự chưa có lệnh nào là chuyện KHÁC với lỗi mạng, và câu chữ
// phải phân biệt được hai chuyện đó — nếu không thì bản vá trên chỉ đổi một
// câu sai lấy một câu sai khác.
test("account chưa có lệnh nào thì vẫn là 'không tìm thấy', không phải lỗi", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/trades/facets`, () => envelope({ symbols: [], setups: [] })),
  );
  const u = userEvent.setup();
  renderPage();

  await u.click(await screen.findByRole("combobox", { name: "Mã sản phẩm" }));
  expect(await screen.findByText("Không tìm thấy mã sản phẩm")).toBeInTheDocument();
  expect(
    screen.queryByText("Không tải được danh sách — thử tải lại trang"),
  ).not.toBeInTheDocument();
});
