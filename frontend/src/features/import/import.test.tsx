import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { server } from "@/test/server";
import { BASE, envelope, errorEnvelope, makeAccount, renderApp, resetAll } from "@/test/harness";
import { ImportPage } from "./ImportPage";
import type { ImportReport } from "./types";

const account = makeAccount();

function baoCao(over: Partial<ImportReport> = {}): ImportReport {
  return { valid: 3, skipped: 0, errors: [], committed: false, ...over };
}

/** Bắt mọi request import, trả preview cho dry_run và commit cho lần còn lại. */
function moTaImport(preview: ImportReport, commit?: ImportReport) {
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

function fileCsv(noiDung = "Day,Symbol,Long/ Short,Profit\n2026-06-09,XAUUSD,BUY,100\n") {
  return new File([noiDung], "lenh.csv", { type: "text/csv" });
}

beforeEach(() => {
  resetAll();
});

test("chọn file thì tự xem trước và hiện số dòng đọc được", async () => {
  moTaImport(baoCao({ valid: 3, skipped: 1 }));
  renderApp(<ImportPage />);

  const input = await screen.findByLabelText(/chọn file/i);
  await userEvent.upload(input, fileCsv());

  expect(await screen.findByText("3")).toBeInTheDocument();
  expect(screen.getByText("1")).toBeInTheDocument();
});

test("dòng lỗi hiện kèm số dòng và tên cột", async () => {
  moTaImport(
    baoCao({
      valid: 1,
      errors: [
        { line: 3, column: "Long/ Short", msg: 'chiều lệnh "RAC" không hợp lệ' },
        { line: 7, column: "Profit", msg: '"abc" không phải số hợp lệ' },
      ],
    }),
  );
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), fileCsv());

  expect(await screen.findByText("Long/ Short")).toBeInTheDocument();
  expect(screen.getByText(/chiều lệnh "RAC" không hợp lệ/)).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByText("7")).toBeInTheDocument();
  expect(screen.getByText("Profit")).toBeInTheDocument();
});

// Bất biến quan trọng nhất của trang: file còn lỗi thì KHÔNG cho ghi.
test("còn dòng lỗi thì nút nhập bị vô hiệu hoá", async () => {
  moTaImport(baoCao({ valid: 2, errors: [{ line: 3, column: "Profit", msg: "sai" }] }));
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), fileCsv());

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
        return envelope(baoCao({ valid: 3, committed: true }));
      }
      return envelope(baoCao({ valid: 3 }));
    }),
  );
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), fileCsv());
  const nut = await screen.findByRole("button", { name: /nhập vào tài khoản/i });
  await waitFor(() => expect(nut).toBeEnabled());
  await userEvent.click(nut);

  expect(await screen.findByText(/đã nhập xong/i)).toBeInTheDocument();
  expect(urlGhi).toContain("dry_run=false");
});

test("file không có dòng nào thì không cho nhập", async () => {
  moTaImport(baoCao({ valid: 0 }));
  renderApp(<ImportPage />);

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), fileCsv());

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

  await userEvent.upload(await screen.findByLabelText(/chọn file/i), fileCsv());

  expect(await screen.findByText(/thiếu cột bắt buộc/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /nhập vào tài khoản/i })).not.toBeInTheDocument();
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
      return envelope(baoCao());
    }),
  );
  renderApp(<ImportPage />);

  const input = await screen.findByLabelText(/chọn file/i);
  await userEvent.upload(input, fileCsv());

  expect(await screen.findByRole("status")).toHaveTextContent(/đang kiểm tra/i);
  expect(input).toBeDisabled();

  cho();
  await screen.findByText("3");
});

// Chọn file mới phải xoá kết quả của file cũ, nếu không người dùng đọc báo
// cáo của file này mà tưởng là của file kia.
test("chọn file mới thì xoá kết quả cũ", async () => {
  let lan = 0;
  server.use(
    http.get(`${BASE}/accounts`, () => envelope([account])),
    http.post(`${BASE}/accounts/1/import`, () => {
      lan++;
      return envelope(lan === 1 ? baoCao({ valid: 9 }) : baoCao({ valid: 4 }));
    }),
  );
  renderApp(<ImportPage />);

  const input = await screen.findByLabelText(/chọn file/i);
  await userEvent.upload(input, fileCsv());
  expect(await screen.findByText("9")).toBeInTheDocument();

  await userEvent.upload(input, new File(["Day\n"], "khac.csv", { type: "text/csv" }));
  expect(await screen.findByText("4")).toBeInTheDocument();
  expect(screen.queryByText("9")).not.toBeInTheDocument();
});

test("chưa có account thì AccountGate chặn", async () => {
  server.use(http.get(`${BASE}/accounts`, () => envelope([])));
  renderApp(<ImportPage />);

  expect(await screen.findByRole("link", { name: /tạo tài khoản/i })).toBeInTheDocument();
  expect(screen.queryByLabelText(/chọn file/i)).not.toBeInTheDocument();
});
