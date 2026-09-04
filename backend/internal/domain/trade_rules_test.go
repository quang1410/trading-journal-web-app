package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/csvformat"
	"journal/internal/domain"
)

func validTrade() domain.Trade {
	return domain.Trade{
		EnteredAt: time.Date(2026, 6, 9, 5, 0, 0, 0, time.UTC),
		Symbol:    "XAUUSD",
		Direction: domain.DirectionLong,
	}
}

func TestValidateTradeAcceptsMinimalTrade(t *testing.T) {
	tr := validTrade()
	require.NoError(t, domain.ValidateTrade(&tr))
	require.Equal(t, domain.DefaultSetup, tr.Setup, "setup rỗng phải về mặc định")
}

func TestValidateTradeRequiredFields(t *testing.T) {
	for _, tc := range []struct {
		name string
		sua  func(*domain.Trade)
		mong error
	}{
		{"thiếu thời điểm", func(t *domain.Trade) { t.EnteredAt = time.Time{} }, domain.ErrEnteredAtEmpty},
		{"symbol rỗng", func(t *domain.Trade) { t.Symbol = "" }, domain.ErrSymbolEmpty},
		{"symbol chỉ có khoảng trắng", func(t *domain.Trade) { t.Symbol = "   " }, domain.ErrSymbolEmpty},
		{"direction rỗng", func(t *domain.Trade) { t.Direction = "" }, domain.ErrDirectionInvalid},
		{"direction lạ", func(t *domain.Trade) { t.Direction = "BUY" }, domain.ErrDirectionInvalid},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tr := validTrade()
			tc.sua(&tr)
			require.ErrorIs(t, domain.ValidateTrade(&tr), tc.mong)
		})
	}
}

// Lệnh CHƯA đánh giá là trạng thái hợp lệ (spec mẹ quyết định #8): cả năm cột
// chấm điểm để trống vẫn phải qua.
func TestValidateTradeAllowsFiveEmptyScoringColumns(t *testing.T) {
	tr := validTrade()
	require.NoError(t, domain.ValidateTrade(&tr))
	require.Empty(t, tr.EntryQuality)
	require.Empty(t, tr.Psychology)
}

func TestValidateTradeRejectsInvalidEnum(t *testing.T) {
	for _, tc := range []struct {
		name string
		sua  func(*domain.Trade)
		msg  string
	}{
		{"timeframe", func(t *domain.Trade) { t.Timeframe = "H3" }, "khung thời gian không hợp lệ"},
		{"entry_quality", func(t *domain.Trade) { t.EntryQuality = "Linh tinh" }, "chất lượng vào lệnh không hợp lệ"},
		{"in_trade_quality", func(t *domain.Trade) { t.InTradeQuality = "Linh tinh" }, "diễn biến trong lệnh không hợp lệ"},
		{"exit_quality", func(t *domain.Trade) { t.ExitQuality = "Linh tinh" }, "chất lượng thoát lệnh không hợp lệ"},
		{"psychology", func(t *domain.Trade) { t.Psychology = "Linh tinh" }, "trạng thái tâm lý không hợp lệ"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tr := validTrade()
			tc.sua(&tr)
			err := domain.ValidateTrade(&tr)
			require.Error(t, err)
			// Thông điệp hiển thị THẲNG cho người dùng và test httpapi đang
			// khẳng định từng chữ, nên nó là một phần hợp đồng.
			require.Equal(t, tc.msg, err.Error())
		})
	}
}

func TestValidateTradeNormalizesInPlace(t *testing.T) {
	tr := validTrade()
	tr.Symbol = "  XAUUSD  "
	tr.Setup = "  Breakout  "
	tr.Notes = "  ghi chú  "

	require.NoError(t, domain.ValidateTrade(&tr))

	require.Equal(t, "XAUUSD", tr.Symbol)
	require.Equal(t, "Breakout", tr.Setup)
	require.Equal(t, "ghi chú", tr.Notes)
}

func TestNormalizeSetup(t *testing.T) {
	require.Equal(t, domain.DefaultSetup, domain.NormalizeSetup(""))
	require.Equal(t, domain.DefaultSetup, domain.NormalizeSetup("   "))
	require.Equal(t, "Breakout", domain.NormalizeSetup("  Breakout "))
}

