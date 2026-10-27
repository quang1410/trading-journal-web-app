package httpapi

import (
	"context"
	"log"
	"net/http"
	"strings"

	"journal/internal/service"
)

// CronHandler phục vụ Vercel Cron (vercel.json): mỗi sáng thứ Bảy, và chạy dự phòng Chủ nhật, kéo
// tuần nến 1m CME vừa đóng và lưu vào DB.
type CronHandler struct{ svc *service.LiveBarService }

type cronResultDTO struct {
	Symbol string `json:"symbol"`
	Bars   int    `json:"bars"`
	From   int64  `json:"from"`
	To     int64  `json:"to"`
	Error  string `json:"error,omitempty"`
}

// ReplayBars: GET /api/cron/replay-bars. Mã nào hỏng thì 502 nêu tên mã đó, để trang Cron Jobs của
// Vercel đánh dấu lần chạy thất bại; mã nào xong vẫn đã được lưu.
func (h *CronHandler) ReplayBars(w http.ResponseWriter, _ *http.Request) {
	// context nền: lần chạy không gắn với kết nối của Vercel Cron
	results := h.svc.RefreshAll(context.Background())
	out := make([]cronResultDTO, len(results))
	var failed []string
	for i, res := range results {
		out[i] = cronResultDTO{Symbol: res.Symbol, Bars: res.Bars, From: res.From, To: res.To}
		if res.Err != nil {
			out[i].Error = res.Err.Error()
			failed = append(failed, res.Symbol)
		}
	}
	log.Printf("cron replay bars: %+v", out)
	if len(failed) > 0 {
		Fail(w, http.StatusBadGateway, 1502, "không lưu được nến của "+strings.Join(failed, ", "))
		return
	}
	OK(w, out)
}
