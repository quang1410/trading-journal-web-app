package httpapi

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/shopspring/decimal"

	"journal/internal/aggregate"
	"journal/internal/domain"
	"journal/internal/service"
)

type JournalNoteHandler struct {
	notes  *service.JournalNoteService
	trades *service.TradeService
}

// DTO riêng, không marshal thẳng domain.JournalNote: struct domain mang tag
// GORM, lôi ra API là rò rỉ tầng lưu trữ (cùng lý do noteTemplateDTO tồn tại).
//
// Không có ID: khoá của một ghi chú kỳ là (period, period_key) mà client đã
// biết trước. Gửi thêm id chỉ mời frontend dựng URL theo id — đường dẫn mà
// API này cố ý không mở.
type journalNoteDTO struct {
	Period    domain.Period `json:"period"`
	PeriodKey string        `json:"period_key"`
	BodyHTML  string        `json:"body_html"`
	UpdatedAt time.Time     `json:"updated_at"`
}

func toJournalNoteDTO(n domain.JournalNote) journalNoteDTO {
	return journalNoteDTO{
		Period:    n.Period,
		PeriodKey: n.PeriodKey,
		BodyHTML:  n.BodyHTML,
		UpdatedAt: n.UpdatedAt,
	}
}

// make(..., 0, n) chứ không var: slice rỗng phải marshal thành [] chứ không
// phải null — null.map(...) là crash ở frontend.
func toJournalNoteDTOs(list []domain.JournalNote) []journalNoteDTO {
	out := make([]journalNoteDTO, 0, len(list))
	for _, n := range list {
		out = append(out, toJournalNoteDTO(n))
	}
	return out
}

// periodStatDTO cắt CurrentBalance và NetCashFlow khỏi KPI của kỳ.
//
// Hai trường đó luôn bằng 0 ở cấp kỳ và không mang nghĩa nào: số dư là một mốc
// tại một thời điểm, không phải đại lượng của một khoảng. Để lọt ra JSON thì
// frontend có hai con số 0 trông như dữ liệu thật.
type periodStatDTO struct {
	Key    string                  `json:"key"`
	Start  string                  `json:"start"`
	End    string                  `json:"end"`
	Volume decimal.Decimal         `json:"volume"`
	Points []aggregate.PeriodPoint `json:"points"`
	KPI    periodKpiDTO            `json:"kpi"`
}

// periodKpiDTO là statsDTO TRỪ hai trường số dư.
//
// Viết riêng thay vì nhúng statsDTO rồi gắn json:"-": nhúng struct khác chỉ để
// giấu hai trường sẽ khiến mỗi trường mới thêm vào statsDTO tự động chảy ra
// đây mà không ai quyết định là nó có nghĩa ở cấp kỳ hay không.
type periodKpiDTO struct {
	TotalWin  decimal.Decimal `json:"total_win"`
	TotalLoss decimal.Decimal `json:"total_loss"`
	NetProfit decimal.Decimal `json:"net_profit"`
	TotalFees decimal.Decimal `json:"total_fees"`

	ProfitFactor *decimal.Decimal `json:"profit_factor"`

	WinCount    int              `json:"win_count"`
	LossCount   int              `json:"loss_count"`
	TotalTrades int              `json:"total_trades"`
	WinPct      *decimal.Decimal `json:"win_pct"`

	AveWin  *decimal.Decimal `json:"ave_win"`
	AveLoss *decimal.Decimal `json:"ave_loss"`

	BiggestWinner *decimal.Decimal `json:"biggest_winner"`
	BiggestLoser  *decimal.Decimal `json:"biggest_loser"`

	Expectancy *decimal.Decimal `json:"expectancy"`

	AvgHoldSeconds *int64 `json:"avg_hold_seconds"`

	MaxDrawdown decimal.Decimal `json:"max_drawdown"`
}

func toPeriodStatDTO(s aggregate.PeriodStat) periodStatDTO {
	k := s.KPI
	return periodStatDTO{
		Key:    s.Key,
		Start:  s.Start,
		End:    s.End,
		Volume: s.Volume,
		Points: s.Points,
		KPI: periodKpiDTO{
			TotalWin: k.TotalWin, TotalLoss: k.TotalLoss,
			NetProfit: k.NetProfit, TotalFees: k.TotalFees,
			ProfitFactor: k.ProfitFactor,
			WinCount:     k.WinCount, LossCount: k.LossCount,
			TotalTrades: k.TotalTrades, WinPct: k.WinPct,
			AveWin: k.AveWin, AveLoss: k.AveLoss,
			BiggestWinner: k.BiggestWinner, BiggestLoser: k.BiggestLoser,
			Expectancy:     k.Expectancy,
			AvgHoldSeconds: k.AvgHoldSeconds,
			MaxDrawdown:    k.MaxDrawdown,
		},
	}
}

type journalNotePutRequest struct {
	BodyHTML string `json:"body_html"`
}

// periodFromQuery đọc kỳ từ query, mặc định "day".
//
// Mặc định chứ không bắt buộc: "day" là tab đầu tiên của UI, nên URL trần phải
// trả về đúng thứ người dùng thấy khi bấm vào tab đó.
func periodFromQuery(r *http.Request) string {
	if p := r.URL.Query().Get("period"); p != "" {
		return p
	}
	return string(domain.PeriodDay)
}

func (h *JournalNoteHandler) Periods(w http.ResponseWriter, r *http.Request) {
	stats, err := h.trades.Periods(r.Context(), Account(r.Context()), filterFromQuery(r), periodFromQuery(r))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	out := make([]periodStatDTO, 0, len(stats))
	for _, s := range stats {
		out = append(out, toPeriodStatDTO(s))
	}
	OK(w, out)
}

func (h *JournalNoteHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.notes.List(r.Context(), Account(r.Context()).ID, periodFromQuery(r))
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, toJournalNoteDTOs(list))
}

// Save là PUT: khoá (account, period, key) do CLIENT biết trước, nên "tạo" và
// "sửa" là cùng một thao tác. Body rỗng nghĩa là xoá — xem service.Save.
func (h *JournalNoteHandler) Save(w http.ResponseWriter, r *http.Request) {
	var req journalNotePutRequest
	if err := DecodeJSON(r, &req); err != nil {
		FailErr(w, r, err)
		return
	}
	saved, deleted, err := h.notes.Save(
		r.Context(),
		Account(r.Context()).ID,
		chi.URLParam(r, "period"),
		chi.URLParam(r, "key"),
		req.BodyHTML,
	)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	if deleted {
		OK(w, nil)
		return
	}
	OK(w, toJournalNoteDTO(saved))
}

func (h *JournalNoteHandler) Delete(w http.ResponseWriter, r *http.Request) {
	err := h.notes.Delete(
		r.Context(),
		Account(r.Context()).ID,
		chi.URLParam(r, "period"),
		chi.URLParam(r, "key"),
	)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, nil)
}
