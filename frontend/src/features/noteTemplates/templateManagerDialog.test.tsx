import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import Quill from "quill";
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { TemplateManagerDialog } from "./TemplateManagerDialog";
import type { NoteTemplate } from "./types";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

// `body_html` KHÔNG chứa `name`: mỗi dòng hiện cả tên và preview nội dung, nên
// thân trùng tên sẽ làm getByText khớp hai node và test đỏ vì lý do sai.
const tpl = (id: number, name: string, position: number): NoteTemplate => ({
  id,
  name,
  body_html: `<p>thân của ${id}</p>`,
  position,
  created_at: "2026-09-09T00:00:00Z",
  updated_at: "2026-09-09T00:00:00Z",
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("tk", { id: 1, email: "a@b.c" });
});

// Ô thân mẫu là contenteditable của Quill, không phải <textarea>: userEvent
// không gõ được vào nó, và userEvent.paste() chỉ ăn khi editor đang rỗng vì
// jsdom dựng ClipboardEvent không đủ cho Quill đọc. Đây là cùng giới hạn mà
// tradeForm.test.tsx đã ghi lại, nên test đi qua đúng API mà nó dùng.
function setBody(text: string) {
  const container = screen.getByLabelText(/nội dung mẫu/i);
  const q = Quill.find(container);
  if (!(q instanceof Quill)) throw new Error("không tìm thấy instance Quill của ô thân mẫu");
  q.setText(text + "\n", "user");
}

test("hiện danh sách mẫu đang có", async () => {
  server.use(http.get(`${BASE}/note-templates`, () => envelope([tpl(1, "Setup A", 1)])));

  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });

  expect(await screen.findByText("Setup A")).toBeInTheDocument();
});

// Spec §7 dòng 220 nói tới "preview trong dialog quản lý": danh sách chỉ có
// TÊN thì không chọn được mẫu khi đã quên trong đó có gì — đúng cái mà feature
// này sinh ra để giải quyết. Preview là TEXT THUẦN, không phải HTML render: một
// dòng danh sách không nên nhận thẻ khối, và text thuần thì không có mặt tấn
// công nào cho HTML lạ đã nằm sẵn trong DB.
test("mỗi dòng hiện preview nội dung mẫu, không chỉ tên", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () =>
      envelope([
        {
          ...tpl(1, "Setup A", 1),
          body_html: '<ul><li data-list="unchecked">Liquidity sweep</li></ul>',
        },
      ]),
    ),
  );

  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });

  expect(await screen.findByText("Setup A")).toBeInTheDocument();
  expect(await screen.findByText(/liquidity sweep/i)).toBeInTheDocument();
});

// Preview KHÔNG được render HTML: nếu nó dùng dangerouslySetInnerHTML thì thẻ
// này thành một node <i>, và truy vấn text dưới đây trượt.
test("preview in ra text thuần, không render thẻ HTML", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () =>
      envelope([{ ...tpl(1, "Setup A", 1), body_html: "<p><i>in nghiêng</i></p>" }]),
    ),
  );

  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });

  const preview = await screen.findByText(/in nghiêng/i);
  expect(preview.querySelector("i")).toBeNull();
});

test("tạo mẫu mới gửi name và body_html", async () => {
  let posted: unknown = null;
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([])),
    http.post(`${BASE}/note-templates`, async ({ request }) => {
      posted = await request.json();
      return envelope(tpl(1, "Mẫu mới", 1));
    }),
  );
  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });

  await userEvent.click(await screen.findByRole("button", { name: /thêm mẫu/i }));
  await userEvent.type(screen.getByLabelText(/tên mẫu/i), "Mẫu mới");
  setBody("checklist");
  await userEvent.click(screen.getByRole("button", { name: /lưu mẫu/i }));

  await waitFor(() => expect(posted).not.toBeNull());
  expect((posted as { name: string }).name).toBe("Mẫu mới");
  expect((posted as { body_html: string }).body_html).toContain("checklist");
});

test("tên rỗng thì báo lỗi và KHÔNG gửi request", async () => {
  let posted = 0;
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([])),
    http.post(`${BASE}/note-templates`, () => {
      posted++;
      return envelope(tpl(1, "x", 1));
    }),
  );
  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });

  await userEvent.click(await screen.findByRole("button", { name: /thêm mẫu/i }));
  await userEvent.click(screen.getByRole("button", { name: /lưu mẫu/i }));

  expect(await screen.findByText(/tên mẫu không được để trống/i)).toBeInTheDocument();
  expect(posted).toBe(0);
});

test("thân rỗng thì báo lỗi và KHÔNG gửi request", async () => {
  let posted = 0;
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([])),
    http.post(`${BASE}/note-templates`, () => {
      posted++;
      return envelope(tpl(1, "x", 1));
    }),
  );
  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });

  await userEvent.click(await screen.findByRole("button", { name: /thêm mẫu/i }));
  await userEvent.type(screen.getByLabelText(/tên mẫu/i), "Có tên nhưng không có thân");
  await userEvent.click(screen.getByRole("button", { name: /lưu mẫu/i }));

  expect(await screen.findByText(/nội dung mẫu không được để trống/i)).toBeInTheDocument();
  expect(posted).toBe(0);
});

