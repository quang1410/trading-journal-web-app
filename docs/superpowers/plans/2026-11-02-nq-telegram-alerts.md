# Bot Telegram bản đồ ICT cho NQ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sáu tin Telegram mỗi ngày về NQ (trước phiên Asia, NY AM và trước 4 macro), đưa dữ kiện
ICT trên 8 khung và hai kịch bản "nếu… thì…", không đưa bias như lời dự đoán.

**Architecture:** Package thuần `internal/ict` (đã có phần phân tích + backtest) thêm lịch tin và
phần soạn tin. Tầng hạ tầng thêm `internal/telegram`, bảng `alert_notices` (giữ chỗ chống trùng,
chặn 6 tin/ngày), `service.AlertService` điều phối, route `GET /api/cron/alerts` bảo vệ bằng
`CRON_SECRET`. Supabase `pg_cron` gọi route mỗi phút.

**Tech Stack:** Go 1.23, chi, GORM, PostgreSQL 16 (Supabase), testcontainers · Yahoo chart API,
TradingView websocket (đã có `yahoofeed`, `tvfeed`) · Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-11-02-nq-telegram-alerts-design.md` ·
Backtest: `docs/ict-backtest-2026-11-02.md`

## Global Constraints

- `internal/ict` là package thuần: không import GORM, `net/http`, `database/sql`, `context`.
  Test chạy không cần Docker và nằm trong `make test-pure`.
- Giá trong `ict` là `float64` (giá chỉ số, không phải tiền — xem comment đầu `chart.go`). Ranh
  giới chuỗi → số là `ict.BarsFrom(domain.MinuteBars)`, chỉ ở đó.
- Mọi giờ tính theo `ict.NY` (America/New_York). Không hardcode độ lệch UTC.
- Code tiếng Anh (định danh, route, log, lỗi, tên test, chuỗi `t.Run`), comment tiếng Việt. Nội dung
  tin Telegram là text cho người dùng → tiếng Việt.
- Không log token bot. Lỗi `net/http` có chép URL (chứa token) → client phải xoá URL khỏi lỗi.
- Mỗi task có test trong cùng commit. Sửa bug thì thêm regression test fail trên code cũ.
- Lệnh: `make test-pure`, `make lint`, `make test` (cần Docker: contract test Postgres).

## Đã xong (commit `256afdb`)

- [x] `internal/ict`: `NewChart` (8 khung, mốc 18:00 NY), `Swings`, `Trend`, `FindFVGs`,
      `SessionLevels`, SMT, `pickRange` (HR/LR), `Analyze`, `BiasSlots`, `FirstHit`, `Score`,
      `ScoreConditional`, `Tally`. Test 86,5%, có test chống lộ nến tương lai.
- [x] `cmd/ict-backtest` + báo cáo `docs/ict-backtest-2026-11-02.md`.

---

## Task 1: Khung ≥ 1H từ nến 1H

Nến 1m của Yahoo chỉ lùi được ~30 ngày (mỗi lần gửi tin chỉ kéo 6 ngày), không đủ swing cho 12H /
Daily. Yahoo cho nến 1H 60 ngày trong một request.

**Files:** `backend/internal/ict/chart.go`, `backend/internal/ict/ict_test.go`

- [ ] `NewChartWithHourly(m1, h1 []Bar) *Chart`: khung 15m / 30m gom từ `m1`; khung ≥ 1H gom từ `h1`,
      rồi ghi đè bằng nến gom từ `m1` ở những nến mà `m1` phủ trọn (nến 1m chính xác hơn).
- [ ] `BarsFrom(b domain.MinuteBars) ([]Bar, error)`: đổi `json.Number` → `float64`, lỗi nếu cột
      lệch độ dài hoặc số hỏng.
- [ ] Test: khung 4H giống nhau khi dựng từ 1m và từ 1H trên cùng data; nến 1H thiếu thì vẫn có nến
      khung lớn từ 1m; `BarsFrom` bắt số hỏng.

## Task 2: Lịch 6 tin

**Files:** `backend/internal/ict/schedule.go`, `backend/internal/ict/schedule_test.go`

- [ ] `type Notice struct { ID string; Session string; Kind NoticeKind; At time.Time; MacroStart, MacroEnd time.Time; SessionOpen time.Time }`
      với `Kind` là `NoticeOpen` hoặc `NoticeMacro`. ID: `asia-open`, `asia-macro-1950`,
      `asia-macro-2050`, `ny-open`, `ny-macro-0950`, `ny-macro-1050`.
- [ ] `NoticesOn(day time.Time) []Notice`: Asia Chủ nhật → thứ Năm, NY AM thứ Hai → thứ Sáu.
- [ ] `DueNotice(now time.Time, grace time.Duration) (Notice, bool)`: tin có `At ≤ now < At+grace`.
- [ ] `Notice.Key()` = `"2006-01-02/<ID>"` theo ngày New York của `At`; `MaxNoticesPerDay = 6`.
- [ ] Test bảng: đúng 6 tin ngày thứ Hai; 3 tin Chủ nhật (chỉ Asia); 3 tin thứ Sáu (chỉ NY AM); thứ
      Bảy không tin nào; ngày đổi giờ 08/03/2026 và 01/11/2026 vẫn đúng giờ New York; `now` = `At` +
      2m59s còn hạn, + 3m hết hạn.

## Task 3: Soạn tin

**Files:** `backend/internal/ict/render.go`, `backend/internal/ict/render_test.go`

- [ ] `RenderOpen(a Analysis, n Notice) string` theo mẫu "Tin trước phiên" trong spec: bảng 8 khung
      (cấu trúc + SMT), thanh khoản BSL / SSL (đã quét thì ghi giờ), Midnight Open (NY) hoặc giá mở
      18:00 (Asia) và Premium / Discount, FVG giữ / phá trong 24 giờ, range + HR/LR, hai kịch bản,
      dòng "DOL tiềm năng theo luật … (chưa kiểm chứng)", checklist.
- [ ] Bổ sung `Analysis`: `Opens` (Midnight Open, 18:00 open), danh sách FVG giữ / phá để render.
      Phiên Asia: thêm mức NY AM / NY PM của ngày vừa đóng (đã có trong `SessionLevels`).
- [ ] `RenderMacro(a Analysis, n Notice) string`: những gì xảy ra từ giờ mở phiên tới nến cuối (quét,
      SMT mới, điều kiện còn giữ không, râu nến 15m so với giá mở = stacking), BSL / SSL gần nhất,
      nhắc PO3 của nến sắp mở.
- [ ] Số: `21 345.25` (2 chữ số thập phân, cách hàng nghìn bằng khoảng trắng). Giờ: `HH:MM` NY.
- [ ] Không có range: ghi "Chưa có range hợp lệ từ 15m tới Daily", bỏ phần kịch bản.
- [ ] Test golden: dựng `Analysis` bằng tay → so nguyên văn tin; tin < 4 096 ký tự với data thật
      (chạy `Analyze` trên `walk(...)` 6 ngày).

## Task 4: Client Telegram

**Files:** `backend/internal/telegram/telegram.go`, `backend/internal/telegram/telegram_test.go`

- [ ] `type Client struct { Token, ChatID, BaseURL string; HTTP *http.Client }`;
      `Send(ctx, text string) error` POST `/bot<token>/sendMessage` JSON
      `{chat_id, text, disable_web_page_preview: true}`.
- [ ] Lỗi mạng: thay `url.Error.URL` bằng `"telegram"` trước khi trả. Lỗi HTTP ≠ 200 hoặc `ok:false`:
      trả `description` của Telegram (không có token).
- [ ] Test `httptest.Server`: gửi đúng body / đường dẫn; 400 trả lỗi có description; lỗi kết nối
      không chứa token (regression cho chỗ rò rỉ).

## Task 5: Bảng `alert_notices`

**Files:** `backend/migrations/0009_alert_notices.{up,down}.sql`,
`backend/internal/repository/alertnotice.go`, `backend/internal/service/store.go`,
`backend/internal/service/memstore_test.go`, `backend/internal/service/store_contract_test.go`

- [ ] Bảng: `key TEXT PRIMARY KEY`, `day DATE NOT NULL`, `sent_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
      index `(day)`.
