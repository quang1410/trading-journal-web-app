import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, errorEnvelope, makeAccount, renderApp, resetAll } from "@/test/harness";
import { ImportPage } from "./ImportPage";
import type { ImportPreviewRow, ImportReport } from "./types";

const account = makeAccount();

function makeReport(over: Partial<ImportReport> = {}): ImportReport {
  return { valid: 3, skipped: 0, errors: [], preview: null, committed: false, ...over };
}

/** Một dòng preview như backend trả về: mọi trường tiền là CHUỖI. */
function makePreviewRow(over: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    day: "2026-06-09",
    symbol: "XAUUSD",
    direction: "Long",
    entry: null,
    exit: null,
    volume: null,
    profit: "500",
    fee: "10",
    ...over,
  };
}

/** Bắt mọi request import, trả preview cho dry_run và commit cho lần còn lại. */
function mockImport(preview: ImportReport, commit?: ImportReport) {
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([account])),
    http.post(`${BASE}/accounts/1/import`, ({ request }) => {
      const dryRun = new URL(request.url).searchParams.get("dry_run");
      if (dryRun === "false") {
        return envelope(commit ?? { ...preview, committed: true });
      }
      return envelope(preview);
    }),
  );
}

function makeCsvFile(content = "Day,Symbol,Long/ Short,Profit\n2026-06-09,XAUUSD,BUY,100\n") {
  return new File([content], "trades.csv", { type: "text/csv" });
}

beforeEach(() => {
  resetAll();
});

test("chọn file thì tự xem trước và hiện số dòng đọc được", async () => {
  mockImport(makeReport({ valid: 3, skipped: 1 }));
  renderApp(<ImportPage />);

  const input = await screen.findByLabelText(/chọn file/i);
  await userEvent.upload(input, makeCsvFile());

  // Bám vào Ô CHỈ SỐ chứ không vào chữ số trần: trang có nhiều con số nhỏ
  // (số thứ tự bước, số dòng trong bảng lỗi), nên getByText("3") khớp nhầm
  // ngay khi bố cục đổi. `role="group"` + `aria-label` là hợp đồng trợ năng
  // mà StatTile bảo đảm, nên đó mới là thứ đáng ghim.
  const valid = await screen.findByRole("group", { name: /số dòng đọc được/i });
  expect(within(valid).getByText("3")).toBeInTheDocument();
  expect(
    within(screen.getByRole("group", { name: /dòng bỏ qua/i })).getByText("1"),
  ).toBeInTheDocument();
});

test("dòng lỗi hiện kèm số dòng và tên cột", async () => {
  mockImport(
    makeReport({
      valid: 1,
      errors: [
        { line: 3, column: "Long/ Short", msg: 'chiều lệnh "RAC" không hợp lệ' },
        { line: 7, column: "Profit", msg: '"abc" không phải số hợp lệ' },
      ],
      // Backend trả preview KÈM errors — một file có dòng hỏng vẫn đọc được
      // các dòng khác. Mock đúng như vậy, nếu không test chạy trên một hình
      // dạng response không bao giờ xảy ra thật.
      preview: [makePreviewRow()],
    }),
  );
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), makeCsvFile());

  // Số dòng tra trong CHÍNH bảng lỗi: "3" và "7" là chữ số trần, ngoài bảng
  // chúng còn trùng số thứ tự bước và các ô chỉ số. Trang có hai bảng nên
  // chọn theo TÊN bảng, không phải "bảng đầu tiên tìm thấy".
  const table = within(await screen.findByRole("table", { name: /những dòng cần sửa/i }));
  expect(table.getByText("Long/ Short")).toBeInTheDocument();
  expect(table.getByText(/chiều lệnh "RAC" không hợp lệ/)).toBeInTheDocument();
  expect(table.getByText("3")).toBeInTheDocument();
  expect(table.getByText("7")).toBeInTheDocument();
  expect(table.getByText("Profit")).toBeInTheDocument();
});

// Bất biến quan trọng nhất của trang: file còn lỗi thì KHÔNG cho ghi.
test("còn dòng lỗi thì nút nhập bị vô hiệu hoá", async () => {
  mockImport(makeReport({ valid: 2, errors: [{ line: 3, column: "Profit", msg: "sai" }] }));
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), makeCsvFile());

  const nut = await screen.findByRole("button", { name: /nhập vào tài khoản/i });
  expect(nut).toBeDisabled();
  expect(screen.getByText(/sửa các dòng trên rồi chọn lại file/i)).toBeInTheDocument();
});

