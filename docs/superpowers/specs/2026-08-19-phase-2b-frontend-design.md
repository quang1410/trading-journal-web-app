# Thiết kế — Phase 2b: Frontend (scaffold, theme, auth, accounts)

Ngày: 2026-08-19
Trạng thái: đã chốt
Spec mẹ: `docs/superpowers/specs/2026-08-16-trading-journal-design.md` (§4, §7, §7.2, §8, §11)
Spec anh em: `docs/superpowers/specs/2026-08-18-phase-2a-auth-accounts-design.md`

## 1. Phạm vi

2a đã dựng xong backend: 11 endpoint, envelope thống nhất, refresh token xoay vòng có phát
hiện tái sử dụng, test chạy trên Postgres thật. `curl` đi trọn vòng được.

2b dựng **toàn bộ frontend từ số không** cộng phần hạ tầng để nó chạy được:

- Vite + React 19 + TypeScript scaffold, chưa từng tồn tại trong repo.
- Nối `docs/design/theme.css` vào Tailwind v4 + shadcn/ui.
- Vòng đời phiên đăng nhập: access token trong memory, refresh tự động, khôi phục sau F5.
- Trang `/login`, `/register`, `/accounts` (gồm cash flow).
- App shell + account switcher — nền cho Phase 3 và 4.
- Service `web` trong `docker-compose.yml` và `docker-compose.dev.yml`.

Xong 2b thì `docker compose up` lên đủ bốn service và người dùng làm được **bằng trình duyệt**
đúng vòng mà 2a chỉ làm được bằng `curl`.

## 2. Bối cảnh đã có

`docker-compose.yml` có `db`, `migrate`, `api` — **chưa có `web`**, dù mục "Xong khi" của
Phase 0 ghi là `docker compose up` phải lên cả ba service (db+api+web). Đây là món nợ Phase 0,
2b trả.

`docs/design/theme.css` (544 dòng) do chủ sản phẩm cấp. Kiểm tra thực tế cho thấy **cả 10
token nguồn mà spec mẹ §8.1 dùng để bridge đều tồn tại**, trừ `--font-sans` và `--font-mono`
đúng như spec mẹ đã cảnh báo là theme tham chiếu nhưng không định nghĩa.

**`.horus-sidenav` và `.horus-page-body` KHÔNG phải shell dựng sẵn.** Spec mẹ §8.1 nói "layout
dùng sẵn ... thay vì tự chế shell" — đọc file thì hai class này chỉ cấp token cục bộ
(`--sidebar-bg`, `--sidebar-text`, `--sidebar-active-bg`, …), một `border-right`, và padding.
Không có flex, không width, không height. 2b **vẫn phải tự dựng layout**; theme chỉ đặt tên
class và cấp màu. Ghi lại ở đây để không ai mất một buổi đi tìm layout không tồn tại.

`html { font-size: 14px }` (theme dòng 289) làm mọi thang `rem` của Tailwind co lại còn 14/16.

## 3. Quyết định của phase này

| # | Vấn đề | Quyết định | Vì sao |
|---|---|---|---|
| 1 | Phạm vi hạ tầng | 2b gồm cả service `web` prod (nginx) và `docker-compose.dev.yml` | Cookie refresh có `Path=/api/auth` — FE khác origin thì phiên không khôi phục được sau F5. Proxy là điều kiện đúng/sai, không phải tiện nghi |
| 2 | Ai sở hữu phiên | **API client cấp module**, không phải context React | Single-flight refresh chỉ cưỡng chế được ở một nơi duy nhất ngoài vòng đời React. Xem §5 |
| 3 | Test | Vitest + RTL + MSW làm xương sống, **cộng** 3 kịch bản Playwright trên Docker thật | MSW giả lập được response nhưng không chứng minh được cookie đi đúng qua proxy. Cùng lý do 2a chọn testcontainers thay vì mock DB |
| 4 | Tiền ở FE | Chuỗi xuyên suốt, `lib/decimal.ts` tự viết, không thêm dependency | 2b không có phép tính nào (`one_r` do backend tính). Việc duy nhất là dịch dấu chấm cho risk 0.01↔1% |
| 5 | Account đang chọn | Dựng ngay ở 2b: shell + switcher + localStorage | Phase 3 và 4 đều là route theo account; dựng sau phải viết lại router và mọi query key |
| 6 | Chữ hiển thị lỗi | FE hiện `msg` của backend; `code` chỉ quyết định **hành vi** | Backend đã trả tiếng Việt hiển thị được. FE viết lại là tạo nguồn sự thật thứ hai cho cùng một câu |
| 7 | `air` hot-reload cho Go | Bỏ | 2b không sửa Go. Thêm khi Phase 3 thật sự cần |

