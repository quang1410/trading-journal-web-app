import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Quill from "quill";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { makeTrade } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { wallToInstant } from "@/lib/datetime";
import type { Account } from "@/features/accounts/types";
import type { Trade } from "./types";
import { TradeFormDialog } from "./TradeFormDialog";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const enums = {
  directions: ["Long", "Short"],
  timeframes: ["M15", "H1", "H4"],
  entry_qualities: ["Đúng kế hoạch", "Quá sớm"],
  in_trade_qualities: ["Tuân thủ kế hoạch"],
  exit_qualities: ["Chạm Chốt lời"],
  psychologies: ["Không lỗi", "SỢ BỎ LỠ (FOMO)"],
  trade_classes: ["CHƯA ĐÁNH GIÁ", "Đúng kế hoạch"],
  cash_flow_types: ["deposit", "withdraw"],
  weekdays: ["Mon"],
  default_setup: "KHÔNG CÓ SETUP",
};

function makeAccount(over: Partial<Account> = {}): Account {
  return {
    id: 1,
    code: "FTMO",
    name: "Quỹ thử thách",
    initial_balance: "10000",
    risk_per_trade: "0.01",
    currency: "USD",
    timezone: "Asia/Ho_Chi_Minh",
    one_r: "100",
    ...over,
  };
}

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
  server.use(
    http.get(`${BASE}/meta/enums`, () => envelope(enums)),
    http.get(`${BASE}/accounts/1/trades`, () => envelope({ items: [], page: 1, size: 50, total: 0 })),
    http.get(`${BASE}/accounts/1/stats`, () => envelope(null)),
    http.get(`${BASE}/accounts/1/trades/trash`, () => envelope([])),
    // Form đọc facets để gợi ý setup đã dùng. Trả rỗng là mặc định; test nào
    // cần danh sách thật thì tự ghi đè.
    http.get(`${BASE}/accounts/1/trades/facets`, () => envelope({ symbols: [], setups: [] })),
    // Form giờ có nút "Chèn mẫu" nên nó luôn nạp danh sách mẫu. Rỗng là mặc
    // định; test nào cần mẫu thật thì tự ghi đè.
    http.get(`${BASE}/note-templates`, () => envelope([])),
  );
});

function renderPage(props: { account?: Account; trade?: Trade } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TradeFormDialog
        account={props.account ?? makeAccount()}
        trade={props.trade}
        open
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

// Chờ enum có dữ liệu thật trước khi thao tác, để không thao tác trên một
// form còn đang tính giá trị mặc định. Chiều lệnh giờ là radiogroup (hai lựa
// chọn bày ngang), nên chờ chính nhóm đó xuất hiện.
async function doiEnumTai() {
  await screen.findByRole("radiogroup", { name: "Chiều lệnh" });
}

// Ô ghi chú là contenteditable của Quill, không phải <textarea>: nó không có
// `value` để đọc, và userEvent không gõ được vào nó.
//
// userEvent.paste() chỉ ăn khi editor đang RỖNG: nó dispatch một
// ClipboardEvent mà jsdom dựng không đủ `clipboardData` cho Quill đọc, nên
// khi đã có nội dung sẵn thì thao tác rơi mất. Đó là giới hạn của jsdom, đã
// đo bằng cách gọi thẳng `quill.insertText` trên cùng một editor — API ăn
// bình thường, chỉ đường ClipboardEvent là không. Vì vậy test đi qua đúng
// cái API đó; đường gõ tay của người dùng thật được xác nhận trên trình
// duyệt.
function noteBox(): HTMLElement {
  return screen.getByLabelText("Ghi chú").querySelector(".ql-editor") as HTMLElement;
}

/** Instance Quill gắn với ô ghi chú. Quill 2 phơi nó ra qua Quill.find(). */
function noteQuill(): Quill {
  const container = screen.getByLabelText("Ghi chú");
  const q = Quill.find(container);
  if (!(q instanceof Quill)) throw new Error("không tìm thấy instance Quill của ô ghi chú");
  return q;
}

/** Thay TOÀN BỘ nội dung ghi chú, như người dùng bôi đen rồi gõ đè. */
function setNote(text: string) {
  const q = noteQuill();
  q.setText(text + "\n", "user");
}

test("thêm lệnh gửi entered_at đổi theo timezone của ACCOUNT", async () => {
  const u = userEvent.setup();
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope(makeTrade());
    }),
  );

  // Account ở New York, còn máy chạy test ở đâu thì không ai biết. Chọn ngày
  // hôm nay qua DatePicker rồi kiểm tra giờ được đổi theo timezone account.
  renderPage({ account: makeAccount({ timezone: "America/New_York" }) });
  await doiEnumTai();

  const todayIso = new Date();
  const todayDate = `${todayIso.getFullYear()}-${String(todayIso.getMonth() + 1).padStart(2, "0")}-${String(todayIso.getDate()).padStart(2, "0")}`;
  await u.click(screen.getByRole("button", { name: "Thời điểm vào lệnh" }));
  await u.click(screen.getByRole("button", { name: "Hôm nay" }));
  await u.clear(screen.getByLabelText("Giờ vào lệnh"));
  await u.type(screen.getByLabelText("Giờ vào lệnh"), "08:00");
  await u.click(screen.getByRole("button", { name: "Thời điểm vào lệnh" }));
  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.type(screen.getByLabelText("Lãi/lỗ"), "120.50");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).not.toBeNull());
  expect(submitted!.entered_at).toBe(wallToInstant(`${todayDate}T08:00`, "America/New_York"));
});

