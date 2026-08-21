package httpapi

import (
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/metrics"
	"journal/internal/service"
)

// tradeDTO là hợp đồng của một lệnh: 17 trường input, cộng id/account_id/stt,
// cộng toàn bộ trường suy diễn.
//
// Phẳng chứ không lồng — frontend hiển thị bảng, mỗi cột một trường; lồng
// thêm một tầng chỉ để "gọn" sẽ bắt mọi chỗ dùng phải tự mở ra.
//
// Mọi trường tiền là CHUỖI JSON: decimal.Decimal của shopspring marshal ra
// chuỗi, và đó chính là lý do frontend không mất chữ số.
type tradeDTO struct {
	ID        int64  `json:"id"`
	AccountID int64  `json:"account_id"`
	STT       int    `json:"stt"`
	EnteredAt string `json:"entered_at"`

	Symbol       string           `json:"symbol"`
	Direction    string           `json:"direction"`
	Entry        *decimal.Decimal `json:"entry"`
	Exit         *decimal.Decimal `json:"exit"`
	Volume       *decimal.Decimal `json:"volume"`
	Profit       decimal.Decimal  `json:"profit"`
	ProfitTheory *decimal.Decimal `json:"profit_theory"`
	Fee          decimal.Decimal  `json:"fee"`

	Setup          string `json:"setup"`
	Timeframe      string `json:"timeframe"`
	EntryQuality   string `json:"entry_quality"`
	InTradeQuality string `json:"in_trade_quality"`
	ExitQuality    string `json:"exit_quality"`
	Psychology     string `json:"psychology"`
	Notes          string `json:"notes"`

	Net     decimal.Decimal `json:"net"`
	WinLoss int             `json:"win_loss"`
	WinSign int             `json:"win_sign"`

	ScoreEntry   int    `json:"score_entry"`
	ScoreInTrade int    `json:"score_in_trade"`
	ScoreExit    int    `json:"score_exit"`
	ScorePsych   int    `json:"score_psych"`
	ScoreTotal   *int   `json:"score_total"`
	TradeClass   string `json:"trade_class"`

	Day      string `json:"day"`
	Week     string `json:"week"`
	WeekSort string `json:"week_sort"`
	Month    string `json:"month"`
	Weekday  string `json:"weekday"`

	CumByTrade  decimal.Decimal `json:"cum_by_trade"`
	CumByDay    decimal.Decimal `json:"cum_by_day"`
	CumTheory   decimal.Decimal `json:"cum_theory"`
	RunningPeak decimal.Decimal `json:"running_peak"`
	Drawdown    decimal.Decimal `json:"drawdown"`
}

func toTradeDTO(e metrics.Enriched) tradeDTO {
	t := e.Trade
	return tradeDTO{
		ID:        t.ID,
		AccountID: t.AccountID,
		STT:       t.STT,
		// RFC3339 ở UTC. Frontend đổi sang giờ account để hiển thị; gửi kèm
		// offset là điều kiện để nó làm được việc đó.
		EnteredAt: t.EnteredAt.UTC().Format(time.RFC3339),

		Symbol:       t.Symbol,
		Direction:    t.Direction,
		Entry:        t.Entry,
		Exit:         t.Exit,
		Volume:       t.Volume,
		Profit:       t.Profit,
		ProfitTheory: t.ProfitTheory,
		Fee:          t.Fee,

		Setup:          t.Setup,
		Timeframe:      t.Timeframe,
		EntryQuality:   t.EntryQuality,
		InTradeQuality: t.InTradeQuality,
		ExitQuality:    t.ExitQuality,
		Psychology:     t.Psychology,
		Notes:          t.Notes,

		Net:     e.Net,
		WinLoss: e.WinLoss,
		WinSign: e.WinSign,

		ScoreEntry:   e.ScoreEntry,
		ScoreInTrade: e.ScoreInTrade,
		ScoreExit:    e.ScoreExit,
		ScorePsych:   e.ScorePsych,
		ScoreTotal:   e.ScoreTotal,
		TradeClass:   e.TradeClass,

		Day:      e.Day,
		Week:     e.Week,
		WeekSort: e.WeekSort,
		Month:    e.Month,
		Weekday:  e.Weekday,

		CumByTrade:  e.CumByTrade,
		CumByDay:    e.CumByDay,
		CumTheory:   e.CumTheory,
		RunningPeak: e.RunningPeak,
		Drawdown:    e.Drawdown,
	}
}

