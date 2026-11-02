# Bot Telegram phân tích NQ trước phiên — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sáu tin Telegram mỗi ngày về NQ — 2 tin phân tích trước phiên (18:55 Asia, 09:25 NY AM)
và 4 tin trước macro (19:48, 20:48, 09:48, 10:48 New York). Tin đưa dữ kiện ICT trên **một khung
tham chiếu** (ưu tiên 15m, không có mới lên khung lớn hơn), SMT với ES, hai kịch bản "nếu… thì…" và
trạng thái checklist A+; không đưa bias hay lệnh như lời dự đoán (lý do: backtest, xem spec).

**Architecture:** Package thuần `internal/ict` (đã có phân tích, mức thanh khoản, SMT, range, luật
A+ dùng cho backtest) thêm lịch tin, ảnh chụp trạng thái phiên và phần soạn tin. Tầng hạ tầng thêm
`internal/telegram`, bảng `alert_notices` (giữ chỗ chống trùng, chặn 6 tin/ngày),
`service.AlertService` điều phối, route `GET /api/cron/alerts` bảo vệ bằng `CRON_SECRET`. Supabase
`pg_cron` gọi route mỗi phút. Làm **nội dung tin trước** (task 1–7), chủ sản phẩm duyệt, rồi mới
làm hạ tầng gửi (task 8–14).