test("file sạch thì nút nhập bấm được và gọi dry_run=false", async () => {
  let urlGhi = "";
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([account])),
    http.post(`${BASE}/accounts/1/import`, ({ request }) => {
      const dryRun = new URL(request.url).searchParams.get("dry_run");
      if (dryRun === "false") {
        urlGhi = request.url;
        return envelope(makeReport({ valid: 3, committed: true }));
      }
      return envelope(makeReport({ valid: 3 }));
    }),
  );
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), makeCsvFile());
  const nut = await screen.findByRole("button", { name: /nhập vào tài khoản/i });
  await waitFor(() => expect(nut).toBeEnabled());
  await userEvent.click(nut);

  expect(await screen.findByText(/đã nhập xong/i)).toBeInTheDocument();
  expect(urlGhi).toContain("dry_run=false");
});

test("file không có dòng nào thì không cho nhập", async () => {
  mockImport(makeReport({ valid: 0 }));
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), makeCsvFile());

  expect(await screen.findByText(/không có dòng nào để nhập/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /nhập vào tài khoản/i })).toBeDisabled();
});

test("lỗi cấp file hiện thông điệp của backend", async () => {
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([account])),
    http.post(`${BASE}/accounts/1/import`, () =>
      errorEnvelope(1400, "file thiếu cột bắt buộc: day, symbol"),
    ),
  );
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), makeCsvFile());

  expect(await screen.findByText(/thiếu cột bắt buộc/i)).toBeInTheDocument();
  // Bước 3 vẫn hiện — ba bước là bộ khung cố định của trang, ẩn một bước đi
  // thì người dùng mất chỗ dựa để biết mình đang ở đâu. Bất biến cần giữ là
  // KHÔNG GHI ĐƯỢC, và nút khoá nói đúng điều đó.
  expect(screen.getByRole("button", { name: /nhập vào tài khoản/i })).toBeDisabled();
});

test("đang kiểm tra thì hiện trạng thái chờ và khoá ô chọn file", async () => {
  // Khai qua biến trung gian: gán trong callback của Promise làm TS thu hẹp
  // kiểu của `cho` xuống `never` tại chỗ gọi.
  let cho!: () => void;
  const dung = new Promise<void>((res) => {
    cho = res;
  });
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([account])),
    http.post(`${BASE}/accounts/1/import`, async () => {
      await dung;
      return envelope(makeReport());
    }),
  );
  renderApp(<ImportPage />);

  const input = await screen.findByLabelText(/chọn file/i);
  await userEvent.upload(input, makeCsvFile());

  expect(await screen.findByRole("status")).toHaveTextContent(/đang kiểm tra/i);
  expect(input).toBeDisabled();

  cho();
  await screen.findByText("3");
});

// Chọn file mới phải xoá kết quả của file cũ, nếu không người dùng đọc báo
// cáo của file này mà tưởng là của file kia.
test("chọn file mới thì xoá kết quả cũ", async () => {
  let calls = 0;
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([account])),
    http.post(`${BASE}/accounts/1/import`, () => {
      calls++;
      return envelope(calls === 1 ? makeReport({ valid: 9 }) : makeReport({ valid: 4 }));
    }),
  );
  renderApp(<ImportPage />);

  const input = await screen.findByLabelText(/chọn file/i);
  await userEvent.upload(input, makeCsvFile());
  expect(await screen.findByText("9")).toBeInTheDocument();

  await userEvent.upload(input, new File(["Day\n"], "other.csv", { type: "text/csv" }));
  expect(await screen.findByText("4")).toBeInTheDocument();
  expect(screen.queryByText("9")).not.toBeInTheDocument();
});

test("chưa có account thì AccountGate chặn", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([])));
  renderApp(<ImportPage />);

  expect(await screen.findByRole("link", { name: /tạo tài khoản/i })).toBeInTheDocument();
  expect(screen.queryByLabelText(/chọn file/i)).not.toBeInTheDocument();
});

// ---- Nút bỏ file ----

// Bỏ file phải đưa trang về đúng trạng thái ban đầu: không còn tên file, không
// còn báo cáo của file đó. Giữ lại báo cáo là để người dùng đọc số của một file
// không còn được chọn nữa.
test("bấm nút bỏ file thì xoá cả tên file và báo cáo", async () => {
  mockImport(makeReport({ valid: 7 }));
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), makeCsvFile());
  expect(await screen.findByText("trades.csv")).toBeInTheDocument();
  await screen.findByRole("group", { name: /số dòng đọc được/i });

  await userEvent.click(screen.getByRole("button", { name: /bỏ file đã chọn/i }));

  expect(screen.queryByText("trades.csv")).not.toBeInTheDocument();
  expect(screen.queryByRole("group", { name: /số dòng đọc được/i })).not.toBeInTheDocument();
  expect(screen.getByText(/kéo file csv vào đây/i)).toBeInTheDocument();
});