func toTradeDTOs(rows []metrics.Enriched) []tradeDTO {
	// Slice rỗng chứ không nil: JSON phải là [] chứ không phải null.
	out := make([]tradeDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, toTradeDTO(r))
	}
	return out
}

// deletedTradeDTO là lệnh trong thùng rác — CHỈ trường input.
//
// Không có trường suy diễn, và đó là chủ ý: lệnh đã xoá không nằm trong dãy
// lũy kế, nên cum_by_trade hay drawdown của nó không có nghĩa gì. Trả về số 0
// sẽ trông như một con số thật.
type deletedTradeDTO struct {
	ID        int64           `json:"id"`
	AccountID int64           `json:"account_id"`
	STT       int             `json:"stt"`
	EnteredAt string          `json:"entered_at"`
	Symbol    string          `json:"symbol"`
	Direction string          `json:"direction"`
	Profit    decimal.Decimal `json:"profit"`
	Fee       decimal.Decimal `json:"fee"`
	Setup     string          `json:"setup"`
	Notes     string          `json:"notes"`
}

func toDeletedTradeDTOs(rows []domain.Trade) []deletedTradeDTO {
	out := make([]deletedTradeDTO, 0, len(rows))
	for _, t := range rows {
		out = append(out, deletedTradeDTO{
			ID:        t.ID,
			AccountID: t.AccountID,
			STT:       t.STT,
			EnteredAt: t.EnteredAt.UTC().Format(time.RFC3339),
			Symbol:    t.Symbol,
			Direction: t.Direction,
			Profit:    t.Profit,
			Fee:       t.Fee,
			Setup:     t.Setup,
			Notes:     t.Notes,
		})
	}
	return out
}

// tradePageDTO bọc một trang danh sách.
type tradePageDTO struct {
	Items []tradeDTO `json:"items"`
	Page  int        `json:"page"`
	Size  int        `json:"size"`
	Total int        `json:"total"`
}

// statsDTO ánh xạ 1-1 từ metrics.KPI.
//
// Con trỏ ra null khi không tính được — chưa có lệnh thua thì profit_factor
// là null chứ KHÔNG phải 0. Số 0 ở đây sẽ được đọc thành "hệ số lợi nhuận
// bằng không", tức thua sạch, ngược hẳn sự thật.
type statsDTO struct {
	TotalWin  decimal.Decimal `json:"total_win"`
	TotalLoss decimal.Decimal `json:"total_loss"`
	NetProfit decimal.Decimal `json:"net_profit"`
	TotalFees decimal.Decimal `json:"total_fees"`

	NetReturnPct *decimal.Decimal `json:"net_return_pct"`
	ProfitFactor *decimal.Decimal `json:"profit_factor"`

	WinCount    int              `json:"win_count"`
	LossCount   int              `json:"loss_count"`
	TotalTrades int              `json:"total_trades"`
	WinPct      *decimal.Decimal `json:"win_pct"`

	AveWin  *decimal.Decimal `json:"ave_win"`
	AveLoss *decimal.Decimal `json:"ave_loss"`

	BiggestWinner *decimal.Decimal `json:"biggest_winner"`
	BiggestLoser  *decimal.Decimal `json:"biggest_loser"`

	OneR         decimal.Decimal  `json:"one_r"`
	BiggestRWin  *decimal.Decimal `json:"biggest_r_win"`
	BiggestRLoss *decimal.Decimal `json:"biggest_r_loss"`
	RRActual     *decimal.Decimal `json:"rr_actual"`

	Expectancy *decimal.Decimal `json:"expectancy"`

	MaxDrawdown    decimal.Decimal  `json:"max_drawdown"`
	MaxDDPct       *decimal.Decimal `json:"max_dd_pct"`
	RecoveryFactor *decimal.Decimal `json:"recovery_factor"`

	CurrentBalance decimal.Decimal `json:"current_balance"`
}

func toStatsDTO(k metrics.KPI) statsDTO {
	return statsDTO{
		TotalWin: k.TotalWin, TotalLoss: k.TotalLoss, NetProfit: k.NetProfit, TotalFees: k.TotalFees,
		NetReturnPct: k.NetReturnPct, ProfitFactor: k.ProfitFactor,
		WinCount: k.WinCount, LossCount: k.LossCount, TotalTrades: k.TotalTrades, WinPct: k.WinPct,
		AveWin: k.AveWin, AveLoss: k.AveLoss,
		BiggestWinner: k.BiggestWinner, BiggestLoser: k.BiggestLoser,
		OneR: k.OneR, BiggestRWin: k.BiggestRWin, BiggestRLoss: k.BiggestRLoss, RRActual: k.RRActual,
		Expectancy:  k.Expectancy,
		MaxDrawdown: k.MaxDrawdown, MaxDDPct: k.MaxDDPct, RecoveryFactor: k.RecoveryFactor,
		CurrentBalance: k.CurrentBalance,
	}
}

