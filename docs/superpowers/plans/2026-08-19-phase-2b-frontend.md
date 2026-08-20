# Phase 2b — Frontend (scaffold, theme, auth, accounts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng toàn bộ frontend từ số không và service `web` trong compose, để người dùng làm được **bằng trình duyệt** đúng vòng mà Phase 2a chỉ làm được bằng `curl`: đăng ký → đăng nhập → tạo account → cash flow → F5 vẫn còn phiên → logout.

**Architecture:** Access token JWT sống trong một biến cấp module (`lib/session.ts`), không phải state React. `lib/api.ts` là cửa duy nhất ra mạng: nó bóc envelope `{code,msg,data}`, và khi gặp 401 thì refresh rồi thử lại đúng một lần, với một khoá single-flight cấp module. React chỉ là tầng hiển thị: `AuthProvider` giữ `user` để render, TanStack Query giữ dữ liệu. Theme của chủ sản phẩm được chép nguyên xi và nối vào Tailwind v4 + shadcn qua một file `bridge.css` duy nhất.

**Tech Stack:** Vite 6, React 19, TypeScript 5, React Router v7, TanStack Query v5, Tailwind v4 (`@tailwindcss/vite`), shadcn/ui, react-hook-form + zod, Vitest + Testing Library + MSW, Playwright, nginx alpine.

**Spec:** `docs/superpowers/specs/2026-08-19-phase-2b-frontend-design.md` (và spec mẹ `docs/superpowers/specs/2026-08-16-trading-journal-design.md`, spec anh em `docs/superpowers/specs/2026-08-18-phase-2a-auth-accounts-design.md`)

## Global Constraints

Mọi task đều ngầm bao gồm mục này.

- **Không sửa bất cứ file nào trong `backend/`.** 2b là phase frontend. `make test` và `make test-pure` của backend phải giữ nguyên kết quả.
- **Không sửa `docs/design/theme.css`.** Nó là nguồn sự thật do chủ sản phẩm cấp (CLAUDE.md). `src/styles/theme.css` là **bản chép byte-identical**, và Task 2 dựng test canh điều đó.
- **Tiền là chuỗi.** Backend trả `"10000"`, `"0.01"`. Cấm `Number(`, `parseFloat(`, `parseInt(` trên đường đi của tiền. Task 4 dựng test canh điều đó.
- **Component chỉ dùng biến ngữ nghĩa** (`--surface-*`, `--text-*`, `--border-*`, `--status-*`, `--primary`), không hardcode hex.
- **Lãi = `var(--primary)` (teal), lỗ = `var(--status-error)` (đỏ).** Chỉ một sắc xanh trong toàn app.
- **Theme tắt hết `shadow-*`** (theme.css dòng 534–542). Phân tầng bằng border và bậc surface.
- **Dark mode qua `[data-theme="dark"]` trên `<html>`** — không phải class `.dark`, không phải `prefers-color-scheme`. Mặc định `dark`.
- **FE hiển thị `msg` của backend; `code` chỉ quyết định hành vi, không sinh chữ.** Backend đã trả tiếng Việt hiển thị được.
- **Mã lỗi nghiệp vụ:** `1400` validate · `1401` chưa auth · `1403` không có quyền · `1404` không thấy · `1405` method · `1409` trùng · `1500` lỗi hệ thống.
- **Mọi con số** — tiền, %, R, điểm — dùng font mono + `tabular-nums`.
- Commit sau mỗi task. Chạy đúng lệnh verify đã ghi và **dán output thật**; không được báo xanh khi chưa chạy.
- Mỗi task ship kèm test trong cùng lần thay đổi, không dời sang task sau (CLAUDE.md).

## Ràng buộc từ backend — trích từ code thật, không phải trí nhớ

| Nơi | Ràng buộc | Nguồn |
|---|---|---|
| mật khẩu | ≥ 8 ký tự | `backend/internal/service/auth.go:25` |
| account `code` | không rỗng, ≤ 32 ký tự | `service/account.go:17,133,135` |
| account `currency` | không rỗng, ≤ 8 ký tự | `service/account.go:137,139` |
| `initial_balance` | > 0 | `service/account.go:141` |
| `risk_per_trade` | trong (0, 1] | `service/account.go:144` |
| `timezone` | tên IANA hợp lệ, không rỗng | `service/account.go:149,152` |
| cash flow `date` | `YYYY-MM-DD` | `service/cashflow.go:43` |
| cash flow `amount` | > 0 (chiều nằm ở `type`) | `service/cashflow.go:46` |
| cash flow `type` | `"deposit"` hoặc `"withdraw"` | `service/cashflow.go:52` |
| cookie refresh | tên `refresh_token`, `HttpOnly`, `SameSite=Lax`, **`Path=/api/auth`** | `httpapi/auth_handler.go:10,13` |
| PATCH account | field vắng mặt = không đổi (con trỏ) | `httpapi/dto.go` `accountPatchRequest` |
| `DELETE /api/accounts/:id` | **KHÔNG TỒN TẠI** | `httpapi/router.go` |

## File Structure

| File | Trách nhiệm |
|---|---|
| `frontend/package.json`, `vite.config.ts`, `tsconfig*.json` | Toolchain. Vite config chứa cả cấu hình Vitest và proxy `/api`. |
| `frontend/index.html` | Điểm vào + script inline đặt `data-theme` **trước lần vẽ đầu**. |
| `frontend/src/styles/theme.css` | Bản chép byte-identical của `docs/design/theme.css`. Không sửa. |
| `frontend/src/styles/bridge.css` | Nơi **duy nhất** map token theme → token Tailwind/shadcn. |
| `frontend/src/styles/index.css` | `@import` tailwind → theme → bridge, đúng thứ tự đó. |
| `frontend/src/lib/session.ts` | Giữ access token + user trong biến cấp module. Không import React. |
| `frontend/src/lib/api.ts` | Cửa duy nhất ra mạng: bóc envelope, 401→refresh→retry, khoá single-flight. |
| `frontend/src/lib/decimal.ts` | Dịch dấu chấm trên chuỗi + định dạng tiền. Không phụ thuộc gì. |
| `frontend/src/lib/format.ts` | Định dạng ngày `YYYY-MM-DD` bằng thao tác chuỗi. |
| `frontend/src/lib/queryKeys.ts` | Query key tập trung một chỗ để Phase 3, 4 không tự chế key lệch nhau. |
| `frontend/src/app/providers.tsx` | QueryClientProvider + AuthProvider. |
| `frontend/src/app/router.tsx` | Bảng route + guard. |
| `frontend/src/app/AppShell.tsx` | Sidenav + page body + ThemeToggle + AccountSwitcher. |
| `frontend/src/features/auth/*` | `AuthProvider`, `RequireAuth`, `LoginPage`, `RegisterPage`. |
| `frontend/src/features/accounts/*` | Hook query/mutation, `AccountsPage`, `AccountFormDialog`, `CashFlowPanel`. |
| `frontend/src/features/accounts/activeAccount.ts` | Đọc/ghi/đối chiếu id account đang chọn. |
| `frontend/Dockerfile`, `frontend/nginx.conf` | Build tĩnh → nginx, có SPA fallback và proxy `/api`. |
| `docker-compose.yml`, `docker-compose.dev.yml` (modify/create) | Service `web` prod và override dev. |
| `Makefile`, `.github/workflows/ci.yml` (modify) | `test-fe`, `e2e`, job Node trong CI. |

---

### Task 1: Scaffold Vite + React 19 + TypeScript + Vitest

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/tsconfig.node.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/.dockerignore`
- Create: `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/test/setup.ts`
- Modify: `Makefile`, `.github/workflows/ci.yml`, `.gitignore`

**Interfaces:**
- Consumes: không gì.
- Produces: alias `@/*` → `src/*`; script `npm run dev|build|test`; target `make test-fe`; biến môi trường test `VITE_API_BASE_URL=http://localhost/api` (Task 5 dựa vào).

- [ ] **Step 1: Tạo thư mục và cài phụ thuộc**

```bash
mkdir -p frontend/src/test
cd frontend
npm init -y

npm install react@^19 react-dom@^19 react-router@^7 \
  @tanstack/react-query@^5 \
  react-hook-form zod@^3 @hookform/resolvers@^3 \
  clsx tailwind-merge class-variance-authority lucide-react \
  @fontsource-variable/inter @fontsource-variable/jetbrains-mono

npm install -D vite @vitejs/plugin-react typescript \
  @types/react@^19 @types/react-dom@^19 @types/node \
  tailwindcss@^4 @tailwindcss/vite@^4 \
  vitest jsdom \
  @testing-library/react @testing-library/user-event @testing-library/jest-dom \
  msw@^2 @playwright/test
```

`zod@^3` + `@hookform/resolvers@^3` đi cặp với nhau. Trộn `zod@4` với `resolvers@3` là lỗi kiểu khó đọc — đừng nâng lẻ một cái.

- [ ] **Step 2: Thay khối `scripts` trong `frontend/package.json`**

```json
{
  "name": "trading-journal-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  }
}
```

Giữ nguyên `dependencies` và `devDependencies` mà npm vừa ghi. Commit cả `package-lock.json`.

- [ ] **Step 3: `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "types": ["vitest/globals", "@testing-library/jest-dom", "node"],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "e2e", "vite.config.ts"]
}
```

- [ ] **Step 4: `frontend/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: `frontend/vite.config.ts`**

`defineConfig` lấy từ `vitest/config` chứ không phải `vite` — nhờ vậy khối `test` có kiểu đúng mà không cần file config thứ hai.

```ts
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
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // fetch của Node cần URL tuyệt đối. Đặt base ở đây để MSW (Task 5)
    // khớp handler được, và để test không phụ thuộc origin của jsdom.
    env: { VITE_API_BASE_URL: "http://localhost/api" },
  },
});
```

- [ ] **Step 6: `frontend/src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 7: `frontend/index.html`**

```html
<!doctype html>
<html lang="vi" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nhật ký giao dịch</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Task 2 sẽ thay `data-theme="dark"` cứng này bằng script inline đọc localStorage.

- [ ] **Step 8: Viết test thất bại**

`frontend/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

test("App vẽ được và hiện tên sản phẩm", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Nhật ký giao dịch" })).toBeInTheDocument();
});
```

- [ ] **Step 9: Chạy test, xác nhận nó ĐỎ**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: FAIL — `Failed to resolve import "./App"`.

- [ ] **Step 10: Viết cài đặt tối thiểu**

`frontend/src/App.tsx`:

```tsx
export default function App() {
  return <h1>Nhật ký giao dịch</h1>;
}
```

`frontend/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`StrictMode` bật có chủ ý. Nó gọi effect hai lần ở dev, và chính vì thế nó là thứ phát hiện sớm lỗi refresh song song mà Task 5 phải chống.

- [ ] **Step 11: Chạy lại, xác nhận XANH**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 12: `frontend/.dockerignore`**

```
node_modules
dist
.vite
e2e
playwright-report
test-results
```

- [ ] **Step 13: Thêm target vào `Makefile`**

Sửa dòng `.PHONY` thành:

```make
.PHONY: test test-pure lint up down logs migrate tidy test-fe e2e
```

Thêm vào cuối file:

```make
# Toàn bộ kiểm tra frontend. Không cần Docker.
test-fe:
	cd frontend && npx tsc --noEmit && npm run test && npm run build

# End-to-end trên stack Docker thật. Tách khỏi test-fe vì cần Docker và chậm.
e2e:
	cd frontend && npm run e2e
```

- [ ] **Step 14: Thêm job Node vào `.github/workflows/ci.yml`**

Thêm vào cuối file, ngang cấp với job `backend`:

```yaml
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Install
        run: cd frontend && npm ci
      - name: Check
        run: make test-fe
```

- [ ] **Step 15: Thêm dòng vào `.gitignore`**

Thêm dưới khối `# Node` đã có:

```
/frontend/playwright-report/
/frontend/test-results/
/frontend/.vite/
```

- [ ] **Step 16: Chạy toàn bộ cổng kiểm tra**

Run: `make test-fe`
Expected: `tsc` không in gì, vitest `1 passed`, `vite build` ghi ra `dist/`.

- [ ] **Step 17: Commit**

```bash
git add frontend Makefile .github/workflows/ci.yml .gitignore
git commit -m "feat(fe): scaffold Vite + React 19 + TypeScript + Vitest"
```

---

### Task 2: Nối theme — bản chép, bridge, Tailwind v4

**Files:**
- Create: `frontend/src/styles/theme.css` (bản chép), `frontend/src/styles/theme.test.ts`, `frontend/src/styles/bridge.css`, `frontend/src/styles/index.css`
- Create: `frontend/src/lib/theme.ts`, `frontend/src/lib/theme.test.ts`
- Modify: `frontend/index.html`, `frontend/src/main.tsx`

**Interfaces:**
- Consumes: alias `@/*` của Task 1.
- Produces: `THEME_KEY = "journal.theme"`; `type Theme = "dark" | "light"`; `readStoredTheme(store?): Theme`; `storeTheme(t, store?): void`; `applyTheme(t, root?): void`. Class tiện ích `.num` cho mọi con số. Token Tailwind/shadcn `--color-background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring` và `--radius`.

- [ ] **Step 1: Viết test đồng nhất TRƯỚC khi chép**

`frontend/src/styles/theme.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

test("bản chép theme phải giống bản gốc từng byte", () => {
  const goc = readFileSync(`${here}../../../docs/design/theme.css`);
  const chep = readFileSync(`${here}theme.css`);
  expect(chep.equals(goc)).toBe(true);
});
```

So sánh `Buffer` chứ không so sánh chuỗi: chuỗi che mất khác biệt về BOM và ký tự xuống dòng, mà đó đúng là kiểu trôi lặng lẽ nhất.

- [ ] **Step 2: Chạy test, xác nhận nó ĐỎ**

Run: `cd frontend && npx vitest run src/styles/theme.test.ts`
Expected: FAIL — `ENOENT ... src/styles/theme.css`.

- [ ] **Step 3: Chép theme**

```bash
mkdir -p frontend/src/styles
cp docs/design/theme.css frontend/src/styles/theme.css
```

`cp`, không phải mở ra rồi lưu lại. Editor sẽ tự sửa xuống dòng hoặc thêm newline cuối file.

- [ ] **Step 4: Chạy lại, xác nhận XANH**

Run: `cd frontend && npx vitest run src/styles/theme.test.ts`
Expected: PASS.

- [ ] **Step 5: FALSIFY — chứng minh test này thật sự bắt được**

```bash
printf '\n/* thu pha */\n' >> frontend/src/styles/theme.css
cd frontend && npx vitest run src/styles/theme.test.ts   # PHẢI ĐỎ
cd .. && cp docs/design/theme.css frontend/src/styles/theme.css
cd frontend && npx vitest run src/styles/theme.test.ts   # xanh trở lại
```

Dán cả hai output. Một cổng canh không thể đỏ thì tệ hơn không có cổng nào.

- [ ] **Step 6: `frontend/src/styles/bridge.css`**

Đây là nơi **duy nhất** được map token. Đừng map ở chỗ khác.

```css
/* Nối token ngữ nghĩa của theme sang tên mà Tailwind v4 và shadcn/ui dùng.
   Nguồn sự thật là ../styles/theme.css — file này chỉ đổi tên, không đổi giá trị.

   BẪY 1: Figma đảo tên có chủ ý.
     --surface-raised là nền TRANG   -> background
     --surface-base   là nền THẺ     -> card
   Chép theo trực giác là sai nền toàn app.

   BẪY 2: `inline` là bắt buộc. Không có nó, Tailwind chốt giá trị lúc build
   và utility sẽ không đổi màu khi [data-theme] đổi. */

:root {
  --radius: var(--radius-default);
}

@theme inline {
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, monospace;

  --color-background: var(--surface-raised);
  --color-foreground: var(--text-primary);

  --color-card: var(--surface-base);
  --color-card-foreground: var(--text-primary);

  --color-popover: var(--surface-modal);
  --color-popover-foreground: var(--text-primary);

  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);

  --color-secondary: var(--interactive-bg);
  --color-secondary-foreground: var(--text-primary);

  --color-muted: var(--surface-sunken);
  --color-muted-foreground: var(--text-muted);

  --color-accent: var(--interactive-bg-hover);
  --color-accent-foreground: var(--text-primary);

  --color-destructive: var(--status-error);
  --color-destructive-foreground: var(--status-error-text);

  --color-border: var(--border-default);
  --color-input: var(--border-input);
  --color-ring: var(--focus-ring);
}
```

Spec mẹ §8.1 chỉ liệt kê 10 token. Mười hai cái còn lại ở đây đều trỏ vào token đã **kiểm chứng là có thật** trong `theme.css` (`--primary-foreground` dòng 345/401, `--interactive-bg*` dòng 375–377/433–435, `--surface-sunken`, `--status-error-text`). Không bịa token nào.

- [ ] **Step 7: `frontend/src/styles/index.css`**

```css
@import "tailwindcss";
@import "@fontsource-variable/inter";
@import "@fontsource-variable/jetbrains-mono";
@import "./theme.css";
@import "./bridge.css";

