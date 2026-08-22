import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { server } from "@/test/server";
import { taoLenh, taoStats } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { TradesPage } from "./TradesPage";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const account = {
  id: 1,
  code: "FTMO",
  name: "Quỹ thử thách",
  initial_balance: "10000",
  risk_per_trade: "0.01",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  one_r: "100",
};

const enums = {
  directions: ["Long", "Short"],
  timeframes: ["M15", "H1"],
  entry_qualities: ["Đúng kế hoạch"],
  in_trade_qualities: ["Tuân thủ kế hoạch"],
  exit_qualities: ["Chạm Chốt lời"],
  psychologies: ["Không lỗi"],
  trade_classes: ["CHƯA ĐÁNH GIÁ", "Đúng kế hoạch"],
  cash_flow_types: ["deposit", "withdraw"],
  weekdays: ["Mon"],
  default_setup: "KHÔNG CÓ SETUP",
};

let duongDanTrades = "";

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  localStorage.clear();
  duongDanTrades = "";
  setSession("abc", { id: 1, email: "toi@example.com" });
  server.use(
    http.get(`${BASE}/accounts`, () => phongBi([account])),
    http.get(`${BASE}/meta/enums`, () => phongBi(enums)),
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      duongDanTrades = new URL(request.url).search;
      return phongBi({ items: [taoLenh({ stt: 1 })], page: 1, size: 50, total: 1 });
    }),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi(taoStats())),
    http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([])),
  );
});

/**
 * Hiện URL hiện tại ra DOM để test đọc được mà không cần chạm router nội bộ.
 *
 * <span> chứ không phải <output>: <output> mang sẵn role="status", nên nó
 * lẫn vào phép tìm vùng "đang tải" của test bên dưới.
 */
function HienURL() {
  const l = useLocation();
  return <span data-testid="url">{`${l.pathname}${l.search}`}</span>;
}

/** Nút Back của trình duyệt, dựng lại để test bấm được. */
function NutLui() {
  const di = useNavigate();
  return (
    <button type="button" onClick={() => di(-1)}>
      Lui
    </button>
  );
}

function dung(url = "/trades", truoc: string[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[...truoc, url]}>
        <HienURL />
        <NutLui />
        <Routes>
          <Route path="/trades" element={<TradesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("bảng và dải KPI cùng dựng từ một bộ lọc", async () => {
  dung();
  expect(await screen.findByRole("row", { name: /XAUUSD/ })).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Số lệnh" })).getByText("3")).toBeInTheDocument();
});

// ĐÂY LÀ BẤT BIẾN SỐ 5. Vào thẳng URL có sẵn bộ lọc thì bộ lọc phải có hiệu
// lực ngay từ request ĐẦU TIÊN — đó là điều một useState trong component
// không làm được.
test("bộ lọc trên URL có hiệu lực ngay lần tải đầu", async () => {
  dung("/trades?symbol=XAUUSD&direction=Long&page=2");

  await screen.findByRole("row", { name: /XAUUSD/ });
  expect(duongDanTrades).toBe("?symbol=XAUUSD&direction=Long&page=2");
  expect(screen.getByLabelText("Mã sản phẩm")).toHaveValue("XAUUSD");
});

test("đổi bộ lọc thì ghi lên URL", async () => {
  const u = userEvent.setup();
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.type(screen.getByLabelText("Mã sản phẩm"), "EU");

  expect(await screen.findByTestId("url")).toHaveTextContent("/trades?symbol=EU");
});

// Lọc lại mà vẫn ở trang 7 thì người dùng thấy một trang trống và tưởng
// không có kết quả nào.
test("đổi bộ lọc thì về trang 1", async () => {
  const u = userEvent.setup();
  dung("/trades?page=3");
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.type(screen.getByLabelText("Mã sản phẩm"), "E");

  const url = await screen.findByTestId("url");
  expect(url).toHaveTextContent("symbol=E");
  expect(url).not.toHaveTextContent("page=");
});

// Mỗi phím gõ là một lần đổi bộ lọc. Đẩy tất cả vào history thì gõ "EU"
// xong phải bấm Back hai lần mới rời được trang — nút Back của trình duyệt
// biến thành nút xoá từng ký tự.
test("đổi bộ lọc thay chỗ trên history, không chồng thêm mục mới", async () => {
  const u = userEvent.setup();
  dung("/trades", ["/accounts"]);
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.type(screen.getByLabelText("Mã sản phẩm"), "EU");
  expect(await screen.findByTestId("url")).toHaveTextContent("symbol=EU");

  await u.click(screen.getByRole("button", { name: "Lui" }));

  expect(await screen.findByTestId("url")).toHaveTextContent("/accounts");
});

test("chưa có tài khoản nào thì chỉ đường sang trang tài khoản", async () => {
  server.use(http.get(`${BASE}/accounts`, () => phongBi([])));
  dung();
  expect(await screen.findByRole("link", { name: /tài khoản/i })).toBeInTheDocument();
  expect(duongDanTrades).toBe("");
});

test("phân trang ghi số trang lên URL", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      duongDanTrades = new URL(request.url).search;
      return phongBi({ items: [taoLenh()], page: 1, size: 50, total: 120 });
    }),
  );
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("link", { name: "Trang sau" }));

  expect(await screen.findByTestId("url")).toHaveTextContent("page=2");
});

