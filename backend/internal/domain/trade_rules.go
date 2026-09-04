package domain

import (
	"fmt"
	"strings"
)

// Luật kiểm tra và chuẩn hoá một lệnh, ở MỘT chỗ.
//
// Trước Task 3 cùng bảng năm enum này được chép ba lần: validateTradeInput và
// patchToFields bên service, dungLenh bên importer. Ba bản không gây lỗi khi
// lệch nhau — chúng gây ĐIỂM SAI, im lặng, vì chuỗi enum tiếng Việt là khoá
// chấm điểm (quy tắc 5 của CLAUDE.md). Gộp về đây nghĩa là thêm hay bớt một
// giá trị hợp lệ chỉ phải sửa một chỗ, và cả ba đường vào cùng đổi theo.
//
// Package vẫn THUẦN: chỉ strings và fmt, không hạ tầng.

// EnumField gói một trường enum lại với danh sách hợp lệ và thông điệp lỗi
// của nó.
//
// Ghép cặp ở đây chứ không để người gọi tự ghép: ba chỗ gọi trước đây mỗi
// chỗ tự viết lại cặp (danh sách, thông điệp), và đó chính là khe hở để hai
// nơi nói hai câu khác nhau cho cùng một lỗi.
type EnumField struct {
	// Name mang BA vai cùng lúc, và ba vai đó phải trùng nhau từng chữ:
	//
	//  1. tên cột để importer báo lỗi đúng ô;
	//  2. KHOÁ trong csvformat.ColumnAliases — importer tra cellAt(f.Name);
	//  3. TÊN CỘT SQL — service/trade.go đưa thẳng vào UpdateFields → GORM.
	//
	// Nên đây KHÔNG phải chuỗi hiển thị được tự do đổi. Sửa nó cho thông điệp
	// lỗi đẹp hơn sẽ lặng lẽ ghi sang cột DB không tồn tại và đọc nhầm cột
	// CSV. Thông điệp hiển thị nằm ở Message. TestEnumFieldNameIsTheSharedKey
	// canh vai 2; memTradeStore.UpdateFields panic ở default canh vai 3.
	Name    string
	Allowed []string // danh sách giá trị hợp lệ
	Message string   // thông điệp tiếng Việt hiển thị thẳng cho người dùng

	// Ref trả con trỏ tới trường tương ứng của một lệnh.
	//
	// Là một TRƯỜNG chứ không phải một bảng switch riêng: mỗi EnumField mang
	// theo cách truy cập của chính nó, nên thêm một trường enum mới mà quên
	// phần này là LỖI BIÊN DỊCH ngay tại var block dưới đây. Bản trước dùng
	// `switch f.Ten` ở một hàm riêng — hai bảng phải khớp nhau bằng chuỗi, và
	// quên một nhánh thì importer nil-deref (panic 500 giữa lúc nhập file)
	// còn ValidateTrade thì lặng lẽ bỏ qua không kiểm trường đó.
	Ref func(*Trade) *string
}

// Năm trường enum của một lệnh. Thông điệp giữ NGUYÊN VĂN bản cũ: chúng hiển
// thị thẳng cho người dùng và test httpapi đang khẳng định từng chữ.
var (
	FieldTimeframe = EnumField{"timeframe", Timeframes, "khung thời gian không hợp lệ",
		func(t *Trade) *string { return &t.Timeframe }}
	FieldEntry = EnumField{"entry_quality", EntryQualities, "chất lượng vào lệnh không hợp lệ",
		func(t *Trade) *string { return &t.EntryQuality }}
	FieldInTrade = EnumField{"in_trade_quality", InTradeQualities, "diễn biến trong lệnh không hợp lệ",
		func(t *Trade) *string { return &t.InTradeQuality }}
	FieldExit = EnumField{"exit_quality", ExitQualities, "chất lượng thoát lệnh không hợp lệ",
		func(t *Trade) *string { return &t.ExitQuality }}
	FieldPsych = EnumField{"psychology", Psychologies, "trạng thái tâm lý không hợp lệ",
		func(t *Trade) *string { return &t.Psychology }}

	// TradeEnumFields là cả năm, đúng thứ tự dùng chung cho mọi đường vào.
	TradeEnumFields = []EnumField{
		FieldTimeframe, FieldEntry, FieldInTrade, FieldExit, FieldPsych,
	}
)

// CheckEnum kiểm một giá trị ĐÃ đúng chính tả.
//
// Chuỗi rỗng HỢP LỆ: lệnh chưa đánh giá là trạng thái hợp lệ (spec mẹ quyết
// định #8). CHECK của migration 0001 có chuỗi rỗng trong danh sách, còn
// Timeframes thì không — điều kiện `v != ""` chính là chỗ khớp hai bên lại.
//
// Dùng cho đường API, nơi frontend gửi đúng chuỗi trong danh sách.
func (f EnumField) CheckEnum(v string) error {
	if v != "" && !Valid(f.Allowed, v) {
		return fmt.Errorf("%s", f.Message)
	}
	return nil
}