**Tech Stack:** Go 1.23, chi, GORM, PostgreSQL 16 (Supabase), testcontainers · Yahoo chart API,
TradingView websocket (đã có `yahoofeed`, `tvfeed`) · Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-11-02-nq-telegram-alerts-design.md` ·
Backtest: `docs/ict-backtest-2026-11-02.md`

## Global Constraints

- `internal/ict` là package thuần: không import GORM, `net/http`, `database/sql`, `context`. Test
  chạy không cần Docker và nằm trong `make test-pure`.
- Giá trong `ict` là `float64` (giá chỉ số, không phải tiền — xem comment đầu `chart.go`). Ranh
  giới chuỗi → số là `ict.BarsFrom(domain.MinuteBars)`, chỉ ở đó.
- Mọi giờ tính theo `ict.NY` (America/New_York). Không hardcode độ lệch UTC.
- Tin và backtest dùng **cùng một hàm** cho mỗi khái niệm (FVG, quét, SMT, tích lũy, PO3…). Không
  viết lại luật trong phần soạn tin.
- Phân tích chỉ đọc nến đã đóng trước cutoff = giờ gửi − độ trễ data. Có test chống lộ tương lai.
- Code tiếng Anh (định danh, route, log, lỗi, tên test, chuỗi `t.Run`), comment tiếng Việt. Nội dung
  tin Telegram là text cho người dùng → tiếng Việt.
- Không log token bot. Lỗi `net/http` có chép URL (chứa token) → client phải xoá URL khỏi lỗi.
- Mỗi task có test trong cùng commit. Sửa bug thì thêm regression test fail trên code cũ.
- Lệnh: `make test-pure`, `make lint`, `make test` (cần Docker: contract test Postgres).

## Đã xong (nhánh `feat/ict-telegram-alerts`)

- [x] `internal/ict`: `NewChart` (8 khung, mốc 18:00 NY), `Swings`, `Trend`, `FindFVGs`,
      `SessionLevels` (PDH/PDL, Asia, London, NY AM, NY PM + giờ bị quét), `Analyze` (bước 1 DOL,
      `pickSMT` khung nhỏ nhất có SMT còn mới, `pickRange` khung nhỏ nhất có range hợp lệ, HR/LR,
      FVG điều kiện), `BiasSlots`, chấm điểm (`FirstHit`, `Score`, `Tally`).
- [x] Luật vào lệnh A+ (`trades.go`): `accumulation`, true manipulation, PO3 nến 15m, IFVG mạnh,
      stop raid, stop sạch, CISD, SMT theo vùng tích lũy. Test 90,6%.
- [x] `cmd/ict-backtest` (bias và `-trades`) + báo cáo 3 phần.

---

## Phần A — Nội dung tin (thuần, không cần mạng / DB)

### Task 1: Lịch 6 tin

**Files:** `backend/internal/ict/schedule.go`, `backend/internal/ict/schedule_test.go`

- [ ] `type NoticeKind int` (`NoticeOpen`, `NoticeMacro`) và
      `type Notice struct { ID, Session string; Kind NoticeKind; At, SessionOpen, MacroStart, MacroEnd time.Time }`.
- [ ] ID cố định: `asia-open` 18:55, `asia-macro-1950` 19:48, `asia-macro-2050` 20:48, `ny-open`
      09:25, `ny-macro-0950` 09:48, `ny-macro-1050` 10:48 (giờ New York).
- [ ] `NoticesOn(day time.Time) []Notice`: Asia Chủ nhật → thứ Năm, NY AM thứ Hai → thứ Sáu.
- [ ] `DueNotice(now time.Time, grace time.Duration) (Notice, bool)`: tin có `At ≤ now < At + grace`.
- [ ] `Notice.Key()` = `"2006-01-02/<ID>"` theo ngày New York của `At`; hằng `MaxNoticesPerDay = 6`.
- [ ] `BiasSlots` dùng lại `NoticesOn` cho hai tin mở phiên (một nguồn giờ duy nhất).
- [ ] Test bảng: thứ Hai đủ 6 tin; Chủ nhật 3 (chỉ Asia); thứ Sáu 3 (chỉ NY AM); thứ Bảy 0; ngày đổi
      giờ 08/03/2026 và 01/11/2026 vẫn đúng giờ New York; `At + 2m59s` còn hạn, `At + 3m` hết hạn.

### Task 2: Ảnh chụp trước phiên

**Files:** `backend/internal/ict/brief.go`, `backend/internal/ict/brief_test.go`

- [ ] `type Brief struct` gom những gì tin trước phiên cần, dựng từ `Analysis`:
  - giá + giờ nến cuối; khung tham chiếu (`Range.TF`) và các khung nhỏ hơn đã bỏ qua vì sao;
  - cấu trúc khung tham chiếu (`RangeTrend`); SMT (`SMT`, `SMTTF`, `SMTAt`, giá hai đáy/đỉnh của NQ);
  - mức thanh khoản theo phiên: **NY AM** = PDH/PDL, Asia, London; **Asia** = PDH/PDL ngày vừa đóng,
    NY AM, NY PM. Mức đã quét giữ lại kèm giờ quét;
  - giá mở tham chiếu: Midnight Open 00:00 (NY AM) hoặc giá mở 18:00 (Asia), và giá đang ở Premium
    hay Discount so với nó;
  - FVG từ khung tham chiếu tới 4H được chạm / bị phá trong 24 giờ, đánh dấu FVG còn mới (chưa chạm);
  - range: hai đầu, HR/LR kèm lý do (quét · chạm FVG khung lớn · displacement), FVG điều kiện,
    hai kịch bản (tôn trọng → DOL, phá → phía còn lại), DOL tiềm năng bước 1.
- [ ] `NewBrief(nq, es *Chart, n Notice, delay time.Duration, o Options) Brief` — cutoff = `n.At − delay`.
- [ ] Test: phiên NY không có mức NY AM/PM; phiên Asia không có Asia/London; mức đã quét có giờ; FVG
      khung nhỏ hơn khung tham chiếu bị loại; không có range thì `Brief.Range == nil`.

### Task 3: Soạn tin trước phiên

**Files:** `backend/internal/ict/render.go`, `backend/internal/ict/render_test.go`

- [ ] `RenderOpen(b Brief, n Notice) string` theo mẫu "Tin trước phiên" trong spec. Văn bản thuần,
      không `parse_mode`.
- [ ] Số `21 345.25` (2 chữ số thập phân, cách hàng nghìn bằng khoảng trắng); giờ `HH:MM` New York;
      thứ trong tuần tiếng Việt.
- [ ] Không có range: "Chưa có range hợp lệ từ 15m tới Daily", bỏ phần kịch bản; không có SMT: "SMT
      với ES: không có (15m → D)"; thiếu data ES: "SMT: không có data ES".
- [ ] Test golden: dựng `Brief` bằng tay → so nguyên văn; tin < 4 096 ký tự khi chạy trên 6 ngày
      `walk(...)`.

### Task 4: Ảnh chụp trước macro (checklist A+)

**Files:** `backend/internal/ict/watch.go`, `backend/internal/ict/watch_test.go`, sửa nhẹ `trades.go`

- [ ] Tách khỏi `tryEntry` các kiểm tra thành hàm dùng chung (backtest và tin cùng gọi):
      `detectAccumulation`, `htfFVGTouched`, `esTrueManipulation`, `po3Timing`, `fifteenMinuteWicks`
      (stacking: các nến 15m từ giờ mở phiên có râu cùng phía giá mở). Backtest `-trades` phải ra
      **đúng** số liệu như trước khi tách (regression test so một phiên cố định).
- [ ] `type Watch struct`: từ giờ mở phiên tới cutoff — mức bị quét (tên, giá, giờ), SMT mới (SMTAt
      ≥ giờ mở phiên), FVG điều kiện còn giữ hay đã bị phá, stacking nến 15m, BSL / SSL gần nhất chưa
      quét, và **checklist A+** cho từng phía (long / short):
      tích lũy (giờ, biên độ) · đã phá giả vùng tích lũy / quét mức phiên · cực trị chạm FVG khung
      lớn (khung, vùng, còn mới?) · ES vào FVG khung lớn hoặc SMT · PO3: phút còn lại tới nến 15m kế.
- [ ] `NewWatch(nq, es *Chart, n Notice, delay time.Duration, o Options) Watch`.
- [ ] Test: dựng nến tay (giống `amdSetup` trong `trades_test.go`) → checklist đúng từng dòng; chưa
      có gì xảy ra từ giờ mở phiên → các dòng "chưa".

### Task 5: Soạn tin trước macro

**Files:** `backend/internal/ict/render.go`, `backend/internal/ict/render_test.go`

- [ ] `RenderMacro(w Watch, n Notice) string` theo mẫu "Tin trước macro" trong spec: dòng ✓ / · cho
      từng tiêu chí; luôn kết bằng "IFVG / stop raid: bạn tự xác nhận trên chart (data trễ)".
- [ ] Chỉ in checklist của phía có ít nhất một tiêu chí ✓; cả hai phía trống thì "Chưa có thao túng
      từ HH:MM".
- [ ] Test golden như task 3.

### Task 6: Lệnh xem trước tin

**Files:** `backend/cmd/ict-backtest/main.go`, `backend/cmd/ict-backtest/messages.go`

- [ ] Cờ `-messages 2026-10-20:2026-10-22`: in đúng 6 tin / ngày bot sẽ gửi trong khoảng đó, trên
      data `replay-data` (mô phỏng trễ 10 phút).
- [ ] Test: chạy trên `walk(...)` ra đúng số tin theo lịch, mỗi tin không rỗng.

### Task 7: Chủ sản phẩm duyệt nội dung (cổng chặn)

- [ ] Chạy `go run ./cmd/ict-backtest -messages <5 ngày gần nhất>`, mở `/replay` cùng ngày, đối
      chiếu: khung tham chiếu, HR/LR, FVG điều kiện, SMT, checklist A+.
- [ ] Ghi lại chỗ bot đọc khác cách chủ sản phẩm đọc → sửa luật trong `ict` (kèm test) → chạy lại
      backtest, cập nhật báo cáo. **Không làm Phần B khi chưa qua bước này.**

---

## Phần B — Gửi tin

### Task 8: Data cho khung lớn

**Files:** `backend/internal/ict/chart.go`, `backend/internal/yahoofeed/yahoofeed.go` và test

- [ ] `ict.BarsFrom(b domain.MinuteBars) ([]Bar, error)`: đổi `json.Number` → `float64`, lỗi nếu cột
      lệch độ dài hoặc số hỏng.
- [ ] `ict.NewChartWithHourly(m1, h1 []Bar) *Chart`: 15m / 30m gom từ `m1`; khung ≥ 1H gom từ `h1`,
      rồi thay bằng nến gom từ `m1` ở những nến `m1` phủ trọn.
- [ ] `yahoofeed.Client.FetchHourly(ctx, ticker string, from int64)`: `interval=1h`, 60 ngày trong
      một request (giới hạn khác nến 1m), cùng cách bỏ nến null / nến đang chạy.
- [ ] Test: 4H dựng từ 1m và từ 1H giống nhau trên cùng data; thiếu nến 1H vẫn có khung lớn từ 1m;
      `BarsFrom` bắt số hỏng; `FetchHourly` với `httptest` (một request, đúng tham số).

### Task 9: Client Telegram

**Files:** `backend/internal/telegram/telegram.go`, `backend/internal/telegram/telegram_test.go`

- [ ] `type Client struct { Token, ChatID, BaseURL string; HTTP *http.Client }`;
      `Send(ctx, text string) error` — POST `/bot<token>/sendMessage`, JSON
      `{chat_id, text, disable_web_page_preview: true}`.
- [ ] Lỗi mạng: thay `url.Error.URL` bằng `"telegram"`; HTTP ≠ 200 hoặc `ok:false`: trả
      `description` của Telegram.
- [ ] Test `httptest`: đúng đường dẫn / body; 400 trả description; lỗi kết nối không chứa token
      (regression cho chỗ rò rỉ).

### Task 10: Bảng `alert_notices`

**Files:** `backend/migrations/0009_alert_notices.{up,down}.sql`,
`backend/internal/repository/alertnotice.go`, `backend/internal/service/store.go`,
`backend/internal/service/memstore_test.go`, `backend/internal/service/store_contract_test.go`

- [ ] Bảng: `key TEXT PRIMARY KEY`, `day DATE NOT NULL`, `sent_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
      index `(day)`.