- [ ] Interface `AlertNoticeStore`: `Claim(ctx, key string, day time.Time, limit int) (bool, error)`,
      `Release(ctx, key string) error`. Hợp đồng: (1) key đã có → false; (2) ngày đã đủ `limit` →
      false; (3) Release xong Claim lại được.
- [ ] Repo: một câu `INSERT … SELECT … WHERE (SELECT count(*) …) < ? ON CONFLICT (key) DO NOTHING`,
      `RowsAffected == 1` là giữ được chỗ.
- [ ] `memAlertNoticeStore` + contract test chạy hai lượt (RAM và Postgres).

## Task 6: `AlertService`

**Files:** `backend/internal/service/alerts.go`, `backend/internal/service/alerts_test.go`

- [ ] `NewAlertService(minute RangeFetcher, hourly RangeFetcher, tv LiveFetcher, store AlertNoticeStore, send func(ctx, string) error, now func() time.Time)`.
- [ ] `Run(ctx) (AlertRun, error)`: `DueNotice` → kéo NQ + ES (1m 6 ngày, 1H 60 ngày) song song,
      timeout 7 giây → nến cuối cũ hơn 30 phút thì `Skipped: "market closed"` → `Analyze` → render →
      `Claim` → `send` → lỗi gửi thì `Release` và trả lỗi.
