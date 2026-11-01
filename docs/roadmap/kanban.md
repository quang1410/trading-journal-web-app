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
| K-03 | `MaxBytesReader` cho body JSON; trần độ dài `notes` và ghi chú kỳ; trần import < 4,5 MB — bước 1 BA check | P0 | S | API |

## Cần làm (S1–S2)

| ID | Việc | Ưu tiên | Cỡ | Nguồn | Xong khi |
|---|---|---|---|---|---|
| K-04 | Rate limit dùng chung (Postgres) cho login/register/refresh + lockout theo email | P0 | M | API | test 429; bộ đếm sống qua nhiều instance |
| K-05 | Link "Đăng ký" ở trang login → "Tham gia danh sách chờ" khi đăng ký đã đóng | P1 | S | Design T1 | test cả hai trạng thái |
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
| K-32 | Nút ghost "xoá" ở `TemplateManagerDialog` khi hover chỉ đạt 4,39 / 4,05 (< 4,5) | P2 | S | QC K-01 | |
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

## Xong

| ID | Việc | Ngày | Ghi chú |
|---|---|---|---|
| K-01 | Chữ lỗ/cảnh báo đạt contrast (`text-loss`, `text-warn`) | 2026-11-01 | `2a33822` · 23 file; guard trong `styleguard.test.ts`; PO đạt |
| K-02 | Race xoay refresh token | 2026-11-01 | `5e89489` · `Rotate` một transaction; QC vòng 1 fail → làm lại; stress 200×8 trên Postgres sạch; PO đạt |
| K-29 | Giờ mơ hồ/không tồn tại khi đổi DST: quy đổi cố định, FE khớp BE | 2026-11-01 | commit này · quy tắc compatible (lặp → lần đầu, nhảy → dịch tới) cho cả form và import CSV; QC quét 12.960 phút × 4 mốc "bây giờ", 0 lệch; PO đạt |
