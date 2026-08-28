import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { BASE, resetAll } from "@/test/harness";
import { EMPTY_FILTER } from "./filters";
import { downloadTradesCsv, exportFileName, exportPath } from "./exportCsv";

beforeEach(() => {
  resetAll();
});

test("tên file có mã account và ngày", () => {
  expect(exportFileName("FTMO", new Date(2026, 7, 28))).toBe("FTMO-2026-08-28.csv");
  expect(exportFileName("ACC1", new Date(2026, 0, 5))).toBe("ACC1-2026-01-05.csv");
});

// Export phải khớp cái người dùng ĐANG NHÌN THẤY: cùng bộ lọc như /trades.
test("đường dẫn export mang đúng bộ lọc đang xem", () => {
  const p = exportPath(1, { ...EMPTY_FILTER, symbol: "XAUUSD", setup: "BOS" });
  expect(p).toContain("/accounts/1/trades.csv");
  expect(p).toContain("symbol=XAUUSD");
  expect(p).toContain("setup=BOS");
});

// Xuất cả tập đã lọc, không riêng trang đang xem.
test("đường dẫn export không mang tham số phân trang", () => {
  const p = exportPath(1, EMPTY_FILTER);
  expect(p).not.toContain("page=");
  expect(p).not.toContain("size=");
});

test("tải file thì gọi đúng endpoint và tạo link tải", async () => {
  let goi = "";
  server.use(
    http.get(`${BASE}/accounts/1/trades.csv`, ({ request }) => {
      goi = request.url;
      return new HttpResponse("STT,Symbol\n1,XAUUSD\n", {
        headers: { "Content-Type": "text/csv" },
      });
    }),
  );
  const taoURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:gia");
  const thuHoi = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});

  await downloadTradesCsv(1, "FTMO", { ...EMPTY_FILTER, symbol: "XAUUSD" });

  expect(goi).toContain("symbol=XAUUSD");
  expect(taoURL).toHaveBeenCalled();
  expect(click).toHaveBeenCalled();
  // Không thu hồi thì blob nằm lại trong bộ nhớ tới khi đóng tab.
  expect(thuHoi).toHaveBeenCalledWith("blob:gia");

  taoURL.mockRestore();
  thuHoi.mockRestore();
  click.mockRestore();
});

test("lỗi từ backend được ném ra chứ không lặng lẽ tải file rỗng", async () => {
  server.use(
    http.get(`${BASE}/accounts/1/trades.csv`, () =>
      HttpResponse.json({ code: 1403, msg: "không phải account của bạn", data: null }, { status: 403 }),
    ),
  );

  await expect(downloadTradesCsv(1, "FTMO", EMPTY_FILTER)).rejects.toMatchObject({
    code: 1403,
  });
});
