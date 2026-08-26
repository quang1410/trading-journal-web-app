package metrics

import (
	"fmt"
	"sort"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/domain"
	"journal/internal/scoring"
)

// DefaultTimezone dùng khi account chưa đặt timezone.
const DefaultTimezone = "Asia/Ho_Chi_Minh"

// Enriched là một lệnh kèm toàn bộ trường suy diễn. Không có gì ở đây được
// lưu xuống DB — tất cả tính lại mỗi lần đọc.
type Enriched struct {
	Trade domain.Trade

	Net        decimal.Decimal
	WinLoss    int
	StreakSign int

	ScoreEntry   int
	ScoreExit    int
	ScoreInTrade int
	ScorePsych   int
	ScoreTotal   *int
	TradeClass   string

	Day      string // "2026-06-09" theo timezone của account
	Week     string // "W24", ISO-8601 — nhãn hiển thị, KHÔNG mang năm
	WeekSort string // "2026-W24" — khoá gom nhóm/sắp xếp, mang năm ISO, không hiển thị
	Month    string // "06/2026"
	Weekday  string // "Tue"

	CumByTrade  decimal.Decimal
	CumByDay    decimal.Decimal
	CumTheory   decimal.Decimal
	RunningPeak decimal.Decimal
	Drawdown    decimal.Decimal
}

// Enrich tính mọi trường suy diễn cho một danh sách lệnh CỦA CÙNG MỘT account.
// Trộn lệnh của nhiều account vào đây cho lũy kế sai (cum_by_trade rò rỉ chéo
// giữa hai account) nên hàm chủ động từ chối thay vì âm thầm tính sai — xem
// trading-journal-plan.md:297 và spec §9 dòng 408.
//
// Đầu vào không cần sắp xếp sẵn — hàm tự sort theo STT vì mọi trường lũy kế
// phụ thuộc thứ tự đó.
//
// Lỗi có thể xảy ra: timezone của account không phải tên IANA hợp lệ, hoặc
// trades chứa nhiều hơn một AccountID khác nhau.
func Enrich(trades []domain.Trade, acc domain.Account) ([]Enriched, error) {
	if err := requireSingleAccount(trades); err != nil {
		return nil, err
	}

	tzName := acc.Timezone
	if tzName == "" {
		tzName = DefaultTimezone
	}
	loc, err := time.LoadLocation(tzName)
	if err != nil {
		return nil, fmt.Errorf("timezone %q của account không hợp lệ: %w", tzName, err)
	}

	sorted := make([]domain.Trade, len(trades))
	copy(sorted, trades)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].STT < sorted[j].STT })

	rows := make([]Enriched, 0, len(sorted))

	cum := decimal.Zero
	cumTheory := decimal.Zero
	peak := decimal.Zero // sàn tại 0 theo §3.7

	// Tổng net theo từng ngày, dùng để dựng cum_by_day ở lượt thứ hai.
	netByDay := map[string]decimal.Decimal{}

	for _, t := range sorted {
		net := Net(t)
		cum = cum.Add(net)

		if t.ProfitTheory != nil {
			cumTheory = cumTheory.Add(*t.ProfitTheory)
		}

		if cum.GreaterThan(peak) {
			peak = cum
		}

		day, week, weekSort, month, weekday := DateParts(t.EnteredAt, loc)
		netByDay[day] = netByDay[day].Add(net)

		total := scoring.Total(t.EntryQuality, t.InTradeQuality, t.ExitQuality, t.Psychology)

		rows = append(rows, Enriched{
			Trade:        t,
			Net:          net,
			WinLoss:      WinLoss(net),
			StreakSign:   StreakSign(net),
			ScoreEntry:   scoring.Entry(t.EntryQuality),
			ScoreExit:    scoring.Exit(t.ExitQuality),
			ScoreInTrade: scoring.InTrade(t.InTradeQuality),
			ScorePsych:   scoring.Psych(t.Psychology),
			ScoreTotal:   total,
			TradeClass:   scoring.Classify(total),
			Day:          day,
			Week:         week,
			WeekSort:     weekSort,
			Month:        month,
			Weekday:      weekday,
			CumByTrade:   cum,
			CumTheory:    cumTheory,
			RunningPeak:  peak,
			Drawdown:     peak.Sub(cum),
		})
	}

	fillCumByDay(rows, netByDay)
	return rows, nil
}

// requireSingleAccount trả lỗi nếu trades chứa nhiều hơn một AccountID khác
// nhau. Đây là hàng rào chặn wrong-number bug (equity cộng dồn chéo account)
// biến thành lỗi ồn ào ngay tại Enrich, thay vì để nó lặng lẽ trôi tới tận
// biểu đồ. Không phải "lọc" — đây là từ chối toàn bộ input, nên không vi phạm
// quy tắc "filter chỉ lọc phần hiển thị" ở §7.1/CLAUDE.md quy tắc 8.
func requireSingleAccount(trades []domain.Trade) error {
	seen := false
	var id int64
	for _, t := range trades {
		if !seen {
			id = t.AccountID
			seen = true
			continue
		}
		if t.AccountID != id {
			return fmt.Errorf("trades lẫn nhiều account (account_id %d và %d): Enrich chỉ nhận lệnh của một account", id, t.AccountID)
		}
	}
	return nil
}

// fillCumByDay gán cum_by_day = tổng net của MỌI ngày <= ngày của lệnh đó.
// Định nghĩa theo ngày (không theo thứ tự STT) nên kết quả không đổi khi
// người dùng nhập lệnh của một ngày cũ vào sau — đúng ý "lũy kế tới hết ngày" ở §3.5.
func fillCumByDay(rows []Enriched, netByDay map[string]decimal.Decimal) {
	days := make([]string, 0, len(netByDay))
	for d := range netByDay {
		days = append(days, d)
	}
	sort.Strings(days) // định dạng YYYY-MM-DD nên sort chuỗi = sort ngày

	cumByDay := make(map[string]decimal.Decimal, len(days))
	running := decimal.Zero
	for _, d := range days {
		running = running.Add(netByDay[d])
		cumByDay[d] = running
	}

	for i := range rows {
		rows[i].CumByDay = cumByDay[rows[i].Day]
	}
}
