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

	// Mới nhất trước, đảo vào BẢN SAO chứ không đảo tại chỗ.
	//
	// Nói cho đúng: hôm nay việc này KHÔNG gánh gì cả — mỗi lời gọi Read đều
	// nạp lại từ DB nên không ai chia sẻ chung một ReadResult, và đảo tại chỗ
	// cũng không test nào bắt được (đã thử). Giữ bản sao vì nó làm tính đúng
	// đắn của paginate độc lập với việc Read có cache hay không; ngày nào
	// ReadResult được dùng lại cho cả List lẫn Charts thì đảo tại chỗ sẽ lật
	// ngược dãy cho lời gọi sau mà không có lỗi nào bật ra.
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
// validateTradeInput kiểm và CHUẨN HOÁ tại chỗ.
//
// Nguyên tắc: kiểm đúng những gì migration 0001 đã ràng buộc, cộng những gì
// nghiệp vụ đòi. Không tự đặt thêm giới hạn không có trong schema — làm vậy
// là dựng một nguồn sự thật thứ hai, và hai nguồn sẽ trôi lệch nhau.
//
// Cố ý KHÔNG kiểm: dấu của profit (lỗ là số âm, hợp lệ), quan hệ entry/exit,
// và entered_at ở tương lai (ghi trước một lệnh đang mở là hợp lệ).
func validateTradeInput(in *TradeInput) error {
	if in.EnteredAt.IsZero() {
		return apperr.Validation("thời điểm vào lệnh không được để trống")
	}

	in.Symbol = strings.TrimSpace(in.Symbol)
	if in.Symbol == "" {
		return apperr.Validation("mã sản phẩm không được để trống")
	}

	if !domain.Valid(domain.Directions, in.Direction) {
		return apperr.Validation(`chiều lệnh phải là "Long" hoặc "Short"`)
	}

	// Năm trường dưới đây CHO PHÉP rỗng: lệnh chưa đánh giá là trạng thái
	// hợp lệ (spec mẹ quyết định #8). CHECK của migration 0001 có chuỗi rỗng
	// trong danh sách, còn domain.Timeframes thì không — điều kiện
	// `o.giaTri != ""` chính là chỗ khớp hai bên lại.
	for _, o := range []struct {
		giaTri    string
		hopLe     []string
		thongDiep string
	}{
		{in.Timeframe, domain.Timeframes, "khung thời gian không hợp lệ"},
		{in.EntryQuality, domain.EntryQualities, "chất lượng vào lệnh không hợp lệ"},
		{in.InTradeQuality, domain.InTradeQualities, "diễn biến trong lệnh không hợp lệ"},
		{in.ExitQuality, domain.ExitQualities, "chất lượng thoát lệnh không hợp lệ"},
		{in.Psychology, domain.Psychologies, "trạng thái tâm lý không hợp lệ"},
	} {
		if o.giaTri != "" && !domain.Valid(o.hopLe, o.giaTri) {
			return apperr.Validation(o.thongDiep)
		}
	}

	// Setup do người dùng tự đặt, không có CHECK. Rỗng thì về mặc định —
	// làm ở đây chứ không trông vào DEFAULT của cột, vì GORM luôn gửi mọi
	// cột nên DEFAULT không bao giờ được kích hoạt.
	in.Setup = strings.TrimSpace(in.Setup)
	if in.Setup == "" {
		in.Setup = domain.DefaultSetup
	}
	in.Notes = strings.TrimSpace(in.Notes)
	return nil
}

