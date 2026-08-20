import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

// onUnhandledRequest: "error" là có chủ ý. Một request lọt ra ngoài mà im
// lặng sẽ biến thành test xanh vì lý do sai.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
