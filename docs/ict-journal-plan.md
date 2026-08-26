# Plan — ICT Setup Journal

## 1. Mục tiêu

Mở rộng trading journal hiện tại để ghi lại một setup ICT có cấu trúc, đặc biệt
là setup `A+ NY AM`, và đo được setup nào có edge thật sự sau đủ số lượng trade.

Mục tiêu không phải biến `A+` thành dự đoán kết quả. Định nghĩa chính thức:

```text
A+ = trade thỏa mãn đầy đủ các điều kiện của system đã được chứng minh có expectancy tốt.
```

Vì vậy:

- A+ vẫn có thể thua SL.
- Setup C vẫn có thể chạy 5R.
- Grade của setup không được suy ra từ profit, win/loss hoặc kết quả sau lệnh.
- `A+ setup`, `trade_class` và chất lượng thực thi là ba khái niệm độc lập.

## 2. Phân biệt dữ liệu hiện tại

Form Add Trade hiện có ba nhóm dữ liệu:

- Lệnh: thời gian, symbol, direction, timeframe, giá, volume, profit, fee.
- Setup tự do: trường `setup`.
- Review sau lệnh: `entry_quality`, `in_trade_quality`, `exit_quality`, `psychology`.

`trade_class` hiện tại được tính từ bốn trường review sau lệnh. Nó phản ánh kỷ luật
thực thi, không phản ánh setup ICT. Không dùng các giá trị `Đúng kế hoạch`,
`Cần cải thiện`, `Bốc đồng / FOMO` để thay cho A+/A/B/C.

`profit_theory` cũng không phải target R. Nó tiếp tục giữ nghĩa tiền lãi lý thuyết
hiện tại.

## 3. Mẫu setup cần hỗ trợ

Ví dụ setup người dùng muốn journal:

```text
Grade: A+
Playbook: NY AM
HTF bias: Bullish
HTF context: H1 9H bullish
HTF PDA: H1 Rejection Block
Liquidity: Asia High / BSL
Sweep: NQ sweep Asia High
SMT: SMT với ES
Reclaim: Có
Displacement: Bearish displacement
MSS/CISD: Bearish CISD
Entry model: M15 DM
DOL: Có target xác định
Planned target: 4R
Time window: 09:30–11:00
Direction: Short
```

Narrative hiển thị:

```text
H1 9H bullish
  -> H1 Rejection Block
  -> Asia High / BSL
  -> NQ sweep Asia High
  -> SMT với ES
  -> Reclaim
  -> Bearish Displacement
  -> Bearish CISD
  -> M15 DM
  -> SHORT
  -> 4R
```

## 4. Nguyên tắc dữ liệu

### 4.1. Grade setup

Thêm grade riêng với các mã ổn định:

```text
A_PLUS | A | B | C | UNRATED
```

Frontend hiển thị `A+`, còn API/DB dùng mã ổn định. `UNRATED` dùng cho trade cũ
hoặc trade chưa được đánh giá; không được tự động gán grade cho dữ liệu lịch sử.

V1 chưa tự suy ra A/A/B/C vì system mới chỉ mô tả đầy đủ điều kiện A+, chưa có
ngưỡng chính thức để phân biệt A, B và C. Người dùng chọn grade, hệ thống chỉ tính
độ hoàn thành checklist và hiển thị cảnh báo nếu grade không khớp checklist.

### 4.2. Checklist

Checklist cần phân biệt ba trạng thái:

```text
confirmed | absent | unchecked
```

`unchecked` khác `absent`: chưa ghi nhận không đồng nghĩa điều kiện không xuất hiện.
Mỗi condition có thêm `evidence` để ghi giá trị quan sát thực tế.

Danh sách condition V1:

1. `htf_pda`
2. `session_liquidity`
3. `liquidity_sweep`
4. `dol`
5. `smt`
6. `reclaim`
7. `displacement`
8. `mss_cisd`
9. `entry_model`

Điều kiện `target >= 2R` được tính từ `planned_target_r >= 2`, không lưu thêm một
boolean suy diễn.

### 4.3. Planned R và actual R

- `planned_target_r`: trader nhập, ví dụ `4`.
- `actual_r`: derived, bằng `net / one_R`.
- `one_R`: tiếp tục bằng `initial_balance * risk_per_trade`.
- `actual_r` không lưu trong DB.
- Khi `one_R = 0`, `actual_r` và các thống kê R trả về `null`.

