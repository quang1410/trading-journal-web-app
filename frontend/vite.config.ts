import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      // Cùng origin là điều kiện đúng/sai, không phải tiện nghi: cookie
      // refresh có Path=/api/auth và HttpOnly. Gọi thẳng cổng 8000 từ
      // origin 5173 thì trình duyệt không gửi cookie đó đi, và MỌI lần F5
      // đều văng ra login.
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000",
        changeOrigin: false,
      },
    },
  },
  test: {
    // Chỉ nhận test dưới src/. Không có dòng này thì Vitest quét luôn
    // e2e/*.spec.ts của Playwright — hai runner khác nhau, `test.describe`
    // của Playwright không tồn tại trong Vitest nên file đỏ ngay lúc thu
    // thập, và `make test-fe` đỏ vì một lý do chẳng liên quan gì tới nó.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // fetch của Node cần URL tuyệt đối. Đặt base ở đây để MSW khớp handler
    // được, và để test không phụ thuộc origin của jsdom.
    env: { VITE_API_BASE_URL: "http://localhost/api" },
  },
});
