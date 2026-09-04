package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"

	"journal/internal/aggregate"
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
	trades   TradeStore
	flows    CashFlowStore
	accounts *AccountService
}

func NewTradeService(trades TradeStore, flows CashFlowStore, accounts *AccountService) *TradeService {
	return &TradeService{trades: trades, flows: flows, accounts: accounts}
}

// List phân trang tập đã lọc, lệnh mới nhất trước.
func (s *TradeService) List(ctx context.Context, acc domain.Account, f Filter, page, size int) (Page, error) {
	v, err := s.Load(ctx, acc, f)
	if err != nil {
		return Page{}, err
	}
	return v.Page(page, size), nil
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

	// Mới nhất trước, đảo vào BẢN SAO chứ không đảo tại chỗ.
	//
	// Bản sao này GÁNH THẬT kể từ Task 6: một JournalView phục vụ cả Page,
	// KPI, Charts và CSVRows trong cùng một request (xem journal.go), nên
	// đảo tại chỗ sẽ lật ngược dãy cho mọi lời gọi sau — sai số mà không có
	// lỗi nào bật ra. Đừng bỏ bản sao này.
	reversed := make([]metrics.Enriched, len(rows))
	for i, r := range rows {
		reversed[len(rows)-1-i] = r
	}

	total := len(reversed)
	from := (page - 1) * size
	if from > total {
		from = total
	}
	to := from + size
	if to > total {
		to = total
	}
	return Page{Items: reversed[from:to], Page: page, Size: size, Total: total}
}

// tradeFromInput dựng domain.Trade từ input rồi để domain kiểm và CHUẨN HOÁ nó.
//
// Trả thẳng domain.Trade thay vì sửa ngược TradeInput: bản trước chép ba
// trường (Symbol/Setup/Notes) ngược lại vào input, đúng bằng tập mà
// ValidateTrade chuẩn hoá HÔM NAY. Ngày nào domain chuẩn hoá thêm một trường
// — ví dụ trim timeframe, việc mà MatchEnum của đường import đã làm — thì
// đường API lặng lẽ ghi giá trị chưa chuẩn hoá, và hai đường vào sinh ra hai
// khoá chấm điểm khác nhau cho cùng một input (quy tắc 5). Không có bản chép
// ngược thì không có gì để trôi lệch.
//
// Toàn bộ luật nằm ở domain.ValidateTrade; ở đây chỉ bọc lỗi thường thành
// *apperr.Error để httpapi dịch ra 400.
func tradeFromInput(acc domain.Account, in TradeInput) (domain.Trade, error) {
	t := domain.Trade{
		AccountID:      acc.ID,
		EnteredAt:      in.EnteredAt,
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
	}
	if err := domain.ValidateTrade(&t); err != nil {
		return domain.Trade{}, apperr.Validation(err.Error())
	}
	// UTC sau khi đã kiểm: EnteredAt.IsZero() phải xét trên giá trị gốc.
	t.EnteredAt = t.EnteredAt.UTC()
	return t, nil
}

func (s *TradeService) Create(ctx context.Context, acc domain.Account, in TradeInput) (domain.Trade, error) {
	t, err := tradeFromInput(acc, in)
	if err != nil {
		return domain.Trade{}, err
	}
	created, err := s.trades.Create(ctx, t)
	if err != nil {
		return domain.Trade{}, fmt.Errorf("tạo lệnh: %w", err)
	}
	return created, nil
}