Phí vẫn được tính theo quy tắc hiện tại: `net = profit - fee`.

## 5. Mô hình dữ liệu đề xuất

Không nên đưa toàn bộ trường ICT vào bảng `trades` hiện tại. Tạo bảng một-một:

```text
trade_setup_journals
```

Khóa chính đồng thời là `trade_id`, có foreign key tới `trades`.

Các cột scalar đề xuất:

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `trade_id` | BIGINT | Liên kết tới trade |
| `grade` | TEXT | `A_PLUS`, `A`, `B`, `C`, `UNRATED` |
| `playbook` | TEXT | Ví dụ `NY_AM` |
| `session` | TEXT | Ví dụ `NY_AM` |
| `time_window` | TEXT | Ví dụ `09:30-11:00` |
| `po3_phase` | TEXT | Accumulation, Manipulation/Raid, Distribution |
| `htf_bias` | TEXT | Bullish, Bearish, Neutral |
| `htf_context` | TEXT | Ví dụ `H1 9H bullish` |
| `htf_pda` | TEXT | Ví dụ `H1 Rejection Block` |
| `liquidity_source` | TEXT | Ví dụ `Asia High / BSL` |
| `liquidity_sweep` | TEXT | Ví dụ `NQ sweep Asia High` |
| `smt_reference` | TEXT | Ví dụ `ES` |
| `mss_cisd` | TEXT | Ví dụ `Bearish CISD` |
| `entry_model` | TEXT | Ví dụ `M15 DM` |
| `dol` | TEXT | Mô tả DOL/target |
| `planned_target_r` | NUMERIC | Target R trader dự kiến |
| `narrative` | TEXT | Narrative tự do hoặc bản đã chỉnh sửa |
| `checklist` | JSONB | Trạng thái và evidence từng condition |
| `created_at` | TIMESTAMPTZ | Audit |
| `updated_at` | TIMESTAMPTZ | Audit |

Ví dụ JSONB cho checklist:

```json
{
  "htf_pda": {"status": "confirmed", "evidence": "H1 Rejection Block"},
  "session_liquidity": {"status": "confirmed", "evidence": "Asia High / BSL"},
  "liquidity_sweep": {"status": "confirmed", "evidence": "NQ sweep Asia High"},
  "dol": {"status": "confirmed", "evidence": "Asia Low"},
  "smt": {"status": "confirmed", "evidence": "SMT với ES"},
  "reclaim": {"status": "confirmed", "evidence": "Reclaim sau sweep"},
  "displacement": {"status": "confirmed", "evidence": "Bearish displacement"},
  "mss_cisd": {"status": "confirmed", "evidence": "Bearish CISD"},
  "entry_model": {"status": "confirmed", "evidence": "M15 DM"}
}
```

`JSONB` chỉ chứa dữ liệu trader nhập, không chứa `actual_r`, expectancy, score,
cum hoặc bất kỳ trường suy diễn nào.

## 6. UX của Add Trade

### 6.1. Nhóm form

Giữ các nhóm hiện tại và thêm một nhóm ICT riêng:

1. **Trade**: thời gian, symbol, direction, timeframe, setup.
2. **ICT Setup Plan**: grade, playbook, session, PO3, HTF context, liquidity.
3. **A+ Checklist**: condition, trạng thái, evidence.
4. **Execution Target**: entry model, DOL, planned target R.
5. **Money**: entry, exit, volume, profit, theoretical profit, fee.
6. **Execution Discipline Review**: bốn trường review hiện tại.
7. **Narrative and Notes**: narrative, ghi chú sau lệnh.

Nhóm ICT nên collapsible để modal không quá dài trên mobile.

### 6.2. Phản hồi ngay trong form

Hiển thị summary khi người dùng nhập:

```text
A+ checklist: 9/9 confirmed
Target >= 2R: Yes
A+ candidate: Yes
```

Nếu chọn A+ nhưng checklist chưa đủ, hiển thị warning, không tự sửa grade và không
đổi grade theo kết quả trade.

Narrative preview được tạo từ các field có cấu trúc. Trader vẫn có thể sửa bản
narrative cuối cùng trong textarea.

### 6.3. Hai giai đoạn journal

Quy trình đúng nhất:

1. **Before entry**: ghi context, liquidity, PO3, checklist, grade, target R.
2. **After exit**: ghi giá ra, profit/fee, review, psychology, lesson learned.

