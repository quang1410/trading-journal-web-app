import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";
import { __resetActiveAccountForTest } from "@/features/accounts/activeAccount";

// Radix Select dùng Pointer Events API và scrollIntoView, jsdom không có cả
// hai. Thiếu bốn dòng này thì trigger VẪN mở được nhưng danh sách option
// không bao giờ xuất hiện, và test đỏ với "Unable to find role=option" — một
// thông báo chẳng liên quan gì tới nguyên nhân thật.
//
// Đúng bốn dòng, đã kiểm: ResizeObserver cũng thiếu trong jsdom nhưng Radix
// Select không cần tới nó.
const PROTO = window.HTMLElement.prototype as unknown as Record<string, unknown>;
PROTO.hasPointerCapture = () => false;
PROTO.setPointerCapture = () => {};
PROTO.releasePointerCapture = () => {};
PROTO.scrollIntoView = () => {};

// onUnhandledRequest: "error" là có chủ ý. Một request lọt ra ngoài mà im
// lặng sẽ biến thành test xanh vì lý do sai.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  // Id account đang chọn nằm ở cấp module (xem activeAccount.ts), nên nó
  // sống dai hơn một lần render. Không quên nó ở đây thì lựa chọn của case
  // trước rò sang case sau.
  __resetActiveAccountForTest();
});
afterAll(() => server.close());