- [ ] Interface `AlertNoticeStore`: `Claim(ctx, key string, day time.Time, limit int) (bool, error)`,
      `Release(ctx, key string) error`. Hợp đồng: key đã có → false; ngày đủ `limit` → false;
      Release xong Claim lại được.
- [ ] Repo: một câu `INSERT … SELECT … WHERE (SELECT count(*) …) < ? ON CONFLICT (key) DO NOTHING`;
      `RowsAffected == 1` là giữ được chỗ.
- [ ] `memAlertNoticeStore` + contract test chạy hai lượt (RAM và Postgres).

### Task 11: `AlertService`

**Files:** `backend/internal/service/alerts.go`, `backend/internal/service/alerts_test.go`

- [ ] `NewAlertService(minute, hourly RangeFetcher, tv LiveFetcher, store AlertNoticeStore, send func(context.Context, string) error, now func() time.Time)`.
- [ ] `Run(ctx) (AlertRun, error)`: `DueNotice` → kéo NQ + ES (1m 6 ngày, 1H 60 ngày) song song, hạn
      7 giây → nến cuối cũ hơn 30 phút thì bỏ ("market closed") → `NewBrief` / `NewWatch` → render →
      `Claim` → `send` → gửi lỗi thì `Release` và trả lỗi.
- [ ] Yahoo 1m hỏng → TradingView 1m. ES hỏng → vẫn gửi, dòng SMT / true manipulation ghi "không có
      data ES".
