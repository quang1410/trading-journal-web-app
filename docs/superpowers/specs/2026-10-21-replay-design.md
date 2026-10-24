# Trang Replay NQ/ES

Ngày: 2026-10-21. Viết lại bằng React + TypeScript từ bản HTML một file (`nq-es-replay/index.html`,
khoảng 2.400 dòng JavaScript thuần) mà chủ sản phẩm dùng để luyện vào lệnh kiểu FX Replay.

## Mục đích

Tua lại thị trường NQ và ES bằng nến 1 phút, đặt lệnh giả lập và vẽ phân tích như trên
TradingView / FX Replay, ngay trong app nhật ký (route `/replay`, mục "Replay" ở sidebar).

## Phạm vi (giữ nguyên tính năng của bản cũ)

- Hai chart cạnh nhau (NQ ↔ ES hoặc cùng mã khác khung), một đồng hồ replay chung theo giờ UTC.
  Khung 1m, 5m, 15m, 30m, 1H, 4H, D; nến khung lớn dựng dần từ nến 1 phút nên không lộ tương lai.
- Thanh replay nổi: chọn nến bắt đầu, phát/dừng 0,5–120 bước/giây, cỡ bước. Nhảy tới ngày giờ
  (kiểm phạm vi data, cuối tuần thì tới nến kế tiếp), ngày ngẫu nhiên. Múi giờ New York / Việt Nam / UTC.
- Lệnh Market / Limit / Stop, SL/TP theo điểm, tự tính số hợp đồng theo "Rủi ro $", phí khứ hồi,
  kéo đường SL/TP/lệnh chờ trên chart. Thống kê, bảng lệnh, xuất CSV.
- Công cụ vẽ: đường xu hướng, hình chữ nhật, tia ngang, bút, đường mũi tên, Fibonacci, Long/Short,
  chữ, kẻ ngang. Shift để đường thẳng, Ctrl/⌘ hoặc nút nam châm để bám O/H/L/C, hoàn tác / làm lại,
  thanh của hình đang chọn (màu, độ dày, kiểu, ghi chú, xoá), ghi chú trên đường.
- Phím tắt kiểu TradingView: gõ khung (1, 15, 1h, h4, d…), Alt+T/H/J/F/Shift+R/R, Space, →, B, S, X.
- Indicator "My ICT" (port từ Pine Script của chủ sản phẩm) và SMT Divergence (dựng lại theo mô tả
  của "SMT Divergence [TFO]" vì script gốc đóng mã nguồn).
- Cài đặt màu chart (bộ "Sáng (FX Replay)" và "Tối"), lề, watermark… xem trước ngay, OK / Huỷ.
- Phiên tự lưu; màn hình chọn phiên; data giả lập; mở thêm file CSV.

## Kiến trúc (`frontend/src/features/replay/`)

- `engine/`: TypeScript thuần, không React, không DOM (trừ `storage.ts`). Thời gian và múi giờ,
  dựng nến, khớp lệnh, ICT, SMT, hình học hình vẽ (`projector.ts` đổi thời gian/giá ↔ pixel),
  đọc CSV, giải nén data, lưu phiên. Test đơn vị cạnh từng file.
- `store/ReplayStore.ts`: toàn bộ trạng thái và hành động. React đọc qua `useSyncExternalStore`;
  chart nhận nến qua kênh `onCandles` riêng để lúc phát nhanh không phải dựng lại cây React.
- `chart/`: lightweight-charts 4.2.3 (cùng API bản cũ), lớp phủ SVG vẽ bằng React, lớp chuột
  (`interaction.ts`) nghe `pointerdown` ở pha capture để chart không cuộn khi đang vẽ / kéo.
- `components/`: thanh trên, thanh công cụ, thanh replay, bảng bên, bảng lệnh, cửa sổ Cài đặt,
  màn hình phiên. Dùng component shadcn và biến của theme.

## Data

- Data mặc định: chỉ năm 2026, US100 + US500 (CFD Dukascopy), ở `frontend/public/replay-data/`
  (`manifest.json` + một file `.bin` mỗi mã, khoảng 5,5 MB). Tải và đóng gói bằng
  `scripts/replay-data/` (xem README ở đó). Khởi động: mở phiên gần nhất dùng data này, chưa có
  thì mở phiên mới khoảng 20 ngày giao dịch trước cuối data.
- File CSV người dùng tự mở được lưu vào IndexedDB của trình duyệt cùng phiên.

## Điều hướng nhanh (Next Session / Silver Bullet / Day Open)

Nút tách đôi trên thanh replay, kiểu FX Replay (`components/NavMenu.tsx`, logic thuần ở
`engine/nav.ts`, cài đặt ở `components/NavDialog.tsx`).

- **Nút chính** mang tên mốc đang chọn; bấm là tua tới lần kế tiếp của mốc đó. **Mũi tên** mở
  menu: Phiên kế tiếp (gần nhất trong Á / London / New York), Silver Bullet kế tiếp (gần nhất
  trong ba khung), Mở ngày giao dịch mới, các mốc lẻ đã ghim, và Tuỳ chỉnh…. Chọn một mục là tua
  luôn và mục đó thành hành động của nút chính.