// Ràng buộc bắt buộc của trading-journal-plan.md §1. Bỏ nhánh BUY/SELL là
// không đọc được file Excel cũ nữa.
func TestNormalizeDirectionAcceptsAllFourStrings(t *testing.T) {
	for entry, want := range map[string]string{
		"BUY": domain.DirectionLong, "buy": domain.DirectionLong,
		"Long": domain.DirectionLong, "LONG": domain.DirectionLong,
		"SELL": domain.DirectionShort, "sell": domain.DirectionShort,
		"Short": domain.DirectionShort, "SHORT": domain.DirectionShort,
		"  BUY  ": domain.DirectionLong,
	} {
		got, err := domain.NormalizeDirection(entry)
		require.NoError(t, err, "vào %q", entry)
		require.Equal(t, want, got, "vào %q", entry)
	}

	_, err := domain.NormalizeDirection("MUA")
	require.Error(t, err)
}

// MatchEnum trả CHUỖI GỐC chứ không trả chuỗi người dùng gõ: các chuỗi này là
// khoá chấm điểm, lệch một dấu là sai điểm của cả lịch sử.
func TestMatchEnumReturnsCanonicalDomainString(t *testing.T) {
	got, err := domain.FieldEntry.MatchEnum("đúng kế hoạch") // sai hoa thường
	require.NoError(t, err)
	require.Equal(t, domain.EntryPlanned, got, "phải trả chuỗi gốc, không phải chuỗi người dùng gõ")

	empty, err := domain.FieldEntry.MatchEnum("   ")
	require.NoError(t, err, "ô rỗng là hợp lệ")
	require.Empty(t, empty)

	_, err = domain.FieldEntry.MatchEnum("Không có trong danh sách")
	require.Error(t, err)
}

func TestCheckEnumAcceptsEmptyRejectsInvalid(t *testing.T) {
	require.NoError(t, domain.FieldPsych.CheckEnum(""), "rỗng là hợp lệ")
	require.NoError(t, domain.FieldPsych.CheckEnum(domain.PsychFOMO))
	require.Error(t, domain.FieldPsych.CheckEnum("fomo"),
		"CheckEnum khớp CHÍNH XÁC — sai hoa thường là sai (đường API gửi đúng chuỗi)")
}

// Mỗi EnumField phải mang accessor trỏ ĐÚNG trường của nó.
//
// Accessor là một trường của chính EnumField nên quên nó là lỗi biên dịch;
// test này bắt trường hợp còn lại — khai có nhưng trỏ NHẦM sang trường khác,
// tức kiểm một cột rồi ghi sang cột kia.
func TestEveryEnumFieldPointsAtItsOwnField(t *testing.T) {
	require.Len(t, domain.TradeEnumFields, 5)

	var tr domain.Trade
	readers := map[string]func() string{
		"timeframe":        func() string { return tr.Timeframe },
		"entry_quality":    func() string { return tr.EntryQuality },
		"in_trade_quality": func() string { return tr.InTradeQuality },
		"exit_quality":     func() string { return tr.ExitQuality },
		"psychology":       func() string { return tr.Psychology },
	}
	for _, f := range domain.TradeEnumFields {
		require.NotNil(t, f.Ref, "%q thiếu accessor", f.Name)
		fetch, ok := readers[f.Name]
		require.True(t, ok, "trường enum lạ: %q", f.Name)

		*f.Ref(&tr) = "dau-vet"
		require.Equal(t, "dau-vet", fetch(), "%q trỏ nhầm sang trường khác", f.Name)
		*f.Ref(&tr) = ""
	}
}

// Name của mỗi EnumField phải là KHOÁ có thật trong bảng alias CSV.
//
// Ba vai của Name (thông điệp lỗi, khoá alias CSV, tên cột SQL) trùng nhau
// hôm nay chỉ vì có người đặt trùng, không vì thứ gì bắt buộc. Test này ghim
// vai thứ hai lại: đổi Name mà quên bảng alias thì importer tra cellAt() ra
// chuỗi rỗng và cột đó lặng lẽ không bao giờ được đọc — file nhập vào thiếu
// hẳn một trường mà không có một dòng lỗi nào.
//
// Vai thứ ba (tên cột SQL) do memTradeStore.UpdateFields canh bằng panic ở
// nhánh default.
func TestEnumFieldNameIsTheSharedKey(t *testing.T) {
	for _, f := range domain.TradeEnumFields {
		require.NotEmpty(t, csvformat.ColumnAliases[f.Name],
			"EnumField.Name %q không phải khoá trong csvformat.ColumnAliases — importer sẽ không đọc được cột này", f.Name)
	}
}
