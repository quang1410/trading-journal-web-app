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
func TestTradeDTOTienLaChuoiKhongPhaiSo(t *testing.T) {
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

func TestTradeDTOTruongChuaNhapRaNull(t *testing.T) {
	b, err := json.Marshal(toTradeDTO(metrics.Enriched{
		Trade: domain.Trade{EnteredAt: time.Now().UTC()},
	}))
	require.NoError(t, err)

	for _, khoa := range []string{`"entry":null`, `"exit":null`, `"volume":null`,
		`"profit_theory":null`, `"score_total":null`} {
		require.Contains(t, string(b), khoa)
	}
}

func TestTradeDTOEnteredAtLaRFC3339UTC(t *testing.T) {
	vn := time.FixedZone("ICT", 7*3600)
	b, err := json.Marshal(toTradeDTO(metrics.Enriched{
		Trade: domain.Trade{EnteredAt: time.Date(2026, 6, 10, 6, 0, 0, 0, vn)},
	}))
	require.NoError(t, err)

	require.Contains(t, string(b), `"entered_at":"2026-06-09T23:00:00Z"`,
		"gửi ra UTC kèm offset để frontend tự đổi sang giờ account")
}

func TestTradeDTOsDanhSachRongRaMangRongChuKhongNull(t *testing.T) {
	b, err := json.Marshal(toTradeDTOs(nil))
	require.NoError(t, err)
	require.Equal(t, "[]", string(b))
}

func TestDeletedTradeDTOsDanhSachRongRaMangRong(t *testing.T) {
	b, err := json.Marshal(toDeletedTradeDTOs(nil))
	require.NoError(t, err)
	require.Equal(t, "[]", string(b))
}

// KPI chưa tính được phải ra null. Số 0 ở đây bị đọc thành "hệ số lợi nhuận
// bằng không", tức thua sạch — ngược hẳn sự thật là "chưa đủ dữ liệu".
func TestStatsDTOChiSoChuaTinhDuocRaNull(t *testing.T) {
	b, err := json.Marshal(toStatsDTO(metrics.KPI{}))
	require.NoError(t, err)

	for _, khoa := range []string{`"profit_factor":null`, `"win_pct":null`,
		`"ave_win":null`, `"expectancy":null`, `"rr_actual":null`} {
		require.Contains(t, string(b), khoa)
	}
}
