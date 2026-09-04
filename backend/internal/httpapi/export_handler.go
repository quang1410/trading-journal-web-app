package httpapi

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"journal/internal/exporter"
	"journal/internal/service"
)

type ExportHandler struct{ svc *service.TradeService }

// TradesCSV xuất danh sách lệnh ra file CSV.
//
// KHÔNG bọc envelope: đây là một file, không phải JSON. Frontend tải nó bằng
// đường tải file chứ không qua hàm unwrap chung.
//
// Dùng lại filterFromQuery của trade handler, nên file xuất ra khớp đúng cái
// người dùng đang nhìn thấy ở /trades. Viết một bộ đọc filter thứ hai ở đây
// sẽ trôi lệch khỏi bộ kia mà không test nào bắt được.
func (h *ExportHandler) TradesCSV(w http.ResponseWriter, r *http.Request) {
	acc := Account(r.Context())
	v, err := h.svc.Load(r.Context(), acc, filterFromQuery(r))
	if err != nil {
		FailErr(w, r, err)
		return
	}

	// Đặt header TRƯỚC khi ghi byte đầu tiên: sau đó status đã gửi đi rồi,
	// và một lỗi giữa chừng không còn đổi được thành 500 nữa.
	name := fmt.Sprintf("%s-%s.csv", acc.Code, time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name))

	if err := exporter.WriteCSVFor(w, v.CSVRows(), acc.Code); err != nil {
		// Header đã gửi, không sửa được status. Ghi log rồi thôi — client sẽ
		// thấy file cụt, và đó là điều tốt nhất còn làm được ở đây.
		log.Printf("ghi CSV export [request_id=%s] account=%d: %v",
			middleware.GetReqID(r.Context()), acc.ID, err)
	}
}
