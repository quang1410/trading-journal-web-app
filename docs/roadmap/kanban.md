# Kanban

Nguồn: [lộ trình 3 tháng](2026-10-31-roadmap-11-2026-01-2027.md) và báo cáo rà soát Design ngày 31/10/2026.
Mỗi thẻ ship kèm test và đi qua 6 bước BA → Dev → Review → QC → PO → chờ OK (CLAUDE.md,
mục "Quy trình làm việc"). Chi tiết từng thẻ ở `tickets/K-xx.md` (mẫu: `tickets/_TEMPLATE.md`).
Bốc thẻ từ trên xuống trong cột **Cần làm**; thẻ có `chờ:` thì bỏ qua cho tới khi điều kiện
được gỡ.

Ưu tiên: **P0** chặn người dùng ngoài / lỗi chuẩn · **P1** sprint hiện tại · **P2** khi còn sức.
Cỡ: S ≤ 2 ngày · M 3–5 ngày · L > 1 tuần.

## Đang làm

| ID | Việc | Ưu tiên | Cỡ | Nguồn |
|---|---|---|---|---|

## Cần làm (S1–S2)

| ID | Việc | Ưu tiên | Cỡ | Nguồn | Xong khi |
|---|---|---|---|---|---|
| K-06 | Trang Lệnh rỗng có lối Import CSV | P1 | S | Design T5 | test EmptyState có link /import |
| K-07 | Chuỗi sót i18n (`"Email"`, `aria-label="Net"`, `placeholder="FTMO"`) + nhãn cột Mã sản phẩm | P1 | S | Design L1–L2 | |
| K-08 | Đổi định danh tiếng Việt (`setDangGui`, `DaiKyLuat`…) — quy tắc 9 | P1 | S | Design L4 | grep sạch |
| K-09 | Tiêu đề trang đồng bộ; dashboard loading/error vẫn có tiêu đề | P1 | S | Design T6 | |
| K-10 | Một `EmptyState` chung cho Tài khoản, Dashboard, AccountGate | P1 | S | Design H2 | |
| K-11 | Guard tĩnh còn thiếu: `float64` cho tiền, `{{` trong `strings.ts`, `time/tzdata`, importer/exporter vào purity test, migration không cột suy diễn | P1 | S | QA | |
| K-12 | CI: `make e2e`, test route-table (`chi.Walk`), `-race`, coverage FE | P1 | M | QA | |
| K-13 | Tiến độ thử thách quỹ trên Dashboard | P1 | S | PO B3 / Design T4 | |
| K-14 | Phím tắt một ký tự của Replay bật/tắt được (WCAG 2.1.4) | P1 | S | A11y | |
| K-30 | Nhiều tab refresh cùng lúc bị coi là tái sử dụng → đăng xuất mọi thiết bị. Cân nhắc khoảng ân hạn vài giây cho token vừa xoay, hoặc gộp refresh giữa các tab (BroadcastChannel / Web Locks) | P1 | M | QC K-02 (D2) | test 2 tab mở cùng lúc không bị đăng xuất; tái sử dụng thật vẫn bị bắt |
| K-31 | Test HTTP cho lỗi hạ tầng ở refresh → 500; cân nhắc không xoá cookie khi 500 | P2 | S | QC K-02 (D3) | |
| K-34 | Export CSV ghi offset giờ (vd `2026-11-01 01:30 -05:00`) để export → import giữ đúng lần xuất hiện thứ hai của giờ mơ hồ; import chấp nhận cả có lẫn không offset | P2 | S | BA K-29 (chủ dự án chọn) | round-trip export → import giữ nguyên instant |
| K-33 | Vô hiệu phiên cấp user khi phát hiện tái sử dụng (vd `users.sessions_valid_after`, `Rotate` kiểm mốc này) — đóng cửa sổ token thế hệ sau xoay đúng lúc đang thu hồi | P2 | M | Review K-02 vòng 2 | test xoay chuỗi Y→Z trong lúc thu hồi vẫn chết hết |
| K-35 | FE và BE chỉ khớp giờ khi trình duyệt và server cùng bản dữ liệu múi giờ (IANA tzdata). Server dùng bản nhúng qua `time/tzdata` của Go, thường cũ hơn trình duyệt → có thể lệch 1 giờ ở múi vừa đổi luật (vd Manitoba). Cân nhắc: FE gửi wall + tz để BE quy đổi, hoặc theo dõi phiên bản tzdata | P2 | M | QC K-29 | |
| K-36 | Trước khi deploy K-03: đo `max(char_length(notes))` của `trades` và `max(char_length(body_html))` của `journal_notes` trên prod; có dòng > 131.072 thì báo người dùng / quyết định | P1 | S | PO K-03 (cần K-21) | biết số dòng vượt trần |
| K-37 | Tắt module `uploader` của Quill (dán ảnh hiện lên rồi biến mất khi lưu, vì `sanitizeNoteHtml` bỏ `data:`) hoặc báo rõ | P2 | S | BA K-03 | test dán ảnh không hiện ảnh "ma" |
| K-38 | Khoá i18n theo mã/ngữ cảnh lỗi: bản tiếng Anh của lỗi import quá cỡ mất gợi ý "tách file"; ghi chú quá dài chỉ ra "invalid" chung | P2 | S | Review K-03 | |
| K-32 | Nút ghost "xoá" ở `TemplateManagerDialog` khi hover chỉ đạt 4,39 / 4,05 (< 4,5) | P2 | S | QC K-01 | |
| K-39 | Bộ đếm ký tự ghi chú (đếm chữ nhìn thấy, hiện khi > 80% trần) | P3 | S | BA K-03 | |
| K-40 | Từ chối dữ liệu thừa sau JSON hợp lệ trong `DecodeJSON` | P3 | S | Review K-03 | |
| K-41 | Hộp ghi chú kỳ: chữ "Đang lưu…" trên nút Lưu; kiểm focus sau lưu lỗi trên trình duyệt thật | P3 | S | QC K-03 (a11y) | |
| K-43 | Gộp 2 câu `Peek` khoá (cặp, email) thành một `SELECT … IN`, bớt 1 lượt đi về DB mỗi login | P2 | S | QC K-04 | |
| K-44 | Tạm cho tới khi có K-12: ticket có UI thì QC chạy `make e2e` ở bước 4, để spec không trôi khỏi UI lần nữa | P2 | S | PO K-42 | quy trình ghi trong CLAUDE.md hoặc mẫu ticket |
| K-46 | Link sang nhật ký ở trạng thái rỗng của Dashboard (`DashboardPage.tsx:84`) dùng `text-primary` (2,55:1) → `authLinkClass` hoặc class link chung | P2 | S | BA K-05 (QĐ4) | không còn `text-primary` cho chữ link |
| K-47 | Token `--focus-ring` theme sáng chỉ 2,58:1 trên nền trắng (< 3:1, WCAG 1.4.11); `theme.css` không được sửa → chủ sản phẩm quyết định đổi token hay dùng màu viền khác | P2 | S | QC K-05 (a11y) | chờ: chủ sản phẩm |
| K-48 | `/register` sau 1403: trình đọc màn hình chỉ đọc lỗi, không nhắc danh sách chờ; focus rơi về body | P3 | S | QC K-05 (a11y) | |
| K-49 | Lượt xem landing đếm hai lần cho cùng khách khi đi landing → login → `/?ref=login` (`LandingAnalytics.tsx` `landingOnly`); cân nhắc bỏ qua lượt có `ref=login` hoặc đo theo phiên | P3 | S | PO K-05 | |
| K-50 | Hộp thoại mở bằng state (không `DialogTrigger`) đóng xong thì focus rơi về `<body>` — Radix focus `triggerRef` rỗng (WCAG 2.4.3). Ứng viên: `TradesPage`, `TradeFormDialog`, `PeriodCard`, `PeriodNoteDialog`, `CashFlowSheet`/`CashFlowPanel`, `TemplateManagerDialog`, replay `SessionScreen`/`SettingsDialog`/`NavDialog`. Cân nhắc một helper chung như K-45 làm cho `DayTradesDialog` | P2 | M | QC K-45 | e2e/unit: đóng bằng Esc thì focus về nút đã mở |
| K-15 | Preset khoảng thời gian: Tuần này / Tháng này / Tháng trước | P2 | S | Design T3 | |
| K-16 | Skip link; bảng sr-only cho `TradeClassChart` | P2 | S | A11y | |
| K-17 | Calendar "hôm nay" theo `accounts.timezone` (nghi lệch quy tắc 4 — xác minh trước) | P2 | S | QA | |
| K-18 | Dọn tài liệu: README (Replay đã có backend), dòng trạng thái gap report | P2 | S | QA | |