func (s *TradeService) Create(ctx context.Context, acc domain.Account, in TradeInput) (domain.Trade, error) {
	if err := validateTradeInput(&in); err != nil {
		return domain.Trade{}, err
	}
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

// Stats trả KPI của tập ĐÃ LỌC.
//
// Nạp thêm cash flow vì current_balance = vốn ban đầu + nạp − rút + lãi lỗ;
// thiếu nó thì con số vẫn ra nhưng thiếu phần nạp/rút, và nó trông đủ hợp lý
// để không ai nghi ngờ.
func (s *TradeService) Stats(ctx context.Context, acc domain.Account, f Filter) (metrics.KPI, error) {
	res, err := s.Read(ctx, acc, f)
	if err != nil {
		return metrics.KPI{}, err
	}
	flows, err := s.flows.ListByAccount(ctx, acc.ID)
	if err != nil {
		return metrics.KPI{}, fmt.Errorf("liệt kê cash flow: %w", err)
	}
	return metrics.ComputeKPI(res.Filtered, acc, flows), nil
}

// Charts trả cả 12 nhóm biểu đồ.
//
// Truyền CẢ HAI tập, đúng thứ tự (all, filtered): streak tính trên toàn bộ
// dãy còn pivot tính trên tập đã lọc. Hai tham số cùng kiểu nên đảo chỗ vẫn
// biên dịch và vẫn ra số — đó là lý do có test riêng ghim ngữ nghĩa này.
func (s *TradeService) Charts(ctx context.Context, acc domain.Account, f Filter) (aggregate.Charts, error) {
	res, err := s.Read(ctx, acc, f)
	if err != nil {
		return aggregate.Charts{}, err
	}
	return aggregate.All(res.All, res.Filtered, acc), nil
}

// TradePatch là input sửa lệnh. Mỗi trường ba trạng thái — xem Tri.
//
// Không có STT: sửa lệnh KHÔNG đổi thứ tự lũy kế (spec mẹ §5.5).
type TradePatch struct {
	EnteredAt      Tri[time.Time]
	Symbol         Tri[string]
	Direction      Tri[string]
	Entry          Tri[decimal.Decimal]
	Exit           Tri[decimal.Decimal]
	Volume         Tri[decimal.Decimal]
	Profit         Tri[decimal.Decimal]
	ProfitTheory   Tri[decimal.Decimal]
	Fee            Tri[decimal.Decimal]
	Setup          Tri[string]
	Timeframe      Tri[string]
	EntryQuality   Tri[string]
	InTradeQuality Tri[string]
	ExitQuality    Tri[string]
	Psychology     Tri[string]
	Notes          Tri[string]
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
			return nil, apperr.Validation("thời điểm vào lệnh không được để trống")
		}
		f["entered_at"] = v.UTC()
	}
	if v, ok := p.Symbol.Get(); ok {
		if v == nil || strings.TrimSpace(*v) == "" {
			return nil, apperr.Validation("mã sản phẩm không được để trống")
		}
		f["symbol"] = strings.TrimSpace(*v)
	}
	if v, ok := p.Direction.Get(); ok {
		if v == nil || !domain.Valid(domain.Directions, *v) {
			return nil, apperr.Validation(`chiều lệnh phải là "Long" hoặc "Short"`)
		}
		f["direction"] = *v
	}
	if v, ok := p.Profit.Get(); ok {
		if v == nil {
			return nil, apperr.Validation("lãi lỗ không được để trống")
		}
		f["profit"] = *v
	}
	if v, ok := p.Fee.Get(); ok {
		if v == nil {
			return nil, apperr.Validation("phí không được để trống")
		}
		f["fee"] = *v
	}
	if v, ok := p.Setup.Get(); ok {
		ten := domain.DefaultSetup
		if v != nil && strings.TrimSpace(*v) != "" {
			ten = strings.TrimSpace(*v)
		}
		f["setup"] = ten
	}
	if v, ok := p.Notes.Get(); ok {
		ghi := ""
		if v != nil {
			ghi = strings.TrimSpace(*v)
		}
		f["notes"] = ghi
	}

	// Năm cột enum: rỗng là hợp lệ (lệnh chưa chấm điểm), null quy về rỗng
	// vì cột là NOT NULL DEFAULT ''.
	for _, e := range []struct {
		cot   string
		o     Tri[string]
		hopLe []string
		msg   string
	}{
		{"timeframe", p.Timeframe, domain.Timeframes, "khung thời gian không hợp lệ"},
		{"entry_quality", p.EntryQuality, domain.EntryQualities, "chất lượng vào lệnh không hợp lệ"},
		{"in_trade_quality", p.InTradeQuality, domain.InTradeQualities, "diễn biến trong lệnh không hợp lệ"},
		{"exit_quality", p.ExitQuality, domain.ExitQualities, "chất lượng thoát lệnh không hợp lệ"},
		{"psychology", p.Psychology, domain.Psychologies, "trạng thái tâm lý không hợp lệ"},
	} {
		v, ok := e.o.Get()
		if !ok {
			continue
		}
		giaTri := ""
		if v != nil {
			giaTri = *v
		}
		if giaTri != "" && !domain.Valid(e.hopLe, giaTri) {
			return nil, apperr.Validation(e.msg)
		}
		f[e.cot] = giaTri
	}

	// Bốn cột NULLable: nil đi thẳng xuống DB thành NULL.
	for _, n := range []struct {
		cot string
		o   Tri[decimal.Decimal]
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