@layer base {
  body {
    background-color: var(--surface-raised);
    color: var(--text-primary);
    font-family: var(--font-family);
  }
}

/* Mọi con số — tiền, %, R, điểm — dùng mono + tabular-nums, để cột số
   trong bảng thẳng hàng và để con số trên bảng khớp con số trên chart. */
.num {
  font-family: var(--font-family-mono);
  font-variant-numeric: tabular-nums;
}
```

**Thứ tự import là bắt buộc.** `theme.css` phải nằm SAU `tailwindcss` thì `html { font-size: 14px }` và khối vô hiệu hoá `.shadow-*` mới thắng được preflight cùng utility.

**Tuyệt đối không bọc `theme.css` trong `@theme`.** Theme dùng tiền tố `--text-*` cho **cả hai** thứ: cỡ chữ (`--text-sm`, `--text-2xl`) và màu chữ (`--text-primary`, `--text-muted`). Tailwind v4 coi namespace `--text-*` là **cỡ chữ**, nên đưa vào `@theme` sẽ đẻ ra một utility `text-primary` mang nghĩa cỡ chữ và giẫm lên utility màu. Để nguyên ở `:root` thì Tailwind không đụng tới, mà `--text-sm` v.v. vẫn ghi đè được cỡ chữ mặc định — đúng ý chủ sản phẩm.

- [ ] **Step 8: Viết test cho `lib/theme.ts` (ĐỎ trước)**

`frontend/src/lib/theme.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { THEME_KEY, readStoredTheme, storeTheme, applyTheme } from "./theme";

function kho(giaTri: string | null) {
  return { getItem: () => giaTri, setItem: () => {} };
}

test("mặc định là dark khi chưa lưu gì", () => {
  expect(readStoredTheme(kho(null))).toBe("dark");
});

test("mặc định là dark khi giá trị lưu là rác", () => {
  expect(readStoredTheme(kho("mau-hong"))).toBe("dark");
});

test("đọc lại đúng giá trị đã lưu", () => {
  expect(readStoredTheme(kho("light"))).toBe("light");
  expect(readStoredTheme(kho("dark"))).toBe("dark");
});

test("applyTheme đặt thuộc tính data-theme", () => {
  const root = document.createElement("html");
  applyTheme("light", root);
  expect(root.getAttribute("data-theme")).toBe("light");
});

test("storeTheme ghi dưới đúng khoá", () => {
  let khoaDaGhi = "";
  storeTheme("light", { setItem: (k: string) => { khoaDaGhi = k; } });
  expect(khoaDaGhi).toBe(THEME_KEY);
});

// Khoá này bị viết ra HAI nơi: ở đây và trong script inline của index.html.
// Không có test này thì đổi một nơi mà quên nơi kia sẽ làm theme nháy trắng
// mỗi lần tải trang, và không có gì báo.
test("script inline của index.html dùng đúng khoá localStorage", () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const html = readFileSync(`${here}../../index.html`, "utf8");
  expect(html).toContain(THEME_KEY);
});
```

- [ ] **Step 9: Chạy, xác nhận ĐỎ**

Run: `cd frontend && npx vitest run src/lib/theme.test.ts`
Expected: FAIL — `Failed to resolve import "./theme"`.

- [ ] **Step 10: `frontend/src/lib/theme.ts`**

```ts
export type Theme = "dark" | "light";

// Khoá này cũng xuất hiện trong script inline của index.html. Đổi một nơi
// thì phải đổi cả hai — theme.test.ts canh điều đó.
export const THEME_KEY = "journal.theme";

type Doc = Pick<Storage, "getItem">;
type Ghi = Pick<Storage, "setItem">;

export function readStoredTheme(store: Doc = localStorage): Theme {
  const v = store.getItem(THEME_KEY);
  return v === "light" ? "light" : "dark";
}

export function storeTheme(t: Theme, store: Ghi = localStorage): void {
  store.setItem(THEME_KEY, t);
}

export function applyTheme(t: Theme, root: HTMLElement = document.documentElement): void {
  root.setAttribute("data-theme", t);
}
```

- [ ] **Step 11: Thay `frontend/index.html`**

```html
<!doctype html>
<html lang="vi" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nhật ký giao dịch</title>
    <script>
      // Phải chạy TRƯỚC lần vẽ đầu tiên. Đặt data-theme trong React sẽ
      // nháy một khung hình màu sáng rồi mới sang dark.
      // Khoá "journal.theme" trùng với THEME_KEY trong src/lib/theme.ts.
      (function () {
        try {
          var t = localStorage.getItem("journal.theme");
          document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
        } catch (e) {
          document.documentElement.setAttribute("data-theme", "dark");
        }
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 12: Nạp CSS trong `frontend/src/main.tsx`**

Thêm một dòng import lên đầu file, trên mọi import khác:

```tsx
import "./styles/index.css";
```

- [ ] **Step 13: Chạy toàn bộ**

Run: `cd frontend && npx vitest run`
Expected: PASS — 8 test (1 của Task 1 + 1 đồng nhất theme + 6 của theme.ts).

- [ ] **Step 14: Kiểm bằng mắt rằng theme thật sự ăn**

Run: `cd frontend && npm run dev` rồi mở `http://localhost:5173`.
Expected: nền tối (`#101828`), chữ sáng, cỡ gốc 14px. Đổi `data-theme` sang `light` trong DevTools thì nền phải sang `#f9fafb` **ngay lập tức** — nếu không đổi thì `inline` ở `@theme` đã bị bỏ quên.

- [ ] **Step 15: Commit**

```bash
git add frontend/src/styles frontend/src/lib/theme.ts frontend/src/lib/theme.test.ts frontend/index.html frontend/src/main.tsx
git commit -m "feat(fe): wire product theme into Tailwind v4 with an identity-guarded copy"
```

---

### Task 3: shadcn/ui + hai cổng canh phong cách

**Files:**
- Create: `frontend/components.json`, `frontend/src/components/ui/*` (do CLI sinh), `frontend/src/lib/utils.ts` (do CLI sinh)
- Create: `frontend/src/test/styleguard.test.ts`
- Modify: `frontend/src/styles/index.css` (chỉ để **hoàn tác** nếu CLI chèn vào)

**Interfaces:**
- Consumes: token của Task 2.
- Produces: `cn(...)` từ `@/lib/utils`; component `@/components/ui/{button,input,label,card,table,dialog}`.

Chỉ sáu component, đúng những gì 2b dùng. Ba thứ **cố ý không** thêm:

- `form` — form ở 2b nhiều nhất sáu ô, `react-hook-form` trần là đủ. Phase 3 thêm khi form
  16 field xuất hiện.
- `sonner` — lỗi hiện ngay tại chỗ thay vì bắn toast: ít lớp hơn và test đọc được.
- `select` — dùng `<select>` gốc của trình duyệt cho ô timezone và ô loại giao dịch tiền.
  Select của Radix dựa vào Pointer Capture API mà jsdom không có, nên test phải vá polyfill
  rồi mới click được; `<select>` gốc thì `userEvent.selectOptions` chạy thẳng. Với danh sách
  ~400 múi giờ IANA thì select gốc cũng là thứ trình duyệt tối ưu sẵn.

- [ ] **Step 1: Viết `frontend/components.json` bằng tay**

Viết tay chứ không chạy `shadcn init`, vì `init` sẽ ghi đè `src/styles/index.css` bằng bảng token riêng của nó và giẫm lên `bridge.css`.

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 2: Thêm đúng những component 2b dùng**

```bash
cd frontend
npx shadcn@latest add button input label card table dialog -y
```

- [ ] **Step 3: Hoàn tác mọi thay đổi CLI làm với `index.css`**

```bash
cd frontend && git diff src/styles/index.css
```

Nếu CLI có chèn khối `:root { --background: ... }` hay `@theme` của riêng nó thì **xoá sạch khối đó**. `bridge.css` là nơi duy nhất được map token; hai nguồn sẽ lệch nhau và người sau sẽ sửa nhầm nguồn.

Run: `cd frontend && git diff src/styles/index.css`
Expected: không còn khác biệt nào.

- [ ] **Step 4: Viết hai cổng canh (ĐỎ trước khi sửa component)**

`frontend/src/test/styleguard.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const goc = fileURLToPath(new URL("..", import.meta.url)); // -> src/

function quet(thuMuc: string, ra: string[] = []): string[] {
  for (const ten of readdirSync(thuMuc)) {
    const p = join(thuMuc, ten);
    if (statSync(p).isDirectory()) quet(p, ra);
    else if (/\.tsx?$/.test(ten) && !/\.test\.tsx?$/.test(ten)) ra.push(p);
  }
  return ra;
}

const tatCa = quet(goc);
const duongUI = `${sep}components${sep}ui${sep}`;
const fileUI = tatCa.filter((f) => f.includes(duongUI));
const fileCuaMinh = tatCa.filter((f) => !f.includes(duongUI));

test("component shadcn không được dùng shadow-*", () => {
  // Không có dòng này thì vòng lặp rỗng sẽ pass vĩnh viễn và không ai biết.
  expect(fileUI.length).toBeGreaterThan(0);
  for (const f of fileUI) {
    expect(
      readFileSync(f, "utf8"),
      `${f} còn dùng shadow-*; theme tắt hết shadow, phải phân tầng bằng border`,
    ).not.toMatch(/\bshadow-(?:2xs|xs|sm|md|lg|xl|2xl|inner)\b/);
  }
});

test("code của mình không hardcode màu hex", () => {
  expect(fileCuaMinh.length).toBeGreaterThan(0);
  for (const f of fileCuaMinh) {
    expect(
      readFileSync(f, "utf8"),
      `${f} hardcode màu hex; chỉ được dùng biến ngữ nghĩa của theme`,
    ).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  }
});
```

Hai dòng `expect(...length).toBeGreaterThan(0)` không phải trang trí. Một vòng lặp trên danh sách rỗng luôn xanh, và Phase 2a đã sinh ra năm cái check không bao giờ đỏ được — đừng thêm cái thứ sáu.

- [ ] **Step 5: Chạy, xem cái nào đỏ**

Run: `cd frontend && npx vitest run src/test/styleguard.test.ts`
Expected: test `shadow-*` ĐỎ, kèm tên đúng file component vi phạm (thường là `card.tsx`, `dialog.tsx`, `select.tsx`).

- [ ] **Step 6: Đổi `shadow-*` sang border trong các file bị nêu tên**

Với mỗi file đỏ, thay class `shadow-sm` / `shadow-md` / `shadow-lg` bằng `border border-border`. Nếu phần tử đã có `border` rồi thì chỉ xoá class shadow.

Ví dụ trong `card.tsx`:

```diff
-      className={cn("bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm", className)}
+      className={cn("bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6", className)}
```

- [ ] **Step 7: Chạy lại, xác nhận XANH**

Run: `cd frontend && npx vitest run src/test/styleguard.test.ts`
Expected: PASS, 2 test.

- [ ] **Step 8: FALSIFY cả hai cổng**

```bash
cd frontend
# cổng 1
sed -i.bak 's/rounded-xl border/rounded-xl border shadow-sm/' src/components/ui/card.tsx
npx vitest run src/test/styleguard.test.ts   # PHẢI ĐỎ, nêu tên card.tsx
mv src/components/ui/card.tsx.bak src/components/ui/card.tsx

# cổng 2
printf 'export const x = "#12b886";\n' > src/components/tam.ts
npx vitest run src/test/styleguard.test.ts   # PHẢI ĐỎ, nêu tên tam.ts
rm src/components/tam.ts

npx vitest run src/test/styleguard.test.ts   # xanh trở lại
```

Dán cả bốn output.

- [ ] **Step 9: Chạy toàn bộ cổng kiểm tra**

Run: `make test-fe`
Expected: tsc sạch, vitest toàn xanh, build xong.

- [ ] **Step 10: Commit**

```bash
git add frontend/components.json frontend/src/components frontend/src/lib/utils.ts frontend/src/test frontend/package.json frontend/package-lock.json
git commit -m "feat(fe): add shadcn primitives with shadow and hardcoded-hex guards"
```

---

### Task 4: Tiền và ngày — `decimal.ts`, `format.ts`, cổng cấm `Number(`

**Files:**
- Create: `frontend/src/lib/decimal.ts`, `frontend/src/lib/decimal.test.ts`
- Create: `frontend/src/lib/format.ts`, `frontend/src/lib/format.test.ts`
- Modify: `frontend/src/test/styleguard.test.ts`

**Interfaces:**
- Consumes: không gì.
- Produces: `shiftDecimal(value: string, places: number): string`; `percentFromFraction(v: string): string`; `fractionFromPercent(v: string): string`; `compareDecimal(a: string, b: string): -1 | 0 | 1`; `formatMoney(value: string, currency?: string): string`; `formatDateOnly(iso: string): string`.

- [ ] **Step 1: Viết test ĐỎ cho `decimal.ts`**

`frontend/src/lib/decimal.test.ts`:

```ts
import {
  shiftDecimal,
  percentFromFraction,
  fractionFromPercent,
  compareDecimal,
  formatMoney,
} from "./decimal";

describe("shiftDecimal", () => {
  const bang: Array<[string, number, string]> = [
    ["0.01", 2, "1"],
    ["0.005", 2, "0.5"],
    ["0.0125", 2, "1.25"],
    ["1", 2, "100"],
    ["0", 2, "0"],
    ["1", -2, "0.01"],
    ["100", -2, "1"],
    ["0.5", -2, "0.005"],
    ["-0.5", 2, "-50"],
    ["10000", 0, "10000"],
    [".5", 2, "50"],
    ["1.230", 0, "1.23"],
  ];
  for (const [vao, buoc, ra] of bang) {
    test(`${vao} dịch ${buoc} -> ${ra}`, () => {
      expect(shiftDecimal(vao, buoc)).toBe(ra);
    });
  }

  test("từ chối chuỗi không phải số", () => {
    expect(() => shiftDecimal("abc", 2)).toThrow();
    expect(() => shiftDecimal("", 2)).toThrow();
    expect(() => shiftDecimal("1.2.3", 2)).toThrow();
  });
});

describe("risk % <-> phân số", () => {
  test("phân số sang %", () => {
    expect(percentFromFraction("0.01")).toBe("1");
    expect(percentFromFraction("0.0125")).toBe("1.25");
    expect(percentFromFraction("1")).toBe("100");
  });

  test("% sang phân số", () => {
    expect(fractionFromPercent("1")).toBe("0.01");
    expect(fractionFromPercent("1.25")).toBe("0.0125");
    expect(fractionFromPercent("100")).toBe("1");
  });

  // Lý do tồn tại của cả module này: 0.29 * 100 === 28.999999999999996
  // và 0.07 * 100 === 7.000000000000001. (0.01 * 100 thì tình cờ đúng bằng 1,
  // nên nó là ví dụ TỆ — dùng nó sẽ tưởng vấn đề không tồn tại.)
  test("không mượn float, nên không có đuôi rác", () => {
    expect(percentFromFraction("0.01")).not.toContain("0000000");
    expect(fractionFromPercent("1")).toBe("0.01");
  });

  test("đi một vòng thì trở về chính nó", () => {
    for (const v of ["0.01", "0.005", "0.0125", "0.1", "1"]) {
      expect(fractionFromPercent(percentFromFraction(v))).toBe(v);
    }
  });
});

// Task 9 cần so sánh risk % với 100 mà không được đụng Number. So sánh
// chuỗi thập phân bằng tay là cách duy nhất giữ được cả độ chính xác lẫn
// cổng canh "không ép tiền sang Number".
describe("compareDecimal", () => {
  const bang: Array<[string, string, number]> = [
    ["1", "1", 0],
    ["0.5", "100", -1],
    ["100", "100", 0],
    ["100.0001", "100", 1],
    ["2", "10", -1],
    ["10", "2", 1],
    ["0.10", "0.1", 0],
    ["0", "-0", 0],
    ["-1", "0.5", -1],
    ["-2", "-1", -1],
    ["-1", "-2", 1],
  ];
  for (const [a, b, ra] of bang) {
    test(`${a} so với ${b} -> ${ra}`, () => {
      expect(compareDecimal(a, b)).toBe(ra);
    });
  }

  // Đây là bẫy mà so sánh chuỗi thô sẽ sập: "2" > "10" theo thứ tự từ điển.
  test("so theo giá trị chứ không theo thứ tự từ điển", () => {
    expect(compareDecimal("2", "10")).toBe(-1);
    expect(compareDecimal("9", "11")).toBe(-1);
  });
});

describe("formatMoney", () => {
  test("giữ nguyên độ chính xác của chuỗi dài", () => {
    expect(formatMoney("12345678901234567890.12")).toContain("12.345.678.901.234.567.890");
  });

  test("gắn đơn vị tiền tệ ở dạng chữ", () => {
    expect(formatMoney("10000", "USD")).toBe("10.000 USD");
  });

  // Backend cho currency tới 8 ký tự tự do ("USDT", "vàng"), còn
  // Intl style:"currency" chỉ nhận mã ISO 4217 ba chữ và NÉM RangeError.
  // Nên ở đây currency là chữ gắn thêm, không phải tuỳ chọn của Intl.
  test("không ném với đơn vị tiền tệ không phải ISO", () => {
    expect(() => formatMoney("1", "USDT")).not.toThrow();
    expect(formatMoney("1", "USDT")).toBe("1 USDT");
  });
});
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd frontend && npx vitest run src/lib/decimal.test.ts`
Expected: FAIL — `Failed to resolve import "./decimal"`.

- [ ] **Step 3: Viết `frontend/src/lib/decimal.ts`**

```ts
// Tiền từ backend là CHUỖI (shopspring/decimal marshal ra chuỗi JSON) và
// phải ở nguyên dạng chuỗi cho tới lúc gửi lại. Mọi phép biến đổi ở đây làm
// bằng thao tác chuỗi, không mượn Number: 0.29 * 100 === 28.999999999999996.

const DANG_SO = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/** Dịch dấu chấm thập phân đi `places` chữ số. Dương là nhân 10^places. */
export function shiftDecimal(value: string, places: number): string {
  const m = DANG_SO.exec(value.trim());
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
    throw new Error(`không phải số thập phân: ${JSON.stringify(value)}`);
  }
  const dau = m[1] === "-" ? "-" : "";
  const nguyen = m[2] === "" ? "0" : m[2];
  const le = m[3] ?? "";

  let chuSo = nguyen + le;
  let cham = nguyen.length + places; // vị trí dấu chấm trong `chuSo`

  if (cham < 0) {
    chuSo = "0".repeat(-cham) + chuSo;
    cham = 0;
  }
  if (cham > chuSo.length) {
    chuSo = chuSo + "0".repeat(cham - chuSo.length);
  }

  const dau_ = chuSo.slice(0, cham).replace(/^0+(?=\d)/, "") || "0";
  const duoi = chuSo.slice(cham).replace(/0+$/, "");
  const ket = duoi ? `${dau_}.${duoi}` : dau_;
  return ket === "0" ? "0" : dau + ket;
}

/** 0.01 -> "1" (risk lưu dạng phân số, hiển thị dạng %). */
export const percentFromFraction = (v: string): string => shiftDecimal(v, 2);

/** "1" -> "0.01" (người dùng nhập %, backend nhận phân số). */
export const fractionFromPercent = (v: string): string => shiftDecimal(v, -2);

type Phan = { am: boolean; nguyen: string; le: string };

function tach(v: string): Phan {
  const m = DANG_SO.exec(v.trim());
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
    throw new Error(`không phải số thập phân: ${JSON.stringify(v)}`);
  }
  return {
    am: m[1] === "-",
    nguyen: (m[2] === "" ? "0" : m[2]).replace(/^0+(?=\d)/, ""),
    le: (m[3] ?? "").replace(/0+$/, ""),
  };
}

function soSanhDoLon(a: Phan, b: Phan): -1 | 0 | 1 {
  // So độ dài phần nguyên TRƯỚC: "2" dài 1, "10" dài 2, nên 2 < 10.
  // So chuỗi thẳng sẽ ra "2" > "10" vì thứ tự từ điển.
  if (a.nguyen.length !== b.nguyen.length) return a.nguyen.length > b.nguyen.length ? 1 : -1;
  if (a.nguyen !== b.nguyen) return a.nguyen > b.nguyen ? 1 : -1;
  const n = Math.max(a.le.length, b.le.length);
  const la = a.le.padEnd(n, "0");
  const lb = b.le.padEnd(n, "0");
  if (la === lb) return 0;
  return la > lb ? 1 : -1;
}

/** So sánh hai số thập phân dạng chuỗi, không đi qua Number. */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const A = tach(a);
  const B = tach(b);
  const aKhong = A.nguyen === "0" && A.le === "";
  const bKhong = B.nguyen === "0" && B.le === "";
  if (aKhong && bKhong) return 0; // "0" và "-0" bằng nhau
  if (A.am !== B.am) return A.am ? -1 : 1;
  const d = soSanhDoLon(A, B);
  return A.am ? ((-d) as -1 | 0 | 1) : d;
}

// Intl.NumberFormat.prototype.format nhận CHUỖI từ ES2023, chính là để không
// mất độ chính xác. Kiểu của TypeScript còn khai báo number|bigint nên phải ép.
const DINH_DANG = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 20 });

export function formatMoney(value: string, currency?: string): string {
  const so = DINH_DANG.format(value as unknown as number);
  return currency ? `${so} ${currency}` : so;
}
```

- [ ] **Step 4: Chạy, xác nhận XANH**

Run: `cd frontend && npx vitest run src/lib/decimal.test.ts`
Expected: PASS.

- [ ] **Step 5: Viết test ĐỎ cho `format.ts`**

`frontend/src/lib/format.test.ts`:

```ts
import { formatDateOnly } from "./format";

test("ngày YYYY-MM-DD hiện theo DD/MM/YYYY", () => {
  expect(formatDateOnly("2026-03-01")).toBe("01/03/2026");
});

// Cái bẫy: new Date("2026-03-01") là nửa đêm UTC. Ở mọi offset ÂM nó lùi
// một ngày khi hiển thị. `date` của cash flow không có giờ, nên nó không
// được phép đi qua Date lần nào.
test("không lùi ngày dù máy đang ở múi giờ âm", () => {
  const tz = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    expect(formatDateOnly("2026-03-01")).toBe("01/03/2026");
  } finally {
    process.env.TZ = tz;
  }
});

test("chuỗi không đúng dạng thì trả nguyên vẹn, không ném", () => {
  expect(formatDateOnly("linh tinh")).toBe("linh tinh");
  expect(formatDateOnly("")).toBe("");
});
```

- [ ] **Step 6: Chạy, xác nhận ĐỎ**

Run: `cd frontend && npx vitest run src/lib/format.test.ts`
Expected: FAIL — `Failed to resolve import "./format"`.

- [ ] **Step 7: Viết `frontend/src/lib/format.ts`**

```ts
const NGAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Định dạng chuỗi ngày `YYYY-MM-DD` (không có giờ) sang `DD/MM/YYYY`.
 *
 * Làm bằng thao tác chuỗi có chủ ý. `new Date("2026-03-01")` là nửa đêm UTC,
 * nên ở mọi múi giờ âm nó hiển thị thành ngày 28/02. Thời gian CÓ giờ
 * (entered_at của trade, Phase 3) mới dùng Intl.DateTimeFormat với timeZone
 * lấy từ account.
 */
export function formatDateOnly(iso: string): string {
  const m = NGAY.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
```

- [ ] **Step 8: Chạy, xác nhận XANH**

Run: `cd frontend && npx vitest run src/lib/format.test.ts`
Expected: PASS, 3 test.

- [ ] **Step 9: Thêm cổng cấm `Number(` vào `styleguard.test.ts`**

Thêm vào cuối file `frontend/src/test/styleguard.test.ts`:

```ts
// Quy tắc số 1 của CLAUDE.md ở phía frontend. Backend gửi tiền dưới dạng
// chuỗi chính vì float làm mất chữ số; ép sang Number ở FE là ném đi đúng
// thứ backend đã cố giữ.
test("không ép tiền sang Number", () => {
  expect(fileCuaMinh.length).toBeGreaterThan(0);
  for (const f of fileCuaMinh) {
    expect(
      readFileSync(f, "utf8"),
      `${f} dùng Number(/parseFloat(/parseInt(; tiền phải ở dạng chuỗi, xem src/lib/decimal.ts`,
    ).not.toMatch(/\b(?:Number|parseFloat|parseInt)\(/);
  }
});
```

- [ ] **Step 10: Chạy, sửa những chỗ vi phạm nếu có**

Run: `cd frontend && npx vitest run src/test/styleguard.test.ts`
Expected: PASS, 3 test. Nếu có file bị nêu tên thì viết lại chỗ đó bằng `shiftDecimal`.

- [ ] **Step 11: FALSIFY cổng mới**

```bash
cd frontend
printf 'export const x = Number("1.5");\n' > src/lib/tam.ts
npx vitest run src/test/styleguard.test.ts   # PHẢI ĐỎ, nêu tên tam.ts
rm src/lib/tam.ts
npx vitest run src/test/styleguard.test.ts   # xanh trở lại
```

- [ ] **Step 12: Chạy toàn bộ và commit**

Run: `make test-fe`

```bash
git add frontend/src/lib frontend/src/test
git commit -m "feat(fe): add string-decimal helpers and a guard against Number() on money"
```

---

### Task 5: `session.ts` + `api.ts` — cửa duy nhất ra mạng

Đây là task quan trọng nhất của plan. Đọc §5 của spec trước khi bắt đầu.

**Files:**
- Create: `frontend/src/lib/session.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/api.test.ts`
- Create: `frontend/src/test/server.ts`
- Modify: `frontend/src/test/setup.ts`

**Interfaces:**
- Consumes: `VITE_API_BASE_URL` (Task 1 đã đặt `http://localhost/api` cho test).
- Produces:
  - `type User = { id: number; email: string }`; `type Session = { access_token: string; user: User }`
  - `getAccessToken(): string | null`; `getUser(): User | null`; `setSession(token, user)`; `clearSession()`; `setOnSessionDead(cb | null)`; `fireSessionDead()`
  - `class ApiError extends Error { code: number; msg: string; status: number }`
  - `refreshSession(): Promise<boolean>`; `bootstrapSession(): Promise<boolean>`
  - `api.get<T>(path)`, `api.post<T>(path, body?)`, `api.patch<T>(path, body)`, `api.del<T>(path)`
  - `__resetApiForTest()` — chỉ dùng trong test
  - `server` từ `@/test/server` — MSW server dùng chung

- [ ] **Step 1: Dựng MSW**

`frontend/src/test/server.ts`:

```ts
import { setupServer } from "msw/node";

export const server = setupServer();
```

Thay `frontend/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

// onUnhandledRequest: "error" là có chủ ý. Một request lọt ra ngoài mà im
// lặng sẽ biến thành test xanh vì lý do sai.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 2: Viết test ĐỎ cho `api.ts`**

`frontend/src/lib/api.test.ts`:

```ts
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { api, ApiError, __resetApiForTest } from "./api";
import { clearSession, getAccessToken, setOnSessionDead, setSession } from "./session";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });
const loi = (code: number, msg: string, status: number) =>
  HttpResponse.json({ code, msg, data: null }, { status });

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setOnSessionDead(null);
});

test("bóc envelope và trả về data", async () => {
  server.use(http.get(`${BASE}/accounts`, () => phongBi([{ id: 1 }])));
  await expect(api.get("/accounts")).resolves.toEqual([{ id: 1 }]);
});

test("code khác 0 thành ApiError mang cả code lẫn msg của backend", async () => {
  server.use(http.post(`${BASE}/auth/register`, () => loi(1403, "đã có tài khoản, đăng ký đã đóng", 403)));
  const err = await api.post("/auth/register", {}).catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.code).toBe(1403);
  expect(err.msg).toBe("đã có tài khoản, đăng ký đã đóng");
  expect(err.status).toBe(403);
});

