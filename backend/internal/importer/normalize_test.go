package importer_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/importer"
)

// Ràng buộc bắt buộc của trading-journal-plan.md §1: file Excel gốc lưu
// BUY/SELL, web lưu Long/Short. Thiếu mapping này thì MỌI dòng của file cũ
// fail ở cột direction — đây là lý do Phase 5 tồn tại được.
func TestNormalizeDirection(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"BUY", domain.DirectionLong, false},
		{"buy", domain.DirectionLong, false},
		{"Buy", domain.DirectionLong, false},
		{"Long", domain.DirectionLong, false},
		{"LONG", domain.DirectionLong, false},
		{"long", domain.DirectionLong, false},
		{"  BUY  ", domain.DirectionLong, false},
		{"SELL", domain.DirectionShort, false},
		{"sell", domain.DirectionShort, false},
		{"Short", domain.DirectionShort, false},
		{"SHORT", domain.DirectionShort, false},
		{"  short ", domain.DirectionShort, false},
		{"", "", true},
		{"   ", "", true},
		{"XYZ", "", true},
		{"BUYS", "", true},
	}
	for _, c := range cases {
		got, err := importer.NormalizeDirection(c.in)
		if c.wantErr {
			require.Error(t, err, "input %q phải lỗi", c.in)
			continue
		}
		require.NoError(t, err, "input %q", c.in)
		require.Equal(t, c.want, got, "input %q", c.in)
	}
}

// Đường import khớp enum qua domain.EnumField.MatchEnum — cùng cài đặt với
// đường tạo lệnh và đường sửa lệnh (xem domain/trade_rules.go).
func TestMatchEnumOnImportPath(t *testing.T) {
	t.Run("rỗng là hợp lệ và trả rỗng", func(t *testing.T) {
		// Lệnh chưa đánh giá là trạng thái hợp lệ — spec mẹ quyết định #8.
		got, err := domain.FieldPsych.MatchEnum("")
		require.NoError(t, err)
		require.Equal(t, "", got)

		got, err = domain.FieldPsych.MatchEnum("   ")
		require.NoError(t, err)
		require.Equal(t, "", got)
	})

	t.Run("khớp nguyên văn kể cả dấu tiếng Việt", func(t *testing.T) {
		got, err := domain.FieldPsych.MatchEnum("SỢ BỎ LỠ (FOMO)")
		require.NoError(t, err)
		require.Equal(t, domain.PsychFOMO, got)

		got, err = domain.FieldEntry.MatchEnum(" Đúng kế hoạch ")
		require.NoError(t, err)
		require.Equal(t, domain.EntryPlanned, got)
	})

	t.Run("timeframe không phân biệt hoa thường", func(t *testing.T) {
		got, err := domain.FieldTimeframe.MatchEnum("h4")
		require.NoError(t, err)
		require.Equal(t, "H4", got)
	})

	t.Run("sai chính tả thì lỗi", func(t *testing.T) {
		_, err := domain.FieldEntry.MatchEnum("Đúng kế hoach")
		require.Error(t, err)
		// Thông điệp phải nhắc lại giá trị gặp phải, nếu không người dùng
		// không biết sửa ô nào trong file.
		require.Contains(t, err.Error(), "Đúng kế hoach")
	})
}

func TestParseMoney(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"1234.56", "1234.56", false},
		{"-500", "-500", false},
		{"0", "0", false},
		{"", "0", false},
		{"   ", "0", false},
		{"1,234.56", "1234.56", false}, // dấu phẩy ngăn nghìn của Excel
		{"-1,234,567.89", "-1234567.89", false},
		{"$1,200", "1200", false},                               // ký hiệu tiền tệ Excel hay chèn
		{"(500)", "-500", false},                                // kế toán: ngoặc là số âm
		{"12345678901234567.89", "12345678901234567.89", false}, // không mất chữ số
		{"abc", "", true},
		{"1.2.3", "", true},
	}
	for _, c := range cases {
		got, err := importer.ParseMoney(c.in)
		if c.wantErr {
			require.Error(t, err, "input %q phải lỗi", c.in)
			continue
		}
		require.NoError(t, err, "input %q", c.in)
		require.Equal(t, c.want, got.String(), "input %q", c.in)
	}
}

