import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { server } from "@/test/server";
import { makeTrade, makeStats } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { TradesPage } from "./TradesPage";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

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

let tradesPath = "";

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  localStorage.clear();
  tradesPath = "";
  setSession("abc", { id: 1, email: "toi@example.com" });
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([account])),
    http.get(`${BASE}/meta/enums`, () => envelope(enums)),
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      tradesPath = new URL(request.url).search;
      return envelope({ items: [makeTrade({ stt: 1 })], page: 1, size: 50, total: 1 });
    }),
    http.get(`${BASE}/accounts/1/stats`, () => envelope(makeStats())),
    http.get(`${BASE}/accounts/1/trades/trash`, () => envelope([])),
    http.get(`${BASE}/accounts/1/trades/facets`, () =>
      envelope({ symbols: ["EURUSD", "XAUUSD"], setups: ["Breakout"] }),
    ),
  );
});

// Ô "Mã sản phẩm" là ô chọn: mở dropdown rồi bấm một mục có thật, chứ không
// gõ chuỗi tự do như bản trước.
async function chonMa(u: ReturnType<typeof userEvent.setup>, ma: string) {
  await u.click(await screen.findByRole("combobox", { name: "Mã sản phẩm" }));
  await u.click(await screen.findByRole("option", { name: ma }));
}

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
function PrevButton() {
  const di = useNavigate();
  return (
    <button type="button" onClick={() => di(-1)}>
      Lui
    </button>
  );
}

function renderPage(url = "/trades", before: string[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[...before, url]}>
        <HienURL />
        <PrevButton />
        <Routes>
          <Route path="/trades" element={<TradesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("bảng và dải KPI cùng dựng từ một bộ lọc", async () => {
  renderPage();
  expect(await screen.findByRole("row", { name: /XAUUSD/ })).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Số lệnh" })).getByText("3")).toBeInTheDocument();
});

// ĐÂY LÀ BẤT BIẾN SỐ 5. Vào thẳng URL có sẵn bộ lọc thì bộ lọc phải có hiệu
// lực ngay từ request ĐẦU TIÊN — đó là điều một useState trong component
// không làm được.
test("bộ lọc trên URL có hiệu lực ngay lần tải đầu", async () => {
  renderPage("/trades?symbol=XAUUSD&direction=Long&page=2");

  await screen.findByRole("row", { name: /XAUUSD/ });
  expect(tradesPath).toBe("?symbol=XAUUSD&direction=Long&page=2");
  expect(screen.getByRole("combobox", { name: "Mã sản phẩm" })).toHaveTextContent("XAUUSD");
});

test("đổi bộ lọc thì ghi lên URL", async () => {
  const u = userEvent.setup();
  renderPage();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await chonMa(u, "EURUSD");

  expect(await screen.findByTestId("url")).toHaveTextContent("/trades?symbol=EURUSD");
});

// Lọc lại mà vẫn ở trang 7 thì người dùng thấy một trang trống và tưởng
// không có kết quả nào.
test("đổi bộ lọc thì về trang 1", async () => {
  const u = userEvent.setup();
  renderPage("/trades?page=3");
  await screen.findByRole("row", { name: /XAUUSD/ });

  await chonMa(u, "EURUSD");

  const url = await screen.findByTestId("url");
  expect(url).toHaveTextContent("symbol=EURUSD");
  expect(url).not.toHaveTextContent("page=");
});

// Lọc là thu hẹp cái đang xem, không phải đi sang trang khác. Đẩy mỗi lần
// đổi bộ lọc vào history thì chọn ba điều kiện xong phải bấm Back ba lần mới
// rời được trang — nút Back của trình duyệt biến thành nút bỏ lọc.
test("đổi bộ lọc thay chỗ trên history, không chồng thêm mục mới", async () => {
  const u = userEvent.setup();
  renderPage("/trades", ["/accounts"]);
  await screen.findByRole("row", { name: /XAUUSD/ });

  await chonMa(u, "EURUSD");
  expect(await screen.findByTestId("url")).toHaveTextContent("symbol=EURUSD");

  await u.click(screen.getByRole("button", { name: "Lui" }));

  expect(await screen.findByTestId("url")).toHaveTextContent("/accounts");
});

test("chưa có tài khoản nào thì chỉ đường sang trang tài khoản", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([])));
  renderPage();
  expect(await screen.findByRole("link", { name: /tài khoản/i })).toBeInTheDocument();
  expect(tradesPath).toBe("");
});

test("phân trang ghi số trang lên URL", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      tradesPath = new URL(request.url).search;
      return envelope({ items: [makeTrade()], page: 1, size: 50, total: 120 });
    }),
  );
  renderPage();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("link", { name: "Trang sau" }));

  expect(await screen.findByTestId("url")).toHaveTextContent("page=2");
});

test("đổi số dòng mỗi trang về trang 1 và ghi size lên URL/API", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      tradesPath = new URL(request.url).search;
      return envelope({ items: [makeTrade()], page: 1, size: 100, total: 120 });
    }),
  );
  renderPage("/trades?page=2");
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("combobox", { name: "Số lệnh/trang" }));
  await u.click(screen.getByRole("option", { name: "100" }));

  expect(await screen.findByTestId("url")).toHaveTextContent("/trades?size=100");
  expect(tradesPath).toContain("size=100");
  expect(tradesPath).not.toContain("page=");
});