// Chưa chọn file thì không có gì để bỏ — nút không được có mặt.
test("chưa chọn file thì không có nút bỏ file", async () => {
  mockImport(makeReport());
  renderApp(<ImportPage />);

  await screen.findByLabelText(/chọn file/i);
  expect(screen.queryByRole("button", { name: /bỏ file đã chọn/i })).not.toBeInTheDocument();
});

// Bỏ file rồi thì KHÔNG ghi được nữa: nút nhập phải khoá lại.
//
// Đây là bất biến an toàn — bỏ file mà nút nhập vẫn sáng thì cú bấm tiếp theo
// ghi một file người dùng tưởng đã gỡ ra.
test("bỏ file thì nút nhập khoá lại", async () => {
  mockImport(makeReport({ valid: 3 }));
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), makeCsvFile());
  const nut = await screen.findByRole("button", { name: /nhập vào tài khoản/i });
  await waitFor(() => expect(nut).toBeEnabled());

  await userEvent.click(screen.getByRole("button", { name: /bỏ file đã chọn/i }));

  expect(screen.getByRole("button", { name: /nhập vào tài khoản/i })).toBeDisabled();
});

// ---- Bảng xem trước dữ liệu ----

test("hiện dữ liệu đã parse của vài dòng đầu", async () => {
  mockImport(
    makeReport({
      valid: 2,
      preview: [
        makePreviewRow({ day: "2026-06-09", symbol: "XAUUSD", direction: "Long", profit: "500" }),
        makePreviewRow({ day: "2026-06-10", symbol: "EURUSD", direction: "Short", profit: "-200" }),
      ],
    }),
  );
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), makeCsvFile());

  const table = within(await screen.findByRole("table", { name: /dữ liệu sẽ được ghi/i }));
  expect(table.getByText("2026-06-09")).toBeInTheDocument();
  expect(table.getByText("XAUUSD")).toBeInTheDocument();
  expect(table.getByText("EURUSD")).toBeInTheDocument();
});

// Ô giá để trống là CHƯA NHẬP, phải hiện dấu gạch chứ không phải 0 — cùng bất
// biến mà ParseMoneyPtr giữ ở backend. Hiện "0" là bịa một con số người dùng
// chưa từng gõ, và bịa ngay trong cái bảng sinh ra để soi dữ liệu.
test("ô giá trống hiện dấu gạch, không phải số 0", async () => {
  mockImport(
    makeReport({
      valid: 1,
      preview: [makePreviewRow({ entry: null, exit: null, volume: null, profit: "100" })],
    }),
  );
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), makeCsvFile());

  const table = within(await screen.findByRole("table", { name: /dữ liệu sẽ được ghi/i }));
  expect(table.getAllByText("—")).toHaveLength(3);
});

// File dài hơn số dòng preview thì phải nói rõ còn bao nhiêu dòng nữa, nếu
// không người dùng tưởng file chỉ có ngần ấy dòng.
test("file dài hơn preview thì nói còn bao nhiêu dòng nữa", async () => {
  mockImport(makeReport({ valid: 412, preview: [makePreviewRow()] }));
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), makeCsvFile());

  expect(await screen.findByText(/còn 411 dòng nữa/i)).toBeInTheDocument();
});

// Backend trả null khi không đọc được dòng nào: không dựng bảng rỗng.
test("không có dòng nào thì không có bảng xem trước", async () => {
  mockImport(makeReport({ valid: 0, preview: null }));
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), makeCsvFile());

  expect(await screen.findByText(/không có dòng nào để nhập/i)).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

// Ca hồi quy: giá KHÔNG bị cắt về 2 chữ số thập phân.
//
// formatMoney chốt cứng 2 chữ số. Dùng nó cho cột giá thì entry 1.08420 và
// exit 1.08110 cùng hiện ra "1,08" — hai giá khác nhau thành hai ô giống hệt,
// đúng trong cái bảng người dùng mở ra để đối chiếu từng ô với file.
test("giá forex giữ nguyên chữ số, không bị làm tròn về 2 số lẻ", async () => {
  mockImport(
    makeReport({
      valid: 1,
      preview: [
        makePreviewRow({ symbol: "EURUSD", entry: "1.08420", exit: "1.08110", volume: "1.00" }),
      ],
    }),
  );
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), makeCsvFile());

  const table = within(await screen.findByRole("table", { name: /dữ liệu sẽ được ghi/i }));
  expect(table.getByText("1,08420")).toBeInTheDocument();
  expect(table.getByText("1,08110")).toBeInTheDocument();
  expect(table.queryByText("1,08"), "giá bị cắt còn 2 số lẻ").not.toBeInTheDocument();
});