// nginx trả 502 với body HTML là chuyện có thật. JSON.parse sẽ ném
// SyntaxError, và mọi chỗ bắt lỗi ở FE lại đang trông chờ ApiError.
test("body không phải JSON vẫn thành ApiError chứ không phải SyntaxError", async () => {
  server.use(http.get(`${BASE}/accounts`, () => new HttpResponse("<html>502</html>", { status: 502 })));
  const err = await api.get("/accounts").catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.code).toBe(1500);
});

test("JSON hợp lệ nhưng không phải envelope cũng thành ApiError", async () => {
  server.use(http.get(`${BASE}/accounts`, () => HttpResponse.json({ chao: "ban" })));
  await expect(api.get("/accounts")).rejects.toBeInstanceOf(ApiError);
});

test("gắn Authorization khi đã có token", async () => {
  let header: string | null = null;
  server.use(
    http.get(`${BASE}/accounts`, ({ request }) => {
      header = request.headers.get("Authorization");
      return phongBi([]);
    }),
  );
  setSession("abc", { id: 1, email: "a@b.c" });
  await api.get("/accounts");
  expect(header).toBe("Bearer abc");
});

test("401 thì refresh rồi thử lại đúng một lần", async () => {
  let soLanGoiAccounts = 0;
  let conHan = false;
  server.use(
    http.post(`${BASE}/auth/refresh`, () => {
      conHan = true;
      return phongBi({ access_token: "moi", user: { id: 1, email: "a@b.c" } });
    }),
    http.get(`${BASE}/accounts`, () => {
      soLanGoiAccounts++;
      return conHan ? phongBi([{ id: 7 }]) : loi(1401, "hết hạn", 401);
    }),
  );
  setSession("cu", { id: 1, email: "a@b.c" });

  await expect(api.get("/accounts")).resolves.toEqual([{ id: 7 }]);
  expect(soLanGoiAccounts).toBe(2);
  expect(getAccessToken()).toBe("moi");
});

// ĐÂY LÀ BÀI TEST ĐẮT NHẤT CỦA PLAN.
// Backend xoay vòng refresh token và phát hiện tái sử dụng: hai refresh
// song song mang CÙNG một cookie thì cái thứ hai bị đọc là replay và
// backend thu hồi MỌI phiên của user. Không có khoá single-flight thì
// app tự sát ngay lần đầu có nhiều query cùng hết hạn.
test("năm request song song cùng ăn 401 chỉ gây ĐÚNG MỘT lần refresh", async () => {
  let soLanRefresh = 0;
  let conHan = false;
  server.use(
    http.post(`${BASE}/auth/refresh`, async () => {
      soLanRefresh++;
      // Giữ cửa sổ song song mở, đúng như mạng thật.
      await new Promise((r) => setTimeout(r, 20));
      conHan = true;
      return phongBi({ access_token: "moi", user: { id: 1, email: "a@b.c" } });
    }),
    http.get(`${BASE}/accounts`, () => (conHan ? phongBi([]) : loi(1401, "hết hạn", 401))),
  );
  setSession("cu", { id: 1, email: "a@b.c" });

  await Promise.all(Array.from({ length: 5 }, () => api.get("/accounts")));

  expect(soLanRefresh).toBe(1);
});

test("refresh thất bại thì báo phiên chết và ném lại đúng lỗi gốc", async () => {
  let daBaoChet = false;
  server.use(
    http.post(`${BASE}/auth/refresh`, () => loi(1401, "phiên đăng nhập không hợp lệ, đăng nhập lại", 401)),
    http.get(`${BASE}/accounts`, () => loi(1401, "hết hạn", 401)),
  );
  setOnSessionDead(() => { daBaoChet = true; });
  setSession("cu", { id: 1, email: "a@b.c" });

  const err = await api.get("/accounts").catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.code).toBe(1401);
  expect(daBaoChet).toBe(true);
  expect(getAccessToken()).toBeNull();
});

// Sai mật khẩu trả 401. Nếu đường /auth/* cũng được tự refresh thì mỗi lần
// gõ sai mật khẩu sẽ bắn thêm một refresh vô nghĩa, và với backend có phát
// hiện tái sử dụng thì đó là rủi ro thật chứ không chỉ là lãng phí.
test("401 trên đường /auth/* KHÔNG kích refresh", async () => {
  let soLanRefresh = 0;
  server.use(
    http.post(`${BASE}/auth/refresh`, () => { soLanRefresh++; return phongBi(null); }),
    http.post(`${BASE}/auth/login`, () => loi(1401, "email hoặc mật khẩu không đúng", 401)),
  );

  await expect(api.post("/auth/login", { email: "a@b.c", password: "sai" })).rejects.toBeInstanceOf(ApiError);
  expect(soLanRefresh).toBe(0);
});
```

- [ ] **Step 3: Chạy, xác nhận ĐỎ**

Run: `cd frontend && npx vitest run src/lib/api.test.ts`
Expected: FAIL — `Failed to resolve import "./api"`.

- [ ] **Step 4: Viết `frontend/src/lib/session.ts`**

```ts
// Access token sống ở đây, trong một biến cấp module — KHÔNG phải state
// React, KHÔNG phải localStorage (spec mẹ §7.2). Cấp module là điều kiện
// để api.ts khoá được refresh, vì khoá phải sống lâu hơn vòng đời component.

export type User = { id: number; email: string };

let accessToken: string | null = null;
let user: User | null = null;
let baoChet: (() => void) | null = null;

export const getAccessToken = (): string | null => accessToken;
export const getUser = (): User | null => user;

export function setSession(token: string, u: User): void {
  accessToken = token;
  user = u;
}

export function clearSession(): void {
  accessToken = null;
  user = null;
}

/** AuthProvider đăng ký hàm này để dọn cache và đẩy về /login. */
export function setOnSessionDead(cb: (() => void) | null): void {
  baoChet = cb;
}

export function fireSessionDead(): void {
  clearSession();
  baoChet?.();
}
```

- [ ] **Step 5: Viết `frontend/src/lib/api.ts`**

```ts
import { clearSession, fireSessionDead, getAccessToken, setSession, type User } from "./session";

export class ApiError extends Error {
  constructor(
    readonly code: number,
    readonly msg: string,
    readonly status: number,
  ) {
    super(msg);
    this.name = "ApiError";
  }
}

export type Session = { access_token: string; user: User };

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