// Ba nhóm hành vi khác nhau của ô rỗng, theo đúng patchToFields của backend:
// bốn cột NULLable nhận null, còn setup/notes/enum nhận chuỗi rỗng.
test("ô rỗng gửi null cho cột NULLable và chuỗi rỗng cho phần còn lại", async () => {
  const u = userEvent.setup();
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope(makeTrade());
    }),
  );

  renderPage();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.type(screen.getByLabelText("Lãi/lỗ"), "120.50");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(submitted).not.toBeNull();
  expect(submitted!.entry).toBeNull();
  expect(submitted!.exit).toBeNull();
  expect(submitted!.volume).toBeNull();
  expect(submitted!.profit_theory).toBeNull();
  expect(submitted!.setup).toBe("");
  expect(submitted!.notes).toBe("");
  expect(submitted!.entry_quality).toBe("");
  expect(submitted!.psychology).toBe("");
  // fee mặc định "0", không phải rỗng — backend từ chối null cho cột này.
  expect(submitted!.fee).toBe("0");
  // stt KHÔNG được gửi: backend cấp (CLAUDE.md quy tắc 7).
  expect(submitted).not.toHaveProperty("stt");
});

// PATCH của backend dùng ba trạng thái: khoá vắng = không đổi. Gửi cả bảng
// biến một lần sửa ghi chú thành một lần ghi đè toàn bộ 16 trường.
test("sửa chỉ gửi trường đã đổi", async () => {
  const u = userEvent.setup();
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.patch(`${BASE}/trades/7`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope(makeTrade({ id: 7 }));
    }),
  );

  renderPage({ trade: makeTrade({ id: 7, notes: "ghi chú cũ" }) });
  await doiEnumTai();

  setNote("ghi chú mới");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  // Quill lưu HTML: nội dung gõ ra được bọc thành một đoạn văn.
  expect(submitted).toEqual({ notes: "<p>ghi chú mới</p>" });
});

test("xoá trắng ô giá vào khi sửa thì gửi null, không gửi chuỗi rỗng", async () => {
  const u = userEvent.setup();
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.patch(`${BASE}/trades/7`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope(makeTrade({ id: 7 }));
    }),
  );

  renderPage({ trade: makeTrade({ id: 7, entry: "2048.50" }) });
  await doiEnumTai();

  await u.clear(screen.getByLabelText("Giá vào"));
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(submitted).toEqual({ entry: null });
});

test("mã sản phẩm rỗng bị chặn ở client, không gọi API", async () => {
  const u = userEvent.setup();
  let called = false;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, () => {
      called = true;
      return envelope(makeTrade());
    }),
  );

  renderPage();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Lãi/lỗ"), "120.50");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText("mã sản phẩm không được để trống")).toBeInTheDocument();
  expect(called).toBe(false);
});

test("dropdown tâm lý lấy danh sách từ backend", async () => {
  const u = userEvent.setup();
  renderPage();
  await doiEnumTai();

  await u.click(screen.getByLabelText("Tâm lý"));

  expect(await screen.findByRole("option", { name: "SỢ BỎ LỠ (FOMO)" })).toBeInTheDocument();
});

