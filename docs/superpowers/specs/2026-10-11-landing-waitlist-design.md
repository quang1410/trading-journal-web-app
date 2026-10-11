# Landing page và danh sách chờ — thiết kế

Ngày: 2026-10-11 · Trạng thái: chờ duyệt

## 1. Mục tiêu

Đo nhu cầu trước khi đầu tư làm multi-user. Landing giới thiệu sản phẩm cho trader Việt
Nam và thu email vào danh sách chờ, kèm 3 câu hỏi ngắn để biết người đăng ký là ai.

**Thành công đo bằng:** số người đăng ký, tỷ lệ chuyển đổi (đăng ký / lượt xem landing),
và phân bố câu trả lời (đang ghi nhật ký bằng gì, thị trường, có thi quỹ không). Mỗi
đăng ký mang theo nguồn (`utm_source` / `ref`) để biết group hay kênh nào đem người tới.

**Không làm trong phase này:**

- Multi-user, mở đăng ký. `/register` giữ nguyên quy tắc một user.
- Gửi email (xác nhận, thư mời). Danh sách được đọc thẳng từ DB.
- Trang admin xem danh sách chờ. Dùng SQL ở §8.
- SEO cho Google (pre-render, SSR). Traffic dự kiến đến từ link chia sẻ trong group.

## 2. Thiết kế giao diện đã duyệt