## 4. Cấu trúc

```
frontend/
  index.html  vite.config.ts  tsconfig.json  tsconfig.node.json
  components.json  Dockerfile  nginx.conf  vitest.config.ts  playwright.config.ts
  src/
    main.tsx
    app/         router.tsx · providers.tsx · AppShell.tsx · RequireAuth.tsx
    components/ui/   (shadcn sinh ra)
    components/      MoneyText · AccountSwitcher · ThemeToggle · EmptyState
    features/
      auth/      LoginPage · RegisterPage · useAuth
      accounts/  AccountsPage · AccountFormDialog · CashFlowPanel · hooks
    lib/         api.ts · session.ts · decimal.ts · format.ts · queryKeys.ts
    styles/      theme.css (bản chép) · bridge.css · index.css
  e2e/           auth.spec.ts
```

Test đặt **cạnh code** (`api.test.ts` nằm cạnh `api.ts`), cùng quy ước với backend. Chỉ
Playwright tách ra `e2e/` vì nó cần stack thật.

Thư viện: React 19, React Router v7, TanStack Query v5, Tailwind v4, shadcn/ui,
react-hook-form + zod, Vitest + Testing Library + MSW, Playwright,
`@fontsource-variable/{inter,jetbrains-mono}`.

## 5. Vòng đời phiên — phần khó nhất của phase

### 5.1 Ràng buộc từ 2a

- Access token JWT 15 phút, **chỉ ở memory**, không localStorage (spec mẹ §7.2).
- Refresh token trong cookie `HttpOnly`, `SameSite=Lax`, `Path=/api/auth`.
- Backend **xoay vòng** refresh token mỗi lần gọi và **phát hiện tái sử dụng**: gửi lại một
  token đã bị xoay sẽ **thu hồi mọi phiên của user đó**, kể cả phiên đang hợp lệ.
- Không có endpoint `/me`. Không cần: `refresh` trả kèm `user`.

Ràng buộc thứ ba là ràng buộc định hình kiến trúc: **hai lần refresh song song với cùng một
cookie sẽ tự sát.** Cái thứ hai bị đọc là replay và giết sạch phiên.

### 5.2 `lib/session.ts`

Giữ access token trong biến cấp module, cộng một callback "phiên chết". Tách khỏi `api.ts`
để `AuthProvider` đăng ký callback mà không tạo import vòng.

### 5.3 `lib/api.ts`

Làm đúng bốn việc:

1. Gắn `Authorization: Bearer …` khi có token.
2. Bóc envelope. `code !== 0` → ném `ApiError{code, msg, status}`. Một hàm unwrap duy nhất
   cho toàn app, đúng như spec mẹ §7 hứa. Response không phải envelope (nginx 502, body rỗng)
   cũng phải thành `ApiError` chứ không được ném `SyntaxError` của `JSON.parse`.
3. `401` → refresh → **thử lại đúng một lần**. Không áp dụng cho `/auth/refresh`,
   `/auth/login`, `/auth/register`.
4. **Khoá single-flight** quanh refresh, hai lớp có vai trò **khác nhau**:
   - `inflight: Promise | null` — gộp các lần gọi **song song** vào một request. Đây là guard
     **đúng/sai**.
   - `bootstrapped: boolean` — chặn lần bootstrap **nối tiếp**. Đây chỉ là vệ sinh.

Phân biệt hai vai trò này quan trọng, vì nhầm sẽ dẫn tới viết sai test.