// Lệnh chưa đánh giá là trạng thái HỢP LỆ (quyết định #8 của spec mẹ). Form
// không được ép người dùng chấm điểm mới cho lưu.
test("năm trường đánh giá để trống vẫn lưu được", async () => {
  const u = userEvent.setup();
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope(makeTrade());
    }),
  );

  renderPage();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.type(screen.getByLabelText("Lãi/lỗ"), "-45");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(submitted).not.toBeNull();
  expect(submitted!.profit).toBe("-45");
  expect(submitted!.timeframe).toBe("");
});

// ── Hành vi mới của form, xem TradeFormDialog.tsx ────────────────────────

// Bản trước bắt buộc Lãi/lỗ nên KHÔNG ghi nổi một lệnh vừa mở: nút ghi "Thêm
// lệnh", giờ mặc định là bây giờ, mà lại đòi con số chỉ có sau khi đóng lệnh.
// domain.ValidateTrade của backend không hề đòi trường này.
test("lệnh chưa đóng: để trống lãi/lỗ và phí vẫn lưu được, gửi 0", async () => {
  const u = userEvent.setup();
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope(makeTrade());
    }),
  );

  renderPage();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).not.toBeNull());
  expect(submitted!.profit).toBe("0");
  expect(submitted!.fee).toBe("0");
});

test("gợi ý lãi lỗ từ giá vào, giá ra và khối lượng; bấm mới điền", async () => {
  const u = userEvent.setup();
  renderPage();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Giá vào"), "2000");
  await u.type(screen.getByLabelText("Giá ra"), "2010");
  await u.type(screen.getByLabelText("Khối lượng"), "2");

  const suggest = await screen.findByRole("button", { name: /Điền lãi lỗ 20 USD/ });
  // Chưa bấm thì ô vẫn trống: gợi ý KHÔNG tự ghi đè.
  expect(screen.getByLabelText("Lãi/lỗ")).toHaveValue("");

  await u.click(suggest);
  expect(screen.getByLabelText("Lãi/lỗ")).toHaveValue("20");
  // Bấm xong thì gợi ý biến mất — một nút không làm gì cả vẫn mời người ta bấm.
  expect(screen.queryByRole("button", { name: /Điền lãi lỗ/ })).not.toBeInTheDocument();
});

test("gợi ý đảo chiều theo lệnh Short", async () => {
  const u = userEvent.setup();
  renderPage();
  await doiEnumTai();

  await u.click(screen.getByRole("radio", { name: "Short" }));
  await u.type(screen.getByLabelText("Giá vào"), "2010");
  await u.type(screen.getByLabelText("Giá ra"), "2000");
  await u.type(screen.getByLabelText("Khối lượng"), "2");

  expect(await screen.findByRole("button", { name: /Điền lãi lỗ 20 USD/ })).toBeInTheDocument();
});

// mode: "onBlur" — người dùng phải biết ô sai NGAY khi rời nó, không phải sau
// khi đã điền hết mười sáu ô rồi bấm Lưu.
test("báo lỗi ngay khi rời ô, không đợi bấm Lưu", async () => {
  const u = userEvent.setup();
  renderPage();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Giá vào"), "abc");
  await u.tab();

  expect(await screen.findByText("giá vào phải là số")).toBeInTheDocument();
});

test("bốn ô đánh giá gập lại, mở ra mới thấy", async () => {
  const u = userEvent.setup();
  renderPage();
  await doiEnumTai();

  const toggle = screen.getByRole("button", { name: /Chấm điểm lệnh này/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");

  await u.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByLabelText("Tâm lý")).toBeVisible();
});

// Giấu đi mất chính là thứ người ta mở form ra để xem.
test("sửa một lệnh đã chấm điểm thì nhóm đánh giá mở sẵn", async () => {
  renderPage({ trade: makeTrade({ id: 7, psychology: "Không lỗi" }) });
  await doiEnumTai();

  expect(screen.getByRole("button", { name: /Chấm điểm lệnh này/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("lưu và thêm tiếp: giữ dialog mở, giữ mã sản phẩm, xoá phần riêng của lệnh", async () => {
  const u = userEvent.setup();
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return envelope(makeTrade());
    }),
  );

  renderPage();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.type(screen.getByLabelText("Lãi/lỗ"), "120.50");
  setNote("lệnh đầu");
  await u.click(screen.getByRole("button", { name: "Lưu và thêm tiếp" }));

  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(bodies[0].profit).toBe("120.50");

  // Form vẫn còn đó, mã sản phẩm giữ lại, lãi lỗ và ghi chú đã xoá.
  expect(screen.getByLabelText("Mã sản phẩm")).toHaveValue("XAUUSD");
  expect(screen.getByLabelText("Lãi/lỗ")).toHaveValue("");
  expect(noteBox().textContent).toBe("");
  expect(await screen.findByText(/Đã lưu lệnh XAUUSD/)).toBeInTheDocument();
});

test("sửa lệnh thì không có nút lưu và thêm tiếp", async () => {
  renderPage({ trade: makeTrade({ id: 7 }) });
  await doiEnumTai();

  expect(screen.queryByRole("button", { name: "Lưu và thêm tiếp" })).not.toBeInTheDocument();
});

test("Ctrl+Enter lưu mà không cần bấm nút", async () => {
  const u = userEvent.setup();
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope(makeTrade());
    }),
  );

  renderPage();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.keyboard("{Control>}{Enter}{/Control}");

  await waitFor(() => expect(submitted).not.toBeNull());
  expect(submitted!.symbol).toBe("XAUUSD");
});