- [ ] Yahoo 1m hỏng → TradingView 1m. ES hỏng → vẫn gửi, bảng SMT ghi "không có data ES".
- [ ] `yahoofeed`: thêm `FetchInterval(ctx, ticker, interval string, from int64)` cho nến `1h`
      (giới hạn 60 ngày / request khác với 1m) + test.
- [ ] Test với fetcher giả + store RAM: không tới giờ thì không kéo data; gửi một lần dù gọi 3 lần
      trong cửa sổ; tin thứ 7 trong ngày bị chặn; gửi lỗi thì phút sau gửi lại; data cũ thì không
      gửi; Yahoo hỏng dùng TradingView.

## Task 7: Route `/api/cron/alerts`

**Files:** `backend/internal/httpapi/cron_handler.go`, `backend/internal/httpapi/router.go`,
`backend/internal/httpapi/*_test.go`

- [ ] `Deps.Alerts *service.AlertService`; gắn `GET /api/cron/alerts` sau `RequireCronSecret` khi
      `Alerts != nil && CronSecret != ""`.
- [ ] Trả `{notice, sent, skipped}`; lỗi kéo data / gửi → 502 để log của `pg_net` thấy.
- [ ] Test: thiếu secret 401; không tới giờ 200 `sent:false`; gửi lỗi 502.

## Task 8: Cấu hình và khởi động

**Files:** `backend/internal/config/config.go`, `backend/cmd/api/main.go`, `.env.example`

- [ ] `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`; thiếu một trong hai thì không dựng `AlertService`
      (log một dòng, không lỗi khởi động).
- [ ] Test config: đọc đủ hai biến; thiếu thì rỗng.

## Task 9: Tài liệu triển khai

**Files:** `docs/deployment-vercel-supabase.md`

- [ ] Mục 7: tạo bot qua @BotFather, lấy `chat_id` (nhắn bot rồi gọi `getUpdates`), đặt biến trên
      Vercel.
- [ ] SQL bật `pg_cron` + `pg_net`, lưu `CRON_SECRET` trong Supabase Vault, và
      `cron.schedule('nq-alerts', '* 13-15,22-23,0-1 * * *', …net.http_get…)`; cách xem lịch sử chạy
      (`cron.job_run_details`, `net._http_response`); cách tắt (`cron.unschedule`).

## Task 10: Soát luật trước khi bật

**Files:** `backend/cmd/ict-backtest/main.go`

- [ ] Cờ `-messages 2026-10-20:2026-10-22`: in đúng các tin bot sẽ gửi trong những ngày đó (dùng
      `RenderOpen` / `RenderMacro`), để chủ sản phẩm mở `/replay` cùng ngày và so.
- [ ] Chủ sản phẩm soát ít nhất 5 ngày; chỗ nào bot đọc HR/LR, FVG điều kiện, swing khác mình thì
      ghi lại → sửa luật trong `ict` (kèm test) → chạy lại backtest, cập nhật báo cáo.

## Task 11: Kiểm tra cuối

- [ ] `make test-pure` và `make lint` xanh.
- [ ] `make test` trên máy có Docker (contract test `alert_notices` trên Postgres).
- [ ] Deploy preview, gọi tay `curl -H "Authorization: Bearer $CRON_SECRET" …/api/cron/alerts`
      trong cửa sổ một tin → nhận tin trên Telegram; gọi lại → không nhận tin thứ hai.
- [ ] Bật `pg_cron` trên production, theo dõi một ngày đủ 6 tin.