// MatchEnum khớp một ô do NGƯỜI dùng gõ, không phân biệt hoa thường, và trả
// về CHUỖI GỐC trong danh sách.
//
// Trả chuỗi gốc chứ không trả chuỗi người dùng gõ là điều kiện sống còn: các
// chuỗi này là khoá chấm điểm, lệch một dấu là sai điểm của cả lịch sử.
//
// Dùng cho đường import, nơi ô trong file Excel có thể sai hoa thường.
func (f EnumField) MatchEnum(s string) (string, error) {
	v := strings.TrimSpace(s)
	if v == "" {
		return "", nil
	}
	for _, a := range f.Allowed {
		if strings.EqualFold(a, v) {
			return a, nil
		}
	}
	return "", fmt.Errorf("giá trị %q không nằm trong danh sách hợp lệ", v)
}

// NormalizeSetup trim và đưa ô rỗng về mặc định.
//
// Setup do người dùng tự đặt, không có danh sách hợp lệ và không có CHECK.
// Mặc định đặt ở đây chứ không trông vào DEFAULT của cột: GORM luôn gửi mọi
// cột nên DEFAULT của DB không bao giờ được kích hoạt.
func NormalizeSetup(s string) string {
	v := strings.TrimSpace(s)
	if v == "" {
		return DefaultSetup
	}
	return v
}

// NormalizeDirection nhận cả bốn chuỗi mà một lệnh có thể mang, không phân
// biệt hoa thường, và trả về giá trị web lưu.
//
// Ràng buộc bắt buộc — trading-journal-plan.md §1:
//
//	BUY,  Long  → Long
//	SELL, Short → Short
//
// File Excel gốc lưu BUY/SELL (data validation cột G là list literal
// "BUY,SELL"); chỉ HEADER cột G mới là "Long/ Short". Bỏ nhánh BUY/SELL đi
// thì mọi dòng của file cũ fail validate, tức không đọc được file cũ nữa.
func NormalizeDirection(s string) (string, error) {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "BUY", "LONG":
		return DirectionLong, nil
	case "SELL", "SHORT":
		return DirectionShort, nil
	default:
		return "", fmt.Errorf("chiều lệnh %q không hợp lệ (nhận BUY/SELL hoặc Long/Short)", strings.TrimSpace(s))
	}
}

// ErrSymbolEmpty và bạn bè là lỗi của những trường bắt buộc.
//
// Trả error thường chứ không trả *apperr.Error: domain không biết gì về HTTP.
// Tầng service bọc chúng thành apperr.Validation.
var (
	ErrEnteredAtEmpty   = fmt.Errorf("thời điểm vào lệnh không được để trống")
	ErrSymbolEmpty      = fmt.Errorf("mã sản phẩm không được để trống")
	ErrDirectionInvalid = fmt.Errorf(`chiều lệnh phải là "Long" hoặc "Short"`)
	ErrProfitEmpty      = fmt.Errorf("lãi lỗ không được để trống")
	ErrFeeEmpty         = fmt.Errorf("phí không được để trống")
)

// ValidateTrade kiểm và CHUẨN HOÁ tại chỗ toàn bộ trường của một lệnh.
//
// Nguyên tắc: kiểm đúng những gì migration 0001 đã ràng buộc, cộng những gì
// nghiệp vụ đòi. Không tự đặt thêm giới hạn không có trong schema — làm vậy
// là dựng một nguồn sự thật thứ hai, và hai nguồn sẽ trôi lệch nhau.
//
// Cố ý KHÔNG kiểm: dấu của profit (lỗ là số âm, hợp lệ), quan hệ entry/exit,
// và entered_at ở tương lai (ghi trước một lệnh đang mở là hợp lệ).
func ValidateTrade(t *Trade) error {
	if t.EnteredAt.IsZero() {
		return ErrEnteredAtEmpty
	}

	t.Symbol = strings.TrimSpace(t.Symbol)
	if t.Symbol == "" {
		return ErrSymbolEmpty
	}

	if !Valid(Directions, t.Direction) {
		return ErrDirectionInvalid
	}

	for _, f := range TradeEnumFields {
		if err := f.CheckEnum(*f.Ref(t)); err != nil {
			return err
		}
	}

	t.Setup = NormalizeSetup(t.Setup)
	t.Notes = strings.TrimSpace(t.Notes)
	return nil
}