`inflight` là thứ ngăn tự sát. **React 19 StrictMode gọi effect hai lần ở dev**, và hai lần đó
nối nhau trong cùng một tick — lần thứ hai khởi hành **trước khi** lần thứ nhất trả lời, nên cả
hai mang **cùng một cookie**. Đó đúng là kịch bản replay: backend thu hồi mọi phiên, lập trình
viên bị đá ra login ngay khi mở app ở dev, rồi đi đổ lỗi cho backend. Gỡ `inflight` là hỏng
thật. Khoá phải ở cấp module mới sống sót qua vòng đời component.

`bootstrapped` **không** phải guard đúng/sai: nếu lần refresh thứ hai chỉ khởi hành sau khi lần
đầu đã xong thì cookie đã xoay, token nó mang là token mới và hợp lệ — chỉ tốn thêm một vòng
xoay vô ích, không chết. Giữ cờ này để khỏi xoay thừa, và **không** viết test kiểu "gỡ
`bootstrapped` thì phiên chết", vì nó sẽ không chết và test đó sẽ xanh vì lý do sai.

### 5.4 Khởi động và guard

`AuthProvider` có ba trạng thái: `loading` → `authed` | `anon`. Lúc mount gọi refresh **một
lần**; thành công thì có cả token lẫn `user`.

**Guard không được redirect khi `loading` — phải render splash.** Redirect lúc đang loading là
bug kinh điển: F5 trên `/accounts` sẽ văng sang `/login` trước khi refresh kịp trả lời. Có test
riêng cho nhánh này.

Khi refresh thất bại giữa phiên: xoá token, `queryClient.clear()` (để dữ liệu account của user
cũ không nằm lại trong cache), chuyển `anon`, điều hướng `/login`.

### 5.5 Route

| Route | Guard |
|---|---|
| `/login`, `/register` | công khai; `authed` thì đẩy về `/` |
| `/` | redirect `/accounts` |
| `/accounts` | trong `AppShell`, cần `authed` |

Sidenav 2b chỉ một mục. Phase 3, 4, 5 thêm dần.

## 6. Active account

`useAccounts()` tải danh sách; id đang chọn lưu localStorage khoá `journal.active_account`.

Id lưu **phải đối chiếu với danh sách vừa tải**. Id cũ của user khác, hoặc account đã biến mất,
sẽ làm mọi query của Phase 3 gọi vào account không thuộc mình và ăn 403 khó hiểu. Không khớp →
rơi về account đầu tiên. Chưa có account nào → empty state mời tạo.

## 7. Theme

1. **Chép `docs/design/theme.css` → `src/styles/theme.css` nguyên xi**, kèm **một test khẳng
   định hai file byte-identical**. CLAUDE.md nói theme là nguồn sự thật và không được sửa; test
   này là thứ duy nhất bắt được lúc bản chép thôi là bản chép.
2. **`bridge.css`** map token theo spec mẹ §8.1. Điểm chết người, lặp lại ở đây vì nó sai được
   trong im lặng: `--background ← --surface-raised` (raised là nền **trang**) và
   `--card ← --surface-base` (base là nền **thẻ**). Figma đảo tên có chủ ý.
3. **Tailwind v4** nối bằng `@theme inline` trong `index.css`, không dùng `tailwind.config.js`
   kiểu v3.
4. **Font**: `bridge.css` định nghĩa `--font-sans`/`--font-mono` mà theme còn thiếu, trỏ vào
   `@fontsource-variable`. Self-host: app không gọi ra Google Fonts lúc chạy.
5. **`data-theme` phải đặt trước lần vẽ đầu tiên** bằng script inline trong `index.html`.
   Không thì nháy trắng rồi mới sang dark. Mặc định `dark`, toggle lưu localStorage.
6. **shadcn**: chỉ thêm component 2b dùng — button, input, label, card, select, table, dialog,
   sonner, form. Component nào dựa `shadow-sm` phải đổi sang `border`, vì theme **vô hiệu hoá
   toàn bộ** `.shadow-*` (dòng 534–542); để nguyên thì nó chỉ đơn giản là không có viền.
7. Mọi con số — tiền, %, R, điểm — mono + `tabular-nums`, gói trong `MoneyText`.
8. `html { font-size: 14px }`: thuận theo, không chỉnh ngược.

## 8. Trang

