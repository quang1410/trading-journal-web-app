import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Chạy một câu SQL trên Postgres của stack E2E và trả về kết quả dạng
 * `cột|cột` mỗi dòng.
 *
 * Đi qua `docker compose exec` chứ không mở kết nối Postgres từ Node: khỏi
 * thêm driver vào devDependencies chỉ cho vài phép kiểm. `make e2e` dựng stack
 * dưới project `jrnl-e2e` và truyền tên đó qua E2E_COMPOSE_PROJECT.
 */
export function queryE2EDb(sql: string): string {
  const project = process.env.E2E_COMPOSE_PROJECT ?? "jrnl-e2e";
  return execFileSync(
    "docker",
    ["compose", "-p", project, "exec", "-T", "db", "psql", "-U", "journal", "-d", "journal", "-tA", "-c", sql],
    // Playwright chạy từ frontend/; docker-compose.yml nằm ở gốc repo.
    { cwd: resolve(process.cwd(), ".."), encoding: "utf8" },
  ).trim();
}
