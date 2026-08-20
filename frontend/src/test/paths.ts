import { resolve } from "node:path";

// Dưới môi trường jsdom của Vitest, import.meta.url là một URL http://, KHÔNG
// phải file:// — fileURLToPath sẽ ném "The URL must be of scheme file". Vitest
// đặt process.cwd() ở gốc project (thư mục frontend/), nên mốc đó là thứ dùng
// được ở cả test lẫn CI.
export const tuFrontend = (...p: string[]): string => resolve(process.cwd(), ...p);
export const tuRepo = (...p: string[]): string => resolve(process.cwd(), "..", ...p);
