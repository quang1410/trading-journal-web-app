import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

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
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
