import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Một user, một DB. Chạy song song sẽ giẫm lên nhau, và thứ tự có ý
  // nghĩa: user đầu tiên phải được đăng ký trước khi kiểm "đăng ký đã đóng".
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
  },
});