test("setup đã dùng bày ra để chọn lại, chọn xong thì điền vào ô", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/trades/facets`, () =>
      envelope({ symbols: ["XAUUSD"], setups: ["Breakout", "Pullback"] }),
    ),
  );

  renderPage();
  await doiEnumTai();

  await u.click(await screen.findByRole("combobox", { name: "Chọn setup đã dùng" }));
  await u.click(await screen.findByRole("option", { name: "Pullback" }));

  expect(screen.getByLabelText("Setup")).toHaveValue("Pullback");
});

test("chưa có setup nào thì không bày nút chọn", async () => {
  renderPage();
  await doiEnumTai();

  expect(
    screen.queryByRole("combobox", { name: "Chọn setup đã dùng" }),
  ).not.toBeInTheDocument();
});

// Đóng một form đã gõ dở mà không hỏi lại là vứt đi công của người dùng.
test("đóng lúc đang gõ dở thì hỏi lại, giữ nguyên form nếu chọn nhập tiếp", async () => {
  const u = userEvent.setup();
  let open = true;
  const onOpenChange = vi.fn((v: boolean) => {
    open = v;
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TradeFormDialog account={makeAccount()} open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  await doiEnumTai();

  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.keyboard("{Escape}");

  expect(await screen.findByText("Bỏ những gì vừa nhập?")).toBeInTheDocument();
  expect(onOpenChange).not.toHaveBeenCalledWith(false);

  await u.click(screen.getByRole("button", { name: "Nhập tiếp" }));
  expect(open).toBe(true);
});

test("đóng một form chưa gõ gì thì đóng thẳng, không hỏi", async () => {
  const u = userEvent.setup();
  const onOpenChange = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TradeFormDialog account={makeAccount()} open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  await doiEnumTai();

  await u.keyboard("{Escape}");

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(screen.queryByText("Bỏ những gì vừa nhập?")).not.toBeInTheDocument();
});

// Đơn vị tiền lấy từ account, không chép cứng USD.
test("ô tiền mang đơn vị của tài khoản", async () => {
  renderPage({ account: makeAccount({ currency: "VND" }) });
  await doiEnumTai();

  expect(screen.getAllByText("VND").length).toBeGreaterThan(0);
});

// ─── Thiết kế lại: vòng đời lệnh, chiều lệnh bày ngang, gợi ý mã ───────────

// Câu hỏi thật của người dùng ở form cũ là "chưa biết lãi lỗ thì có lưu được
// không?", và form cũ trả lời bằng cách KHÔNG báo lỗi — tức là không trả lời.
test("huy hiệu trạng thái đổi theo ô lãi/lỗ", async () => {
  const u = userEvent.setup();
  renderPage();
  await doiEnumTai();

  expect(screen.getByText("Đang mở")).toBeInTheDocument();

  await u.type(screen.getByLabelText("Lãi/lỗ"), "120");
  expect(await screen.findByText("Đã đóng")).toBeInTheDocument();
  expect(screen.queryByText("Đang mở")).not.toBeInTheDocument();
});

// Câu dặn "chưa đóng thì để trống" hết đúng ngay khi lệnh đã đóng; để nó nằm
// lại là dặn người dùng làm một việc họ vừa làm xong.
test("lời dặn của băng Đóng lệnh biến mất khi đã có lãi/lỗ", async () => {
  const u = userEvent.setup();
  renderPage();
  await doiEnumTai();

  expect(screen.getByText(/Chưa đóng thì để trống/)).toBeInTheDocument();
  await u.type(screen.getByLabelText("Lãi/lỗ"), "120");
  await waitFor(() =>
    expect(screen.queryByText(/Chưa đóng thì để trống/)).not.toBeInTheDocument(),
  );
});

// Chiều lệnh là radiogroup THẬT, không phải một hàng nút rời rạc: trình đọc
// màn hình phải đọc được "1 trong 2", và cả nhóm chỉ chiếm một nấc Tab.
test("chiều lệnh là radiogroup, mũi tên đổi lựa chọn", async () => {
  const u = userEvent.setup();
  renderPage();
  await doiEnumTai();

  const long = screen.getByRole("radio", { name: "Long" });
  expect(long).toBeChecked();

  long.focus();
  await u.keyboard("{ArrowRight}");
  expect(screen.getByRole("radio", { name: "Short" })).toBeChecked();
  // Chạy vòng như radio gốc.
  await u.keyboard("{ArrowRight}");
  expect(screen.getByRole("radio", { name: "Long" })).toBeChecked();
});

// Chiều lệnh gửi lên phải là chuỗi enum của backend, không phải nhãn hiển thị.
test("chọn Short bằng bàn phím rồi lưu gửi đúng chuỗi enum", async () => {
  const u = userEvent.setup();
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope(makeTrade());
    }),
  );
  renderPage();
  await doiEnumTai();

  await u.click(screen.getByRole("radio", { name: "Short" }));
  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).not.toBeNull());
  expect(submitted!.direction).toBe("Short");
});

// Khung thời gian bỏ trống là hợp lệ, nên phải có đường QUAY LẠI sau khi đã
// lỡ chọn — ở dropdown đó là một mục, ở đây phải là một ô thật.
test("khung thời gian chọn rồi bỏ được về không ghi", async () => {
  const u = userEvent.setup();
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope(makeTrade());
    }),
  );
  renderPage();
  await doiEnumTai();

  await u.click(screen.getByRole("radio", { name: "H1" }));
  expect(screen.getByRole("radio", { name: "H1" })).toBeChecked();
  await u.click(screen.getByRole("radio", { name: "Không ghi" }));

  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.click(screen.getByRole("button", { name: "Lưu" }));
  await waitFor(() => expect(submitted).not.toBeNull());
  expect(submitted!.timeframe).toBe("");
});

// Mã sản phẩm lặp lại rất nhiều giữa các lệnh; backend đã trả sẵn danh sách
// trong /trades/facets, form cũ chỉ chưa dùng tới.
test("mã sản phẩm gợi ý từ những mã đã dùng", async () => {
  const u = userEvent.setup();
  server.use(
    http.get(`${BASE}/accounts/1/trades/facets`, () =>
      envelope({ symbols: ["XAUUSD", "EURUSD"], setups: [] }),
    ),
  );
  renderPage();
  await doiEnumTai();

  const picker = await screen.findByRole("combobox", { name: "Mã đã dùng" });
  await u.click(picker);
  await u.click(await screen.findByRole("option", { name: "EURUSD" }));

  expect(screen.getByLabelText("Mã sản phẩm")).toHaveValue("EURUSD");
});

// Danh sách rỗng thì nút mở nó chỉ là một lời hứa suông.
test("không có mã cũ thì không bày nút chọn", async () => {
  renderPage();
  await doiEnumTai();

  expect(screen.queryByRole("combobox", { name: "Mã đã dùng" })).not.toBeInTheDocument();
});

// Lỗi hiện ra KHÔNG được làm ô cao thêm: form mười sáu ô mà mỗi lỗi đẩy phần
// dưới xuống một dòng thì người dùng đang nhắm chuột vào ô kế tiếp sẽ thấy nó
// trượt khỏi đầu ngón tay. Vùng dưới ô chừa sẵn chỗ, kể cả khi không có gì.
test("vùng dưới ô chừa sẵn chỗ nên lỗi không đẩy layout", async () => {
  const u = userEvent.setup();
  renderPage();
  await doiEnumTai();

  const foot = () =>
    screen.getByLabelText("Mã sản phẩm").closest("div.flex.flex-col")?.querySelector("p");

  // Chưa có lỗi: ô vẫn có sẵn một dòng trống mang min-h.
  expect(foot()).toHaveClass("min-h-[17px]");

  await u.click(screen.getByRole("button", { name: "Lưu" }));
  const err = await screen.findByRole("alert");

  // Có lỗi: vẫn đúng một phần tử ấy, cùng lớp min-h — không thêm thẻ nào.
  expect(err).toHaveClass("min-h-[17px]");
  expect(err).toHaveTextContent("mã sản phẩm không được để trống");
});

// ─────────────────────────────────────────────────────────────────────────
// Chèn mẫu ghi chú

const TPL = {
  id: 1,
  name: "Setup A",
  body_html: "<p>checklist</p>",
  position: 1,
  created_at: "2026-09-09T00:00:00Z",
  updated_at: "2026-09-09T00:00:00Z",
};

/** Mở menu rồi bấm một mẫu. */
async function insertTemplate(u: ReturnType<typeof userEvent.setup>, name = TPL.name) {
  await u.click(await screen.findByRole("button", { name: /chèn mẫu/i }));
  await u.click(await screen.findByRole("menuitem", { name }));
}

test("chèn mẫu vào ô ghi chú đang trống", async () => {
  const u = userEvent.setup();
  server.use(http.get(`${BASE}/note-templates`, () => envelope([TPL])));
  renderPage();

  await insertTemplate(u);

  await waitFor(() => expect(noteBox().textContent).toContain("checklist"));
});

// Quyết định 7 của spec: chèn thêm vào CUỐI, không thay thế. Chữ người dùng đã
// gõ không bao giờ được mất.
test("chèn mẫu khi ô ghi chú đã có chữ thì chữ cũ còn nguyên ở TRÊN", async () => {
  const u = userEvent.setup();
  server.use(http.get(`${BASE}/note-templates`, () => envelope([TPL])));
  renderPage();
  // Đợi form dựng xong trước khi chạm vào Quill: renderPage không await, và
  // ô ghi chú chỉ tồn tại sau khi /meta/enums về.
  await screen.findByLabelText("Ghi chú");
  setNote("ghi chú của tôi");

  await insertTemplate(u);

  await waitFor(() => {
    const text = noteBox().textContent ?? "";
    expect(text).toContain("ghi chú của tôi");
    expect(text).toContain("checklist");
    expect(text.indexOf("ghi chú của tôi")).toBeLessThan(text.indexOf("checklist"));
  });
});

// Rủi ro #1 của feature này, và chú thích của patchFromDirty nói đúng nó: quên
// đánh dấu dirty thì field "lặng lẽ không bao giờ lưu, không có lỗi nào bật
// ra". Thiếu shouldDirty ở insertTemplate là đúng lớp lỗi đó.
test("chèn mẫu khi SỬA lệnh cũ thì notes được gửi lên trong PATCH", async () => {
  const u = userEvent.setup();
  let patched: Record<string, unknown> | null = null;
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([TPL])),
    http.patch(`${BASE}/trades/7`, async ({ request }) => {
      patched = (await request.json()) as Record<string, unknown>;
      return envelope(makeTrade({ id: 7 }));
    }),
  );
  renderPage({ trade: makeTrade({ id: 7, notes: "" }) });

  await insertTemplate(u);
  await u.click(screen.getByRole("button", { name: /^lưu$/i }));

  await waitFor(() => expect(patched).not.toBeNull());
  expect(patched).toHaveProperty("notes");
  expect(String(patched!.notes)).toContain("checklist");
});

// Quill trống trả về "<p></p>" / "<p><br></p>", không phải chuỗi rỗng, nên
// `insertTemplate` so sánh `current === ""` chỉ đúng nhờ rich-text-editor.tsx
// đã chuẩn hoá về "" trong onChange. Test này ghim ranh giới đó TỪ PHÍA FORM:
// nếu ai bỏ phép chuẩn hoá kia đi, mẫu sẽ bị chèn sau một đoạn văn rỗng và
// test này đỏ, thay vì ghi chú lặng lẽ mọc thêm dòng trắng.
test("gõ rồi xoá hết rồi chèn mẫu thì KHÔNG có dòng trắng ở đầu", async () => {
  const u = userEvent.setup();
  let submitted: Record<string, unknown> | null = null;
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([TPL])),
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return envelope(makeTrade());
    }),
  );
  renderPage();
  await screen.findByLabelText("Ghi chú");
  setNote("rồi tôi xoá hết");
  setNote("");

  await insertTemplate(u);

  await waitFor(() => expect(noteBox().textContent).toContain("checklist"));
  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.type(screen.getByLabelText("Lãi/lỗ"), "120.50");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await waitFor(() => expect(submitted).not.toBeNull());
  expect(submitted!.notes).toBe(TPL.body_html);
});