// CreateAndLoad tạo lệnh rồi trả luôn ảnh chụp để người gọi đọc lại lệnh vừa
// tạo KÈM trường suy diễn.
//
// Ghép hai bước vào một method vì chúng là một cặp không tách được: handler
// nào cũng phải nạp lại sau khi ghi (cum_by_trade, running_peak, drawdown của
// một lệnh phụ thuộc TOÀN BỘ dãy trước nó, nên không tính được nếu chỉ có
// mình nó). Để handler tự ghép thì mỗi handler là một cơ hội quên, hoặc nạp
// hai lần.
//
// Bộ lọc rỗng là chủ ý: lệnh vừa tạo có thể nằm ngoài bộ lọc người dùng đang
// xem, mà tạo xong thì phải trả về được nó.
func (s *TradeService) CreateAndLoad(ctx context.Context, acc domain.Account, in TradeInput) (*JournalView, int64, error) {
	created, err := s.Create(ctx, acc, in)
	if err != nil {
		return nil, 0, err
	}
	v, err := s.Load(ctx, acc, Filter{})
	if err != nil {
		return nil, 0, err
	}
	return v, created.ID, nil
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

// Stats trả KPI của tập ĐÃ LỌC, trừ current_balance.
//
// Nạp thêm cash flow vì current_balance = vốn ban đầu + nạp − rút + lãi lỗ;
// thiếu nó thì con số vẫn ra nhưng thiếu phần nạp/rút, và nó trông đủ hợp lý
// để không ai nghi ngờ.
//
// Truyền CẢ res.Filtered lẫn res.All: số dư tài khoản không chịu bộ lọc
// (ngoại lệ của quy tắc 8), phần còn lại thì có.
func (s *TradeService) Stats(ctx context.Context, acc domain.Account, f Filter) (metrics.KPI, error) {
	v, err := s.Load(ctx, acc, f)
	if err != nil {
		return metrics.KPI{}, err
	}
	flows, err := s.flows.ListByAccount(ctx, acc.ID)
	if err != nil {
		return metrics.KPI{}, fmt.Errorf("liệt kê cash flow: %w", err)
	}
	return v.KPI(flows), nil
}

// Charts trả cả 12 nhóm biểu đồ.
//
// Truyền CẢ HAI tập, đúng thứ tự (all, filtered): streak tính trên toàn bộ
// dãy còn pivot tính trên tập đã lọc. Hai tham số cùng kiểu nên đảo chỗ vẫn
// biên dịch và vẫn ra số — đó là lý do có test riêng ghim ngữ nghĩa này.
func (s *TradeService) Charts(ctx context.Context, acc domain.Account, f Filter) (aggregate.Charts, error) {
	v, err := s.Load(ctx, acc, f)
	if err != nil {
		return aggregate.Charts{}, err
	}
	return v.Charts(), nil
}

// TradePatch là input sửa lệnh. Mỗi trường ba trạng thái — xem Tri.
//
// Không có STT: sửa lệnh KHÔNG đổi thứ tự lũy kế (spec mẹ §5.5).
type TradePatch struct {
	EnteredAt      Tristate[time.Time]
	Symbol         Tristate[string]
	Direction      Tristate[string]
	Entry          Tristate[decimal.Decimal]
	Exit           Tristate[decimal.Decimal]
	Volume         Tristate[decimal.Decimal]
	Profit         Tristate[decimal.Decimal]
	ProfitTheory   Tristate[decimal.Decimal]
	Fee            Tristate[decimal.Decimal]
	Setup          Tristate[string]
	Timeframe      Tristate[string]
	EntryQuality   Tristate[string]
	InTradeQuality Tristate[string]
	ExitQuality    Tristate[string]
	Psychology     Tristate[string]
	Notes          Tristate[string]
}

// Update ghi đúng những cột được gửi lên.
func (s *TradeService) Update(ctx context.Context, id int64, p TradePatch) error {
	fields, err := patchToFields(p)
	if err != nil {
		return err
	}
	if len(fields) == 0 {
		return nil
	}
	if err := s.trades.UpdateFields(ctx, id, fields); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy lệnh")
		}
		return fmt.Errorf("sửa lệnh: %w", err)
	}
	return nil
}

// patchToFields đổi TradePatch thành map cột→giá trị, đồng thời kiểm giá trị.
//
// Bốn cột NULLable nhận thẳng `nil` khi Tri báo "có gửi, giá trị null" — đó
// là cách "xoá giá trị" đi tới được DB.
func patchToFields(p TradePatch) (map[string]any, error) {
	f := map[string]any{}

	if v, ok := p.EnteredAt.Get(); ok {
		if v == nil {
			return nil, apperr.Validation(domain.ErrEnteredAtEmpty.Error())
		}
		f["entered_at"] = v.UTC()
	}
	if v, ok := p.Symbol.Get(); ok {
		if v == nil || strings.TrimSpace(*v) == "" {
			return nil, apperr.Validation(domain.ErrSymbolEmpty.Error())
		}
		f["symbol"] = strings.TrimSpace(*v)
	}
	if v, ok := p.Direction.Get(); ok {
		if v == nil || !domain.Valid(domain.Directions, *v) {
			return nil, apperr.Validation(domain.ErrDirectionInvalid.Error())
		}
		f["direction"] = *v
	}
	if v, ok := p.Profit.Get(); ok {
		if v == nil {
			return nil, apperr.Validation(domain.ErrProfitEmpty.Error())
		}
		f["profit"] = *v
	}
	if v, ok := p.Fee.Get(); ok {
		if v == nil {
			return nil, apperr.Validation(domain.ErrFeeEmpty.Error())
		}
		f["fee"] = *v
	}
	if v, ok := p.Setup.Get(); ok {
		name := domain.DefaultSetup
		if v != nil {
			name = domain.NormalizeSetup(*v)
		}
		f["setup"] = name
	}
	if v, ok := p.Notes.Get(); ok {
		notes := ""
		if v != nil {
			notes = strings.TrimSpace(*v)
		}
		f["notes"] = notes
	}

	// Năm cột enum dùng CHUNG bảng luật với đường tạo lệnh và đường import
	// (domain.TradeEnumFields). Rỗng là hợp lệ (lệnh chưa chấm điểm), null
	// quy về rỗng vì cột là NOT NULL DEFAULT ''.
	for _, e := range []struct {
		field domain.EnumField
		o     Tristate[string]
	}{
		{domain.FieldTimeframe, p.Timeframe},
		{domain.FieldEntry, p.EntryQuality},
		{domain.FieldInTrade, p.InTradeQuality},
		{domain.FieldExit, p.ExitQuality},
		{domain.FieldPsych, p.Psychology},
	} {
		v, ok := e.o.Get()
		if !ok {
			continue
		}
		value := ""
		if v != nil {
			value = *v
		}
		if err := e.field.CheckEnum(value); err != nil {
			return nil, apperr.Validation(err.Error())
		}
		f[e.field.Name] = value
	}

	// Bốn cột NULLable: nil đi thẳng xuống DB thành NULL.
	for _, n := range []struct {
		cot string
		o   Tristate[decimal.Decimal]
	}{
		{"entry", p.Entry},
		{"exit", p.Exit},
		{"volume", p.Volume},
		{"profit_theory", p.ProfitTheory},
	} {
		v, ok := n.o.Get()
		if !ok {
			continue
		}
		if v == nil {
			f[n.cot] = nil
			continue
		}
		f[n.cot] = *v
	}
	return f, nil
}

