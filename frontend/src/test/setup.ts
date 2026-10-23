import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";
import { __resetActiveAccountForTest } from "@/features/accounts/activeAccount";

// findBy* / waitFor chờ tối đa 5 giây thay vì 1 giây mặc định. Test đầu tiên của một file mở
// trang qua lazy() phải chờ vitest biên dịch nguội cả cây module của trang đó NGAY TRONG lúc
// findBy đang đếm giờ: switchAccount ~960ms, periodTabs ~660ms trên máy dev — sát mép 1 giây, máy
// bận hơn một chút là đỏ với "Unable to find…" dù code không sai. Không nới assert nào: phần tử
// không bao giờ hiện thì vẫn đỏ, chỉ muộn hơn.
configure({ asyncUtilTimeout: 5000 });

// Radix Select dùng Pointer Events API và scrollIntoView, jsdom không có cả
// hai. Thiếu bốn dòng này thì trigger VẪN mở được nhưng danh sách option
// không bao giờ xuất hiện, và test đỏ với "Unable to find role=option" — một
// thông báo chẳng liên quan gì tới nguyên nhân thật.
//
// Đúng bốn dòng, đã kiểm: Radix Select không cần ResizeObserver (Slider thì
// cần, xem bên dưới).
const PROTO = window.HTMLElement.prototype as unknown as Record<string, unknown>;
PROTO.hasPointerCapture = () => false;
PROTO.setPointerCapture = () => {};
PROTO.releasePointerCapture = () => {};
PROTO.scrollIntoView = () => {};

// Radix Slider đo kích thước núm kéo bằng ResizeObserver — jsdom không có. Bản rỗng là đủ: jsdom
// không bố cục, kích thước nào đo ra cũng là 0.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Request không có handler phải làm ĐỎ test. Một request lọt ra ngoài mà im
// lặng sẽ biến thành test xanh vì lý do sai.
//
// Chỉ đặt onUnhandledRequest: "error" là KHÔNG đủ: MSW chỉ làm hỏng riêng
// request đó, còn test vẫn xanh nếu component lặng lẽ xuống cấp khi request
// lỗi (FilterBar làm đúng như vậy khi thiếu /facets). Cả bộ test từng xanh
// với hàng chục request không handler, cho tới khi thứ tự thời gian trên CI
// khác đi và hai test đỏ. Nên ghi lại từng request rồi đánh đỏ ở afterEach.
const unhandled: string[] = [];
beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      unhandled.push(`${request.method} ${new URL(request.url).pathname}`);
      print.error();
    },
  }),
);
afterEach(() => {
  const leaked = unhandled.splice(0);
  server.resetHandlers();
  // Id account đang chọn nằm ở cấp module (xem activeAccount.ts), nên nó
  // sống dai hơn một lần render. Không quên nó ở đây thì lựa chọn của case
  // trước rò sang case sau.
  __resetActiveAccountForTest();
  if (leaked.length > 0) {
    throw new Error(`request without an MSW handler:\n  ${[...new Set(leaked)].join("\n  ")}`);
  }
});
afterAll(() => server.close());