- [ ] Test với fetcher giả + store RAM: chưa tới giờ thì không kéo data; gọi 3 lần trong cửa sổ chỉ
      gửi 1; tin thứ 7 trong ngày bị chặn; gửi lỗi thì phút sau gửi lại; data cũ không gửi; Yahoo hỏng
      dùng TradingView.

### Task 12: Route, cấu hình, khởi động

**Files:** `backend/internal/httpapi/cron_handler.go`, `backend/internal/httpapi/router.go`,
`backend/internal/config/config.go`, `backend/cmd/api/main.go`, `.env.example`, test tương ứng

- [ ] `Deps.Alerts *service.AlertService`; gắn `GET /api/cron/alerts` sau `RequireCronSecret` khi
      `Alerts != nil && CronSecret != ""`. Trả `{notice, sent, skipped}`; lỗi → 502.
- [ ] `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`; thiếu một trong hai thì không dựng `AlertService` (log
      một dòng, không lỗi khởi động).
- [ ] Test: thiếu secret 401; chưa tới giờ 200 `sent:false`; gửi lỗi 502; config đọc đủ / thiếu biến.

### Task 13: Tài liệu triển khai

**Files:** `docs/deployment-vercel-supabase.md`

- [ ] Mục 7: tạo bot qua @BotFather, lấy `chat_id` (nhắn bot rồi gọi `getUpdates`), đặt biến trên
      Vercel.
- [ ] SQL bật `pg_cron` + `pg_net`, lưu `CRON_SECRET` trong Supabase Vault,
      `cron.schedule('nq-alerts', '* 13-15,22-23,0-1 * * *', …net.http_get…)`; xem lịch sử chạy
      (`cron.job_run_details`, `net._http_response`); tắt (`cron.unschedule`).

### Task 14: Kiểm tra cuối và bật

- [ ] `make test-pure`, `make lint` xanh; `make test` trên máy có Docker.
- [ ] Deploy preview, gọi tay `curl -H "Authorization: Bearer $CRON_SECRET" …/api/cron/alerts` trong
      cửa sổ một tin → nhận tin; gọi lại → không nhận tin thứ hai.
- [ ] Bật `pg_cron` trên production, theo dõi một ngày đủ 6 tin; so tin với chart `/replay` cùng ngày.

## Sau khi chạy (ngoài plan này)

- Đo lợi thế thật: chủ sản phẩm đánh dấu setup A+ mình sẽ vào trên `/replay` (hoặc dùng lệnh thật
  trong nhật ký), chấm winrate / R của đúng các setup đó.
- Nhiều người dùng, liên kết Telegram qua `/start`, giao diện cài đặt.
