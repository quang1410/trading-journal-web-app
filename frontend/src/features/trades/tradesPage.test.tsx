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
  await u.click(await screen.findByRole("button", { name: /Xuất CSV/ }));

  await vi.waitFor(() => expect(goi).toContain("symbol=XAUUSD"));
  expect(goi).toContain("/accounts/1/trades.csv");
  expect(click).toHaveBeenCalled();

  taoURL.mockRestore();
  thuHoi.mockRestore();
  click.mockRestore();
});

// Không có lệnh nào thì khoá nút.
//
// Quyết định này ĐẢO NGƯỢC bản trước, và lý do đảo được ghi lại ở đây. Bản
// trước cố ý để nút bấm được, vì lo rằng một nút mờ sẽ bị đọc thành "chức
// năng hỏng". Nỗi lo đó có thật, nhưng nay nút đã tự khai số lệnh ngay trên
// mặt nó: "Xuất CSV · 0 lệnh" nói rõ vì sao không bấm được, nên cái mờ không
// còn mơ hồ nữa. Đổi lại, ta không đưa cho người dùng một file chỉ có mỗi
// dòng header — thứ trông như dữ liệu đã mất chứ không như một tập rỗng.
// REGRESSION: đang tải thì KHÔNG được nói "chưa có lệnh nào".
//
// `total` đọc từ `ds.data?.total ?? 0`, mà header vẽ TRƯỚC cổng `ds.isPending`
// ở dưới. Nên trong lúc request đầu tiên còn bay, nút hiện "Xuất CSV · 0 lệnh"
// và tooltip nói "Chưa có lệnh nào để xuất" — một câu SAI với tài khoản đang
// có 128 lệnh. "Chưa biết" và "không có" là hai chuyện khác nhau; gộp chúng
// lại là để giao diện nói dối trong lúc chờ.
test("đang tải thì nút xuất không khẳng định là chưa có lệnh", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/trades`, async () => {
      await delay(120);
      return envelope({ items: [makeTrade()], page: 1, size: 50, total: 128 });
    }),
  );

  renderPage();

  const nut = await screen.findByRole("button", { name: /Xuất CSV/ });
  expect(nut).not.toHaveAttribute("title", expect.stringMatching(/chưa có lệnh nào/i));
  expect(nut).not.toHaveTextContent("0 lệnh");

  // Tải xong thì con số thật hiện ra.
  await vi.waitFor(() => expect(nut).toHaveTextContent("128 lệnh"));
});

// Nút phải nói TRƯỚC số lệnh sắp xuất.
//
// Trang hiện 50 dòng một trang nhưng file lấy cả tập đã lọc, nên "bao nhiêu
// dòng" là câu người dùng không tự trả lời được bằng mắt.
test("nút xuất nói rõ số lệnh sắp xuất", async () => {
  // Đặt total rõ ràng thay vì mượn số của fixture mặc định: con số này CHÍNH
  // LÀ thứ đang kiểm, nên nó phải nằm ngay trong ca test.
  server.use(
    http.get(`${BASE}/accounts/1/trades`, () =>
      envelope({ items: [makeTrade()], page: 1, size: 50, total: 128 }),
    ),
  );

  renderPage();
  expect(await screen.findByRole("button", { name: /Xuất CSV · 128 lệnh/ })).toBeInTheDocument();
});

// Đang lọc thì phải NÓI ra là đang lọc.
//
// Đây là chỗ hiểu nhầm tốn kém nhất của tính năng: xuất nhầm tập dữ liệu
// không báo lỗi, nó chỉ cho ra một file sai trong im lặng. Nhãn phải là CHỮ
// chứ không chỉ tooltip — tooltip cần rê chuột, điện thoại không có chuột.
test("đang lọc thì nút xuất nói rõ chỉ xuất phần đã lọc", async () => {
  renderPage("/trades?symbol=XAUUSD");

  expect(await screen.findByText(/theo bộ lọc hiện tại/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Xuất CSV/ })).toHaveAttribute(
    "title",
    expect.stringMatching(/bộ lọc/i),
  );
});

// Không lọc thì KHÔNG nói gì thêm: một nhãn "toàn bộ" luôn hiện sẽ thành
// nhiễu, và người dùng ngừng đọc nó đúng lúc nó bắt đầu quan trọng.
test("không lọc thì không hiện nhãn bộ lọc", async () => {
  renderPage();
  await screen.findByRole("button", { name: /Xuất CSV/ });

  expect(screen.queryByText(/theo bộ lọc hiện tại/i)).not.toBeInTheDocument();
});

// REGRESSION: export hỏng phải BÁO cho người dùng.
//
// Code cũ bọc lời gọi trong try/finally mà KHÔNG có catch, nên khi server trả
// lỗi thì nút chỉ hết xoay và không gì khác xảy ra. Người dùng không phân
// biệt được "hỏng" với "đang tải ngầm" hay "trình duyệt chặn tải" — họ ngồi
// chờ một file không bao giờ tới. Ca này fail trên code cũ.
test("export lỗi thì báo cho người dùng, không im lặng", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/trades.csv`, () =>
      HttpResponse.json(
        { code: 1500, msg: "lỗi máy chủ", data: null },
        { status: 500 },
      ),
    ),
  );

  renderPage();
  const u = userEvent.setup();
  await u.click(await screen.findByRole("button", { name: /Xuất CSV/ }));

  // Câu lỗi phải nêu tên VIỆC hỏng, không chỉ nguyên nhân thô từ backend.
  //
  // Khẳng định TRỌN câu chứ không chỉ hai mảnh rời: backend trả msg viết
  // thường, không dấu chấm cuối, nên nối thẳng vào câu cho ra "…file CSV. lỗi
  // máy chủ Bảng lệnh vẫn bình thường". Hai mảnh đều "có mặt" nên phép kiểm
  // từng mảnh vẫn xanh trong khi màn hình thật đọc không xuôi.
  expect(
    await screen.findByText(
      /Không tải được file CSV \(lỗi máy chủ\)\. Bảng lệnh vẫn bình thường/i,
    ),
  ).toBeInTheDocument();
  // Bảng lệnh KHÔNG hỏng — chỉ mỗi việc xuất file hỏng.
  expect(screen.getByRole("row", { name: /XAUUSD/ })).toBeInTheDocument();
});

