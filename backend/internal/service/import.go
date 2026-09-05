package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/importer"
	"journal/internal/repository"
)

// MaxImportBytes là trần kích thước một file import.
//
// 5MB đủ cho khoảng 50 nghìn dòng — nhiều hơn hẳn một cuốn nhật ký giao dịch
// đời thật. Có trần là để một file hỏng (hoặc cố tình) không giữ RAM và giữ
// kết nối DB của cả API; không có trần thì lỗi biểu hiện thành timeout, và
// timeout thì không nói cho người dùng biết phải sửa gì.
const MaxImportBytes = 5 << 20

// MaxPreviewRows là số dòng đầu được trả về để người dùng xem trước.
//
// Cố tình nhỏ: preview để ĐỐI CHIẾU chứ không để đọc cả file. Mười dòng đủ
// thấy ngày đọc ra có đúng không, chiều lệnh có bị lật không, cột tiền có
// lệch không — ba thứ hỏng ngầm hay gặp nhất. Trả cả 5000 dòng chỉ làm response
// phình lên và bảng preview thành một bản sao vô dụng của file gốc.
const MaxPreviewRows = 10

// PreviewRow là một dòng ĐÃ PARSE, đúng như nó sẽ được ghi.
//
// Vì sao không dùng lại tradeDTO của httpapi: DTO đó nhúng metrics.Enriched và
// mang stt — cả hai đều CHƯA TỒN TẠI ở thời điểm preview. Lệnh chưa ghi thì
// chưa có số thứ tự, và mọi trường lũy kế đều tính trên dãy đã ghi. Trả một
// DTO có sẵn những trường đó, dù bỏ trống, là nói dối về thứ mình biết.
//
// Chỉ giữ các cột người dùng đối chiếu được bằng mắt với file Excel. Setup,
// Notes và bốn cột chấm điểm cố ý KHÔNG có mặt: chúng không phải chỗ dữ liệu
// bị đọc sai, và thêm vào chỉ làm bảng preview tràn ngang.
//
// Mọi trường tiền là chuỗi JSON, cùng lý do như tradeDTO: decimal marshal ra
// chuỗi nên frontend không mất chữ số.
type PreviewRow struct {
	// Ngày sau khi ĐÃ quy đổi theo accounts.timezone. Đây là trường đáng xem
	// nhất của cả bảng: "09/06/2026" trong file là 9 tháng 6 hay 6 tháng 9 chỉ
	// lộ ra ở đây, và lộ ra TRƯỚC khi ghi.
	Day       string           `json:"day"`
	Symbol    string           `json:"symbol"`
	Direction string           `json:"direction"` // đã map BUY/SELL → Long/Short
	Entry     *decimal.Decimal `json:"entry"`
	Exit      *decimal.Decimal `json:"exit"`
	Volume    *decimal.Decimal `json:"volume"`
	Profit    decimal.Decimal  `json:"profit"`
	Fee       decimal.Decimal  `json:"fee"`
}

// ImportReport là kết quả một lần import, đủ để frontend dựng bảng preview.
type ImportReport struct {
	Valid   int                 `json:"valid"`   // số dòng đọc được
	Skipped int                 `json:"skipped"` // dòng trống bỏ qua
	Errors  []importer.RowError `json:"errors"`  // dòng hỏng, kèm số dòng và tên cột
	// Preview là tối đa MaxPreviewRows dòng ĐẦU đã parse. Rỗng khi file không
	// đọc được dòng nào.
	Preview   []PreviewRow `json:"preview"`
	Committed bool         `json:"committed"` // đã ghi vào DB hay chưa
}

type ImportService struct{ trades TradeStore }

func NewImportService(trades TradeStore) *ImportService {
	return &ImportService{trades: trades}
}