// Bốn đường này LÀ cơ chế auth, nên không được tự refresh khi gặp 401.
const DUONG_AUTH = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

let inflight: Promise<boolean> | null = null;
let khoiDong: Promise<boolean> | null = null;

async function goi(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // same-origin: cookie refresh có Path=/api/auth và chỉ đi khi cùng origin.
  return fetch(`${BASE}${path}`, { ...init, headers, credentials: "same-origin" });
}

async function boc<T>(res: Response): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(1500, "máy chủ trả về dữ liệu không đọc được", res.status);
  }
  const e = body as { code?: unknown; msg?: unknown; data?: unknown };
  if (typeof e?.code !== "number") {
    throw new ApiError(1500, "máy chủ trả về dữ liệu sai định dạng", res.status);
  }
  if (e.code !== 0) {
    throw new ApiError(e.code, typeof e.msg === "string" ? e.msg : "lỗi không rõ", res.status);
  }
  return e.data as T;
}

/**
 * Xoay refresh token. GUARD ĐÚNG/SAI: `inflight` gộp mọi lần gọi song song
 * vào MỘT request. Backend phát hiện tái sử dụng — hai refresh song song
 * mang cùng một cookie sẽ bị đọc là replay và giết sạch mọi phiên của user.
 */
export function refreshSession(): Promise<boolean> {
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const s = await boc<Session>(await goi("/auth/refresh", { method: "POST" }));
      setSession(s.access_token, s.user);
      return true;
    } catch {
      clearSession();
      return false;
    } finally {
      if (inflight === p) inflight = null;
    }
  })();
  inflight = p;
  return p;
}

/**
 * Khôi phục phiên lúc mở app. Ghi nhớ kết quả để StrictMode gọi effect hai
 * lần cũng chỉ xoay một vòng. Đây CHỈ là vệ sinh, không phải guard đúng/sai:
 * một lần xoay thừa vẫn hợp lệ vì cookie đã đổi. Đừng viết test kiểu "gỡ
 * biến này thì phiên phải chết" — nó sẽ không chết.
 */
export function bootstrapSession(): Promise<boolean> {
  khoiDong ??= refreshSession();
  return khoiDong;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await goi(path, init);
  const laAuth = DUONG_AUTH.some((p) => path.startsWith(p));
  if (res.status !== 401 || laAuth) return boc<T>(res);

  const ok = await refreshSession();
  if (!ok) {
    fireSessionDead();
    return boc<T>(res); // ném lại chính lỗi 1401 gốc, chưa đọc body lần nào
  }
  // `init` phải dùng lại được: body luôn là chuỗi, không bao giờ là stream.
  return boc<T>(await goi(path, init));
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

/** Chỉ dùng trong test: xoá khoá giữa các case. */
export function __resetApiForTest(): void {
  inflight = null;
  khoiDong = null;
}
```

- [ ] **Step 6: Chạy, xác nhận XANH**

Run: `cd frontend && npx vitest run src/lib/api.test.ts`
Expected: PASS, 9 test.

- [ ] **Step 7: FALSIFY khoá single-flight**

```bash
cd frontend
# Gỡ dòng `if (inflight) return inflight;` trong src/lib/api.ts
npx vitest run src/lib/api.test.ts -t "song song"
```

Expected: ĐỎ với `expected 5 to be 1`. Khôi phục lại dòng đó và chạy lại để thấy xanh. Dán cả hai output.

Nếu nó **không** đỏ thì test đang sai chứ không phải code đang đúng — nhiều khả năng độ trễ 20ms đã bị bỏ, làm năm request không còn chồng lấn nữa.

- [ ] **Step 8: FALSIFY danh sách `DUONG_AUTH`**

```bash
cd frontend
# Đổi DUONG_AUTH thành mảng rỗng: []
npx vitest run src/lib/api.test.ts -t "KHÔNG kích refresh"
```

Expected: ĐỎ với `expected 0 to be 1`. Khôi phục.

- [ ] **Step 9: Chạy toàn bộ và commit**

Run: `make test-fe`

```bash
git add frontend/src/lib/session.ts frontend/src/lib/api.ts frontend/src/lib/api.test.ts frontend/src/test
git commit -m "feat(fe): add api client with envelope unwrap and single-flight refresh"
```

---

### Task 6: `AuthProvider` + `RequireAuth` — khôi phục phiên sau F5

**Files:**
- Create: `frontend/src/features/auth/AuthProvider.tsx`, `frontend/src/features/auth/RequireAuth.tsx`, `frontend/src/features/auth/auth.test.tsx`

**Interfaces:**
- Consumes: `api`, `bootstrapSession`, `Session` (Task 5); `setOnSessionDead`, `setSession`, `clearSession`, `getUser`, `User` (Task 5).
- Produces:
  - `type AuthStatus = "loading" | "authed" | "anon"`
  - `<AuthProvider>{children}</AuthProvider>` — phải nằm trong `QueryClientProvider`
  - `useAuth(): { status, user, login(email,password), register(email,password), logout() }`
  - `<RequireAuth>{children}</RequireAuth>` và `<OnlyAnon>{children}</OnlyAnon>`

- [ ] **Step 1: Viết test ĐỎ**

`frontend/src/features/auth/auth.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, fireSessionDead } from "@/lib/session";
import { AuthProvider } from "./AuthProvider";
import { RequireAuth } from "./RequireAuth";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });
const phien = { access_token: "abc", user: { id: 1, email: "toi@example.com" } };

beforeEach(() => {
  clearSession();
  __resetApiForTest();
});

function dungApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/accounts"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>TRANG LOGIN</div>} />
            <Route
              path="/accounts"
              element={
                <RequireAuth>
                  <div>NỘI DUNG RIÊNG</div>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

// BÀI TEST QUAN TRỌNG NHẤT CỦA TASK NÀY.
// Khi refresh còn đang bay, trạng thái là "loading" — CHƯA biết đã đăng nhập
// hay chưa. Redirect lúc này là bug kinh điển: F5 trên /accounts sẽ văng sang
// /login trước khi máy chủ kịp trả lời, và người dùng thấy mình bị đăng xuất
// mỗi lần refresh trang dù phiên vẫn còn nguyên.
test("đang khôi phục phiên thì hiện splash, TUYỆT ĐỐI không đẩy sang /login", async () => {
  server.use(http.post(`${BASE}/auth/refresh`, () => new Promise<never>(() => {})));
  dungApp();

  expect(await screen.findByRole("status")).toHaveTextContent(/khôi phục phiên/i);
  expect(screen.queryByText("TRANG LOGIN")).not.toBeInTheDocument();
  expect(screen.queryByText("NỘI DUNG RIÊNG")).not.toBeInTheDocument();
});

test("refresh thành công thì vào thẳng nội dung riêng", async () => {
  server.use(http.post(`${BASE}/auth/refresh`, () => phongBi(phien)));
  dungApp();
  expect(await screen.findByText("NỘI DUNG RIÊNG")).toBeInTheDocument();
});

test("refresh thất bại thì sang /login", async () => {
  server.use(
    http.post(`${BASE}/auth/refresh`, () =>
      HttpResponse.json({ code: 1401, msg: "phiên đăng nhập không hợp lệ, đăng nhập lại", data: null }, { status: 401 }),
    ),
  );
  dungApp();
  expect(await screen.findByText("TRANG LOGIN")).toBeInTheDocument();
});

// Cache của TanStack Query giữ dữ liệu của user cũ. Không dọn thì user sau
// đăng nhập vào sẽ thấy chớp qua danh sách account của user trước.
test("phiên chết giữa chừng thì dọn cache và sang /login", async () => {
  server.use(http.post(`${BASE}/auth/refresh`, () => phongBi(phien)));
  const qc = dungApp();
  await screen.findByText("NỘI DUNG RIÊNG");

  qc.setQueryData(["accounts"], [{ id: 1 }]);
  fireSessionDead();

  expect(await screen.findByText("TRANG LOGIN")).toBeInTheDocument();
  await waitFor(() => expect(qc.getQueryData(["accounts"])).toBeUndefined());
});
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd frontend && npx vitest run src/features/auth/auth.test.tsx`
Expected: FAIL — `Failed to resolve import "./AuthProvider"`.

- [ ] **Step 3: Viết `frontend/src/features/auth/AuthProvider.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, bootstrapSession, type Session } from "@/lib/api";
import { clearSession, getUser, setOnSessionDead, setSession, type User } from "@/lib/session";

export type AuthStatus = "loading" | "authed" | "anon";

type AuthValue = {
  status: AuthStatus;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth phải nằm trong AuthProvider");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const qc = useQueryClient();

  // Khôi phục phiên lúc mở app. Access token chỉ ở memory nên mỗi lần F5 là
  // mất; cookie refresh (HttpOnly) là thứ duy nhất còn lại để dựng phiên dậy.
  useEffect(() => {
    let con = true;
    void bootstrapSession().then((ok) => {
      if (!con) return;
      setUser(ok ? getUser() : null);
      setStatus(ok ? "authed" : "anon");
    });
    return () => {
      con = false;
    };
  }, []);

  useEffect(() => {
    setOnSessionDead(() => {
      qc.clear();
      setUser(null);
      setStatus("anon");
    });
    return () => setOnSessionDead(null);
  }, [qc]);

  const nhanPhien = useCallback((s: Session) => {
    setSession(s.access_token, s.user);
    setUser(s.user);
    setStatus("authed");
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      nhanPhien(await api.post<Session>("/auth/login", { email, password }));
    },
    [nhanPhien],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      nhanPhien(await api.post<Session>("/auth/register", { email, password }));
    },
    [nhanPhien],
  );

  // finally: kể cả khi máy chủ không trả lời, phía client vẫn phải sạch.
  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      clearSession();
      qc.clear();
      setUser(null);
      setStatus("anon");
    }
  }, [qc]);

  const value = useMemo(
    () => ({ status, user, login, register, logout }),
    [status, user, login, register, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 4: Viết `frontend/src/features/auth/RequireAuth.tsx`**

```tsx
import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "./AuthProvider";

function Splash() {
  return (
    <div
      role="status"
      className="flex min-h-dvh items-center justify-center text-muted-foreground"
    >
      Đang khôi phục phiên…
    </div>
  );
}

/**
 * `loading` PHẢI render splash, không được redirect.
 *
 * Lúc đó ta chưa biết người dùng đã đăng nhập hay chưa — refresh còn đang
 * bay. Đẩy sang /login ở nhánh này làm mọi lần F5 trông như bị đăng xuất.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "anon") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Ngược lại: đã đăng nhập thì không cho vào /login, /register nữa. */
export function OnlyAnon({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <Splash />;
  if (status === "authed") return <Navigate to="/accounts" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 5: Chạy, xác nhận XANH**

Run: `cd frontend && npx vitest run src/features/auth/auth.test.tsx`
Expected: PASS, 4 test.

- [ ] **Step 6: FALSIFY nhánh splash**

```bash
cd frontend
# Trong RequireAuth.tsx, xoá dòng `if (status === "loading") return <Splash />;`
npx vitest run src/features/auth/auth.test.tsx -t "splash"
```

Expected: ĐỎ — `TRANG LOGIN` xuất hiện, đúng cái bug mà nhánh này chặn. Khôi phục rồi chạy lại. Dán cả hai output.

- [ ] **Step 7: FALSIFY việc dọn cache**

```bash
cd frontend
# Trong AuthProvider.tsx, xoá `qc.clear();` trong callback setOnSessionDead
npx vitest run src/features/auth/auth.test.tsx -t "phiên chết"
```

Expected: ĐỎ — `qc.getQueryData(["accounts"])` vẫn còn dữ liệu cũ. Khôi phục.

- [ ] **Step 8: Chạy toàn bộ và commit**

Run: `make test-fe`

```bash
git add frontend/src/features/auth
git commit -m "feat(fe): add AuthProvider and route guards that survive a page reload"
```

---

### Task 7: Router + trang đăng nhập, đăng ký

**Files:**
- Create: `frontend/src/app/providers.tsx`, `frontend/src/app/router.tsx`, `frontend/src/app/router.test.tsx`
- Create: `frontend/src/features/auth/CredentialsForm.tsx`, `frontend/src/features/auth/LoginPage.tsx`, `frontend/src/features/auth/RegisterPage.tsx`
- Create: `frontend/src/features/accounts/AccountsPage.tsx` (bản tối thiểu; Task 9 đắp tiếp)
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `useAuth`, `RequireAuth`, `OnlyAnon` (Task 6); `ApiError` (Task 5); `Button`, `Input`, `Label`, `Card` (Task 3).
- Produces: `<Providers>`; `<AppRoutes />`; `credentialsSchema`; `type Credentials = { email: string; password: string }`; `<AccountsPage />`.

- [ ] **Step 1: Viết test ĐỎ**

`frontend/src/app/router.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { AppRoutes } from "./router";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });
const loi = (code: number, msg: string, status: number) =>
  HttpResponse.json({ code, msg, data: null }, { status });
const chuaDangNhap = http.post(`${BASE}/auth/refresh`, () =>
  loi(1401, "phiên đăng nhập không hợp lệ, đăng nhập lại", 401),
);

beforeEach(() => {
  clearSession();
  __resetApiForTest();
});

function dung(duong: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[duong]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("chưa đăng nhập, vào / thì kết cục là trang đăng nhập", async () => {
  server.use(chuaDangNhap);
  dung("/");
  expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
});

// Backend đã trả tiếng Việt hiển thị được. FE viết lại câu này là tạo nguồn
// sự thật thứ hai, và hai nguồn sẽ lệch nhau.
test("hiện NGUYÊN VĂN msg của backend khi sai mật khẩu", async () => {
  server.use(chuaDangNhap, http.post(`${BASE}/auth/login`, () => loi(1401, "email hoặc mật khẩu không đúng", 401)));
  dung("/login");
  await screen.findByRole("heading", { name: "Đăng nhập" });

  await userEvent.type(screen.getByLabelText("Email"), "toi@example.com");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "matkhausai");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

  expect(await screen.findByText("email hoặc mật khẩu không đúng")).toBeInTheDocument();
});

test("đăng nhập thành công thì vào trang tài khoản", async () => {
  server.use(
    chuaDangNhap,
    http.post(`${BASE}/auth/login`, () => phongBi({ access_token: "abc", user: { id: 1, email: "toi@example.com" } })),
    http.get(`${BASE}/accounts`, () => phongBi([])),
  );
  dung("/login");
  await screen.findByRole("heading", { name: "Đăng nhập" });

  await userEvent.type(screen.getByLabelText("Email"), "toi@example.com");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "matkhaudung");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

  expect(await screen.findByRole("heading", { name: "Tài khoản giao dịch" })).toBeInTheDocument();
});

// Ngưỡng 8 lấy từ backend (service/auth.go:25). Chặn ở FE là để phản hồi
// nhanh; MSW đang bật onUnhandledRequest:"error" nên nếu có request lọt ra
// thì test này đỏ — tức là nó cũng chứng minh luôn rằng KHÔNG có request nào.
test("mật khẩu ngắn bị chặn ngay ở client", async () => {
  server.use(chuaDangNhap);
  dung("/login");
  await screen.findByRole("heading", { name: "Đăng nhập" });

  await userEvent.type(screen.getByLabelText("Email"), "toi@example.com");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "ngan");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

  expect(await screen.findByText("mật khẩu phải dài ít nhất 8 ký tự")).toBeInTheDocument();
});