// Rỗng và "0" là HAI thứ khác nhau: profit_theory để trống (fixture STT 4)
// nghĩa là chưa nhập, còn 0 nghĩa là lý thuyết hoà. Gộp chúng lại là bịa dữ liệu.
func TestParseMoneyPtr(t *testing.T) {
	got, err := importer.ParseMoneyPtr("")
	require.NoError(t, err)
	require.Nil(t, got, "ô rỗng phải ra nil, không phải con trỏ tới 0")

	got, err = importer.ParseMoneyPtr("   ")
	require.NoError(t, err)
	require.Nil(t, got)

	got, err = importer.ParseMoneyPtr("0")
	require.NoError(t, err)
	require.NotNil(t, got)
	require.True(t, got.Equal(decimal.Zero))

	got, err = importer.ParseMoneyPtr("150.5")
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, "150.5", got.String())

	_, err = importer.ParseMoneyPtr("rác")
	require.Error(t, err)
}

func TestParseDay(t *testing.T) {
	vn, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)

	// 12:00 giờ account, không phải 00:00: đặt ở giữa ngày thì không phép
	// quy đổi timezone nào đẩy lệnh sang ngày khác.
	want := time.Date(2026, 6, 9, 5, 0, 0, 0, time.UTC) // 12:00 +07 = 05:00Z

	for _, in := range []string{
		"2026-06-09",
		"09/06/2026",
		"9/6/2026",
		"2026/06/09",
		"09-06-2026",
		" 2026-06-09 ",
	} {
		got, err := importer.ParseDay(in, vn)
		require.NoError(t, err, "input %q", in)
		require.True(t, got.Equal(want), "input %q: được %v, muốn %v", in, got.UTC(), want)
	}

	t.Run("timezone khác cho instant khác", func(t *testing.T) {
		got, err := importer.ParseDay("2026-06-09", time.UTC)
		require.NoError(t, err)
		require.True(t, got.Equal(time.Date(2026, 6, 9, 12, 0, 0, 0, time.UTC)))
	})

	t.Run("chuỗi hỏng thì lỗi", func(t *testing.T) {
		for _, in := range []string{"", "   ", "hôm qua", "32/13/2026", "2026-13-01"} {
			_, err := importer.ParseDay(in, vn)
			require.Error(t, err, "input %q phải lỗi", in)
		}
	})
}

func TestParseDateTime(t *testing.T) {
	vn, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)

	t.Run("o rong tra nil khong loi — lenh chua dong la hop le", func(t *testing.T) {
		got, err := importer.ParseDateTime("   ", vn)
		require.NoError(t, err)
		require.Nil(t, got)
	})

	t.Run("RFC3339 giu nguyen thoi diem tuyet doi", func(t *testing.T) {
		got, err := importer.ParseDateTime("2026-09-10T14:13:06Z", vn)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.True(t, got.Equal(time.Date(2026, 9, 10, 14, 13, 6, 0, time.UTC)))
	})

	t.Run("chuoi khong mang offset doc theo timezone account", func(t *testing.T) {
		got, err := importer.ParseDateTime("2026-09-10 21:13:06", vn)
		require.NoError(t, err)
		require.NotNil(t, got)
		// 21:13 giờ VN = 14:13 UTC. Đọc theo UTC sẽ lệch 7 tiếng và thời gian
		// giữ lệnh sẽ sai đúng bằng chừng đó.
		require.True(t, got.Equal(time.Date(2026, 9, 10, 14, 13, 6, 0, time.UTC)))
	})

	t.Run("GIU phan gio — day la khac biet then chot so voi ParseDay", func(t *testing.T) {
		got, err := importer.ParseDateTime("10/09/2026 21:47:52", vn)
		require.NoError(t, err)
		require.NotNil(t, got)
		inVN := got.In(vn)
		require.Equal(t, 21, inVN.Hour())
		require.Equal(t, 47, inVN.Minute())
		require.Equal(t, 52, inVN.Second())
	})

	t.Run("chuoi rac bao loi", func(t *testing.T) {
		_, err := importer.ParseDateTime("hôm qua", vn)
		require.Error(t, err)
	})
}

