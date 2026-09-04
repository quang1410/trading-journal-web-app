package httpapi

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/metrics"
)

// Tiền phải ra CHUỖI JSON, không phải số. Số JSON là float64 ở phía nhận,
// và ở đó 12345678901234567890.12 mất bốn chữ số cuối mà không báo gì.
func TestTradeDTOMoneyIsStringNotNumber(t *testing.T) {
	e := metrics.Enriched{
		Trade: domain.Trade{
			EnteredAt: time.Date(2026, 6, 9, 5, 0, 0, 0, time.UTC),
			Profit:    decimal.RequireFromString("12345678901234567890.12"),
			Fee:       decimal.RequireFromString("2.00"),
		},
		Net: decimal.RequireFromString("12345678901234567888.12"),
	}

	b, err := json.Marshal(toTradeDTO(e))
	require.NoError(t, err)

	require.Contains(t, string(b), `"profit":"12345678901234567890.12"`,
		"phải là chuỗi có dấu nháy, và không được mất chữ số")
	require.Contains(t, string(b), `"net":"12345678901234567888.12"`)
}

func TestTradeDTOUnsetFieldsBecomeNull(t *testing.T) {
	b, err := json.Marshal(toTradeDTO(metrics.Enriched{
		Trade: domain.Trade{EnteredAt: time.Now().UTC()},
	}))
	require.NoError(t, err)

	for _, key := range []string{`"entry":null`, `"exit":null`, `"volume":null`,
		`"profit_theory":null`, `"score_total":null`} {
		require.Contains(t, string(b), key)
	}
}

func TestTradeDTOEnteredAtIsRFC3339UTC(t *testing.T) {
	vn := time.FixedZone("ICT", 7*3600)
	b, err := json.Marshal(toTradeDTO(metrics.Enriched{
		Trade: domain.Trade{EnteredAt: time.Date(2026, 6, 10, 6, 0, 0, 0, vn)},
	}))
	require.NoError(t, err)

	require.Contains(t, string(b), `"entered_at":"2026-06-09T23:00:00Z"`,
		"gửi ra UTC kèm offset để frontend tự đổi sang giờ account")
}

func TestTradeDTOsEmptyListBecomesEmptyArrayNotNull(t *testing.T) {
	b, err := json.Marshal(toTradeDTOs(nil))
	require.NoError(t, err)
	require.Equal(t, "[]", string(b))
}

func TestDeletedTradeDTOsEmptyListBecomesEmptyArray(t *testing.T) {
	b, err := json.Marshal(toDeletedTradeDTOs(nil))
	require.NoError(t, err)
	require.Equal(t, "[]", string(b))
}

// KPI chưa tính được phải ra null. Số 0 ở đây bị đọc thành "hệ số lợi nhuận
// bằng không", tức thua sạch — ngược hẳn sự thật là "chưa đủ dữ liệu".
func TestStatsDTOUncomputableMetricsBecomeNull(t *testing.T) {
	b, err := json.Marshal(toStatsDTO(metrics.KPI{}))
	require.NoError(t, err)

	for _, key := range []string{`"profit_factor":null`, `"win_pct":null`,
		`"ave_win":null`, `"expectancy":null`, `"rr_actual":null`} {
		require.Contains(t, string(b), key)
	}
}

// TestTradeDTOEmbedsButStaysFlat ghim rằng việc nhúng metrics.Enriched KHÔNG
// thêm một tầng lồng nào vào JSON.
//
// Struct nhúng không mang json tag thì encoding/json trải phẳng trường của nó
// ra cùng cấp. Gắn nhầm một tag (ví dụ `json:"enriched"`) sẽ biến toàn bộ 23
// trường suy diễn thành một object con, và frontend mất sạch chúng — test này
// là chỗ việc đó bị bắt.
func TestTradeDTOEmbedsButStaysFlat(t *testing.T) {
	e := metrics.Enriched{
		Trade: domain.Trade{
			ID: 7, AccountID: 3, STT: 2,
			EnteredAt: time.Date(2026, 6, 9, 5, 0, 0, 0, time.UTC),
			Symbol:    "XAUUSD", Direction: domain.DirectionLong,
			Profit: decimal.RequireFromString("100"),
			Fee:    decimal.RequireFromString("2"),
		},
		Net:        decimal.RequireFromString("98"),
		Day:        "2026-06-09",
		CumByTrade: decimal.RequireFromString("98"),
		TradeClass: domain.ClassNotEvaluated,
	}

	raw, err := json.Marshal(toTradeDTO(e))
	require.NoError(t, err)

	var got map[string]any
	require.NoError(t, json.Unmarshal(raw, &got))

	// Trường suy diễn nằm ở CẤP GỐC, không nằm trong object con.
	for _, key := range []string{
		"net", "win_loss", "streak_sign",
		"score_entry", "score_exit", "score_in_trade", "score_psych",
		"score_total", "trade_class",
		"day", "week", "week_sort", "month", "weekday",
		"cum_by_trade", "cum_by_day", "cum_theory", "running_peak", "drawdown",
	} {
		require.Contains(t, got, key, "trường suy diễn %q phải nằm ở cấp gốc", key)
	}
	// Và không có tầng lồng nào lọt ra.
	require.NotContains(t, got, "Enriched")
	require.NotContains(t, got, "Trade")

	require.Equal(t, "98", got["net"])
	require.Equal(t, "2026-06-09", got["day"])
	require.EqualValues(t, 7, got["id"])
}