test("hiện link số trang và giữ size khi chuyển trang", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/trades`, ({ request }) => {
      tradesPath = new URL(request.url).search;
      return envelope({ items: [makeTrade()], page: 1, size: 25, total: 120 });
    }),
  );
  renderPage("/trades?size=25");
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("link", { name: "Đến trang 3" }));

  expect(await screen.findByTestId("url")).toHaveTextContent("/trades?page=3&size=25");
});

test("mở form thêm lệnh từ nút trên đầu trang", async () => {
  const u = userEvent.setup();
  renderPage();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("button", { name: "Thêm lệnh" }));

  expect(await screen.findByRole("dialog")).toHaveTextContent("Thêm lệnh");
});

test("xoá lệnh phải xác nhận trước", async () => {
  const u = userEvent.setup();
  let removed = false;
  server.use(
    http.delete(`${BASE}/trades/1`, () => {
      removed = true;
      return envelope(null);
    }),
  );
  renderPage();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("button", { name: "Xem chi tiết lệnh 1" }));
  await u.click(screen.getByRole("button", { name: "Xoá lệnh 1" }));
  expect(removed).toBe(false);

  await u.click(await screen.findByRole("button", { name: "Xoá" }));
  await screen.findByRole("row", { name: /XAUUSD/ });
  expect(removed).toBe(true);
});

// Hộp xác nhận cho một thao tác PHÁ HUỶ phải là alertdialog, không phải
// dialog. Khác biệt không nằm ở giao diện mà ở hành vi: alertdialog dồn
// focus vào nút Huỷ chứ không phải nút Xoá, nên phím Enter theo phản xạ
// sau khi hộp bật lên sẽ huỷ chứ không xoá mất lệnh.
test("hộp xác nhận xoá là alertdialog và focus rơi vào Huỷ", async () => {
  const u = userEvent.setup();
  renderPage();
  await screen.findByRole("row", { name: /XAUUSD/ });

  await u.click(screen.getByRole("button", { name: "Xem chi tiết lệnh 1" }));
  await u.click(screen.getByRole("button", { name: "Xoá lệnh 1" }));

  const box = await screen.findByRole("alertdialog");
  expect(box).toHaveTextContent("Xoá lệnh?");
  expect(within(box).getByRole("button", { name: "Huỷ" })).toHaveFocus();
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
  renderPage();

  const warn = await screen.findByRole("alert");
  expect(warn).toHaveTextContent("máy chủ đang bận");
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
      envelope({ items: [makeTrade()], page: 1, size: 50, total: 120 }),
    ),
  );
  renderPage("/trades?symbol=XAU");
  await screen.findByRole("row", { name: /XAUUSD/ });

  const navigate = screen.getByRole("navigation", { name: "Phân trang" });
  const after = within(navigate).getByRole("link", { name: "Trang sau" });
  // Giữ nguyên bộ lọc: nhảy trang mà rơi mất bộ lọc là đổi luôn tập kết quả.
  expect(after).toHaveAttribute("href", "/trades?symbol=XAU&page=2");
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
      return envelope(null);
    }),
  );
  renderPage();

  const warn = await screen.findByRole("status");
  expect(warn).toHaveTextContent(/đang tải/i);
});

// ---- Xuất CSV (Phase 5) ----

// Export phải khớp cái người dùng ĐANG NHÌN THẤY. Xuất toàn bộ account trong
// khi màn hình đang lọc một symbol là đưa nhầm file cho người ta.
test("nút xuất CSV gọi endpoint kèm bộ lọc đang xem", async () => {
  let goi = "";
  server.use(
    http.get(`${BASE}/accounts/1/trades.csv`, ({ request }) => {
      goi = request.url;
      return new HttpResponse("STT,Symbol\n", { headers: { "Content-Type": "text/csv" } });
    }),
  );
  const taoURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:gia");
  const thuHoi = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  renderPage("/trades?symbol=XAUUSD");
  const u = userEvent.setup();
  await u.click(await screen.findByRole("button", { name: "Xuất CSV" }));

  await vi.waitFor(() => expect(goi).toContain("symbol=XAUUSD"));
  expect(goi).toContain("/accounts/1/trades.csv");
  expect(click).toHaveBeenCalled();

  taoURL.mockRestore();
  thuHoi.mockRestore();
  click.mockRestore();
});

// Danh sách rỗng vẫn xuất được: file chỉ có header là kết quả hợp lệ, và
// vô hiệu hoá nút sẽ khiến người dùng tưởng chức năng hỏng.
test("danh sách rỗng thì nút xuất vẫn bấm được", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/trades`, () =>
      envelope({ items: [], page: 1, size: 50, total: 0 }),
    ),
  );

  renderPage();
  expect(await screen.findByRole("button", { name: "Xuất CSV" })).toBeEnabled();
});