// Đăng ký chỉ mở cho user đầu tiên (quyết định #4 của spec 2a).
test("đăng ký khi đã đóng thì hiện msg của backend kèm lối sang đăng nhập", async () => {
  server.use(
    chuaDangNhap,
    http.post(`${BASE}/auth/register`, () => loi(1403, "đã có tài khoản, đăng ký đã đóng", 403)),
  );
  dung("/register");
  await screen.findByRole("heading", { name: "Đăng ký" });

  await userEvent.type(screen.getByLabelText("Email"), "toi@example.com");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "matkhaudai");
  await userEvent.click(screen.getByRole("button", { name: "Đăng ký" }));

  expect(await screen.findByText("đã có tài khoản, đăng ký đã đóng")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /đăng nhập/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd frontend && npx vitest run src/app/router.test.tsx`
Expected: FAIL — `Failed to resolve import "./router"`.

- [ ] **Step 3: `frontend/src/features/auth/CredentialsForm.tsx`**

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Ngưỡng lấy từ backend (service/auth.go:25 minPasswordLen = 8). Validate ở
// đây là để phản hồi nhanh, KHÔNG phải để thay backend.
export const credentialsSchema = z.object({
  email: z.string().min(1, "email không được để trống").email("email không hợp lệ"),
  password: z.string().min(8, "mật khẩu phải dài ít nhất 8 ký tự"),
});

export type Credentials = z.infer<typeof credentialsSchema>;

type Props = {
  nhanNut: string;
  dangGui: boolean;
  loi: string | null;
  onSubmit: (v: Credentials) => void;
};

export function CredentialsForm({ nhanNut, dangGui, loi, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  return (
    // noValidate: để zod là nơi duy nhất quyết định thông báo lỗi, thay vì
    // trình duyệt chen ngang bằng tooltip tiếng Anh của riêng nó.
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && (
          <p role="alert" className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Mật khẩu</Label>
        <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
        {errors.password && (
          <p role="alert" className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>

      {loi && <p role="alert" className="text-sm text-destructive">{loi}</p>}

      <Button type="submit" disabled={dangGui}>
        {dangGui ? "Đang gửi…" : nhanNut}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: `frontend/src/features/auth/LoginPage.tsx`**

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { ApiError } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuth } from "./AuthProvider";
import { CredentialsForm, type Credentials } from "./CredentialsForm";

export function LoginPage() {
  const { login } = useAuth();
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  async function gui(v: Credentials) {
    setLoi(null);
    setDangGui(true);
    try {
      await login(v.email, v.password);
      // Không tự điều hướng: status chuyển sang "authed" và OnlyAnon trong
      // router lo việc đó. Một luật, một nơi.
    } catch (e) {
      setLoi(e instanceof ApiError ? e.msg : "không kết nối được máy chủ");
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* h1 thẳng, không bọc CardTitle asChild: CardTitle của shadcn là
              một <div> thường, không dựng trên Slot, nên asChild sẽ hỏng. */}
          <h1 className="text-lg font-semibold">Đăng nhập</h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CredentialsForm nhanNut="Đăng nhập" dangGui={dangGui} loi={loi} onSubmit={gui} />
          <p className="text-sm text-muted-foreground">
            Chưa có tài khoản? <Link to="/register" className="text-primary underline">Đăng ký</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: `frontend/src/features/auth/RegisterPage.tsx`**

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { ApiError } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuth } from "./AuthProvider";
import { CredentialsForm, type Credentials } from "./CredentialsForm";

export function RegisterPage() {
  const { register } = useAuth();
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  async function gui(v: Credentials) {
    setLoi(null);
    setDangGui(true);
    try {
      await register(v.email, v.password);
    } catch (e) {
      // 1403 "đã có tài khoản, đăng ký đã đóng" là đường đi BÌNH THƯỜNG ở
      // đây, không phải sự cố: đăng ký chỉ mở cho user đầu tiên.
      setLoi(e instanceof ApiError ? e.msg : "không kết nối được máy chủ");
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-lg font-semibold">Đăng ký</h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CredentialsForm nhanNut="Đăng ký" dangGui={dangGui} loi={loi} onSubmit={gui} />
          <p className="text-sm text-muted-foreground">
            Đã có tài khoản? <Link to="/login" className="text-primary underline">Đăng nhập</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: `frontend/src/features/accounts/AccountsPage.tsx` (bản tối thiểu)**

```tsx
export function AccountsPage() {
  return <h1 className="text-xl font-semibold">Tài khoản giao dịch</h1>;
}
```

Task 9 đắp bảng và dialog vào đây.

- [ ] **Step 7: `frontend/src/app/router.tsx`**

```tsx
import { Navigate, Route, Routes } from "react-router";
import { OnlyAnon, RequireAuth } from "@/features/auth/RequireAuth";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { AccountsPage } from "@/features/accounts/AccountsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<OnlyAnon><LoginPage /></OnlyAnon>} />
      <Route path="/register" element={<OnlyAnon><RegisterPage /></OnlyAnon>} />
      <Route path="/accounts" element={<RequireAuth><AccountsPage /></RequireAuth>} />
      {/* 2b chưa có dashboard, nên gốc đi thẳng vào accounts. */}
      <Route path="*" element={<Navigate to="/accounts" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 8: `frontend/src/app/providers.tsx`**

```tsx
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/features/auth/AuthProvider";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // retry: false có chủ ý. api.ts đã tự lo 401 -> refresh -> thử
            // lại; để Query thử lại nữa là nhân bản số lần refresh, mà
            // backend có phát hiện tái sử dụng token.
            retry: false,
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 9: Thay `frontend/src/App.tsx` và xoá `App.test.tsx`**

```tsx
import { BrowserRouter } from "react-router";
import { Providers } from "./app/providers";
import { AppRoutes } from "./app/router";

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <AppRoutes />
      </Providers>
    </BrowserRouter>
  );
}
```

```bash
rm frontend/src/App.test.tsx
```

Xoá có lý do, không phải để né: `App` giờ chỉ là keo dán `BrowserRouter` + `Providers` + `AppRoutes`, và `BrowserRouter` dùng history thật nên `MemoryRouter` không lồng vào được. Toàn bộ hành vi đáng test đã chuyển sang `router.test.tsx`, nơi test được nhiều đường hơn hẳn.

- [ ] **Step 10: Chạy, xác nhận XANH**

Run: `cd frontend && npx vitest run src/app/router.test.tsx`
Expected: PASS, 5 test.

- [ ] **Step 11: FALSIFY quy tắc "hiện msg của backend"**

```bash
cd frontend
# Trong LoginPage.tsx đổi setLoi(...) thành setLoi("đăng nhập thất bại");
npx vitest run src/app/router.test.tsx -t "NGUYÊN VĂN"
```

Expected: ĐỎ — không tìm thấy "email hoặc mật khẩu không đúng". Khôi phục.

- [ ] **Step 12: Chạy toàn bộ và commit**

Run: `make test-fe`

```bash
git add frontend/src frontend/src/app
git rm --cached frontend/src/App.test.tsx 2>/dev/null || true
git add -A frontend/src
git commit -m "feat(fe): add router with login and register pages"
```

---

### Task 8: App shell + đổi giao diện sáng/tối

**Files:**
- Create: `frontend/src/app/AppShell.tsx`, `frontend/src/components/ThemeToggle.tsx`, `frontend/src/app/shell.test.tsx`
- Modify: `frontend/src/app/router.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 6); `readStoredTheme`, `storeTheme`, `applyTheme`, `Theme` (Task 2); `Button` (Task 3).
- Produces: `<AppShell />` — route layout, render `<Outlet />`; `<ThemeToggle />`.

- [ ] **Step 1: Viết test ĐỎ**

`frontend/src/app/shell.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { THEME_KEY } from "@/lib/theme";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { AppRoutes } from "./router";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });
const phien = { access_token: "abc", user: { id: 1, email: "toi@example.com" } };

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

function dungDaDangNhap() {
  server.use(
    http.post(`${BASE}/auth/refresh`, () => phongBi(phien)),
    http.get(`${BASE}/accounts`, () => phongBi([])),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/accounts"]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("shell hiện email người dùng và điều hướng", async () => {
  dungDaDangNhap();
  expect(await screen.findByText("toi@example.com")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Tài khoản" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeInTheDocument();
});

test("đổi giao diện thì đổi data-theme và ghi vào localStorage", async () => {
  dungDaDangNhap();
  const nut = await screen.findByRole("button", { name: /giao diện sáng/i });

  await userEvent.click(nut);

  expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  expect(localStorage.getItem(THEME_KEY)).toBe("light");
});

// Máy chủ không trả lời cũng phải đăng xuất được. Nếu chỉ dọn phía client
// khi API trả 200 thì mất mạng đồng nghĩa với kẹt lại trong app.
test("đăng xuất được kể cả khi máy chủ trả 500", async () => {
  dungDaDangNhap();
  await screen.findByText("toi@example.com");
  server.use(
    http.post(`${BASE}/auth/logout`, () =>
      HttpResponse.json({ code: 1500, msg: "lỗi hệ thống", data: null }, { status: 500 }),
    ),
  );

  await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

  expect(await screen.findByRole("heading", { name: "Đăng nhập" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd frontend && npx vitest run src/app/shell.test.tsx`
Expected: FAIL — không tìm thấy `toi@example.com` (chưa có shell).

- [ ] **Step 3: `frontend/src/components/ThemeToggle.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { applyTheme, readStoredTheme, storeTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    storeTheme(theme);
  }, [theme]);

  const sangTiepTheo = theme === "dark";
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setTheme(sangTiepTheo ? "light" : "dark")}
    >
      {sangTiepTheo ? "Giao diện sáng" : "Giao diện tối"}
    </Button>
  );
}
```

- [ ] **Step 4: `frontend/src/app/AppShell.tsx`**

```tsx
import { NavLink, Outlet } from "react-router";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/utils";

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-dvh">
      {/*
        .horus-sidenav của theme CHỈ cấp token cục bộ (--sidebar-bg,
        --sidebar-text, --sidebar-active-bg…) và một border-right. Nó không
        phải shell dựng sẵn: chiều rộng, flex và cuộn vẫn phải tự đặt ở đây.
      */}
      <aside
        className="horus-sidenav flex w-60 shrink-0 flex-col gap-1 p-3"
        style={{ backgroundColor: "var(--sidebar-bg)" }}
      >
        <div className="px-2 py-3 font-semibold">Nhật ký giao dịch</div>

        <nav className="flex flex-col gap-1">
          <NavLink
            to="/accounts"
            className={({ isActive }) =>
              cn("rounded-md px-2 py-1.5 text-sm", isActive && "font-medium")
            }
            style={({ isActive }) =>
              isActive
                ? { backgroundColor: "var(--sidebar-active-bg)", color: "var(--sidebar-text-active)" }
                : { color: "var(--sidebar-text)" }
            }
          >
            Tài khoản
          </NavLink>
        </nav>

        <div className="mt-auto flex flex-col items-start gap-2 px-2 pb-2">
          <ThemeToggle />
          <span className="max-w-full truncate text-sm text-muted-foreground">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            Đăng xuất
          </Button>
        </div>
      </aside>

      <main className="horus-main min-w-0 flex-1">
        <div className="horus-page-body">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Cho `AppShell` thành route layout trong `frontend/src/app/router.tsx`**

```tsx
import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./AppShell";
import { OnlyAnon, RequireAuth } from "@/features/auth/RequireAuth";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { AccountsPage } from "@/features/accounts/AccountsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<OnlyAnon><LoginPage /></OnlyAnon>} />
      <Route path="/register" element={<OnlyAnon><RegisterPage /></OnlyAnon>} />

      {/* Route layout: guard chạy MỘT lần cho cả nhánh, Phase 3 và 4 chỉ
          cần thêm <Route> con vào đây. */}
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/accounts" element={<AccountsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/accounts" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 6: Chạy, xác nhận XANH**

Run: `cd frontend && npx vitest run src/app`
Expected: PASS — 5 test của `router.test.tsx` + 3 test của `shell.test.tsx`.

- [ ] **Step 7: FALSIFY `finally` của logout**

```bash
cd frontend
# Trong AuthProvider.tsx, đổi khối try/finally của logout thành:
#   await api.post("/auth/logout"); clearSession(); qc.clear(); setUser(null); setStatus("anon");
# (tức bỏ finally, để lỗi 500 làm dừng luôn phần dọn dẹp)
npx vitest run src/app/shell.test.tsx -t "500"
```

Expected: ĐỎ — vẫn ở trang tài khoản, không sang được `/login`. Khôi phục.

- [ ] **Step 8: Chạy toàn bộ và commit**

Run: `make test-fe`

```bash
git add frontend/src/app frontend/src/components/ThemeToggle.tsx
git commit -m "feat(fe): add app shell, sidenav and theme toggle"
```

---

### Task 9: Trang tài khoản — danh sách, tạo, sửa

**Files:**
- Create: `frontend/src/lib/queryKeys.ts`
- Create: `frontend/src/features/accounts/types.ts`, `frontend/src/features/accounts/hooks.ts`, `frontend/src/features/accounts/AccountFormDialog.tsx`, `frontend/src/features/accounts/accounts.test.tsx`
- Create: `frontend/src/components/MoneyText.tsx`
- Modify: `frontend/src/features/accounts/AccountsPage.tsx`

**Interfaces:**
- Consumes: `api` (Task 5); `formatMoney`, `percentFromFraction`, `fractionFromPercent`, `compareDecimal` (Task 4); `Button`, `Input`, `Label`, `Card`, `Table`, `Dialog` (Task 3).
- Produces:
  - `type Account = { id: number; code: string; name: string; initial_balance: string; risk_per_trade: string; currency: string; timezone: string; one_r: string }`
  - `qk.accounts`, `qk.cashFlows(accountId)`, `qk.metaEnums`
  - `useAccounts()`, `useCreateAccount()`, `useUpdateAccount()`
  - `<MoneyText value currency? />`

- [ ] **Step 1: Viết test ĐỎ**

`frontend/src/features/accounts/accounts.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { AccountsPage } from "./AccountsPage";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const mau = {
  id: 1,
  code: "FTMO",
  name: "Quỹ thử thách",
  initial_balance: "10000",
  risk_per_trade: "0.01",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  one_r: "100",
};

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
});

function dung() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("hiện risk dưới dạng % và one_r do backend tính", async () => {
  server.use(http.get(`${BASE}/accounts`, () => phongBi([mau])));
  dung();

  const dong = await screen.findByRole("row", { name: /FTMO/ });
  expect(within(dong).getByText("1%")).toBeInTheDocument();
  expect(within(dong).getByText(/100/)).toBeInTheDocument();
});

test("chưa có account nào thì mời tạo", async () => {
  server.use(http.get(`${BASE}/accounts`, () => phongBi([])));
  dung();
  expect(await screen.findByText(/chưa có tài khoản giao dịch nào/i)).toBeInTheDocument();
});

// Người dùng gõ % , backend nhận phân số. Đi qua float thì 0.29*100 ra
// 28.999999999999996 — nên chiều nào cũng phải dùng dịch dấu chấm.
test("tạo mới gửi risk dạng phân số, không phải %", async () => {
  let daGui: Record<string, unknown> | null = null;
  server.use(
    http.get(`${BASE}/accounts`, () => phongBi([])),
    http.post(`${BASE}/accounts`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      return phongBi({ ...mau, id: 2 });
    }),
  );
  dung();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const hop = await screen.findByRole("dialog");
  await userEvent.type(within(hop).getByLabelText("Mã tài khoản"), "FTMO");
  await userEvent.type(within(hop).getByLabelText("Tên"), "Quỹ thử thách");
  await userEvent.clear(within(hop).getByLabelText("Đơn vị tiền tệ"));
  await userEvent.type(within(hop).getByLabelText("Đơn vị tiền tệ"), "USD");
  await userEvent.type(within(hop).getByLabelText("Vốn ban đầu"), "10000");
  await userEvent.clear(within(hop).getByLabelText("Rủi ro mỗi lệnh (%)"));
  await userEvent.type(within(hop).getByLabelText("Rủi ro mỗi lệnh (%)"), "1");
  await userEvent.click(within(hop).getByRole("button", { name: "Lưu" }));

  await screen.findByRole("row", { name: /FTMO/ });
  expect(daGui).toMatchObject({ risk_per_trade: "0.01", initial_balance: "10000" });
});

// PATCH của backend dùng con trỏ: khoá VẮNG MẶT nghĩa là "không đổi".
// Gửi cả bảng lên là biến một lần sửa tên thành một lần ghi đè toàn bộ.
test("sửa chỉ gửi đúng field đã đổi", async () => {
  let daGui: Record<string, unknown> | null = null;
  server.use(
    http.get(`${BASE}/accounts`, () => phongBi([mau])),
    http.patch(`${BASE}/accounts/1`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      return phongBi({ ...mau, name: "Tên mới" });
    }),
  );
  dung();
  await screen.findByRole("row", { name: /FTMO/ });

  await userEvent.click(screen.getByRole("button", { name: "Sửa FTMO" }));
  const hop = await screen.findByRole("dialog");
  await userEvent.clear(within(hop).getByLabelText("Tên"));
  await userEvent.type(within(hop).getByLabelText("Tên"), "Tên mới");
  await userEvent.click(within(hop).getByRole("button", { name: "Lưu" }));

  await screen.findByRole("row", { name: /Tên mới/ });
  expect(daGui).toEqual({ name: "Tên mới" });
});

test("risk quá 100% bị chặn ở client", async () => {
  server.use(http.get(`${BASE}/accounts`, () => phongBi([])));
  dung();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const hop = await screen.findByRole("dialog");
  await userEvent.type(within(hop).getByLabelText("Mã tài khoản"), "X");
  await userEvent.type(within(hop).getByLabelText("Vốn ban đầu"), "1000");
  await userEvent.clear(within(hop).getByLabelText("Rủi ro mỗi lệnh (%)"));
  await userEvent.type(within(hop).getByLabelText("Rủi ro mỗi lệnh (%)"), "150");
  await userEvent.click(within(hop).getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText(/không được vượt quá 100/i)).toBeInTheDocument();
});

test("lỗi từ backend hiện nguyên văn trong hộp thoại", async () => {
  server.use(
    http.get(`${BASE}/accounts`, () => phongBi([])),
    http.post(`${BASE}/accounts`, () =>
      HttpResponse.json({ code: 1409, msg: "mã tài khoản đã tồn tại", data: null }, { status: 409 }),
    ),
  );
  dung();
  await screen.findByText(/chưa có tài khoản giao dịch nào/i);

  await userEvent.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
  const hop = await screen.findByRole("dialog");
  await userEvent.type(within(hop).getByLabelText("Mã tài khoản"), "FTMO");
  await userEvent.type(within(hop).getByLabelText("Vốn ban đầu"), "10000");
  await userEvent.click(within(hop).getByRole("button", { name: "Lưu" }));

  expect(await screen.findByText("mã tài khoản đã tồn tại")).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd frontend && npx vitest run src/features/accounts`
