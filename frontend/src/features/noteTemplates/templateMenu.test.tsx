import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { TemplateMenu } from "./TemplateMenu";
import type { NoteTemplate } from "./types";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const tpl = (id: number, name: string, position: number): NoteTemplate => ({
  id,
  name,
  body_html: `<p>${name}</p>`,
  position,
  created_at: "2026-09-09T00:00:00Z",
  updated_at: "2026-09-09T00:00:00Z",
});

function renderMenu(onInsert = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(<TemplateMenu onInsert={onInsert} />, { wrapper: Wrapper });
  return { onInsert };
}

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("tk", { id: 1, email: "a@b.c" });
});

test("bấm một mẫu gọi onInsert với body_html của mẫu đó", async () => {
  server.use(http.get(`${BASE}/note-templates`, () => envelope([tpl(1, "Setup A", 1)])));
  const { onInsert } = renderMenu();

  await userEvent.click(screen.getByRole("button", { name: /chèn mẫu/i }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Setup A" }));

  expect(onInsert).toHaveBeenCalledWith("<p>Setup A</p>");
});

// Menu rỗng không được là một menu TRỐNG: người dùng bấm vào rồi không hiểu
// mình đang thấy gì. Nó phải mời tạo mẫu đầu tiên.
test("chưa có mẫu nào thì hiện lời mời tạo mẫu, không hiện menu trống", async () => {
  server.use(http.get(`${BASE}/note-templates`, () => envelope([])));
  renderMenu();

  await userEvent.click(screen.getByRole("button", { name: /chèn mẫu/i }));

  expect(await screen.findByText(/chưa có mẫu nào/i)).toBeInTheDocument();
});

test("danh sách hiện theo đúng thứ tự API trả về", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () =>
      envelope([tpl(3, "Ba", 1), tpl(1, "Một", 2), tpl(2, "Hai", 3)]),
    ),
  );
  renderMenu();

  await userEvent.click(screen.getByRole("button", { name: /chèn mẫu/i }));

  const items = await screen.findAllByRole("menuitem");
  const names = items
    .map((i) => i.textContent)
    .filter((n): n is string => ["Ba", "Một", "Hai"].includes(n ?? ""));
  expect(names).toEqual(["Ba", "Một", "Hai"]);
});

// Tải hỏng KHÁC với chưa có mẫu nào. Bản trước dùng `templates ?? []` nên khi
// GET /note-templates trả 500, menu in ra "Chưa có mẫu nào" — một câu SAI, và
// sai theo hướng nguy hiểm: người dùng có thể tưởng mẫu của mình mất rồi và
// ngồi tạo lại. Cùng lý lẽ với filters.optionsFailed ở FilterBar.
test("tải mẫu hỏng thì nói tải hỏng, không nói chưa có mẫu", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () => HttpResponse.json({ code: 5, msg: "boom" }, { status: 500 })),
  );
  renderMenu();

  await userEvent.click(screen.getByRole("button", { name: "Chèn mẫu" }));

  expect(await screen.findByText("Không tải được danh sách mẫu")).toBeInTheDocument();
  expect(screen.queryByText("Chưa có mẫu nào — tạo mẫu đầu tiên")).not.toBeInTheDocument();
});

test("tải mẫu hỏng vẫn vào được dialog quản lý mẫu", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () => HttpResponse.json({ code: 5, msg: "boom" }, { status: 500 })),
  );
  renderMenu();

  await userEvent.click(screen.getByRole("button", { name: "Chèn mẫu" }));
  await userEvent.click(await screen.findByText("Quản lý mẫu…"));

  expect(await screen.findByRole("dialog", { name: "Quản lý mẫu ghi chú" })).toBeInTheDocument();
});
