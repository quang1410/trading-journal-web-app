package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

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

// ImportReport là kết quả một lần import, đủ để frontend dựng bảng preview.
type ImportReport struct {
	Valid     int                 `json:"valid"`     // số dòng đọc được
	Skipped   int                 `json:"skipped"`   // dòng trống bỏ qua
	Errors    []importer.RowError `json:"errors"`    // dòng hỏng, kèm số dòng và tên cột
	Committed bool                `json:"committed"` // đã ghi vào DB hay chưa
}

type ImportService struct{ trades *repository.TradeRepo }

func NewImportService(trades *repository.TradeRepo) *ImportService {
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
	dem := &demByte{r: lr}

	rep, err := importer.Parse(dem, loc)
	if dem.n > MaxImportBytes {
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

// demByte đếm số byte đã đọc, để phát hiện file vượt trần.
type demByte struct {
	r io.Reader
	n int64
}

func (d *demByte) Read(p []byte) (int, error) {
	n, err := d.r.Read(p)
	d.n += int64(n)
	return n, err
}