// dstCases CHÉP NGUYÊN VĂN từ frontend/src/lib/datetime.test.ts (DST_CASES).
// Form (FE wallToInstant) và import CSV phải ra cùng một instant cho cùng giờ
// treo tường. Quy tắc "compatible": giờ lặp lại lấy lần ĐẦU, giờ không tồn tại
// dịch TỚI. time.Date không cam kết cách chọn ở hai ca này, nên phải ghim.
var dstCases = []struct{ wall, zone, want string }{
	{"2026-11-01T01:30", "America/New_York", "2026-11-01T05:30:00.000Z"},
	{"2026-03-08T02:30", "America/New_York", "2026-03-08T07:30:00.000Z"},
	{"2026-11-01T00:59", "America/New_York", "2026-11-01T04:59:00.000Z"},
	{"2026-11-01T02:00", "America/New_York", "2026-11-01T07:00:00.000Z"},
	{"2026-03-08T03:00", "America/New_York", "2026-03-08T07:00:00.000Z"},
	{"2026-10-25T01:30", "Europe/London", "2026-10-25T00:30:00.000Z"},
	{"2026-03-29T01:30", "Europe/London", "2026-03-29T01:30:00.000Z"},
	{"2026-04-05T02:30", "Australia/Adelaide", "2026-04-04T16:00:00.000Z"},
	{"2026-10-04T02:30", "Australia/Adelaide", "2026-10-03T17:00:00.000Z"},
	{"2026-04-05T01:45", "Australia/Lord_Howe", "2026-04-04T14:45:00.000Z"},
	{"2026-10-04T02:15", "Australia/Lord_Howe", "2026-10-03T15:45:00.000Z"},
	{"2026-06-09T21:30", "Asia/Ho_Chi_Minh", "2026-06-09T14:30:00.000Z"},
}

func TestParseDateTimeAcrossDSTTransitions(t *testing.T) {
	const out = "2006-01-02T15:04:05.000Z"
	for _, c := range dstCases {
		t.Run(c.wall+" "+c.zone, func(t *testing.T) {
			loc, err := time.LoadLocation(c.zone)
			require.NoError(t, err)
			wall, err := time.Parse("2006-01-02T15:04", c.wall)
			require.NoError(t, err)

			// Cùng một giờ treo tường, ba đường vào của CSV: ISO có dấu cách,
			// dd/mm kiểu Việt Nam, và ô Day có giờ (entered_at) qua
			// ParseDayOrDateTime. Cả ba phải ra cùng một instant với form.
			iso, err := importer.ParseDateTime(wall.Format("2006-01-02 15:04"), loc)
			require.NoError(t, err)
			require.NotNil(t, iso)
			require.Equal(t, c.want, iso.UTC().Format(out), "ISO layout")

			dmy, err := importer.ParseDateTime(wall.Format("02/01/2006 15:04"), loc)
			require.NoError(t, err)
			require.NotNil(t, dmy)
			require.Equal(t, c.want, dmy.UTC().Format(out), "dd/mm layout")

			entered, err := importer.ParseDayOrDateTime(wall.Format("2006-01-02 15:04:05"), loc)
			require.NoError(t, err)
			require.Equal(t, c.want, entered.UTC().Format(out), "ParseDayOrDateTime")
		})
	}

	// Cùng ba ca có giây với datetime.test.ts: 03:00:00 ngày lùi giờ là EST.
	ny, err := time.LoadLocation("America/New_York")
	require.NoError(t, err)
	for in, want := range map[string]string{
		"2026-11-01 03:00:00": "2026-11-01T08:00:00.000Z",
		"2026-11-01 01:30:45": "2026-11-01T05:30:45.000Z",
		"2026-03-08 02:30:00": "2026-03-08T07:30:00.000Z",
	} {
		got, err := importer.ParseDateTime(in, ny)
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Equal(t, want, got.UTC().Format(out), in)
	}
}