test("mở form thêm lệnh từ nút trên đầu trang", async () => {
  const u = userEvent.setup();
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("button", { name: "Thêm lệnh" }));

  expect(await screen.findByRole("dialog")).toHaveTextContent("Thêm lệnh");
});

test("xoá lệnh phải xác nhận trước", async () => {
  const u = userEvent.setup();
  let daXoa = false;
  server.use(
    http.delete(`${BASE}/trades/1`, () => {
      daXoa = true;
      return phongBi(null);
    }),
  );
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("button", { name: "Xem chi tiết lệnh 1" }));
  await u.click(screen.getByRole("button", { name: "Xoá lệnh 1" }));
  expect(daXoa).toBe(false);

  await u.click(await screen.findByRole("button", { name: "Xoá" }));
  await screen.findByRole("row", { name: /XAUUSD/ });
  expect(daXoa).toBe(true);
});

// Hộp xác nhận cho một thao tác PHÁ HUỶ phải là alertdialog, không phải
// dialog. Khác biệt không nằm ở giao diện mà ở hành vi: alertdialog dồn
// focus vào nút Huỷ chứ không phải nút Xoá, nên phím Enter theo phản xạ
// sau khi hộp bật lên sẽ huỷ chứ không xoá mất lệnh.
test("hộp xác nhận xoá là alertdialog và focus rơi vào Huỷ", async () => {
  const u = userEvent.setup();
  dung();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("button", { name: "Xem chi tiết lệnh 1" }));
  await u.click(screen.getByRole("button", { name: "Xoá lệnh 1" }));

  const hop = await screen.findByRole("alertdialog");
  expect(hop).toHaveTextContent("Xoá lệnh?");
  expect(within(hop).getByRole("button", { name: "Huỷ" })).toHaveFocus();
});

// Lưới an toàn cho việc đổi thẻ <p> chữ đỏ sang component Alert. Hai điều
// phải giữ nguyên qua mọi lần đổi cách trình bày:
//
//  1. Lỗi phải mang role="alert" — không có nó thì trình đọc màn hình im
//     lặng và người dùng ngồi chờ một bảng không bao giờ tới.
//  2. KHÔNG được hiện kèm "không có lệnh nào khớp bộ lọc". Tải hỏng và lọc
//     ra rỗng là hai chuyện khác nhau; gộp lại thì người dùng đi nới bộ lọc
//     trong khi thứ hỏng là máy chủ.
test("tải lỗi thì báo bằng role=alert, không nói là bộ lọc rỗng", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/trades`, () =>
      HttpResponse.json({ code: 1500, msg: "máy chủ đang bận", data: null }, { status: 500 }),
    ),
  );
  dung();

  const bao = await screen.findByRole("alert");
  expect(bao).toHaveTextContent("máy chủ đang bận");
  expect(screen.queryByText(/không có lệnh nào khớp bộ lọc/i)).not.toBeInTheDocument();
});

// Phân trang phải là ĐIỀU HƯỚNG, không phải hai cái nút.
//
// Trang kế tiếp đã có URL riêng — bộ lọc nằm hết trên query string. Dựng nó
// bằng <button onClick> là vứt đi điều đó: không copy được đường dẫn, không
// bấm chuột giữa mở tab mới, và trình đọc màn hình không có landmark nào để
// nhảy tới. <nav aria-label> + <a href> lấy lại cả ba.
test("phân trang là nav chứa link mang URL trang kế", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/trades`, () =>
      phongBi({ items: [taoLenh()], page: 1, size: 50, total: 120 }),
    ),
  );
  dung("/trades?symbol=XAU");
  await screen.findByRole("row", { name: /XAUUSD/ });

  const dieuHuong = screen.getByRole("navigation", { name: "Phân trang" });
  const sau = within(dieuHuong).getByRole("link", { name: "Trang sau" });
  // Giữ nguyên bộ lọc: nhảy trang mà rơi mất bộ lọc là đổi luôn tập kết quả.
  expect(sau).toHaveAttribute("href", "/trades?symbol=XAU&page=2");
});

// Lưới an toàn cho việc đổi "Đang tải…" sang Skeleton.
//
// Skeleton là mấy khối xám nhấp nháy — với mắt thì rõ, với trình đọc màn
// hình thì KHÔNG CÓ GÌ. Bất biến phải giữ: vùng đang tải mang role="status"
// và trong đó còn chữ đọc được, dù chữ ấy có bị ẩn khỏi mắt bằng sr-only.
// Thiếu nó thì người dùng bàn phím ngồi im trước một trang câm.
test("đang tải thì vẫn còn thông báo đọc được", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/trades`, async () => {
      await delay("infinite");
      return phongBi(null);
    }),
  );
  dung();

  const bao = await screen.findByRole("status");
  expect(bao).toHaveTextContent(/đang tải/i);
});