Mockup: `docs/design/landing-mockup.html` (bản publish:
https://claude.ai/artifact/DwyRUkCwHanatGokSi3t7X). Mockup là HTML tĩnh, chỉ dùng làm
tham chiếu thị giác. Code thật viết lại bằng React và Tailwind theo token của theme.

### 2.1. Thứ tự các khối

| # | Khối | Nội dung |
|---|---|---|
| 1 | Thanh trên | Logo + "Nhật ký giao dịch", link neo Chấm điểm / Tính năng / Hỏi đáp, `LanguageSwitcher`, `ThemeToggle`, link "Đăng nhập" → `/login` |
| 2 | Hero | Nhãn "Đang nhận đăng ký dùng thử", H1 "Lệnh lãi chưa chắc là **lệnh đúng.**" (vế sau màu lỗ), đoạn dẫn, form email. Bên phải: biểu đồ lý thuyết và thực tế (§2.3) |
| 3 | Chấm điểm | "Bốn câu hỏi sau mỗi lệnh" + phiếu chấm điểm bấm được (§2.4) |
| 4 | Tính năng | "Nhập lệnh một lần. Ứng dụng tính phần còn lại." Khối Dashboard lớn + 4 thẻ có hình minh hoạ (§2.5), dòng "Còn có", dòng nguồn gốc Excel |
| 5 | Dùng thử sớm | Form danh sách chờ lần hai, cho người đọc hết trang |
| 6 | Hỏi đáp | 4 câu, dùng `<details>` |
| 7 | Footer | Tên sản phẩm, dòng "Số liệu trên trang là minh hoạ." |

### 2.2. Chữ, màu, token

- **Font tiêu đề: IBM Plex Sans 600**, có bộ dấu tiếng Việt. Chỉ dùng cho H1, H2, H3.
  Cài `@fontsource/ibm-plex-sans` và import **chỉ trong chunk landing**, để app không
  phải tải thêm font. Khai `--font-display` trong `@theme` của `bridge.css` để có utility
  `font-display`.
- Chữ thường giữ Inter, số liệu giữ JetBrains Mono như app.
- Tiêu đề tiếng Việt chồng dấu nên `line-height` tối thiểu 1.1 cho H1, 1.16 cho H2.
- **Token mới trong `bridge.css`** (`theme.css` không sửa):

  | Token | Sáng | Tối | Lý do |
  |---|---|---|---|
  | `--loss-text` | `var(--color-red-700)` | `var(--color-red-300)` | `--status-error` trên nền trắng chỉ đạt 3,76:1; chữ số lỗ cần ≥ 4,5:1 |
  | `--warn-text` | `var(--status-warning-text)` | `var(--status-warning)` | Chữ bậc "Cần cải thiện": `--status-warning` trên nền sáng chỉ đạt 1,74:1 |
  | `--cta` | `var(--color-teal-900)` | `var(--primary)` | Chữ trắng trên `--primary` chỉ đạt 2,55:1 |
  | `--cta-foreground` | `var(--color-white)` | `var(--gray-950)` | Đi cặp với `--cta` |

  Khai thêm `--color-loss`, `--color-warn`, `--color-cta`, `--color-cta-foreground` trong `@theme inline`
  để có utility. Nhớ bẫy: tên chưa khai trong `@theme` thì không sinh ra lớp CSS nào.
- Lãi dùng `text-profit` có sẵn. Mảng màu lỗ (vùng gạch, thanh) dùng `--status-error`.
- Logo vẽ lại bằng SVG nội tuyến, màu lấy từ token. Không chép hex của `favicon.svg` vào
  component (`styleguard` chặn).
- Theme: landing dùng chung `journal.theme` với app. Mặc định vẫn là tối như
  `index.html` hiện tại. Mockup đã kiểm cả hai theme.

### 2.3. Biểu đồ lý thuyết và thực tế (hero)

- SVG tự vẽ, không dùng Recharts, để chunk landing không kéo theo Recharts.
- Dữ liệu là **30 lệnh minh hoạ cố định** (`gapSample.ts`), 1R = 100 USD, ghi rõ trên thẻ
  "Dữ liệu minh hoạ". Tổng cuối: lý thuyết +1.330, thực tế +190, chênh lệch −1.140.
- Hai đường: lý thuyết (nét đứt, `--text-muted`) và thực tế (`--primary`). Vùng giữa tô
  gạch chéo màu lỗ. Mỗi lệnh làm khác kế hoạch có một chấm đỏ. Rê chuột, focus hoặc bấm
  vào chấm thì dòng chú thích bên dưới hiện tên lệnh, nhãn lỗi và số tiền mất. Lúc tải
  trang, chú thích hiện lệnh mất nhiều nhất.
- Vẽ lại theo kích thước thật của khung (`ResizeObserver`), để chữ trục không bị co nhỏ
  trên điện thoại.
- Hiệu ứng duy nhất của trang: đường thực tế tự vẽ trong 1,3 giây, sau đó vùng gạch hiện
  dần. Tắt hẳn khi `prefers-reduced-motion`.
- **Số minh hoạ để ở dạng `number`.** Đây là dữ liệu tổng hợp nằm trong code landing,
  không đến từ backend, nên quy tắc "tiền là chuỗi" không áp vào. Comment đầu file
  `gapSample.ts` ghi rõ điều này. File không dùng `Number()`, `parseFloat()` hay `toPlot()`.
- **Nhãn lỗi trên chấm đỏ lấy từ `/meta/enums`.** Mẫu dữ liệu tham chiếu nhãn bằng
  `{ field: "psychologies", index: 5 }`. Test ghim index nào ra chuỗi nào (file test được
  phép chứa chuỗi enum). Nếu `/meta/enums` chưa trả về, chấm đỏ vẫn hiện, chú thích chỉ
  hiện số tiền.

### 2.4. Phiếu chấm điểm

- Một lệnh mẫu: XAUUSD · Short · M15, **+90 USD**. Lựa chọn mặc định ra 35/100, loại
  "Bốc đồng / FOMO".
- Bốn nhóm radio dạng chip: Vào lệnh, Trong lệnh, Thoát lệnh, Tâm lý. Bấm để chấm lại,
  tổng điểm, thanh đo và loại lệnh cập nhật ngay.
- **Nhãn, điểm và ngưỡng phân loại đều lấy từ backend** (§4.1), không chép vào frontend.
  Quy tắc 5 của CLAUDE.md và `styleguard` đều đòi điều này.
- Lựa chọn mặc định được chọn theo điểm (vào lệnh 10, trong lệnh 25, thoát lệnh 0, tâm
  lý 0), cách viết đó không chứa chuỗi enum.
- Khi `/meta/enums` đang tải, phiếu hiện khung xương cùng kích thước. Khi lỗi, phiếu ẩn
  hẳn và khối chỉ còn phần chữ bên trái.

### 2.5. Tính năng

Hình minh hoạ dựng bằng React với dữ liệu mẫu cố định, không dùng ảnh chụp màn hình,
để giữ nét và tự đổi theo theme.

- **Dashboard** (khối lớn): 4 KPI (Lãi ròng, Tỷ lệ thắng, Hệ số lợi nhuận, Sụt giảm lớn
  nhất), thanh "Lãi ròng theo setup" (setup cuối là `default_setup` lấy từ meta, đang
  lỗ), radar tâm lý 4 trục. Bên trái là tên đủ 13 nhóm biểu đồ.
- **Tài khoản quỹ và vòng thi:** các bước Vòng 1 ✓ → Vòng 2 → Funded, thanh Lợi nhuận
  3,4% / 5% và Drawdown 2,1% / 10%.
- **Tổng kết ngày và tuần:** tab Lệnh/Ngày/Tuần, thẻ W41 với 4 số và một ghi chú.
- **Ghi chú và checklist:** mẫu "HTF PDA - FVG - H1", 3/4 bước đã tích.
- **Nhập từ Excel:** 3 dòng CSV, BUY → Long, SELL → Short, "128 dòng đọc được · 2 dòng
  cần sửa".

Nhãn tái dùng khoá có sẵn trong `strings.ts` khi trùng nghĩa (`kpi.*`, `periods.*`,
`accounts.*`). Nhãn mới thêm với tiền tố `landing.`.

### 2.6. Form danh sách chờ

Hai bước, để giữ được email kể cả khi người dùng bỏ qua phần khảo sát:

1. Ô email + nút "Vào danh sách chờ". Gợi ý dưới ô: "Chỉ gửi email khi mở cho bạn dùng."
   Email sai dạng thì báo ngay tại chỗ: "Email chưa đúng dạng. Ví dụ: ten@gmail.com".
2. Gửi thành công thì form biến thành khung: "Đã thêm vào danh sách chờ. Thư mời sẽ gửi
   tới {email}." kèm 3 câu không bắt buộc và nút "Gửi câu trả lời":
   - Bạn đang ghi nhật ký bằng gì? Excel / Google Sheets · Notion · Ứng dụng khác · Chưa ghi
   - Bạn giao dịch thị trường nào? (chọn nhiều) Forex / Vàng · Crypto · Chứng khoán VN · Phái sinh VN
   - Bạn có đang thi quỹ không? Đang thi · Đã từng · Chưa
3. Gửi câu trả lời xong: "Đã lưu câu trả lời. Cảm ơn bạn, hẹn gặp khi đến lượt."

Cả hai form trên trang dùng chung một component. Đăng ký ở form này thì form kia cũng
chuyển sang trạng thái đã đăng ký. Trạng thái nằm ở `LandingPage`, không lưu
`localStorage`.

Có một ô honeypot `website` ẩn khỏi người dùng và trình đọc màn hình (`tabIndex=-1`,
`aria-hidden`), để bắt bot.

Lỗi mạng hoặc 5xx: "Chưa gửi được. Kiểm tra kết nối rồi thử lại." Lỗi 429 hiện nguyên văn
`msg` của server, theo `i18n/errors.ts`.

### 2.7. Hỏi đáp

Bốn câu, chủ sản phẩm đã duyệt nội dung ngày 2026-10-11:

- Khi nào tôi được dùng? → Mở theo đợt, theo thứ tự đăng ký.
- Tôi có nhập được nhật ký Excel đang dùng không? → Có, qua CSV, báo rõ dòng nào sai.
- Chấm điểm dựa trên gì? → Bốn tiêu chí × 25 điểm, các ngưỡng 80 / 55 / 30.
- Có mất phí không? → Người trong danh sách chờ dùng thử miễn phí trong giai đoạn đầu.

**Ngưỡng 80 / 55 / 30 trong câu trả lời lấy từ `class_bands`** (§4.1), không gõ cứng.

## 3. Định tuyến và tải trang

- `router.tsx`: thêm `<Route path="/" element={<SkipIfAuthed><LandingPage /></SkipIfAuthed>} />`.
  `SkipIfAuthed` khác `OnlyAnon` ở chỗ không hiện Splash khi phiên đang khôi phục: khách lạ
  thấy landing ngay, không chờ `/auth/refresh`. Người đã đăng nhập vẫn sang `/dashboard`.
- Route `*` giữ nguyên.
- `LandingPage` là một chunk `lazy` riêng. Chunk này **không được** kéo theo Recharts,
  Quill, react-hook-form hay zod. Form waitlist chỉ có 1 ô và vài chip, viết bằng state
  thường. Kiểm bằng `npm run build` rồi xem file chunk landing trong `dist/assets`.
- `index.html`: thêm `<meta name="description">`, `og:title`, `og:description`,
  `og:image` và `og:url` dạng URL tuyệt đối (`%SITE_URL%/og.png`, 1200×630; `SITE_URL` đặt lúc build — Facebook và X không ghép đường dẫn tương đối), `og:locale` = `vi_VN`, `twitter:card` =
  `summary_large_image`. App là SPA, nên đây là thẻ duy nhất Facebook và Zalo đọc được
  khi chia sẻ link.
- `public/og.png`: chụp một lần từ khối hero của landing thật bằng Playwright (theme
  sáng), rồi commit vào repo. Không viết script sinh tự động.

## 4. Backend

### 4.1. Mở rộng `/api/meta/enums`

Thêm hai khoá, đều sinh từ package `scoring` để chỉ có một nguồn sự thật:

```json
"score_points": {
  "entry_qualities":    { "<nhãn>": 25, ... },
  "in_trade_qualities": { ... },
  "exit_qualities":     { ... },
  "psychologies":       { ... }
},
"class_bands": [
  { "min": 80, "class": "<domain.ClassPlanned>" },
  { "min": 55, "class": "<domain.ClassNeedsWork>" },
  { "min": 30, "class": "<domain.ClassImpulsive>" },
  { "min": 0,  "class": "<domain.ClassRevenge>" }
]
```

- `score_points` tạo bằng cách gọi `scoring.Entry(label)` và các hàm tương tự cho từng
  nhãn trong `domain.*`. Không viết thêm bảng điểm thứ hai.
- `class_bands`: tách ngưỡng của `scoring.Classify` thành biến `scoring.ClassBands`
  (slice đã sắp giảm dần), và `Classify` đọc từ biến đó. Test hiện có của `Classify` phải
  vẫn xanh, không sửa.
- `scoring` vẫn là package thuần.
- Thêm test: mỗi nhãn trong `score_points` khớp đúng điểm của bảng §2 trong
  `trading-journal-plan.md`; `class_bands` khớp §2.6.

### 4.2. Bảng `waitlist_signups` (migration `0007_waitlist`)

```sql
CREATE TABLE waitlist_signups (
    id           BIGSERIAL   PRIMARY KEY,
    email        TEXT        NOT NULL,           -- đã trim + lowercase
    locale       TEXT        NOT NULL DEFAULT 'vi',
    source       TEXT        NULL,               -- utm_source hoặc ref, tối đa 64 ký tự
    journal_tool TEXT        NULL,
    markets      TEXT        NOT NULL DEFAULT '', -- mã cách nhau bằng dấu phẩy, đã sắp xếp
    prop_status  TEXT        NULL,
    answered_at  TIMESTAMPTZ NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT waitlist_locale       CHECK (locale IN ('vi', 'en')),
    CONSTRAINT waitlist_email_len    CHECK (char_length(email) <= 254),
    CONSTRAINT waitlist_source_len   CHECK (char_length(source) <= 64),
    CONSTRAINT waitlist_journal_tool CHECK (journal_tool IN ('spreadsheet', 'notion', 'other_app', 'none')),
    CONSTRAINT waitlist_prop_status  CHECK (prop_status IN ('active', 'past', 'never'))
);

-- Ràng buộc này thực thi "mỗi email một dòng" và là đích của ON CONFLICT.
CREATE UNIQUE INDEX waitlist_signups_email ON waitlist_signups (email);
```

- Mã thị trường: `fx_gold`, `crypto`, `vn_stocks`, `vn_derivatives`.
- `markets` lưu dạng chuỗi thay vì `TEXT[]`, để GORM không cần thêm kiểu mảng và dữ liệu
  vẫn đọc dễ trong Supabase.
- Bảng không liên kết với `users`. Người trong danh sách chờ chưa phải user.

### 4.3. Endpoint (công khai, không cần đăng nhập)

**`POST /api/waitlist`** — body `{ email, locale?, source?, website? }`

| Trường hợp | Phản hồi |
|---|---|
| Email mới | 200 `{ "joined": true }`, thêm dòng mới |
| Email đã có | 200 `{ "joined": true }`, không đổi gì |
| `website` khác rỗng (bot) | 200 `{ "joined": true }`, không lưu |
| Email sai dạng | 400 / 1400 `"email không hợp lệ"` |
| Vượt giới hạn tần suất | 429 / 1429 `"gửi quá nhiều lần, thử lại sau một phút"` |

Ba trường hợp thành công trả về **giống hệt nhau**, để không ai dò được email nào đã
đăng ký. Thêm dòng bằng `INSERT ... ON CONFLICT (email) DO NOTHING`.

**`PUT /api/waitlist/answers`** — body `{ email, journal_tool?, markets?, prop_status? }`

- Chỉ ghi khi dòng tồn tại **và** `answered_at IS NULL`: câu trả lời chỉ ghi được một
  lần, nên người khác biết email cũng không ghi đè được nhiều lần.
- Email không có, hoặc đã trả lời rồi, vẫn trả 200 `{ "saved": true }` để không lộ
  thông tin.
- Mã sai (ví dụ `journal_tool: "abc"`) → 400 / 1400.
- Chỉ có `email`, không chọn câu nào, cũng hợp lệ và vẫn đặt `answered_at`.

**Quy tắc chung:**

- Chuẩn hoá email trong `domain`: trim, lowercase, `net/mail.ParseAddress` phải đúng
  nguyên chuỗi, phần domain phải có dấu chấm, độ dài ≤ 254.
- Chuẩn hoá `source` trong `domain`: trim, đổi sang chữ thường (để `FB-Group` và
  `fb-group` gom về một nguồn), chỉ giữ `[a-z0-9_.-]`, tối đa 64 ký tự, rỗng thì là NULL.
- `locale` không phải `vi` hay `en` thì lưu là `vi`.

### 4.4. Giới hạn tần suất

- Middleware `RateLimit` trong `httpapi/ratelimit.go`, chỉ gắn vào nhánh `/api/waitlist`.
  Đếm theo header `X-Real-IP` — cả nginx lẫn Vercel GHI ĐÈ header này bằng IP thật của kết
  nối — rồi mới tới `RemoteAddr`. KHÔNG dùng `RemoteAddr` sau `middleware.RealIP`: RealIP tin
  `True-Client-IP` / `X-Forwarded-For` do client tự gửi, đổi header mỗi request là thoát giới
  hạn. IPv6 đếm theo /64. Mỗi khoá 5 request mỗi phút, cửa sổ trượt trong bộ nhớ; map có trần
  10.000 khoá.
- **Giới hạn đã biết:** trên Vercel, mỗi instance của function có bộ đếm riêng, nên giới
  hạn này chỉ chặn được tốt nhất có thể. Chấp nhận được vì còn honeypot, email là duy
  nhất, và trong bảng không có gì đáng để spam. Nếu bị spam thật thì chuyển sang Vercel
  Firewall rate limit.
- Thêm `apperr.TooManyRequests(msg)` (429 / 1429).

### 4.5. Phân tầng

| Tầng | File | Việc |
|---|---|---|
| domain | `waitlist_rules.go` | `NormalizeEmail`, `NormalizeSource`, `NormalizeLocale`, `ParseAnswers(WaitlistAnswerCodes)` (kiểm mã, chuẩn hoá `markets`) |
| service | `waitlist.go` | `WaitlistService.Join`, `.SaveAnswers`; nhận interface `WaitlistStore` |
| repository | `waitlist.go` | `WaitlistRepo.Insert` (ON CONFLICT DO NOTHING), `WaitlistRepo.SaveAnswers` (UPDATE ... WHERE answered_at IS NULL) |
| httpapi | `waitlist_handler.go`, `ratelimit.go` | handler, `RateLimit`; gắn ngoài mọi guard đăng nhập, cạnh `/meta/enums` |
| cmd/api | `main.go` | dựng service, thêm vào `Deps.Waitlist` |

Lỗi trả cho client là tiếng Việt (`apperr`), lỗi nội bộ và log là tiếng Anh, theo quy
tắc 9.

## 5. Frontend

```
src/features/landing/
  LandingPage.tsx        bố cục, state "đã đăng ký" dùng chung, import font
  LandingAnalytics.tsx   <Analytics/> của Vercel, lọc chỉ gửi lượt xem của /
  LandingNav.tsx
  Hero.tsx               bố cục hero; form và biểu đồ truyền vào dạng slot
  SectionTitle.tsx       H2 dùng chung của các khối
  GapChart.tsx           SVG tự vẽ
  gapSample.ts           dữ liệu minh hoạ + hàm thuần (lũy kế, tổng, lệnh mất nhiều nhất)
  format.ts              định dạng số minh hoạ (không dùng cho tiền thật)
  ScoreTicket.tsx
  ScoringSection.tsx
  ticket.ts              hàm thuần: tổng điểm, phân loại theo class_bands
  FeatureShowcase.tsx
  previews/              DashboardPreview, ChallengePreview, PeriodPreview,
                         NotePreview, ImportPreview
  ChoiceChip.tsx         chip radio/checkbox dùng chung cho form và phiếu chấm điểm
  WaitlistForm.tsx       hai bước: EmailStep, AnswersStep
  waitlist.ts            mã câu trả lời, nhãn, đọc utm_source / ref từ URL
  Faq.tsx
  api.ts                 useJoinWaitlist, useSaveWaitlistAnswers (TanStack mutation)
```

- `MetaEnums` trong `features/meta/hooks.ts` thêm kiểu cho `score_points` và
  `class_bands`.
- Mọi chuỗi hiển thị thêm vào `strings.ts` dạng `{ vi, en }`, tiền tố `landing.`. Nội
  suy dùng **một ngoặc** `{email}`.
- **Đo lượt xem:** dùng Vercel Web Analytics (`@vercel/analytics`). `<Analytics />` chỉ
  mount trong `LandingPage`, chỉ ở bản build và chỉ khi phiên đã xác định là khách
  (người đã đăng nhập thấy landing một nhịp trước khi sang `/dashboard`, không tính).
  Script của Vercel sống tiếp sau khi landing unmount và tự đếm mọi lần đổi route, nên
  `beforeSend` lọc chỉ gửi sự kiện của đường dẫn `/`: không theo dõi người dùng app.
  Không dùng cookie. Phải bật Web Analytics cho project trên dashboard Vercel; khi chạy
  local, component không làm gì.

## 6. Testing

Mỗi phần ship kèm test trong cùng thay đổi, theo CLAUDE.md.

**Backend**

- `scoring`: `ClassBands` khớp §2.6; `Classify` vẫn xanh.
- `httpapi/meta`: `score_points` có đủ mọi nhãn, điểm khớp bảng §2; `class_bands` đúng
  thứ tự.
- `domain`: mã câu trả lời trong list Go khớp CHECK của migration 0007 (frontend có
  test tương tự so list TS với list Go); bảng test cho `NormalizeEmail` (hoa/thường, khoảng trắng, thiếu `@`, thiếu
  dấu chấm, 255 ký tự, `"a b"@x.com`), `NormalizeSource`, `ParseAnswers` (mã sai, thị
  trường trùng, thị trường lệch thứ tự).
- `service` (memstore): đăng ký lại cùng email không lỗi, không tạo thêm dòng;
  honeypot không lưu; câu trả lời chỉ ghi lần đầu; email lạ vẫn trả thành công.
- `repository` (Postgres thật): unique theo email; hai lần `Join` song song chỉ ra một
  dòng; `SaveWaitlistAnswers` lần hai không đổi dữ liệu.
- `httpapi`: các mã trạng thái ở §4.3; ba trường hợp thành công trả body giống hệt nhau;
  request thứ 6 trong một phút ra 429; route không đòi token.

**Frontend** (Vitest + MSW)

- `gapSample`: tổng lý thuyết +1.330, thực tế +190, chênh lệch −1.140; lệnh mất nhiều
  nhất là #5; index trỏ vào meta ra đúng chuỗi enum mong muốn.
- `ticket`: các ngưỡng 80 / 79 / 55 / 54 / 30 / 29 / 0 ra đúng loại.
- `ScoreTicket`: mặc định 35 điểm; bấm "Đúng kế hoạch" ở Vào lệnh thì lên 50.
- `WaitlistForm`: email sai hiện lỗi tại chỗ; thành công hiện khung câu hỏi với email đã
  nội suy (assert chuỗi đã nội suy, không assert khoá); đăng ký ở form trên thì form dưới
  cũng đổi; lỗi 429 hiện `msg` của server; lỗi mạng hiện câu lỗi chung.
- `router`: chưa đăng nhập vào `/` thấy landing; đã đăng nhập vào `/` sang `/dashboard`.
- `styleguard` hiện có phải xanh: không hex, không `Number(`, không chuỗi enum trong
  `features/landing/`.

**E2E** (Playwright): mở `/`, đăng ký một email, trả lời câu hỏi, rồi kiểm dòng trong
bảng qua DB của project E2E (`e2e/db.ts` gọi `psql` qua `docker compose exec`).

**Kiểm tay trước khi báo xong:** `npm run build`, kiểm chunk landing không chứa Recharts
và Quill; chụp landing ở 1280px và 390px, cả hai theme; đo tương phản `--loss-text` và
`--cta` trong theme tối bằng `getComputedStyle`, không nhìn ảnh.

## 7. Triển khai

- Chạy migration `0007` trên Supabase trước khi deploy, như các migration trước
  (`docs/deployment-vercel-supabase.md`).
- Bật Web Analytics trong project Vercel.
- Link chia sẻ cho từng group gắn nguồn, ví dụ `https://<domain>/?ref=fb-group-forex`.

## 8. Đọc kết quả

```sql
-- Tổng đăng ký và tỷ lệ có trả lời
SELECT count(*) AS signups,
       count(answered_at) AS answered
FROM waitlist_signups;

-- Theo nguồn
SELECT coalesce(source, '(none)') AS source, count(*)
FROM waitlist_signups GROUP BY 1 ORDER BY 2 DESC;

-- Đang ghi nhật ký bằng gì
SELECT journal_tool, count(*) FROM waitlist_signups
WHERE answered_at IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;
```

Tỷ lệ chuyển đổi = `signups` chia cho lượt xem `/` trên Vercel Web Analytics, cùng
khoảng thời gian.