- **Ngôi sao** trong Custom Settings = ghim mốc lẻ vào menu nhanh. Mặc định chỉ ghim phiên New
  York. Mốc Mở ngày giao dịch luôn có trong menu nên không có sao.
- **Múi giờ:** mọi mốc là giờ New York, tự theo giờ mùa hè, bất kể chart hiển thị múi giờ nào (giống
  indicator ICT). Replay không gắn với tài khoản nên không dùng `accounts.timezone`.
- **"Kế tiếp"** tính từ nến replay hiện tại; đáp xuống nến 1m đầu tiên tại hoặc sau mốc (giống
  "Nhảy tới ngày giờ"). Bấm lại khi đang đứng đúng mốc thì sang lần sau.
- **Ngày giao dịch** bắt đầu ở mốc Next Day Open (mặc định 17:00): 19:00 Chủ nhật là phiên Á của thứ
  Hai. Mốc mở ngày từ 12:00 trở đi thì ngày giao dịch mang tên ngày nó kết thúc, trước 12:00 thì
  mang tên ngày bắt đầu. "Days to skip" xét theo ngày giao dịch này.
- **Data hổng:** mốc không có nến (cuối tuần, giờ nghỉ 17:00 của CME, ngày lễ) thì lấy nến đầu tiên
  sau đó nếu còn cùng ngày giao dịch, không thì sang lần kế tiếp. Hết data thì báo, không tua.
- **Tua tiến như bấm bước** (`advanceTo`): lệnh đang mở / lệnh chờ vẫn chạy qua từng nến. Khác
  "Nhảy tới ngày giờ" là cái bắt đóng lệnh trước.
- **Lưu** ở localStorage (`journal.replay.nav`, `journal.replay.navAction`), chung cho mọi phiên.
- **Hộp thoại** sửa trên bản nháp: Save kiểm tra (không được bỏ cả 7 ngày) rồi lưu, Cancel / X /
  Esc bỏ hết. Reset to defaults chỉ đổ mặc định vào bản nháp, Cancel vẫn lấy lại được, nên không
  hỏi xác nhận. Ô giờ là dropdown 24 giờ, bước 15 phút.

## Lưu trữ

Phiên lưu trong trình duyệt (IndexedDB `journal-replay`, kèm bản sao localStorage lúc rời trang),
không gửi lên backend và không gắn với tài khoản. Lệnh replay chưa đi vào nhật ký.

## Chỗ khác với quy tắc chung (cố ý)

- **Số thực thay vì decimal.** Giá, P&L và thống kê của replay là số thực của mô phỏng trên data CFD,
  không phải tiền của tài khoản và không bao giờ gửi lên backend. Quy tắc 1 của CLAUDE.md (tiền là
  decimal) áp cho tiền của sổ nhật ký. Vì cổng canh cấm `Number(`, code đổi chuỗi sang số bằng `+x`.
- **Màu dữ liệu nằm ở `replay.css`.** Bộ màu nến kiểu FX Replay, màu mặc định của Pine Script và
  bảng màu hình vẽ là màu của DỮ LIỆU trên chart, không phải màu giao diện, nên khai thành biến
  `--replay-*` trong CSS của trang (TypeScript không có mã màu nào). Khung trang vẫn chỉ dùng biến
  của `docs/design/theme.css`. Chart theo giao diện sáng/tối của app cho tới khi người dùng tự chọn màu.
- **Ký hiệu không dịch.** Nhãn khung (1m, 1H, D), tên hợp đồng (NQ, ES), LONG/SHORT, BUY/SELL trên
  đường giá là ký hiệu chung của dân trade, giống nhau ở cả hai ngôn ngữ. Mọi chữ khác ở strings.ts.
- **Biến `window.__replayStore` chỉ có ở bản dev** (`import.meta.env.DEV`) để kiểm tra từ console;
  bản build production không có.

## Test

- Vitest: engine (múi giờ, nến, khớp lệnh, CSV, data đóng gói, khung gõ, ICT và SMT so với một bản
  tính lại độc lập từ nến 1 phút, hình học hình vẽ), store (bước replay, lệnh, nhảy ngày, hình vẽ,
  ghi chú, lưu / khôi phục phiên, cài đặt, khởi động với data mặc định), trang (render với
  lightweight-charts giả, phím tắt, cài đặt, màn hình phiên, tiếng Anh).
- Chưa có spec Playwright trong `frontend/e2e/`: các spec ở đó chạy trên stack Docker thật với
  đăng nhập. Khi làm, nên giả backend bằng `page.route` như lúc kiểm tra thủ công trang này.

## Chưa làm / có thể làm tiếp

- Gửi lệnh replay vào nhật ký (một tài khoản "Backtest"), lưu phiên lên backend.
- SMT chưa chắc trùng 100% với bản TFO (độ dài pivot mặc định, định nghĩa "đường sạch").