// tradeCreateRequest là body của POST.
//
// STT có mặt và CỐ Ý không được đọc tới. Quy tắc 7 của CLAUDE.md nói "frontend
// gửi lên thì bỏ qua", mà DecodeJSON đang bật DisallowUnknownFields — bỏ
// trường này đi thì client gửi `stt` sẽ ăn 400 chứ không phải bị bỏ qua.
type tradeCreateRequest struct {
	STT            int              `json:"stt"`
	EnteredAt      time.Time        `json:"entered_at"`
	Symbol         string           `json:"symbol"`
	Direction      string           `json:"direction"`
	Entry          *decimal.Decimal `json:"entry"`
	Exit           *decimal.Decimal `json:"exit"`
	Volume         *decimal.Decimal `json:"volume"`
	Profit         decimal.Decimal  `json:"profit"`
	ProfitTheory   *decimal.Decimal `json:"profit_theory"`
	Fee            decimal.Decimal  `json:"fee"`
	Setup          string           `json:"setup"`
	Timeframe      string           `json:"timeframe"`
	EntryQuality   string           `json:"entry_quality"`
	InTradeQuality string           `json:"in_trade_quality"`
	ExitQuality    string           `json:"exit_quality"`
	Psychology     string           `json:"psychology"`
	Notes          string           `json:"notes"`
}

func (r tradeCreateRequest) toInput() service.TradeInput {
	return service.TradeInput{
		EnteredAt: r.EnteredAt, Symbol: r.Symbol, Direction: r.Direction,
		Entry: r.Entry, Exit: r.Exit, Volume: r.Volume,
		Profit: r.Profit, ProfitTheory: r.ProfitTheory, Fee: r.Fee,
		Setup: r.Setup, Timeframe: r.Timeframe,
		EntryQuality: r.EntryQuality, InTradeQuality: r.InTradeQuality,
		ExitQuality: r.ExitQuality, Psychology: r.Psychology, Notes: r.Notes,
	}
}

// tradePatchRequest dùng service.Tri cho mọi trường: khoá vắng mặt, khoá mang
// null và khoá mang giá trị là ba chuyện khác nhau.
type tradePatchRequest struct {
	EnteredAt      service.Tri[time.Time]       `json:"entered_at"`
	Symbol         service.Tri[string]          `json:"symbol"`
	Direction      service.Tri[string]          `json:"direction"`
	Entry          service.Tri[decimal.Decimal] `json:"entry"`
	Exit           service.Tri[decimal.Decimal] `json:"exit"`
	Volume         service.Tri[decimal.Decimal] `json:"volume"`
	Profit         service.Tri[decimal.Decimal] `json:"profit"`
	ProfitTheory   service.Tri[decimal.Decimal] `json:"profit_theory"`
	Fee            service.Tri[decimal.Decimal] `json:"fee"`
	Setup          service.Tri[string]          `json:"setup"`
	Timeframe      service.Tri[string]          `json:"timeframe"`
	EntryQuality   service.Tri[string]          `json:"entry_quality"`
	InTradeQuality service.Tri[string]          `json:"in_trade_quality"`
	ExitQuality    service.Tri[string]          `json:"exit_quality"`
	Psychology     service.Tri[string]          `json:"psychology"`
	Notes          service.Tri[string]          `json:"notes"`
}

func (r tradePatchRequest) toPatch() service.TradePatch {
	return service.TradePatch{
		EnteredAt: r.EnteredAt, Symbol: r.Symbol, Direction: r.Direction,
		Entry: r.Entry, Exit: r.Exit, Volume: r.Volume,
		Profit: r.Profit, ProfitTheory: r.ProfitTheory, Fee: r.Fee,
		Setup: r.Setup, Timeframe: r.Timeframe,
		EntryQuality: r.EntryQuality, InTradeQuality: r.InTradeQuality,
		ExitQuality: r.ExitQuality, Psychology: r.Psychology, Notes: r.Notes,
	}
}