Hiện `profit` là bắt buộc nên form chỉ lưu được sau khi trade đã có kết quả. Đây là
MVP chấp nhận được để triển khai nhanh, nhưng không lý tưởng vì có nguy cơ hindsight
bias.

Phase sau cần thêm lifecycle `planned/open/closed` nếu muốn lưu setup trước khi vào
lệnh. Khi đó `profit` có thể để null cho trade chưa đóng; metrics phải bỏ qua các
trade chưa có kết quả.

## 7. API và backend

### 7.1. Contract

Mở rộng trade DTO với object:

```json
{
  "setup_journal": {
    "grade": "A_PLUS",
    "playbook": "NY_AM",
    "session": "NY_AM",
    "po3_phase": "MANIPULATION_RAID",
    "htf_bias": "BULLISH",
    "planned_target_r": "4",
    "checklist": {}
  },
  "actual_r": "3.72"
}
```

`actual_r` chỉ có trong response derived. Mọi tiền và R serialize thành JSON string.

POST nhận `setup_journal` tùy chọn để không phá trade cũ. PATCH chỉ gửi object khi
phần ICT bị thay đổi; object được replace toàn bộ để tránh nested patch vô tình xóa
một condition chưa được gửi.

`GET /meta/enums` trả thêm danh sách grade, session, PO3 phase, bias, execution model
và checklist keys.

### 7.2. Các package cần sửa

- Migration mới trong `backend/migrations/`.
- `backend/internal/domain/models.go` và kiểu ICT thuần.
- `backend/internal/repository/` cho create/update/load journal.
- `backend/internal/service/trade.go` cho validation và transaction.
- `backend/internal/httpapi/trade_dto.go` cho request/response.
- `backend/internal/metrics/` để thêm actual R vào enriched output.
- `backend/internal/aggregate/` để tính expectancy theo group.

Package `scoring`, `metrics`, `aggregate` vẫn phải thuần: không import GORM,
`net/http`, `database/sql` hoặc `context.Context`.

## 8. Analytics và expectancy

### 8.1. Bảng theo grade

Dashboard thêm bảng `Expectancy by Setup Grade`:

| Grade | Trades | Decided | Wins | Losses | Win rate | Avg R | Expectancy R |
|---|---:|---:|---:|---:|---:|---:|---:|
| A+ | 42 | 42 | 24 | 18 | 57% | ... | ... |
| A | 31 | 31 | ... | ... | ... | ... | ... |
| B | 27 | 27 | ... | ... | ... | ... | ... |
| C | 18 | 18 | ... | ... | ... | ... | ... |

Luôn trả đủ bốn grade chính theo thứ tự A+, A, B, C; `UNRATED` hiển thị riêng nếu
có dữ liệu.

### 8.2. Định nghĩa metric

- `Trades`: tổng số trade trong group, gồm cả breakeven.
- `Decided`: wins + losses, không gồm `net = 0` theo spec hiện tại.
- `Win rate`: wins / decided.
- `Avg R`: tổng actual R / tổng Trades, breakeven đóng góp 0.
- `Expectancy R`: dùng cùng semantics KPI hiện tại, tính từ average win R và average
  loss R trên tập decided.
- `Expectancy $`: expectancy R * one_R.
- `Breakeven`: Trades - Decided.

Nếu `one_R = 0`, các cột R trả về null và UI hiển thị `—`, không hiển thị 0.

### 8.3. Group theo setup

Thêm bảng hoặc view `Expectancy by Setup`, group theo trường `setup` hiện tại.
Khác chart setup top 6 hiện có, bảng analytics nên trả toàn bộ setup để không che
một setup ít lệnh nhưng đang có vấn đề.

Không kết luận edge chỉ từ một vài trade. UI cần hiển thị sample size và có thể thêm
ngưỡng cảnh báo, nhưng không được tự gắn nhãn "profitable" khi chưa đủ mẫu.

### 8.4. Filter

Thêm filter:

- Setup grade.
- Playbook/setup.
- Session.
- PO3 phase.
- Entry model.
- Checklist hoàn thành.

Expectancy, KPI và aggregation tính trên tập đã lọc. Cumulative, running peak,
drawdown và streak vẫn tính trên toàn bộ trade của account trước khi filter. Current
balance và cash flow tiếp tục không chịu filter.

## 9. Hiển thị trong trade table

Thêm vào row/detail:

- Badge `A+`, `A`, `B`, `C`.
- Playbook/session.
- Checklist `9/9` hoặc `7/9`.
- Planned target R.
- Actual R.
- Narrative dạng chain.

