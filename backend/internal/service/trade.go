package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/metrics"
	"journal/internal/repository"
)

const (
	// DefaultPageSize và MaxPageSize dùng chung cho service và handler, để
	// hai nơi không trôi lệch nhau.
	DefaultPageSize = 50
	MaxPageSize     = 200
)

// ReadResult là kết quả của một lần nạp-và-lọc.
//
// HAI tập, không phải một. Spec mẹ §7.1 quy định lũy kế, drawdown và streak
// tính trên TOÀN BỘ lệnh chưa xoá, còn KPI và pivot tính trên tập ĐÃ LỌC.
// Trộn lẫn hai tập này là lỗi im lặng: kết quả vẫn ra số, chỉ là số sai.
type ReadResult struct {
	All      []metrics.Enriched
	Filtered []metrics.Enriched
	Account  domain.Account
}

// Page là một trang của danh sách lệnh.
type Page struct {
	Items []metrics.Enriched
	Page  int
	Size  int
	Total int
}

// TradeInput là đầu vào tạo lệnh. Không có STT: backend cấp.
type TradeInput struct {
	EnteredAt      time.Time
	Symbol         string
	Direction      string
	Entry          *decimal.Decimal
	Exit           *decimal.Decimal
	Volume         *decimal.Decimal
	Profit         decimal.Decimal
	ProfitTheory   *decimal.Decimal
	Fee            decimal.Decimal
	Setup          string
	Timeframe      string
	EntryQuality   string
	InTradeQuality string
	ExitQuality    string
	Psychology     string
	Notes          string
}

type TradeService struct {
	trades   *repository.TradeRepo
	flows    *repository.CashFlowRepo
	accounts *AccountService
}

func NewTradeService(trades *repository.TradeRepo, flows *repository.CashFlowRepo, accounts *AccountService) *TradeService {
	return &TradeService{trades: trades, flows: flows, accounts: accounts}
}

// Read nạp toàn bộ lệnh chưa xoá của account, làm giàu trên TRỌN dãy, rồi
// mới lọc.
//
// Thứ tự này là điều kiện đúng/sai chứ không phải sở thích: Enrich tính
// cum_by_trade, running_peak và drawdown theo thứ tự stt, nên lọc trước khi
// làm giàu sẽ dựng đường equity từ một tập con — một đường không có thật.
//
// Nhận sẵn domain.Account thay vì accountID vì handler đã có account trong
// context từ RequireAccount; nạp lại là một truy vấn thừa mỗi request.
func (s *TradeService) Read(ctx context.Context, acc domain.Account, f Filter) (ReadResult, error) {
	rows, err := s.trades.ListByAccount(ctx, acc.ID)
	if err != nil {
		return ReadResult{}, fmt.Errorf("liệt kê lệnh: %w", err)
	}
	all, err := metrics.Enrich(rows, acc)
	if err != nil {
		// Enrich chỉ lỗi khi timezone của account không phải tên IANA hợp lệ,
		// hoặc khi lát cắt trộn nhiều account. Cả hai đều hiển thị được cho
		// người dùng và đều là lỗi dữ liệu, không phải lỗi hệ thống.
		return ReadResult{}, apperr.Validation(err.Error())
	}
	return ReadResult{
		All:      all,
		Filtered: f.Normalize().Apply(all),
		Account:  acc,
	}, nil
}

// List phân trang tập đã lọc, lệnh mới nhất trước.
func (s *TradeService) List(ctx context.Context, acc domain.Account, f Filter, page, size int) (Page, error) {
	res, err := s.Read(ctx, acc, f)
	if err != nil {
		return Page{}, err
	}
	return paginate(res.Filtered, page, size), nil
}

// paginate kẹp tham số sai về khoảng hợp lệ thay vì báo lỗi: một trang danh
// sách không nên gãy vì query string bị gõ nhầm.
func paginate(rows []metrics.Enriched, page, size int) Page {
	if page < 1 {
		page = 1
	}
	switch {
	case size < 1:
		size = DefaultPageSize
	case size > MaxPageSize:
		size = MaxPageSize
	}

	// Mới nhất trước. Đảo vào BẢN SAO chứ không đảo tại chỗ: rows là lát cắt
	// của ReadResult.Filtered, và /stats với /charts còn dùng nó.
	nguoc := make([]metrics.Enriched, len(rows))
	for i, r := range rows {
		nguoc[len(rows)-1-i] = r
	}

	total := len(nguoc)
	from := (page - 1) * size
	if from > total {
		from = total
	}
	to := from + size
	if to > total {
		to = total
	}
	return Page{Items: nguoc[from:to], Page: page, Size: size, Total: total}
}

// Create chèn lệnh mới. Phần kiểm tra đầu vào được đắp vào ở Task 6.
func (s *TradeService) Create(ctx context.Context, acc domain.Account, in TradeInput) (domain.Trade, error) {
	created, err := s.trades.Create(ctx, domain.Trade{
		AccountID:      acc.ID,
		EnteredAt:      in.EnteredAt.UTC(),
		Symbol:         in.Symbol,
		Direction:      in.Direction,
		Entry:          in.Entry,
		Exit:           in.Exit,
		Volume:         in.Volume,
		Profit:         in.Profit,
		ProfitTheory:   in.ProfitTheory,
		Fee:            in.Fee,
		Setup:          in.Setup,
		Timeframe:      in.Timeframe,
		EntryQuality:   in.EntryQuality,
		InTradeQuality: in.InTradeQuality,
		ExitQuality:    in.ExitQuality,
		Psychology:     in.Psychology,
		Notes:          in.Notes,
	})
	if err != nil {
		return domain.Trade{}, fmt.Errorf("tạo lệnh: %w", err)
	}
	return created, nil
}

// Delete xoá mềm. Kiểm quyền sở hữu nằm ở middleware RequireTrade (Task 9).
func (s *TradeService) Delete(ctx context.Context, id int64) error {
	if err := s.trades.SoftDelete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy lệnh")
		}
		return fmt.Errorf("xoá lệnh: %w", err)
	}
	return nil
}