// Import đọc file CSV và, nếu không phải dry-run và không có lỗi dòng nào,
// ghi toàn bộ vào account.
//
// Ba quyết định nằm ở đây chứ không ở importer:
//
//  1. dryRun — importer luôn chỉ đọc; việc có ghi hay không là chuyện của
//     tầng này.
//  2. All-or-nothing — còn một dòng hỏng thì không ghi dòng nào. Người dùng
//     sửa file rồi chạy lại, thay vì phải đoán xem nửa nào đã vào DB.
//  3. Timezone — file cũ chỉ có cột ngày, không có giờ. Quy đổi theo
//     accounts.timezone (quy tắc 4 của CLAUDE.md), không theo giờ máy chủ.
//
// Trả error CHỈ khi cả file không dùng được. Dòng hỏng lẻ tẻ đi vào
// ImportReport.Errors — đó là dữ liệu để hiển thị, không phải sự cố.
func (s *ImportService) Import(ctx context.Context, acc domain.Account, r io.Reader, dryRun bool) (ImportReport, error) {
	loc, err := time.LoadLocation(acc.Timezone)
	if err != nil {
		// Cùng cách xử như metrics.Enrich: timezone hỏng là lỗi DỮ LIỆU của
		// account, hiển thị được cho người dùng, không phải sự cố hệ thống.
		return ImportReport{}, apperr.Validation(
			fmt.Sprintf("timezone %q của account không hợp lệ", acc.Timezone))
	}

	// Chặn theo kích thước bằng LimitReader dư một byte: đọc hết mà vẫn còn
	// byte thứ (MaxImportBytes+1) nghĩa là file vượt trần. Kiểm bằng
	// Content-Length của request thì client tự khai được, nên không tin.
	lr := io.LimitReader(r, MaxImportBytes+1)
	counter := &byteCounter{r: lr}

	rep, err := importer.Parse(counter, loc)
	if counter.n > MaxImportBytes {
		return ImportReport{}, apperr.Validation(
			fmt.Sprintf("file vượt quá %d MB", MaxImportBytes>>20))
	}
	if err != nil {
		// Lỗi cấp file: rỗng, thiếu cột bắt buộc, CSV hỏng cấu trúc. Thông
		// điệp của importer đã viết cho người dùng đọc nên chuyển thẳng.
		return ImportReport{}, apperr.Validation(err.Error())
	}

	out := ImportReport{
		Valid:   len(rep.Rows),
		Skipped: rep.Skipped,
		Errors:  rep.Errors,
		Preview: buildPreview(rep.Rows, loc),
	}
	if dryRun || len(rep.Errors) > 0 || len(rep.Rows) == 0 {
		return out, nil
	}

	if _, err := s.trades.CreateBatch(ctx, acc.ID, rep.Rows); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return out, apperr.NotFound("không tìm thấy account")
		}
		return out, fmt.Errorf("ghi lệnh import: %w", err)
	}
	out.Committed = true
	return out, nil
}

// buildPreview lấy tối đa MaxPreviewRows dòng đầu để người dùng đối chiếu.
//
// Ngày quy về loc chứ không để UTC (quy tắc 4 của CLAUDE.md). Đây không phải
// chi tiết trình bày mà là ĐIỂM CHÍNH của preview: ParseDay chốt giờ ở 12:00
// theo giờ account rồi lưu UTC, nên một account ở UTC+7 có entered_at là
// 05:00Z. In ra ngày của chuỗi UTC đó vẫn đúng ngày ở đây, nhưng với account ở
// UTC-5 thì 12:00 local thành 17:00Z — vẫn cùng ngày — còn UTC+13 thì 12:00
// local là 23:00Z HÔM TRƯỚC. Format theo loc mới cho ra đúng ngày người dùng
// gõ trong Excel ở mọi múi giờ.
//
// Trả nil khi không có dòng nào: encoding/json cho ra `null`, và frontend đọc
// `preview ?? []`. Không cố trả mảng rỗng — nil là câu trả lời đúng cho "không
// có gì để xem".
func buildPreview(rows []domain.Trade, loc *time.Location) []PreviewRow {
	n := min(len(rows), MaxPreviewRows)
	if n == 0 {
		return nil
	}
	out := make([]PreviewRow, 0, n)
	for _, t := range rows[:n] {
		out = append(out, PreviewRow{
			Day:       t.EnteredAt.In(loc).Format("2006-01-02"),
			Symbol:    t.Symbol,
			Direction: t.Direction,
			Entry:     t.Entry,
			Exit:      t.Exit,
			Volume:    t.Volume,
			Profit:    t.Profit,
			Fee:       t.Fee,
		})
	}
	return out
}

// byteCounter đếm số byte đã đọc, để phát hiện file vượt trần.
type byteCounter struct {
	r io.Reader
	n int64
}

func (d *byteCounter) Read(p []byte) (int, error) {
	n, err := d.r.Read(p)
	d.n += int64(n)
	return n, err
}