// ByID nạp một lệnh, kể cả lệnh đã ở thùng rác.
func (s *TradeService) ByID(ctx context.Context, id int64) (domain.Trade, error) {
	t, err := s.trades.ByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return domain.Trade{}, apperr.NotFound("không tìm thấy lệnh")
		}
		return domain.Trade{}, fmt.Errorf("tìm lệnh: %w", err)
	}
	return t, nil
}

// ForUser nạp lệnh và account của nó, sau khi xác nhận account thuộc về user.
//
// Trả CẢ account vì handler nào cũng cần nó: Enrich đòi timezone, DTO đòi
// currency. Nạp lại account ở tầng trên là một truy vấn thừa mỗi request.
//
// Lệnh trong thùng rác vẫn nạp được — nếu không thì Restore không hoạt động.
func (s *TradeService) ForUser(ctx context.Context, userID, tradeID int64) (domain.Trade, domain.Account, error) {
	t, err := s.ByID(ctx, tradeID)
	if err != nil {
		return domain.Trade{}, domain.Account{}, err
	}
	// ForUser của AccountService trả 403 khi account thuộc user khác, 404 khi
	// account không tồn tại. Bám đúng tiền lệ đó thay vì tự chế mã lỗi mới.
	acc, err := s.accounts.ForUser(ctx, userID, t.AccountID)
	if err != nil {
		return domain.Trade{}, domain.Account{}, err
	}
	return t, acc, nil
}

// Restore đưa lệnh ra khỏi thùng rác.
//
// Lệnh quay lại đúng vị trí cũ trong dãy stt, nên lũy kế của MỌI lệnh sau nó
// đều đổi. Đó là hành vi đúng, không phải tác dụng phụ.
func (s *TradeService) Restore(ctx context.Context, id int64) error {
	if err := s.trades.Restore(ctx, id); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy lệnh đã xoá")
		}
		return fmt.Errorf("khôi phục lệnh: %w", err)
	}
	return nil
}

// Trash liệt kê lệnh trong thùng rác. KHÔNG Enrich: lệnh đã xoá không nằm
// trong dãy lũy kế, nên mọi trường suy diễn của nó đều vô nghĩa.
func (s *TradeService) Trash(ctx context.Context, accountID int64) ([]domain.Trade, error) {
	rows, err := s.trades.ListDeletedByAccount(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("liệt kê thùng rác: %w", err)
	}
	if rows == nil {
		rows = []domain.Trade{}
	}
	return rows, nil
}

// Facets là tập giá trị người dùng đã từng nhập, để frontend dựng dropdown
// chọn-thay-vì-gõ cho hai ô lọc tự do.
type Facets struct {
	Symbols []string
	Setups  []string
}

// Facets trả danh sách symbol và setup đang có của account.
//
// Không đi qua Load: Load nạp toàn bộ lệnh rồi Enrich cả dãy để tính lũy kế,
// còn ở đây chỉ cần hai cột. Một câu DISTINCT ở DB rẻ hơn nhiều so với việc
// kéo hàng nghìn hàng lên rồi vứt gần hết đi.
func (s *TradeService) Facets(ctx context.Context, accountID int64) (Facets, error) {
	symbols, setups, err := s.trades.Facets(ctx, accountID)
	if err != nil {
		return Facets{}, fmt.Errorf("liệt kê giá trị lọc: %w", err)
	}
	// nil thành slice rỗng: JSON `null` buộc frontend phải phòng thủ ở mọi
	// chỗ đọc, còn `[]` thì không.
	if symbols == nil {
		symbols = []string{}
	}
	if setups == nil {
		setups = []string{}
	}
	return Facets{Symbols: symbols, Setups: setups}, nil
}
