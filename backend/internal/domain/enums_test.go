package domain_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

// Các chuỗi dưới đây được chép NGUYÊN VĂN từ trading-journal-plan.md §1.
// Chúng là key chấm điểm: sai một dấu là sai điểm của toàn bộ lịch sử.
// Test này cố ý viết lại chuỗi thay vì tham chiếu hằng số — so hằng số với
// chính nó thì không kiểm được gì.
func TestEnumListsMatchPlanSection1(t *testing.T) {
	require.Equal(t, []string{"Long", "Short"}, domain.Directions)
	require.Equal(t, []string{"M1", "M5", "M15", "M30", "H1", "H4", "D1", "W"}, domain.Timeframes)
	require.Equal(t,
		[]string{"Đúng kế hoạch", "Quá sớm", "Quá muộn", "Bốc đồng"},
		domain.EntryQualities)
	require.Equal(t,
		[]string{"Tuân thủ kế hoạch", "Dời Chốt lời", "Dời dừng lỗ ra xa", "Muốn thoát lệnh"},
		domain.InTradeQualities)
	require.Equal(t,
		[]string{"Chạm Chốt lời", "Chạm Dừng lỗ", "Thoát chủ động (lý do kỹ thuật)", "Thoát lệnh cảm tính, sợ hãi"},
		domain.ExitQualities)
	require.Equal(t,
		[]string{"Không lỗi", "SỢ BỎ LỠ (FOMO)", "SỢ HÃI", "HI VỌNG", "THAM LAM", "GIAO DỊCH TRẢ THÙ", "LUÔN MUỐN MÌNH ĐÚNG"},
		domain.Psychologies)
	require.Equal(t,
		[]string{"CHƯA ĐÁNH GIÁ", "Đúng kế hoạch", "Cần cải thiện", "Bốc đồng / FOMO", "Giao dịch trả thù"},
		domain.TradeClasses)
	require.Equal(t, []string{"deposit", "withdraw"}, domain.CashFlowTypes)
	require.Equal(t, "KHÔNG CÓ SETUP", domain.DefaultSetup)
}

func TestValid(t *testing.T) {
	require.True(t, domain.Valid(domain.Directions, "Long"))
	require.False(t, domain.Valid(domain.Directions, "long"), "phân biệt hoa thường")
	require.False(t, domain.Valid(domain.Directions, ""))
	require.False(t, domain.Valid(nil, "Long"))
}