Expected: FAIL — chưa có bảng, chưa có nút "Thêm tài khoản".

- [ ] **Step 3: `frontend/src/lib/queryKeys.ts`**

```ts
// Query key tập trung một chỗ. Phase 3 và 4 sẽ thêm key của trades, stats,
// charts vào đây — để không ai tự chế key lệch nhau rồi invalidate hụt.
export const qk = {
  accounts: ["accounts"] as const,
  cashFlows: (accountId: number) => ["accounts", accountId, "cash-flows"] as const,
  metaEnums: ["meta", "enums"] as const,
};
```

- [ ] **Step 4: `frontend/src/features/accounts/types.ts`**

```ts
// Mọi trường tiền là CHUỖI. Backend marshal decimal ra chuỗi JSON chính vì
// float làm mất chữ số; khai kiểu number ở đây là ném đi điều đó ngay tại
// ranh giới.
export type Account = {
  id: number;
  code: string;
  name: string;
  initial_balance: string;
  risk_per_trade: string; // phân số: "0.01" là 1%
  currency: string;
  timezone: string;
  one_r: string; // suy diễn, backend tính
};

export type AccountCreate = {
  code: string;
  name: string;
  currency: string;
  timezone: string;
  initial_balance: string;
  risk_per_trade: string;
};

export type AccountPatch = Partial<AccountCreate>;
```

- [ ] **Step 5: `frontend/src/features/accounts/hooks.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { Account, AccountCreate, AccountPatch } from "./types";

export function useAccounts() {
  return useQuery({ queryKey: qk.accounts, queryFn: () => api.get<Account[]>("/accounts") });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: AccountCreate) => api.post<Account>("/accounts", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.accounts }),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: AccountPatch }) =>
      api.patch<Account>(`/accounts/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.accounts }),
  });
}
```

- [ ] **Step 6: `frontend/src/components/MoneyText.tsx`**

```tsx
import { formatMoney } from "@/lib/decimal";

/** Mọi con số đi qua đây: mono + tabular-nums để cột số thẳng hàng. */
export function MoneyText({ value, currency }: { value: string; currency?: string }) {
  return <span className="num">{formatMoney(value, currency)}</span>;
}
```

- [ ] **Step 7: `frontend/src/features/accounts/AccountFormDialog.tsx`**

```tsx
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { compareDecimal, fractionFromPercent, percentFromFraction } from "@/lib/decimal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateAccount, useUpdateAccount } from "./hooks";
import type { Account, AccountCreate, AccountPatch } from "./types";

// Kiểm số dương mà KHÔNG dùng Number: một chuỗi chữ số hợp lệ và có ít nhất
// một chữ số khác 0.
const laSoDuong = (v: string) => /^\d*\.?\d+$/.test(v.trim()) && /[1-9]/.test(v);

// Mọi thông điệp dưới đây khớp ràng buộc thật của backend
// (service/account.go). Chặn ở client là để phản hồi nhanh, không phải thay.
const schema = z.object({
  code: z.string().trim().min(1, "mã tài khoản không được để trống").max(32, "mã tài khoản dài quá 32 ký tự"),
  name: z.string().trim(),
  currency: z.string().trim().min(1, "đơn vị tiền tệ không được để trống").max(8, "đơn vị tiền tệ dài quá 8 ký tự"),
  timezone: z.string().min(1, "timezone không được để trống"),
  initial_balance: z.string().refine(laSoDuong, "vốn ban đầu phải lớn hơn 0"),
  risk_percent: z
    .string()
    .refine(laSoDuong, "rủi ro mỗi lệnh phải lớn hơn 0")
    .refine((v) => compareDecimal(v, "100") <= 0, "rủi ro mỗi lệnh không được vượt quá 100%"),
});

type Fields = z.infer<typeof schema>;

// Danh sách IANA lấy thẳng từ trình duyệt, không cần thư viện.
const MUI_GIO: string[] =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["Asia/Ho_Chi_Minh", "UTC"];

const MAC_DINH: Fields = {
  code: "",
  name: "",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  initial_balance: "",
  risk_percent: "1",
};

function tuAccount(a: Account): Fields {
  return {
    code: a.code,
    name: a.name,
    currency: a.currency,
    timezone: a.timezone,
    initial_balance: a.initial_balance,
    risk_percent: percentFromFraction(a.risk_per_trade),
  };
}