### 8.1 `/login`, `/register`

react-hook-form + zod. Schema khớp **đúng** ràng buộc backend đã có, không đoán:

| Trường | Ràng buộc backend | Nguồn |
|---|---|---|
| email | phải hợp lệ | `service/auth.go` — "email không hợp lệ" |
| password | ≥ 8 ký tự | `service/auth.go:25` `minPasswordLen = 8` |

Validate ở FE là để phản hồi nhanh, **không** thay backend. Lỗi từ server luôn hiển thị `msg`.

`/register` gặp `1403` → hiện msg "đã có tài khoản, đăng ký đã đóng" kèm link sang `/login`.
Đăng ký chỉ mở cho user đầu tiên (quyết định #4 của spec 2a).

### 8.2 `/accounts`

Bảng: code · name · currency · timezone · initial_balance · risk % · one_r.

Dialog tạo mới; sửa bằng `PATCH` **chỉ gửi field đã đổi** (`dirtyFields` của react-hook-form),
đúng hợp đồng con trỏ của `accountPatchRequest` — `null` và "không gửi" là hai chuyện khác nhau.

zod schema khớp `validateAccount` của backend:

| Trường | Ràng buộc |
|---|---|
| code | không rỗng, ≤ 32 ký tự |
| currency | không rỗng, ≤ 8 ký tự |
| initial_balance | > 0 |
| risk_per_trade | trong khoảng (0, 1] — nhập theo **%**, tức (0, 100] |
| timezone | tên IANA hợp lệ, không rỗng |

Ô timezone lấy từ `Intl.supportedValuesOf('timeZone')` — không cần thư viện — mặc định
`Asia/Ho_Chi_Minh`, kèm cảnh báo của spec mẹ §8.3: đổi timezone sẽ tính lại cách gom nhóm của
**toàn bộ lịch sử**.

**Không có nút xoá account**: backend không có `DELETE /api/accounts/:id`. Xem §12.

### 8.3 Cash flow

Panel trong `/accounts`: danh sách (date · amount · type · note), form thêm, xoá có xác nhận.
Khớp `validateCashFlow`: date `YYYY-MM-DD`, amount **> 0** (chiều tiền nằm ở `type`, không phải
ở dấu), type ∈ `{deposit, withdraw}` lấy từ `GET /api/meta/enums`, không hardcode.

## 9. Tiền và ngày

`lib/decimal.ts`:

- Hiển thị qua `Intl.NumberFormat.prototype.format()` **truyền thẳng chuỗi** — ES2023 cho phép
  chính vì lý do không mất precision. Không đi vòng qua `Number`.
- `percentFromFraction("0.01") → "1"` và `fractionFromPercent` chiều ngược lại, làm bằng **dịch
  dấu chấm trên chuỗi**. Nhân 100 bằng float cho `0.29 * 100 === 28.999999999999996` (0.01 thì tình cờ đúng, nên đừng lấy nó làm ví dụ).
  Test table-driven: `"0.005"→"0.5"`, `"0.0125"→"1.25"`, `"1"→"100"`, và chiều ngược lại.
- **Một test quét `src/` cấm `Number(` và `parseFloat(` trên đường đi của tiền**, cùng tinh thần
  `internal/aggregate/purity_test.go` mà 2a vừa dựng. Ranh giới nào đáng giữ thì đáng có thứ
  bắt được lúc nó vỡ.

`lib/format.ts`: `date` của cash flow là `YYYY-MM-DD` **không có giờ** — định dạng bằng thao tác
chuỗi, **không** đi qua `new Date()`. `new Date("2026-03-01")` là nửa đêm UTC và sẽ lùi một ngày
ở mọi offset âm. Thời gian có giờ (Phase 3 trở đi) mới dùng `Intl.DateTimeFormat` với `timeZone`
lấy từ account.

## 10. Hạ tầng chạy

| | Dev | Prod-like |
|---|---|---|
| Chạy | Vite dev server `--host`, mount source | nginx alpine serve static |
| `/api` | proxy của Vite → `http://api:8000` | `proxy_pass http://api:8000` |
| Cổng | 5173 | 8080 |
| CORS | không dính (cùng origin) | không dính (cùng origin) |

`docker-compose.yml` thêm `web` (build `./frontend`, `depends_on: api`).
`docker-compose.dev.yml` override `web` sang Vite dev server. `CORS_ORIGINS` vẫn để trống —
đó là ý nghĩa của việc đi qua proxy. `VITE_API_BASE_URL` mặc định `/api`.

nginx cần SPA fallback `try_files $uri /index.html`, nếu không F5 trên `/accounts` sẽ ra 404
của nginx trước khi React kịp chạy.

## 11. Testing

| Tầng | Nội dung |
|---|---|
| Đơn vị | `decimal.ts` table-driven · bóc envelope · guard cấm `Number(` trên tiền · test đồng nhất bản chép theme |
| `api.ts` | **bắn 5 request song song cùng ăn 401, khẳng định MSW nhận đúng MỘT `POST /auth/refresh`** |
| Component (RTL + MSW) | login hiện `msg` của backend khi 1401 · guard render splash chứ không redirect khi `loading` · `AccountsPage` hiện `one_r` · form PATCH chỉ gửi dirty field · id account lưu sẵn không khớp thì rơi về account đầu |
| E2E (Playwright, Docker thật) | 1. đăng ký user đầu → tạo account → **F5** → vẫn đăng nhập, account vẫn đó. 2. logout → F5 → ở lại `/login`. 3. đăng ký lần hai → hiện thông báo đã đóng |

Kịch bản E2E số 1 là thứ **MSW không thay thế được**: nó là bằng chứng duy nhất rằng cookie
`Path=/api/auth` đi đúng qua proxy.

**Bất biến phải falsify** (xoá dòng, chứng minh có test đỏ) — thói quen rút từ 2a, nơi cách làm
này tìm ra lỗ hổng thật ở **cả 7 task từ 5 đến 11**:

- khoá `inflight` (KHÔNG phải `bootstrapped` — xem §5.3)
- splash khi `loading`
- PATCH chỉ gửi dirty field
- test đồng nhất bản chép theme
- dịch dấu chấm ở `decimal.ts`
- đối chiếu id account lưu sẵn với danh sách
- SPA fallback của nginx

`make test-fe` = `tsc --noEmit && vitest run && npm run build`. `make e2e` riêng vì cần Docker.
CI thêm job Node; job Go giữ nguyên.

## 12. Không làm

### 12.1 Thuộc phase sau — đã có lịch

| Món | Phase |
|---|---|
| Trade CRUD: form 16 field, bảng + filter, soft delete + restore, trash | 3 |
| Dashboard 24 KPI + 12 nhóm chart, ngưỡng màu | 4 |
| Recharts + bảng màu phân loại (bắt buộc dùng skill `dataviz`, spec mẹ §8.2) | 4 |
| Import CSV/Excel có preview + dry-run, export | 5 |

### 12.2 Chưa phase nào nhận — ghi ra để không núp bóng mục trên

| Món | Trạng thái |
|---|---|
| `air` hot-reload cho Go (spec mẹ §11 có nhắc, bảng phase §10 không xếp vào đâu) | **Bỏ.** Thêm khi Phase 3 thật sự sửa backend nhiều |
| Đặt lại mật khẩu / xác minh email | **Không làm.** Một user, đăng ký đã đóng. Khôi phục bằng `docker compose exec db psql` cập nhật `password_hash` |
| Xoá account | **Đẩy sang Phase 3.** Cần `DELETE /api/accounts/:id` và một quyết định nghiệp vụ thật: account còn trades thì chặn hay xoá lan. Chỉ trả lời được khi đã có trades |
| i18n | **Không có kế hoạch.** App một người dùng, tiếng Việt |

## 13. Xong khi

`docker compose up` lên đủ bốn service. Mở trình duyệt vào `http://localhost:8080` và làm trọn
vòng mà 2a chỉ làm được bằng `curl`: đăng ký user đầu → thấy đăng ký lần hai bị từ chối → tạo
account → thêm cash flow → **F5 và vẫn đăng nhập** → logout → F5 và vẫn ở `/login`.

`make test-fe` xanh, `make e2e` xanh, `make test` và `make test-pure` của backend **không đổi**.
