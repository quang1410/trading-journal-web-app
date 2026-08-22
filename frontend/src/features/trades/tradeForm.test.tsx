import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { taoLenh } from "@/test/tradeFactory";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import type { Account } from "@/features/accounts/types";
import type { Trade } from "./types";
import { TradeFormDialog } from "./TradeFormDialog";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

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

function taoAccount(over: Partial<Account> = {}): Account {
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
    http.get(`${BASE}/meta/enums`, () => phongBi(enums)),
    http.get(`${BASE}/accounts/1/trades`, () => phongBi({ items: [], page: 1, size: 50, total: 0 })),
    http.get(`${BASE}/accounts/1/stats`, () => phongBi(null)),
    http.get(`${BASE}/accounts/1/trades/trash`, () => phongBi([])),
  );
});

function dung(props: { account?: Account; trade?: Trade } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TradeFormDialog
        account={props.account ?? taoAccount()}
        trade={props.trade}
        open
        onOpenChange={() => {}}
      />
    </QueryClientProvider>,
  );
}

// Chờ dropdown có dữ liệu thật trước khi thao tác, để không thao tác trên một
// form còn đang tính giá trị mặc định.
async function doiEnumTai() {
  await screen.findByLabelText("Chiều lệnh");
}

test("thêm lệnh gửi entered_at đổi theo timezone của ACCOUNT", async () => {
  const u = userEvent.setup();
  let daGui: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      return phongBi(taoLenh());
    }),
  );

  // Account ở New York, còn máy chạy test ở đâu thì không ai biết. 08:00 giờ
  // New York ngày 15/07 là 12:00Z — con số này chỉ ra đúng nếu code dùng
  // timezone của account.
  dung({ account: taoAccount({ timezone: "America/New_York" }) });
  await doiEnumTai();

  await u.clear(screen.getByLabelText("Thời điểm vào lệnh"));
  await u.type(screen.getByLabelText("Thời điểm vào lệnh"), "2026-07-15T08:00");
  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.type(screen.getByLabelText("Lãi/lỗ"), "120.50");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(daGui).not.toBeNull();
  expect(daGui!.entered_at).toBe("2026-07-15T12:00:00.000Z");
});

// Ba nhóm hành vi khác nhau của ô rỗng, theo đúng patchToFields của backend:
// bốn cột NULLable nhận null, còn setup/notes/enum nhận chuỗi rỗng.
test("ô rỗng gửi null cho cột NULLable và chuỗi rỗng cho phần còn lại", async () => {
  const u = userEvent.setup();
  let daGui: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      return phongBi(taoLenh());
    }),
  );

  dung();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.type(screen.getByLabelText("Lãi/lỗ"), "120.50");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(daGui).not.toBeNull();
  expect(daGui!.entry).toBeNull();
  expect(daGui!.exit).toBeNull();
  expect(daGui!.volume).toBeNull();
  expect(daGui!.profit_theory).toBeNull();
  expect(daGui!.setup).toBe("");
  expect(daGui!.notes).toBe("");
  expect(daGui!.entry_quality).toBe("");
  expect(daGui!.psychology).toBe("");
  // fee mặc định "0", không phải rỗng — backend từ chối null cho cột này.
  expect(daGui!.fee).toBe("0");
  // stt KHÔNG được gửi: backend cấp (CLAUDE.md quy tắc 7).
  expect(daGui).not.toHaveProperty("stt");
});

// PATCH của backend dùng ba trạng thái: khoá vắng = không đổi. Gửi cả bảng
// biến một lần sửa ghi chú thành một lần ghi đè toàn bộ 16 trường.
test("sửa chỉ gửi trường đã đổi", async () => {
  const u = userEvent.setup();
  let daGui: Record<string, unknown> | null = null;
  server.use(
    http.patch(`${BASE}/trades/7`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      return phongBi(taoLenh({ id: 7 }));
    }),
  );

  dung({ trade: taoLenh({ id: 7, notes: "ghi chú cũ" }) });
  await doiEnumTai();

  await u.clear(screen.getByLabelText("Ghi chú"));
  await u.type(screen.getByLabelText("Ghi chú"), "ghi chú mới");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(daGui).toEqual({ notes: "ghi chú mới" });
});

test("xoá trắng ô giá vào khi sửa thì gửi null, không gửi chuỗi rỗng", async () => {
  const u = userEvent.setup();
  let daGui: Record<string, unknown> | null = null;
  server.use(
    http.patch(`${BASE}/trades/7`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      return phongBi(taoLenh({ id: 7 }));
    }),
  );

  dung({ trade: taoLenh({ id: 7, entry: "2048.50" }) });
  await doiEnumTai();

  await u.clear(screen.getByLabelText("Giá vào"));
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(daGui).toEqual({ entry: null });
});

test("mã sản phẩm rỗng bị chặn ở client, không gọi API", async () => {
  const u = userEvent.setup();
  let daGoi = false;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, () => {
      daGoi = true;
      return phongBi(taoLenh());
    }),
  );

  dung();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Lãi/lỗ"), "120.50");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText("mã sản phẩm không được để trống")).toBeInTheDocument();
  expect(daGoi).toBe(false);
});

test("dropdown tâm lý lấy danh sách từ backend", async () => {
  const u = userEvent.setup();
  dung();
  await doiEnumTai();

  await u.click(screen.getByLabelText("Tâm lý"));

  expect(await screen.findByRole("option", { name: "SỢ BỎ LỠ (FOMO)" })).toBeInTheDocument();
});

// Lệnh chưa đánh giá là trạng thái HỢP LỆ (quyết định #8 của spec mẹ). Form
// không được ép người dùng chấm điểm mới cho lưu.
test("năm trường đánh giá để trống vẫn lưu được", async () => {
  const u = userEvent.setup();
  let daGui: Record<string, unknown> | null = null;
  server.use(
    http.post(`${BASE}/accounts/1/trades`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      return phongBi(taoLenh());
    }),
  );

  dung();
  await doiEnumTai();

  await u.type(screen.getByLabelText("Mã sản phẩm"), "XAUUSD");
  await u.type(screen.getByLabelText("Lãi/lỗ"), "-45");
  await u.click(screen.getByRole("button", { name: "Lưu" }));

  await screen.findByLabelText("Thời điểm vào lệnh");
  expect(daGui).not.toBeNull();
  expect(daGui!.profit).toBe("-45");
  expect(daGui!.timeframe).toBe("");
});