## Chờ chủ dự án

| ID | Việc | Ưu tiên | Cỡ | Chờ |
|---|---|---|---|---|
| K-19 | Backup `pg_dump` theo lịch (GitHub Action) + thử khôi phục | P0 | S | chờ: secret kết nối Supabase, nơi lưu bản backup |
| K-20 | Theo dõi lỗi + uptime ping | P0 | S | chờ: chọn dịch vụ |
| K-21 | Bộ SQL metric hằng tuần + event funnel landing | P1 | S | chờ: quyền đọc DB production |
| K-22 | UX chấm điểm: mở sẵn hay hàng đợi "chưa chấm" | P1 | M | chờ: số liệu % lệnh được chấm (K-21) |
| K-23 | ICT journal Phase 0–1 (từ vựng, migration, API) | P0 | M | chờ: D3, D4 |
| K-24 | ICT Phase 2 (form, checklist 3 trạng thái, narrative) | P0 | L | chờ: K-23 |
| K-25 | ICT Phase 3 (`actual_r`, expectancy theo grade) | P0 | M | chờ: K-24 |
| K-26 | Replay: thống nhất token/toast; nối lệnh replay vào tài khoản Backtest | P2 | M | chờ: D2 |
| K-27 | Checklist làm quen 3 bước | P2 | M | chờ: test khả dụng |
| K-28 | Mobile: filter trong sheet, bảng lệnh dạng thẻ | P2 | L | chờ: phỏng vấn (dùng điện thoại hay máy tính) |

