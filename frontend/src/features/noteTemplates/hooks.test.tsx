import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import {
  useCreateNoteTemplate,
  useDeleteNoteTemplate,
  useNoteTemplates,
  useReorderNoteTemplates,
  useUpdateNoteTemplate,
} from "./hooks";
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

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    qc,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("tk", { id: 1, email: "a@b.c" });
});

test("useNoteTemplates nạp danh sách theo position", async () => {
  server.use(http.get(`${BASE}/note-templates`, () => envelope([tpl(1, "A", 1), tpl(2, "B", 2)])));
  const { Wrapper } = wrap();

  const { result } = renderHook(() => useNoteTemplates(), { wrapper: Wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.map((t) => t.name)).toEqual(["A", "B"]);
});

test("useCreateNoteTemplate POST rồi làm mới danh sách", async () => {
  let listCalls = 0;
  server.use(
    http.get(`${BASE}/note-templates`, () => {
      listCalls++;
      return envelope([]);
    }),
    http.post(`${BASE}/note-templates`, async ({ request }) => {
      const body = (await request.json()) as { name: string; body_html: string };
      expect(body).toEqual({ name: "A", body_html: "<p>a</p>" });
      return envelope(tpl(1, "A", 1));
    }),
  );
  const { Wrapper } = wrap();
  const { result } = renderHook(
    () => ({ list: useNoteTemplates(), create: useCreateNoteTemplate() }),
    { wrapper: Wrapper },
  );
  await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
  const before = listCalls;

  await result.current.create.mutateAsync({ name: "A", body_html: "<p>a</p>" });

  await waitFor(() => expect(listCalls).toBeGreaterThan(before));
});

test("useUpdateNoteTemplate PATCH đúng id và chỉ gửi field đã đổi", async () => {
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([tpl(7, "A", 1)])),
    http.patch(`${BASE}/note-templates/7`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      expect(body).toEqual({ name: "A mới" });
      return envelope(tpl(7, "A mới", 1));
    }),
  );
  const { Wrapper } = wrap();
  const { result } = renderHook(() => useUpdateNoteTemplate(), { wrapper: Wrapper });

  const updated = await result.current.mutateAsync({ id: 7, patch: { name: "A mới" } });

  expect(updated.name).toBe("A mới");
});

test("useDeleteNoteTemplate DELETE đúng id", async () => {
  let deleted = 0;
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([])),
    http.delete(`${BASE}/note-templates/7`, () => {
      deleted++;
      return envelope(null);
    }),
  );
  const { Wrapper } = wrap();
  const { result } = renderHook(() => useDeleteNoteTemplate(), { wrapper: Wrapper });

  await result.current.mutateAsync(7);

  expect(deleted).toBe(1);
});

test("useReorderNoteTemplates PUT mảng ids", async () => {
  let sent: number[] | null = null;
  server.use(
    http.get(`${BASE}/note-templates`, () => envelope([])),
    http.put(`${BASE}/note-templates/order`, async ({ request }) => {
      sent = ((await request.json()) as { ids: number[] }).ids;
      return envelope(null);
    }),
  );
  const { Wrapper } = wrap();
  const { result } = renderHook(() => useReorderNoteTemplates(), { wrapper: Wrapper });

  await result.current.mutateAsync([3, 1, 2]);

  expect(sent).toEqual([3, 1, 2]);
});
