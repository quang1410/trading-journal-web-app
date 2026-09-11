// Package exporter dựng file CSV từ danh sách lệnh đã làm giàu.
//
// Package THUẦN: không GORM, không net/http, không context. Nhận
// []metrics.Enriched và io.Writer.
//
// Nó KHÔNG tính lại gì cả. Mọi cột derived lấy thẳng từ metrics.Enriched —
// nếu ở đây có một phép cộng nào thì đó là công thức thứ hai cho cùng một
// con số, và hai công thức sẽ trôi lệch nhau.
package exporter

import (
	"encoding/csv"
	"io"
	"strconv"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/csvformat"
	"journal/internal/metrics"
)

// Thứ tự cột và quy tắc thoát ô chữ nằm ở package csvformat — dùng chung với
// importer, để xuất-rồi-nhập-lại là ràng buộc CẤU TRÚC chứ không phải một
// điều phải nhớ ở hai nơi.

// Header trả bản sao danh sách cột. Uỷ thác cho csvformat, giữ tên cũ để
// chỗ gọi và test không phải đổi.
func Header() []string { return csvformat.Header() }

// WriteCSV ghi header cộng một dòng mỗi lệnh.
//
// accountCode để trống ở đây vì metrics.Enriched không mang nó; handler biết
// account nên nó điền qua WriteCSVFor. Cột này chỉ để người đọc nhận ra file,
// importer bỏ qua nó (account suy từ URL).
func WriteCSV(w io.Writer, rows []metrics.Enriched) error {
	return WriteCSVFor(w, rows, "")
}

// WriteCSVFor như WriteCSV nhưng điền mã account vào cột Account.
func WriteCSVFor(w io.Writer, rows []metrics.Enriched, accountCode string) error {
	// BOM trước mọi thứ: Excel mở CSV UTF-8 KHÔNG có BOM sẽ hiện "Đúng kế
	// hoạch" thành ký tự rác, và người dùng sẽ nghĩ dữ liệu hỏng chứ không
	// nghĩ font hỏng.
	if _, err := io.WriteString(w, "\uFEFF"); err != nil {
		return err
	}

	cw := csv.NewWriter(w)
	if err := cw.Write(csvformat.Header()); err != nil {
		return err
	}
	for _, e := range rows {
		if err := cw.Write(row(e, accountCode)); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

// moneyPtr trả ô RỖNG cho con trỏ nil.
//
// Rỗng và "0" là hai chuyện khác nhau: profit_theory chưa nhập không phải là
// lý thuyết hoà vốn. Xuất 0 ở đây là bịa ra một con số người dùng chưa gõ.
func moneyPtr(d *decimal.Decimal) string {
	if d == nil {
		return ""
	}
	return d.String()
}

// closedAt ghi RFC3339, hoặc ô RỖNG khi lệnh chưa đóng.
//
// RFC3339 chứ không phải định dạng ngày của cột Day: cột này mang phần giờ, và
// phần giờ là thứ duy nhất làm nó có ích. Mang sẵn offset nên nhập lại không
// phụ thuộc vào timezone của account lúc nhập.
func closedAt(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

// enteredAt ghi RFC3339 đầy đủ giờ cho cột Day.
//
// TRƯỚC đây cột này ghi bare date (chỉ ngày, không giờ) — importer.ParseDay
// đọc lại phải GHIM giờ về 12:00 vì không có giờ thật để dùng. Nhưng
// closed_at (ngay cột kế bên) luôn mang giờ đầy đủ, nên một lệnh xuất ra rồi
// nhập lại có entered_at bị ghim 12:00 trong khi closed_at giữ giờ thật —
// hold_seconds tính sai, và lệnh đóng trước 12:00 còn bị từ chối vì
// "closed_at trước entered_at". Ghi RFC3339 ở đây để cặp entered_at/closed_at
// của MỘT lệnh luôn khớp nhau khi nhập lại; ParseDayOrDateTime vẫn đọc được
// file Excel gốc chỉ có ngày trần, nên không mất khả năng nhập file cũ.
func enteredAt(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}

// scoreTotal trả ô RỖNG cho lệnh chưa chấm.
//
// Cùng lý do §2.5 của trading-journal-plan.md: score_total = nil nghĩa là
// CHƯA ĐÁNH GIÁ. Ghi 0 vào đây thì đọc lại thành "chấm rồi, được 0 điểm" —
// đúng cái bug của Excel gốc mà web cố ý sửa.
func scoreTotal(p *int) string {
	if p == nil {
		return ""
	}
	return strconv.Itoa(*p)
}

func row(e metrics.Enriched, accountCode string) []string {
	t := e.Trade
	return []string{
		strconv.Itoa(t.STT),
		accountCode,
		enteredAt(t.EnteredAt),
		closedAt(t.ClosedAt),
		csvformat.Escape(t.Symbol),
		t.Direction,
		moneyPtr(t.Entry),
		moneyPtr(t.Exit),
		moneyPtr(t.Volume),
		t.Profit.String(),
		moneyPtr(t.ProfitTheory),
		t.Fee.String(),
		csvformat.Escape(t.Setup),
		t.Timeframe,
		t.EntryQuality,
		t.InTradeQuality,
		t.ExitQuality,
		t.Psychology,
		// Bóc thẻ TRƯỚC khi bọc chống công thức: ghi chú lưu dạng HTML nên nó
		// mở đầu bằng "<p>", và Escape nhìn vào ký tự đầu. Bọc trước thì
		// "<p>=1+1</p>" thoát lưới và Excel chạy nó lúc mở file.
		csvformat.Escape(csvformat.NotesToText(t.Notes)),

		e.TradeClass,
		strconv.Itoa(e.ScoreEntry),
		strconv.Itoa(e.ScoreExit),
		strconv.Itoa(e.ScoreInTrade),
		strconv.Itoa(e.ScorePsych),
		scoreTotal(e.ScoreTotal),
		e.Week,
		e.Month,
		e.Net.String(),
		strconv.Itoa(e.WinLoss),
		e.CumByTrade.String(),
		e.CumByDay.String(),
		e.CumTheory.String(),
		e.RunningPeak.String(),
		e.Drawdown.String(),
	}
}