export function AccountFormDialog({ account }: { account?: Account }) {
  const [mo, setMo] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const taoMoi = useCreateAccount();
  const capNhat = useUpdateAccount();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: account ? tuAccount(account) : MAC_DINH,
  });

  async function gui(v: Fields) {
    setLoi(null);
    try {
      if (account) {
        // Chỉ gửi field đã đổi: PATCH của backend dùng con trỏ, khoá vắng
        // mặt nghĩa là "không đổi". Gửi cả bảng biến một lần sửa tên thành
        // một lần ghi đè toàn bộ.
        const patch: AccountPatch = {};
        if (dirtyFields.code) patch.code = v.code.trim();
        if (dirtyFields.name) patch.name = v.name.trim();
        if (dirtyFields.currency) patch.currency = v.currency.trim();
        if (dirtyFields.timezone) patch.timezone = v.timezone;
        if (dirtyFields.initial_balance) patch.initial_balance = v.initial_balance.trim();
        if (dirtyFields.risk_percent) patch.risk_per_trade = fractionFromPercent(v.risk_percent.trim());
        await capNhat.mutateAsync({ id: account.id, patch });
      } else {
        const body: AccountCreate = {
          code: v.code.trim(),
          name: v.name.trim(),
          currency: v.currency.trim(),
          timezone: v.timezone,
          initial_balance: v.initial_balance.trim(),
          risk_per_trade: fractionFromPercent(v.risk_percent.trim()),
        };
        await taoMoi.mutateAsync(body);
      }
      setMo(false);
      reset(account ? undefined : MAC_DINH);
    } catch (e) {
      setLoi(e instanceof ApiError ? e.msg : "không kết nối được máy chủ");
    }
  }

  return (
    <Dialog open={mo} onOpenChange={setMo}>
      <DialogTrigger asChild>
        <Button variant={account ? "outline" : "default"} size={account ? "sm" : "default"}>
          {account ? `Sửa ${account.code}` : "Thêm tài khoản"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Sửa tài khoản" : "Thêm tài khoản"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(gui)} className="flex flex-col gap-3" noValidate>
          <O ten="code" nhan="Mã tài khoản" loi={errors.code?.message} dangKy={register("code")} />
          <O ten="name" nhan="Tên" loi={errors.name?.message} dangKy={register("name")} />
          <O ten="currency" nhan="Đơn vị tiền tệ" loi={errors.currency?.message} dangKy={register("currency")} />
          <O ten="initial_balance" nhan="Vốn ban đầu" loi={errors.initial_balance?.message} dangKy={register("initial_balance")} />
          <O ten="risk_percent" nhan="Rủi ro mỗi lệnh (%)" loi={errors.risk_percent?.message} dangKy={register("risk_percent")} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timezone">Múi giờ</Label>
            <select
              id="timezone"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("timezone")}
            >
              {MUI_GIO.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Đổi múi giờ sẽ tính lại cách gom nhóm theo ngày, tuần, tháng của toàn bộ lịch sử.
            </p>
          </div>

          {loi && <p role="alert" className="text-sm text-destructive">{loi}</p>}

          <DialogFooter>
            <Button type="submit">Lưu</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function O({
  ten, nhan, loi, dangKy,
}: {
  ten: string;
  nhan: string;
  loi?: string;
  dangKy: UseFormRegisterReturn;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={ten}>{nhan}</Label>
      <Input id={ten} {...dangKy} />
      {loi && <p role="alert" className="text-sm text-destructive">{loi}</p>}
    </div>
  );
}
```

- [ ] **Step 8: `frontend/src/features/accounts/AccountsPage.tsx`**

```tsx
import { MoneyText } from "@/components/MoneyText";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { percentFromFraction } from "@/lib/decimal";
import { AccountFormDialog } from "./AccountFormDialog";
import { useAccounts } from "./hooks";

export function AccountsPage() {
  const { data, isPending, error } = useAccounts();

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Tài khoản giao dịch</h1>
        <AccountFormDialog />
      </header>

      {isPending && <p role="status">Đang tải…</p>}
      {error && <p role="alert" className="text-destructive">{error.message}</p>}

      {data && data.length === 0 && (
        <p className="text-muted-foreground">
          Chưa có tài khoản giao dịch nào. Tạo một tài khoản để bắt đầu ghi nhật ký.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Vốn ban đầu</TableHead>
                <TableHead>Rủi ro</TableHead>
                <TableHead>1R</TableHead>
                <TableHead>Múi giờ</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.code}</TableCell>
                  <TableCell>{a.name}</TableCell>
                  <TableCell><MoneyText value={a.initial_balance} currency={a.currency} /></TableCell>
                  {/* Một chuỗi duy nhất, không phải {bieu_thuc}% — tách làm hai text node
                      thì getByText("1%") không khớp được. */}
                  <TableCell><span className="num">{`${percentFromFraction(a.risk_per_trade)}%`}</span></TableCell>
                  <TableCell><MoneyText value={a.one_r} currency={a.currency} /></TableCell>
                  <TableCell>{a.timezone}</TableCell>
                  <TableCell><AccountFormDialog account={a} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
```

Trang này **không có nút xoá**: backend không có `DELETE /api/accounts/:id`. Xem §12.2 của spec.

- [ ] **Step 9: Chạy, xác nhận XANH**

Run: `cd frontend && npx vitest run src/features/accounts`
Expected: PASS, 6 test.

- [ ] **Step 10: FALSIFY việc chỉ gửi dirty field**

```bash
cd frontend
# Trong AccountFormDialog.tsx, thay khối dựng `patch` bằng việc gửi cả bảng:
#   await capNhat.mutateAsync({ id: account.id, patch: { code: v.code, name: v.name, ... } });
npx vitest run src/features/accounts -t "chỉ gửi đúng field"
```

Expected: ĐỎ — `daGui` có sáu khoá thay vì một. Khôi phục.

- [ ] **Step 11: FALSIFY việc đổi risk sang phân số**

```bash
cd frontend
# Đổi `fractionFromPercent(v.risk_percent.trim())` thành `v.risk_percent.trim()`
npx vitest run src/features/accounts -t "dạng phân số"
```

Expected: ĐỎ — gửi lên `"1"` thay vì `"0.01"`, tức risk sai gấp 100 lần. Khôi phục.

- [ ] **Step 12: Chạy toàn bộ và commit**

Run: `make test-fe`

```bash
git add frontend/src/features/accounts frontend/src/lib/queryKeys.ts frontend/src/components/MoneyText.tsx
git commit -m "feat(fe): add accounts page with create and partial-update dialog"
```

---

### Task 10: Giao dịch tiền (cash flow) + enum từ `/meta/enums`

**Files:**
- Create: `frontend/src/features/meta/hooks.ts`
- Create: `frontend/src/features/accounts/cashflowHooks.ts`, `frontend/src/features/accounts/CashFlowPanel.tsx`, `frontend/src/features/accounts/cashflow.test.tsx`
- Modify: `frontend/src/features/accounts/AccountsPage.tsx`

**Interfaces:**
- Consumes: `api`, `qk`, `formatDateOnly`, `MoneyText`, `Button`, `Input`, `Label`, `Table`, `Dialog`.
- Produces:
  - `type MetaEnums = { directions: string[]; timeframes: string[]; entry_qualities: string[]; in_trade_qualities: string[]; exit_qualities: string[]; psychologies: string[]; trade_classes: string[]; cash_flow_types: string[]; weekdays: string[]; default_setup: string }`
  - `useMetaEnums()`
  - `type CashFlow = { id: number; date: string; amount: string; type: string; note: string }`
  - `useCashFlows(accountId)`, `useCreateCashFlow(accountId)`, `useDeleteCashFlow(accountId)`
  - `<CashFlowPanel account={...} />`

- [ ] **Step 1: Viết test ĐỎ**

`frontend/src/features/accounts/cashflow.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { __resetApiForTest } from "@/lib/api";
import { clearSession, setSession } from "@/lib/session";
import { CashFlowPanel } from "./CashFlowPanel";
import type { Account } from "./types";

const BASE = "http://localhost/api";
const phongBi = (data: unknown) => HttpResponse.json({ code: 0, msg: "ok", data });

const tk: Account = {
  id: 1, code: "FTMO", name: "Quỹ", initial_balance: "10000",
  risk_per_trade: "0.01", currency: "USD", timezone: "Asia/Ho_Chi_Minh", one_r: "100",
};

const enums = {
  directions: [], timeframes: [], entry_qualities: [], in_trade_qualities: [],
  exit_qualities: [], psychologies: [], trade_classes: [], weekdays: [],
  cash_flow_types: ["deposit", "withdraw"], default_setup: "KHÔNG CÓ SETUP",
};

beforeEach(() => {
  clearSession();
  __resetApiForTest();
  setSession("abc", { id: 1, email: "toi@example.com" });
});

function dung() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CashFlowPanel account={tk} />
    </QueryClientProvider>,
  );
  return qc;
}

test("hiện ngày theo DD/MM/YYYY, không đi qua Date", async () => {
  server.use(
    http.get(`${BASE}/meta/enums`, () => phongBi(enums)),
    http.get(`${BASE}/accounts/1/cash-flows`, () =>
      phongBi([{ id: 5, date: "2026-03-01", amount: "500", type: "deposit", note: "nạp thêm" }]),
    ),
  );
  dung();

  const dong = await screen.findByRole("row", { name: /nạp thêm/ });
  expect(within(dong).getByText("01/03/2026")).toBeInTheDocument();
});

// Đúng lỗi đã xuất hiện HAI lần liên tiếp ở Phase 2a: danh sách rỗng trả
// null thay vì [] rồi FE nổ khi .map. Backend đã sửa; test này canh phía FE.
test("danh sách rỗng thì hiện trạng thái rỗng chứ không nổ", async () => {
  server.use(
    http.get(`${BASE}/meta/enums`, () => phongBi(enums)),
    http.get(`${BASE}/accounts/1/cash-flows`, () => phongBi([])),
  );
  dung();
  expect(await screen.findByText(/chưa có giao dịch tiền nào/i)).toBeInTheDocument();
});

// Chuỗi enum phải lấy từ /meta/enums, không được chép cứng vào FE. Ở đây
// backend chỉ cấp "deposit", nên nếu FE hardcode thì "Rút" vẫn hiện ra.
test("loại giao dịch lấy từ /meta/enums chứ không hardcode", async () => {
  server.use(
    http.get(`${BASE}/meta/enums`, () => phongBi({ ...enums, cash_flow_types: ["deposit"] })),
    http.get(`${BASE}/accounts/1/cash-flows`, () => phongBi([])),
  );
  dung();
  await screen.findByText(/chưa có giao dịch tiền nào/i);

  const chon = await screen.findByLabelText("Loại");
  expect(within(chon).getByRole("option", { name: "Nạp" })).toBeInTheDocument();
  expect(within(chon).queryByRole("option", { name: "Rút" })).not.toBeInTheDocument();
});

test("thêm giao dịch gửi đúng bốn trường và làm mới danh sách", async () => {
  let daGui: Record<string, unknown> | null = null;
  let daTao = false;
  server.use(
    http.get(`${BASE}/meta/enums`, () => phongBi(enums)),
    http.get(`${BASE}/accounts/1/cash-flows`, () =>
      phongBi(daTao ? [{ id: 9, date: "2026-03-02", amount: "250", type: "withdraw", note: "rút bớt" }] : []),
    ),
    http.post(`${BASE}/accounts/1/cash-flows`, async ({ request }) => {
      daGui = (await request.json()) as Record<string, unknown>;
      daTao = true;
      return phongBi({ id: 9, date: "2026-03-02", amount: "250", type: "withdraw", note: "rút bớt" });
    }),
  );
  dung();
  await screen.findByText(/chưa có giao dịch tiền nào/i);

  await userEvent.type(screen.getByLabelText("Ngày"), "2026-03-02");
  await userEvent.type(screen.getByLabelText("Số tiền"), "250");
  await userEvent.selectOptions(screen.getByLabelText("Loại"), "withdraw");
  await userEvent.type(screen.getByLabelText("Ghi chú"), "rút bớt");
  await userEvent.click(screen.getByRole("button", { name: "Thêm giao dịch" }));

  await screen.findByRole("row", { name: /rút bớt/ });
  expect(daGui).toEqual({ date: "2026-03-02", amount: "250", type: "withdraw", note: "rút bớt" });
});

// Chiều tiền nằm ở `type`, nên `amount` luôn dương — trùng CHECK (amount > 0)
// của migration 0001 và validate của service/cashflow.go:46.
test("số tiền âm hoặc 0 bị chặn ở client", async () => {
  server.use(
    http.get(`${BASE}/meta/enums`, () => phongBi(enums)),
    http.get(`${BASE}/accounts/1/cash-flows`, () => phongBi([])),
  );
  dung();
  await screen.findByText(/chưa có giao dịch tiền nào/i);

  await userEvent.type(screen.getByLabelText("Ngày"), "2026-03-02");
  await userEvent.type(screen.getByLabelText("Số tiền"), "0");
  await userEvent.click(screen.getByRole("button", { name: "Thêm giao dịch" }));

  expect(await screen.findByText(/số tiền phải lớn hơn 0/i)).toBeInTheDocument();
});

test("xoá gọi DELETE /cash-flows/:id và làm mới danh sách", async () => {
  let daXoa = false;
  server.use(
    http.get(`${BASE}/meta/enums`, () => phongBi(enums)),
    http.get(`${BASE}/accounts/1/cash-flows`, () =>
      phongBi(daXoa ? [] : [{ id: 5, date: "2026-03-01", amount: "500", type: "deposit", note: "nạp thêm" }]),
    ),
    http.delete(`${BASE}/cash-flows/5`, () => {
      daXoa = true;
      return phongBi(null);
    }),
  );
  dung();
  await screen.findByRole("row", { name: /nạp thêm/ });

  await userEvent.click(screen.getByRole("button", { name: "Xoá giao dịch ngày 01/03/2026" }));
  await userEvent.click(await screen.findByRole("button", { name: "Xoá" }));

  expect(await screen.findByText(/chưa có giao dịch tiền nào/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd frontend && npx vitest run src/features/accounts/cashflow.test.tsx`
Expected: FAIL — `Failed to resolve import "./CashFlowPanel"`.

- [ ] **Step 3: `frontend/src/features/meta/hooks.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";

/**
 * Enum §1 do backend cấp. FE KHÔNG được chép lại các chuỗi tiếng Việt này:
 * chúng là key chấm điểm, đổi một ký tự là đổi kết quả của toàn bộ lịch sử
 * (CLAUDE.md quy tắc 5).
 */
export type MetaEnums = {
  directions: string[];
  timeframes: string[];
  entry_qualities: string[];
  in_trade_qualities: string[];
  exit_qualities: string[];
  psychologies: string[];
  trade_classes: string[];
  cash_flow_types: string[];
  weekdays: string[];
  default_setup: string;
};

export function useMetaEnums() {
  return useQuery({
    queryKey: qk.metaEnums,
    queryFn: () => api.get<MetaEnums>("/meta/enums"),
    // Dữ liệu tham chiếu tĩnh: tải một lần cho cả phiên.
    staleTime: Infinity,
  });
}
```

- [ ] **Step 4: `frontend/src/features/accounts/cashflowHooks.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";

export type CashFlow = {
  id: number;
  date: string; // YYYY-MM-DD, không có giờ
  amount: string; // luôn dương; chiều nằm ở `type`
  type: string; // "deposit" | "withdraw", lấy từ /meta/enums
  note: string;
};

export type CashFlowCreate = Omit<CashFlow, "id">;

export function useCashFlows(accountId: number) {
  return useQuery({
    queryKey: qk.cashFlows(accountId),
    queryFn: () => api.get<CashFlow[]>(`/accounts/${accountId}/cash-flows`),
  });
}

export function useCreateCashFlow(accountId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: CashFlowCreate) => api.post<CashFlow>(`/accounts/${accountId}/cash-flows`, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cashFlows(accountId) }),
  });
}

// URL xoá KHÔNG lồng dưới account: backend là DELETE /api/cash-flows/{id},
// và nó tự kiểm quyền sở hữu (service/cashflow.go). Vẫn cần accountId để
// biết phải làm mới danh sách nào.
export function useDeleteCashFlow(accountId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<null>(`/cash-flows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cashFlows(accountId) }),
  });
}
```

- [ ] **Step 5: `frontend/src/features/accounts/CashFlowPanel.tsx`**

```tsx
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { formatDateOnly } from "@/lib/format";
import { MoneyText } from "@/components/MoneyText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMetaEnums } from "@/features/meta/hooks";
import { useCashFlows, useCreateCashFlow, useDeleteCashFlow } from "./cashflowHooks";
import type { Account } from "./types";

// Nhãn hiển thị cho giá trị enum của backend. Giá trị ("deposit"/"withdraw")
// là hợp đồng; nhãn là chữ. Loại lạ thì hiện nguyên giá trị chứ không nuốt.
const NHAN: Record<string, string> = { deposit: "Nạp", withdraw: "Rút" };
const nhan = (v: string) => NHAN[v] ?? v;

const laSoDuong = (v: string) => /^\d*\.?\d+$/.test(v.trim()) && /[1-9]/.test(v);
const laNgay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

export function CashFlowPanel({ account }: { account: Account }) {
  const { data: enums } = useMetaEnums();
  const { data, isPending } = useCashFlows(account.id);
  const themMoi = useCreateCashFlow(account.id);
  const xoa = useDeleteCashFlow(account.id);

  const [ngay, setNgay] = useState("");
  const [soTien, setSoTien] = useState("");
  const [loai, setLoai] = useState("deposit");
  const [ghiChu, setGhiChu] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [sapXoa, setSapXoa] = useState<number | null>(null);

  const loaiHopLe = enums?.cash_flow_types ?? [];

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    setLoi(null);
    if (!laNgay(ngay)) return setLoi("ngày phải theo định dạng YYYY-MM-DD");
    if (!laSoDuong(soTien)) return setLoi("số tiền phải lớn hơn 0");
    try {
      await themMoi.mutateAsync({
        date: ngay.trim(),
        amount: soTien.trim(),
        type: loai,
        note: ghiChu.trim(),
      });
      setNgay(""); setSoTien(""); setGhiChu("");
    } catch (err) {
      setLoi(err instanceof ApiError ? err.msg : "không kết nối được máy chủ");
    }
  }

  const dangXoa = data?.find((cf) => cf.id === sapXoa) ?? null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Nạp / rút — {account.code}</h2>

      {isPending && <p role="status">Đang tải…</p>}

      {data && data.length === 0 && (
        <p className="text-muted-foreground">Chưa có giao dịch tiền nào cho tài khoản này.</p>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Số tiền</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((cf) => (
                <TableRow key={cf.id}>
                  <TableCell className="num">{formatDateOnly(cf.date)}</TableCell>
                  <TableCell>{nhan(cf.type)}</TableCell>
                  <TableCell><MoneyText value={cf.amount} currency={account.currency} /></TableCell>
                  <TableCell>{cf.note}</TableCell>
                  <TableCell>
                    {/* Chữ hiển thị ngắn, tên trợ năng đầy đủ: nhờ vậy nút
                        xoá ở hàng và nút Xoá trong hộp xác nhận không trùng
                        tên nhau khi test truy theo role. */}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Xoá giao dịch ngày ${formatDateOnly(cf.date)}`}
                      onClick={() => setSapXoa(cf.id)}
                    >
                      Xoá
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <form onSubmit={gui} className="flex flex-wrap items-end gap-3" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf-ngay">Ngày</Label>
          <Input id="cf-ngay" value={ngay} onChange={(e) => setNgay(e.target.value)} placeholder="2026-03-01" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf-tien">Số tiền</Label>
          <Input id="cf-tien" value={soTien} onChange={(e) => setSoTien(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf-loai">Loại</Label>
          <select
            id="cf-loai"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={loai}
            onChange={(e) => setLoai(e.target.value)}
          >
            {loaiHopLe.map((t) => (
              <option key={t} value={t}>{nhan(t)}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cf-note">Ghi chú</Label>
          <Input id="cf-note" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
        </div>
        <Button type="submit">Thêm giao dịch</Button>
      </form>

      {loi && <p role="alert" className="text-sm text-destructive">{loi}</p>}

      <Dialog open={sapXoa !== null} onOpenChange={(v) => !v && setSapXoa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xoá giao dịch tiền?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {dangXoa
              ? `${nhan(dangXoa.type)} ${dangXoa.amount} ${account.currency} ngày ${formatDateOnly(dangXoa.date)}. Thao tác này không hoàn tác được.`
              : ""}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSapXoa(null)}>Huỷ</Button>
            <Button
              onClick={async () => {
                if (sapXoa !== null) await xoa.mutateAsync(sapXoa);
                setSapXoa(null);
              }}
            >
              Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
```

- [ ] **Step 6: Chạy, xác nhận XANH**

Run: `cd frontend && npx vitest run src/features/accounts/cashflow.test.tsx`
Expected: PASS, 6 test.

- [ ] **Step 7: FALSIFY việc lấy enum từ backend**

```bash
cd frontend
# Đổi `const loaiHopLe = enums?.cash_flow_types ?? [];`
# thành `const loaiHopLe = ["deposit", "withdraw"];`
npx vitest run src/features/accounts/cashflow.test.tsx -t "meta/enums"
```

Expected: ĐỎ — option "Rút" xuất hiện dù backend không cấp. Khôi phục.

- [ ] **Step 8: FALSIFY việc định dạng ngày bằng chuỗi**

```bash
cd frontend
# Trong src/lib/format.ts, đổi thân hàm thành:
#   return new Date(iso).toLocaleDateString("vi-VN");
TZ=America/New_York npx vitest run src/lib/format.test.ts
```

Expected: ĐỎ — ra `28/02/2026` thay vì `01/03/2026`, đúng cái bẫy lùi một ngày. Khôi phục.

- [ ] **Step 9: Gắn panel vào `AccountsPage`**

Trong `frontend/src/features/accounts/AccountsPage.tsx`, thêm import và render panel cho account đang chọn. Tạm thời dùng account đầu tiên; Task 11 thay bằng account đang chọn thật:

```tsx
import { CashFlowPanel } from "./CashFlowPanel";
```

Thêm ngay trước thẻ đóng `</section>`:

```tsx
      {data && data.length > 0 && <CashFlowPanel account={data[0]} />}
```

- [ ] **Step 10: Chạy toàn bộ và commit**

Run: `make test-fe`

```bash
git add frontend/src/features
git commit -m "feat(fe): add cash flow panel backed by /meta/enums"
```

---

### Task 11: Account đang chọn + bộ chuyển tài khoản

**Files:**
- Create: `frontend/src/features/accounts/activeAccount.ts`, `frontend/src/features/accounts/activeAccount.test.ts`
- Create: `frontend/src/components/AccountSwitcher.tsx`
- Modify: `frontend/src/features/accounts/AccountsPage.tsx`, `frontend/src/app/AppShell.tsx`

**Interfaces:**
- Consumes: `useAccounts` (Task 9); `Account` (Task 9).
- Produces:
  - `ACTIVE_ACCOUNT_KEY = "journal.active_account"`
  - `readActiveAccountId(store?): number | null`
  - `storeActiveAccountId(id: number, store?): void`
  - `resolveActiveAccount(list: Account[], storedId: number | null): Account | null`
  - `useActiveAccount(): { account: Account | null; accounts: Account[]; isPending: boolean; choose(id: number): void }`
  - `<AccountSwitcher />`

- [ ] **Step 1: Viết test ĐỎ (thuần, không cần DOM)**

`frontend/src/features/accounts/activeAccount.test.ts`:

```ts
import { ACTIVE_ACCOUNT_KEY, readActiveAccountId, resolveActiveAccount, storeActiveAccountId } from "./activeAccount";
import type { Account } from "./types";

const tk = (id: number, code: string): Account => ({
  id, code, name: "", initial_balance: "1000", risk_per_trade: "0.01",
  currency: "USD", timezone: "Asia/Ho_Chi_Minh", one_r: "10",
});

const A = tk(1, "A");
const B = tk(2, "B");

describe("resolveActiveAccount", () => {
  test("chưa có account nào thì không có account đang chọn", () => {
    expect(resolveActiveAccount([], 1)).toBeNull();
    expect(resolveActiveAccount([], null)).toBeNull();
  });

  test("chưa lưu gì thì lấy account đầu tiên", () => {
    expect(resolveActiveAccount([A, B], null)).toBe(A);
  });

  test("id đã lưu có trong danh sách thì dùng nó", () => {
    expect(resolveActiveAccount([A, B], 2)).toBe(B);
  });

  // ĐÂY LÀ NHÁNH QUAN TRỌNG. Id còn sót lại của user khác — hoặc của một
  // account đã biến mất — sẽ làm mọi query của Phase 3 gọi vào account
  // không thuộc mình và ăn 403 mà không ai hiểu vì sao.
  test("id đã lưu KHÔNG có trong danh sách thì rơi về account đầu tiên", () => {
    expect(resolveActiveAccount([A, B], 999)).toBe(A);
  });
});

describe("đọc ghi localStorage", () => {
  test("chưa lưu gì thì trả null", () => {
    expect(readActiveAccountId({ getItem: () => null })).toBeNull();
  });

  test("giá trị rác thì trả null chứ không trả NaN", () => {
    expect(readActiveAccountId({ getItem: () => "linh tinh" })).toBeNull();
    expect(readActiveAccountId({ getItem: () => "" })).toBeNull();
    expect(readActiveAccountId({ getItem: () => "1.5" })).toBeNull();
  });

  test("đọc lại đúng số đã ghi", () => {
    expect(readActiveAccountId({ getItem: () => "42" })).toBe(42);
  });

  test("ghi dưới đúng khoá", () => {
    let khoa = "";
    let giaTri = "";
    storeActiveAccountId(7, { setItem: (k: string, v: string) => { khoa = k; giaTri = v; } });
    expect(khoa).toBe(ACTIVE_ACCOUNT_KEY);
    expect(giaTri).toBe("7");
  });
});
```

- [ ] **Step 2: Chạy, xác nhận ĐỎ**

Run: `cd frontend && npx vitest run src/features/accounts/activeAccount.test.ts`
Expected: FAIL — `Failed to resolve import "./activeAccount"`.

- [ ] **Step 3: `frontend/src/features/accounts/activeAccount.ts`**

```ts
import { useCallback, useEffect, useState } from "react";
import { useAccounts } from "./hooks";
import type { Account } from "./types";

export const ACTIVE_ACCOUNT_KEY = "journal.active_account";

type Doc = Pick<Storage, "getItem">;
type Ghi = Pick<Storage, "setItem">;

export function readActiveAccountId(store: Doc = localStorage): number | null {
  const v = store.getItem(ACTIVE_ACCOUNT_KEY);
  // Chỉ chấp nhận chuỗi toàn chữ số. parseInt("1.5") ra 1 và parseInt("abc")
  // ra NaN — cả hai đều là id sai mà im lặng. Cổng cấm Number( ở Task 4
  // cũng chặn hướng đó rồi.
  return v !== null && /^\d+$/.test(v) ? +v : null;
}

export function storeActiveAccountId(id: number, store: Ghi = localStorage): void {
  store.setItem(ACTIVE_ACCOUNT_KEY, String(id));
}

/**
 * Chọn account đang hoạt động từ danh sách VỪA TẢI.
 *
 * Id lưu sẵn luôn phải đối chiếu lại: nó có thể là của user khác, hoặc của
 * một account đã biến mất. Tin nó mà không kiểm sẽ làm Phase 3 gọi vào
 * account không thuộc mình và ăn 403 khó hiểu.
 */
export function resolveActiveAccount(list: Account[], storedId: number | null): Account | null {
  if (list.length === 0) return null;
  return list.find((a) => a.id === storedId) ?? list[0];
}

export function useActiveAccount() {
  const { data, isPending } = useAccounts();
  const [id, setId] = useState<number | null>(() => readActiveAccountId());

  const list = data ?? [];
  const account = resolveActiveAccount(list, id);

  // Giữ localStorage khớp với thứ đang thực sự hiển thị, kể cả khi vừa rơi
  // về account đầu tiên vì id cũ không còn hợp lệ.
  useEffect(() => {
    if (account && account.id !== id) {
      setId(account.id);
      storeActiveAccountId(account.id);
    }
  }, [account, id]);

  const choose = useCallback((chon: number) => {
    setId(chon);
    storeActiveAccountId(chon);
  }, []);

  return { account, accounts: list, isPending, choose };
}
```

`+v` chứ không phải `Number(v)`: cổng canh ở Task 4 cấm `Number(`, và ở đây chuỗi đã được regex `^\d+$` bảo đảm nên phép ép là an toàn.

- [ ] **Step 4: Chạy, xác nhận XANH**

Run: `cd frontend && npx vitest run src/features/accounts/activeAccount.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: FALSIFY việc đối chiếu id**

```bash
cd frontend
# Trong resolveActiveAccount, đổi thành:
#   return list.find((a) => a.id === storedId) ?? null;
npx vitest run src/features/accounts/activeAccount.test.ts -t "rơi về account đầu tiên"
```

Expected: ĐỎ — trả `null` thay vì `A`. Khôi phục.

- [ ] **Step 6: `frontend/src/components/AccountSwitcher.tsx`**

```tsx
import { Label } from "@/components/ui/label";
import { useActiveAccount } from "@/features/accounts/activeAccount";

export function AccountSwitcher() {
  const { account, accounts, choose } = useActiveAccount();
  if (accounts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-2">
      <Label htmlFor="account-switcher" className="text-xs">Tài khoản đang xem</Label>
      <select
        id="account-switcher"
        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        value={account?.id ?? ""}
        onChange={(e) => choose(+e.target.value)}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>{a.code}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 7: Gắn switcher vào `AppShell`**

Trong `frontend/src/app/AppShell.tsx`, thêm import và chèn `<AccountSwitcher />` ngay dưới `<nav>`:

```tsx
import { AccountSwitcher } from "@/components/AccountSwitcher";
```

```tsx
        </nav>

        <div className="mt-3">
          <AccountSwitcher />
        </div>
```

- [ ] **Step 8: Dùng account đang chọn ở `AccountsPage`**

Trong `frontend/src/features/accounts/AccountsPage.tsx`, thay dòng tạm của Task 10:

```diff
-      {data && data.length > 0 && <CashFlowPanel account={data[0]} />}
+      {accountDangChon && <CashFlowPanel account={accountDangChon} />}
```

và thêm ở đầu component:

```tsx
  const { account: accountDangChon } = useActiveAccount();
```

kèm import:

```tsx
import { useActiveAccount } from "./activeAccount";
```

- [ ] **Step 9: Chạy toàn bộ và commit**

Run: `make test-fe`
Expected: toàn xanh. Nếu `accounts.test.tsx` đỏ vì switcher gọi thêm `/accounts` thì không phải lỗi — `useAccounts` dùng chung một query key nên TanStack gộp, kiểm lại handler MSW.

```bash
git add frontend/src/features/accounts frontend/src/components/AccountSwitcher.tsx frontend/src/app/AppShell.tsx
git commit -m "feat(fe): add active account store and switcher"
```

---

### Task 12: Đóng gói — Dockerfile, nginx, service `web`, override dev

**Files:**
- Create: `frontend/Dockerfile`, `frontend/nginx.conf`, `docker-compose.dev.yml`
- Modify: `docker-compose.yml`, `Makefile`

**Interfaces:**
- Consumes: `npm run build` (Task 1), `npm run dev` (Task 1).
- Produces: service `web` (prod: nginx cổng 8080; dev: Vite cổng 5173); target `make up-dev`.

- [ ] **Step 1: `frontend/nginx.conf`**

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # SPA fallback. KHÔNG có dòng này thì F5 trên /accounts trả 404 của nginx
  # trước khi React kịp chạy — và đó chính là kịch bản E2E số 1 kiểm.
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Cùng origin với frontend là điều kiện đúng/sai: cookie refresh có
  # Path=/api/auth và HttpOnly. Nhờ khối này mà CORS_ORIGINS để trống được.
  location /api/ {
    proxy_pass http://api:8000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

- [ ] **Step 2: `frontend/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Tầng dev: docker-compose.dev.yml trỏ build.target vào đây. Tách bằng
# target thay vì đổi `image` ở override, vì Compose không bỏ được `build`
# của service gốc — đặt `image` chồng lên sẽ build nhầm ảnh nginx rồi chạy
# npm trong đó.
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM deps AS build
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 3: Thêm service `web` vào `docker-compose.yml`**

Thêm sau service `api`, trước khối `volumes:`:

```yaml
  web:
    build:
      context: ./frontend
      target: prod
    depends_on:
      - api
    ports:
      - "8080:80"
```

- [ ] **Step 4: `docker-compose.dev.yml`**

```yaml
# Override cho dev: Vite dev server thay nginx, source mount vào để hot
# reload. Dùng: make up-dev
#
# Cố ý KHÔNG đụng tới service api. Spec mẹ §11 có nhắc air hot-reload cho
# Go, nhưng 2b không sửa backend nên thêm vào đây là kéo việc backend vào
# một phase frontend. Xem §12.2 của spec 2b.
services:
  web:
    build:
      target: dev
    environment:
      VITE_PROXY_TARGET: http://api:8000
    volumes:
      - ./frontend:/app
      # Volume ẩn danh giữ node_modules của ảnh, không để bind mount che mất.
      - /app/node_modules
    ports:
      - "5173:5173"
```

- [ ] **Step 5: Thêm target vào `Makefile`**

Sửa `.PHONY` thành:

```make
.PHONY: test test-pure lint up down logs migrate tidy test-fe e2e up-dev
```

Thêm vào cuối:

```make
up-dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

- [ ] **Step 6: Dựng và kiểm trên project Docker CÁCH LY**

Toàn bộ bước kiểm chạy dưới project riêng, dọn bằng `down -v`, để volume `trading-journal-web-app_pgdata` của người dùng không bị đụng.

```bash
export JWT_SECRET=$(openssl rand -base64 48)
docker compose -p jrnl-2b up -d --build
docker compose -p jrnl-2b ps
```

Expected: bốn service, `db` healthy, `migrate` exited 0, `api` và `web` đang chạy.

- [ ] **Step 7: Kiểm ba tính chất của nginx**

```bash
# 1. Trang gốc trả HTML
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8080/

# 2. SPA fallback: đường dẫn React phải trả index.html chứ không phải 404
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/accounts

# 3. Proxy /api cùng origin
curl -s http://localhost:8080/api/meta/enums | head -c 200; echo
```

Expected: `200 text/html`, `200`, và envelope `{"code":0,"msg":"ok","data":{...}}`.

- [ ] **Step 8: FALSIFY SPA fallback**

```bash
# Trong frontend/nginx.conf, đổi `try_files $uri $uri/ /index.html;` thành `try_files $uri;`
docker compose -p jrnl-2b up -d --build web
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/accounts
```

Expected: `404`. Khôi phục dòng cũ, build lại, xác nhận về `200`. Dán cả hai output.

- [ ] **Step 9: Dọn và xác nhận volume của người dùng còn nguyên**

```bash
docker compose -p jrnl-2b down -v
docker volume ls | grep trading-journal-web-app_pgdata
```

Expected: volume `trading-journal-web-app_pgdata` vẫn còn trong danh sách.

- [ ] **Step 10: Commit**

```bash
git add frontend/Dockerfile frontend/nginx.conf docker-compose.yml docker-compose.dev.yml Makefile
git commit -m "feat(fe): serve frontend from nginx with SPA fallback and same-origin api proxy"
```

---

### Task 13: E2E trên stack thật + kiểm tra cuối Phase 2b

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/e2e/auth.spec.ts`
- Modify: `Makefile`

**Interfaces:**
- Consumes: toàn bộ stack của Task 12.
- Produces: `make e2e` chạy trọn vòng trên Docker thật rồi tự dọn.

- [ ] **Step 1: `frontend/playwright.config.ts`**

```ts
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
```

- [ ] **Step 2: `frontend/e2e/auth.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

const EMAIL = "toi@example.com";
const MAT_KHAU = "matkhaudai123";

test.describe.serial("vòng đời phiên trên stack thật", () => {
  /**
   * KỊCH BẢN MSW KHÔNG THAY THẾ ĐƯỢC.
   *
   * Nó là bằng chứng duy nhất rằng cookie refresh (HttpOnly, Path=/api/auth)
   * đi đúng qua proxy nginx và dựng lại được phiên sau khi tải lại trang.
   * Access token chỉ sống trong memory, nên F5 xoá sạch nó; nếu cookie sai
   * đường thì người dùng bị đá ra login mỗi lần refresh trang.
   */
  test("đăng ký user đầu, tạo account, F5 vẫn còn phiên", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Mật khẩu").fill(MAT_KHAU);
    await page.getByRole("button", { name: "Đăng ký" }).click();

    await expect(page.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeVisible();

    await page.getByRole("button", { name: "Thêm tài khoản" }).click();
    const hop = page.getByRole("dialog");
    await hop.getByLabel("Mã tài khoản").fill("FTMO");
    await hop.getByLabel("Tên").fill("Quỹ thử thách");
    await hop.getByLabel("Vốn ban đầu").fill("10000");
    await hop.getByLabel("Rủi ro mỗi lệnh (%)").fill("1");
    await hop.getByRole("button", { name: "Lưu" }).click();

    await expect(page.getByRole("cell", { name: "FTMO" })).toBeVisible();

    // one_r = initial_balance × risk_per_trade = 10000 × 0.01 = 100.
    // Con số này do backend tính; thấy nó đúng ở đây nghĩa là risk đã được
    // gửi lên dạng phân số chứ không phải dạng %.
    await expect(page.getByRole("row", { name: /FTMO/ })).toContainText("100");

    await page.reload();

    await expect(page.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "FTMO" })).toBeVisible();
    await expect(page).toHaveURL(/\/accounts$/);
  });

  test("đăng ký lần hai bị từ chối bằng đúng thông điệp của backend", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill("nguoikhac@example.com");
    await page.getByLabel("Mật khẩu").fill(MAT_KHAU);
    await page.getByRole("button", { name: "Đăng ký" }).click();

    await expect(page.getByText("đã có tài khoản, đăng ký đã đóng")).toBeVisible();
  });

  test("đăng xuất rồi F5 thì ở lại trang đăng nhập", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Mật khẩu").fill(MAT_KHAU);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page.getByRole("heading", { name: "Tài khoản giao dịch" })).toBeVisible();

    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Đăng nhập" })).toBeVisible();
  });
});
```

- [ ] **Step 3: Cho `make e2e` tự dựng stack cách ly rồi tự dọn**

Thay target `e2e` trong `Makefile`:

```make
# E2E trên stack Docker THẬT, dưới project cách ly nên volume dev của người
# dùng không bị đụng. DB sạch mỗi lần chạy — cần thiết vì kịch bản đầu tiên
# phải là user được đăng ký đầu tiên.
e2e:
	JWT_SECRET=$${JWT_SECRET:-$$(openssl rand -base64 48)} docker compose -p jrnl-e2e up -d --build
	@echo "chờ stack sẵn sàng..."
	@for i in $$(seq 1 60); do \
		curl -sf http://localhost:8080/api/meta/enums >/dev/null && break || sleep 2; \
	done
	cd frontend && npx playwright install --with-deps chromium
	cd frontend && E2E_BASE_URL=http://localhost:8080 npm run e2e; \
		status=$$?; cd .. ; docker compose -p jrnl-e2e down -v; exit $$status
```

`; status=$$?; ... exit $$status` là có chủ ý: stack phải được dọn kể cả khi test đỏ, nhưng `make` vẫn phải thoát khác 0 để CI không báo xanh nhầm.

- [ ] **Step 4: Chạy E2E**

Run: `make e2e`
Expected: `3 passed`. Dán output thật.

- [ ] **Step 5: FALSIFY kịch bản F5 — chứng minh nó thật sự canh cookie**

```bash
# Trong frontend/nginx.conf, đổi proxy_pass thành một upstream khác origin,
# ví dụ bỏ hẳn khối `location /api/` và để Vite/nginx không proxy nữa.
# Hoặc đơn giản hơn: trong src/lib/api.ts đổi credentials: "same-origin"
# thành credentials: "omit"
make e2e
```

Expected: kịch bản 1 ĐỎ ở bước sau `page.reload()` — bật sang trang đăng nhập, vì cookie refresh không còn được gửi. Khôi phục và chạy lại.

Đây là bước quan trọng nhất của cả task: nó chứng minh bộ E2E bắt được đúng lớp lỗi mà MSW mù.

- [ ] **Step 6: Kiểm tra cuối — backend phải nguyên vẹn**

```bash
git diff --stat main -- backend/ | tail -5
make test-pure
make lint
```

Expected: `git diff` trên `backend/` **rỗng hoàn toàn** (2b không sửa dòng Go nào), `make test-pure` xanh dưới 1 giây và không cần Docker, `make lint` sạch.

- [ ] **Step 7: Kiểm tra cuối — toàn bộ cổng**

```bash
make lint
make test
make test-pure
make test-fe
make e2e
```

Dán output thật của cả năm. Không được báo xanh khi chưa chạy.

- [ ] **Step 8: Kiểm tra cuối — đi trọn vòng bằng trình duyệt**

```bash
export JWT_SECRET=$(openssl rand -base64 48)
docker compose -p jrnl-2b-final up -d --build
```

Mở `http://localhost:8080` và làm thật, ghi lại kết quả từng bước:

| # | Việc | Mong đợi |
|---|---|---|
| 1 | Vào `/` khi chưa đăng nhập | Ra trang Đăng nhập |
| 2 | Đăng ký user đầu | Vào thẳng trang Tài khoản giao dịch |
| 3 | Đăng ký lần hai (cửa sổ ẩn danh) | "đã có tài khoản, đăng ký đã đóng" |
| 4 | Tạo account FTMO, vốn 10000, risk 1% | Bảng hiện `1%` và `1R = 100` |
| 5 | Thêm cash flow 500 deposit ngày 2026-03-01 | Bảng hiện `01/03/2026`, `Nạp`, `500 USD` |
| 6 | **F5** | Vẫn đăng nhập, dữ liệu còn nguyên |
| 7 | Đổi sang giao diện sáng, rồi F5 | Vẫn sáng, **không nháy tối rồi mới sáng** |
| 8 | Xoá cash flow | Biến khỏi bảng sau khi xác nhận |
| 9 | Đăng xuất, rồi F5 | Ở lại trang Đăng nhập |

```bash
docker compose -p jrnl-2b-final down -v
docker volume ls | grep trading-journal-web-app_pgdata
```

- [ ] **Step 9: Commit**

```bash
git add frontend/playwright.config.ts frontend/e2e Makefile
git commit -m "test(fe): add end-to-end session lifecycle checks on the real stack"
```

---

## Danh sách bất biến phải FALSIFY

Trước khi báo Phase 2b xong, xác nhận từng dòng dưới đây đã được xoá đi một lần và **thấy test đỏ**, kèm output thật. Ở Phase 2a, cách làm này tìm ra lỗ hổng thật ở **cả 7 task từ 5 đến 11** — lần nào cũng cùng hình dạng: code production đúng, suite xanh, nhưng xoá dòng cố ý đi thì không test nào đỏ.

| # | Bất biến | Task | Test phải đỏ |
|---|---|---|---|
| 1 | Bản chép `theme.css` giống bản gốc từng byte | 2 | `theme.test.ts` |
| 2 | Component shadcn không dùng `shadow-*` | 3 | `styleguard.test.ts` |
| 3 | Code của mình không hardcode hex | 3 | `styleguard.test.ts` |
| 4 | Không ép tiền sang `Number` | 4 | `styleguard.test.ts` |
| 5 | **Khoá `inflight`** (KHÔNG phải `bootstrapped` — xem §5.3 của spec) | 5 | `api.test.ts -t "song song"` |
| 6 | `/auth/*` không tự refresh khi 401 | 5 | `api.test.ts -t "KHÔNG kích refresh"` |
| 7 | `loading` render splash chứ không redirect | 6 | `auth.test.tsx -t "splash"` |
| 8 | Phiên chết thì dọn cache Query | 6 | `auth.test.tsx -t "phiên chết"` |
| 9 | Hiện nguyên văn `msg` của backend | 7 | `router.test.tsx -t "NGUYÊN VĂN"` |
| 10 | `logout` dọn phía client trong `finally` | 8 | `shell.test.tsx -t "500"` |
| 11 | PATCH chỉ gửi field đã đổi | 9 | `accounts.test.tsx -t "chỉ gửi đúng field"` |
| 12 | Risk gửi lên dạng phân số | 9 | `accounts.test.tsx -t "dạng phân số"` |
| 13 | Enum lấy từ `/meta/enums`, không hardcode | 10 | `cashflow.test.tsx -t "meta/enums"` |
| 14 | Ngày `YYYY-MM-DD` không đi qua `new Date()` | 10 | `format.test.ts` với `TZ=America/New_York` |
| 15 | Đối chiếu id account đã lưu với danh sách | 11 | `activeAccount.test.ts -t "rơi về account đầu tiên"` |
| 16 | SPA fallback của nginx | 12 | `curl /accounts` phải 200 |
| 17 | Cookie đi cùng origin qua proxy | 13 | E2E kịch bản 1 sau `page.reload()` |

**Hai điều cần cảnh giác**, rút từ Phase 2a:

- **Check không bao giờ đỏ được.** Vòng lặp trên danh sách rỗng luôn xanh; `go test -run` không khớp gì in `ok ... [no tests to run]` rồi thoát 0. Ở plan này, ba test quét file đều mở đầu bằng `expect(...length).toBeGreaterThan(0)` chính vì lý do đó.
- **Falsify sai chỗ.** Nếu xoá một dòng mà test vẫn xanh, hãy hỏi "test này sai, hay dòng kia thừa?" trước khi kết luận. `bootstrapped` ở Task 5 là ví dụ có sẵn: nó **không** phải guard đúng/sai, và viết test kiểu "gỡ nó thì phiên chết" sẽ cho một test xanh vì lý do sai.

## Xong khi

- `make lint`, `make test`, `make test-pure` của backend **không đổi kết quả**; `git diff main -- backend/` rỗng.
- `make test-fe` xanh, không cần Docker.
- `make e2e` xanh trên stack Docker thật, và tự dọn project cách ly.
- `docker compose up` lên đủ **bốn** service — trả xong món nợ "Xong khi" của Phase 0.
- Bảng 9 bước ở Task 13 Step 8 đúng hết trên trình duyệt thật.
- 17 bất biến ở bảng trên đều đã falsify, có output thật.