// Nút ▼ phải gửi ĐÚNG TẬP id theo thứ tự mới. Gửi mảng cắt cụt thì service
// trả 400 — test này là hàng rào chống đúng lỗi đó.
test("bấm ▼ ở dòng đầu gửi PUT /order với đủ id, thứ tự đã đổi", async () => {
  let sent: number[] | null = null;
  server.use(
    http.get(`${BASE}/note-templates`, () =>
      envelope([tpl(1, "A", 1), tpl(2, "B", 2), tpl(3, "C", 3)]),
    ),
    http.put(`${BASE}/note-templates/order`, async ({ request }) => {
      sent = ((await request.json()) as { ids: number[] }).ids;
      return envelope(null);
    }),
  );
  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });
  await screen.findByText("A");

  const downButtons = screen.getAllByRole("button", { name: /chuyển xuống/i });
  await userEvent.click(downButtons[0]);

  await waitFor(() => expect(sent).not.toBeNull());
  expect(sent).toEqual([2, 1, 3]);
});

test("nút ▲ của dòng đầu và ▼ của dòng cuối bị disabled", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([tpl(1, "A", 1), tpl(2, "B", 2)])),
  );
  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });
  await screen.findByText("A");

  const ups = screen.getAllByRole("button", { name: /chuyển lên/i });
  const downs = screen.getAllByRole("button", { name: /chuyển xuống/i });

  expect(ups[0]).toBeDisabled();
  expect(downs[downs.length - 1]).toBeDisabled();
});

test("xoá phải qua hộp xác nhận", async () => {
  let deleted = 0;
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([tpl(9, "Setup A", 1)])),
    http.delete(`${BASE}/note-templates/9`, () => {
      deleted++;
      return envelope(null);
    }),
  );
  render(<TemplateManagerDialog open onOpenChange={() => {}} />, { wrapper });
  await screen.findByText("Setup A");

  await userEvent.click(screen.getByRole("button", { name: /^xoá$/i }));
  expect(await screen.findByText(/xoá mẫu này\?/i)).toBeInTheDocument();
  expect(deleted).toBe(0);

  const confirm = screen.getAllByRole("button", { name: /^xoá$/i });
  await userEvent.click(confirm[confirm.length - 1]);

  await waitFor(() => expect(deleted).toBe(1));
});

// Ca NGUY HIỂM NHẤT của feature này. TemplateManagerDialog là dialog LỒNG
// trong TradeFormDialog. Esc phải đóng đúng lớp trong; đóng luôn form lệnh là
// mất lệnh người dùng đang gõ — hỏng dữ liệu, không phải lỗi hiển thị.
test("Esc trong dialog quản lý KHÔNG đóng dialog cha", async () => {
  server.use(http.get(`${BASE}/note-templates`, () => envelope([])));

  function TwoLayers() {
    const [outerOpen, setOuterOpen] = useState(true);
    const [innerOpen, setInnerOpen] = useState(true);
    return (
      <Dialog open={outerOpen} onOpenChange={setOuterOpen}>
        <DialogContent>
          <p>form lệnh</p>
          <TemplateManagerDialog open={innerOpen} onOpenChange={setInnerOpen} />
        </DialogContent>
      </Dialog>
    );
  }
  render(<TwoLayers />, { wrapper });
  expect(await screen.findByText("form lệnh")).toBeInTheDocument();
  expect(await screen.findByText(/quản lý mẫu ghi chú/i)).toBeInTheDocument();

  await userEvent.keyboard("{Escape}");

  await waitFor(() =>
    expect(screen.queryByText(/quản lý mẫu ghi chú/i)).not.toBeInTheDocument(),
  );
  expect(screen.getByText("form lệnh")).toBeInTheDocument();
});

// Đóng dialog giữa lúc đang soạn rồi mở lại: không được thấy form nửa vời của
// lần trước. `editing`/`name`/`body` sống trong state của component, mà Radix
// giữ component sống khi đóng — nên phải chủ động dọn.
test("đóng giữa lúc đang soạn rồi mở lại thì form đã dọn", async () => {
  server.use(http.get(`${BASE}/note-templates`, () => envelope([])));

  function Reopenable() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          mở lại
        </button>
        <TemplateManagerDialog open={open} onOpenChange={setOpen} />
      </>
    );
  }
  render(<Reopenable />, { wrapper });

  await userEvent.click(await screen.findByRole("button", { name: /thêm mẫu/i }));
  await userEvent.type(screen.getByLabelText(/tên mẫu/i), "đang gõ nửa vời");
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByLabelText(/tên mẫu/i)).not.toBeInTheDocument());

  await userEvent.click(screen.getByRole("button", { name: /mở lại/i }));

  expect(await screen.findByRole("button", { name: /thêm mẫu/i })).toBeInTheDocument();
  expect(screen.queryByLabelText(/tên mẫu/i)).not.toBeInTheDocument();
});