## Backlog (S3 trở đi)

E2E Replay · benchmark Go + partial index + bỏ `notes` khỏi truy vấn tính toán · endpoint gộp
dashboard · CSP/security header · tách `strings.ts` theo ngôn ngữ · axe trong test · golden
test từ file Excel · nhánh GO (mời, xác minh email, quên mật khẩu, quota) hoặc NO-GO
(vòng đời `planned/open/closed`, upload ảnh).

Từ K-04: chuyển limiter của Replay sang bộ đếm dùng chung (QĐ 2) · cấu hình proxy tin cậy cho
`X-Real-IP` khi tự host · đo tải cổng băm argon2 (`testing-performance-benchmarker`).

## Xong

| ID | Việc | Ngày | Ghi chú |
|---|---|---|---|
| K-01 | Chữ lỗ/cảnh báo đạt contrast (`text-loss`, `text-warn`) | 2026-11-01 | `2a33822` · 23 file; guard trong `styleguard.test.ts`; PO đạt |
| K-02 | Race xoay refresh token | 2026-11-01 | `5e89489` · `Rotate` một transaction; QC vòng 1 fail → làm lại; stress 200×8 trên Postgres sạch; PO đạt |
| K-29 | Giờ mơ hồ/không tồn tại khi đổi DST: quy đổi cố định, FE khớp BE | 2026-11-01 | `d73abd5` · quy tắc compatible (lặp → lần đầu, nhảy → dịch tới) cho cả form và import CSV; QC quét 12.960 phút × 4 mốc "bây giờ", 0 lệch; PO đạt |
| K-03 | Trần body JSON 2 MiB (413), ghi chú ≤ 131.072 ký tự, import ≤ 4 MB | 2026-11-01 | `d60dc73` · 13 route qua `DecodeJSON`; dropzone kiểm cỡ trước; hộp ghi chú kỳ giữ chữ khi lưu lỗi; PO đạt |
| K-04 | Rate limit dùng chung (Postgres) cho login/register/refresh/waitlist + lockout kết hợp + cổng băm argon2 | 2026-11-01 | `0f2fe90` · bảng `rate_limit_counters` upsert nguyên tử; khoá (email, IP) 5 lần sai, email 30 lần sai/giờ; cổng băm 4 chỗ → 503; FE khoá nút theo Retry-After, refresh 429 giữ phiên; QC HTTP thật 2 instance; PO đạt (điều kiện: e2e trước merge) |
| K-42 | e2e xanh trên UI hiện tại, chạy song song stack dev | 2026-11-01 | `6deb555` · sửa 7 nhóm bước lệch UI trong `auth.spec.ts`, không đổi code sản phẩm; `docker-compose.e2e.yml` chỉ mở cổng web; Makefile dọn stack cũ đúng cách, chặn Compose < 2.24; `make e2e` 28/28 hai lần, QC 5 mutant đều đỏ; PO đạt — điều kiện merge của K-04 đã thoả |
| K-05 | Login/register: lối "Tham gia danh sách chờ" thay cho "Đăng ký" | 2026-11-01 | `21bec1f` · luôn hiện link chờ ở login (không endpoint), `/register` hiện link khi 1403; link → `/?ref=login`; chữ link 17,75:1 / 14,98:1, viền focus thật (QC vòng 1 bắt `outline-none` triệt tiêu); e2e 29/29; PO đạt |
| K-45 | Viền focus bàn phím không hiện (Tailwind v4 `outline-none`) + focus về ô lịch khi đóng hộp ngày | 2026-11-02 | `HASH` · bỏ `outline-none` ở ô lịch và link hộp ngày, `TabsContent` có viền; guard styleguard theo token; hộp ngày trả focus về ô đã mở (Radix focus `triggerRef` rỗng); khung lịch đệm 4px để viền không bị cắt; e2e 21a đo viền + hình học; QC 2 vòng; PO đạt |