// Thử lại thành công thì lỗi cũ phải biến mất, không nằm lại trên màn hình.
test("xuất lại thành công thì xoá thông báo lỗi cũ", async () => {
  let hong = true;
  server.use(
    http.get(`${BASE}/accounts/1/trades.csv`, () => {
      if (hong) {
        return HttpResponse.json({ code: 1500, msg: "lỗi máy chủ", data: null }, { status: 500 });
      }
      return new HttpResponse("STT,Symbol\n", { headers: { "Content-Type": "text/csv" } });
    }),
  );
  const taoURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:gia");
  const thuHoi = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  renderPage();
  const u = userEvent.setup();
  const nut = await screen.findByRole("button", { name: /Xuất CSV/ });

  await u.click(nut);
  expect(await screen.findByText(/không tải được file csv/i)).toBeInTheDocument();

  hong = false;
  await u.click(nut);
  await vi.waitFor(() => expect(click).toHaveBeenCalled());
  await vi.waitFor(() =>
    expect(screen.queryByText(/không tải được file csv/i)).not.toBeInTheDocument(),
  );

  taoURL.mockRestore();
  thuHoi.mockRestore();
  click.mockRestore();
});

test("không có lệnh nào thì khoá nút xuất và nói rõ 0 lệnh", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/trades`, () =>
      envelope({ items: [], page: 1, size: 50, total: 0 }),
    ),
  );

  renderPage();
  // Chờ TRẠNG THÁI ĐÃ TẢI XONG chứ không chỉ chờ nút xuất hiện: lúc còn tải,
  // nút cũng mang nhãn "Xuất CSV" và cũng đang khoá, nên bắt sớm là khẳng
  // định nhầm về một khoảnh khắc khác.
  const nut = await screen.findByRole("button", { name: /Xuất CSV · 0 lệnh/ });
  expect(nut).toBeDisabled();
  expect(nut).toHaveAttribute("title", expect.stringMatching(/chưa có lệnh nào/i));
});
