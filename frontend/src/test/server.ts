import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const BASE = "http://localhost/api";
const envelope = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

/**
 * Handler mặc định cho những endpoint mà COMPONENT DÙNG CHUNG tự gọi, bất kể
 * trang nào đang test: FilterBar luôn tải facets, TemplateMenu luôn tải mẫu
 * ghi chú. Thiếu chúng thì mọi test dựng /trades hay /dashboard phải tự nhớ
 * mock hai endpoint không liên quan gì tới điều nó đang kiểm.
 *
 * Chỉ trả dữ liệu RỖNG: test nào cần nội dung thật thì server.use() đè lên.
 * resetHandlers() sau mỗi test quay về đúng bộ này, không về bộ trống.
 */
export const defaultHandlers = [
  http.get(`${BASE}/accounts/:id/trades/facets`, () => envelope({ symbols: [], setups: [] })),
  http.get(`${BASE}/note-templates`, () => envelope([])),
];

export const server = setupServer(...defaultHandlers);