Trong detail row, tách rõ hai khu vực:

```text
ICT Setup: A+ NY AM
Execution discipline: Đúng kế hoạch
```

Không dùng màu để truyền tải grade hoặc P&L duy nhất; luôn có text và dấu `+`/`-`.
Tuân thủ semantic tokens trong theme, không hardcode màu.

## 10. Thứ tự triển khai

### Phase 0 — Chốt vocabulary

- Chốt code grade, session, PO3 phase, bias và execution model.
- Chốt định nghĩa evidence cho từng checklist.
- Chốt policy khi grade A+ nhưng checklist thiếu.
- Không tự đặt threshold A/B/C khi chưa có dữ liệu hoặc rule từ trader.

### Phase 1 — Data và API

- Tạo migration `trade_setup_journals`.
- Thêm domain type và repository mapping.
- Thêm create/update/load vào trade service.
- Thêm DTO và enum metadata.
- Backfill trade cũ thành không có journal hoặc `UNRATED`, không đoán dữ liệu.

### Phase 2 — Form và detail

- Thêm ICT Setup Plan vào Add/Edit Trade.
- Thêm checklist tri-state và evidence.
- Thêm planned target R.
- Hiển thị checklist counter, warning và narrative preview.
- Hiển thị journal trong expanded trade row.

### Phase 3 — Derived R và analytics

- Thêm `actual_r` vào enriched trade response.
- Viết pure grouped expectancy bằng `decimal.Decimal`.
- Thêm `by_setup_grade_expectancy` và `by_setup_expectancy` vào charts response.
- Thêm filter theo grade/session/playbook.
- Thêm bảng expectancy trên dashboard.

### Phase 4 — Pre-entry workflow

- Thêm trạng thái `planned/open/closed`.
- Cho phép tạo setup trước khi có profit.
- Sau khi đóng lệnh mới tính actual R và đưa vào expectancy.
- Giữ nguyên setup journal đã ghi trước entry, không cho kết quả sửa ngược grade.

### Phase 5 — Mở rộng sau

- Chart screenshot/attachment.
- Template playbook có thể tái sử dụng.
- Thống kê expectancy theo từng condition.
- Confidence interval hoặc phân tích sample size nâng cao.

Screenshot chưa nằm trong MVP; thiết kế hiện tại cũng đang loại upload ảnh khỏi phạm vi.

## 11. Test bắt buộc

### Backend pure

- Checklist đầy đủ tạo đúng summary `9/9`.
- Thiếu một condition không được coi là A+ candidate.
- `planned_target_r = 2` đạt điều kiện, `1.99` không đạt.
- Actual R dùng `net`, không dùng gross profit.
- `one_R = 0` trả null.
- A+ thua vẫn giữ grade A+.
- C thắng 5R vẫn giữ grade C.
- Breakeven không làm tăng wins/losses theo semantics hiện tại.
- Expectancy theo grade không bị trộn với `trade_class`.
- Filter tính expectancy trên filtered nhưng cumulative trên all.

### Backend API/repository

- Create/update journal đầy đủ.
- PATCH không làm mất journal khi chỉ sửa profit hoặc notes.
- PATCH journal replace đúng object.
- Enum không hợp lệ trả 400.
- Soft delete trade không làm journal xuất hiện ngoài trash.
- Account này không đọc được journal của account khác.

### Frontend

- Form gửi đúng nested `setup_journal`.
- Edit chỉ gửi ICT journal khi phần đó bị thay đổi.
- Checkbox/evidence round-trip đúng.
- Hiển thị warning khi A+ checklist chưa đủ.
- Actual R và planned R hiển thị đúng precision.
- Filter grade/session cập nhật đúng request và dashboard.
- Layout usable trên mobile.

### Lệnh kiểm tra trước khi hoàn tất

```bash
make test
npx tsc --noEmit && npm run build
```

## 12. Tiêu chí hoàn thành

Feature được xem là hoàn thành khi:

- Có thể ghi lại đầy đủ setup NY AM như ví dụ ở mục 3.
- Grade A+/A/B/C độc lập với kết quả và `trade_class`.
- Có thể xem lại checklist, evidence và narrative của từng trade.
- Có planned R và actual R rõ ràng.
- Dashboard trả expectancy theo grade và setup.
- Không có trường suy diễn mới được lưu vào DB.
- Toàn bộ test backend/frontend chạy xanh.
