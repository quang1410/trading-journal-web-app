package domain_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

// Đếm theo KÝ TỰ, không theo byte: "ắ" là 3 byte. Đếm byte thì ghi chú tiếng
// Việt chỉ được một phần ba hạn mức.
func TestCheckNotesLenCountsRunesNotBytes(t *testing.T) {
	require.NoError(t, domain.CheckNotesLen(strings.Repeat("ắ", domain.MaxNotesLen)))

	err := domain.CheckNotesLen(strings.Repeat("ắ", domain.MaxNotesLen+1))
	require.ErrorIs(t, err, domain.ErrNotesTooLong)
	require.Equal(t, "ghi chú dài quá 131072 ký tự", err.Error())
}

// Khoảng trắng đầu/cuối bị trim trước khi lưu, nên cũng không tính vào trần.
func TestCheckNotesLenIgnoresSurroundingWhitespace(t *testing.T) {
	padded := "  \n" + strings.Repeat("a", domain.MaxNotesLen) + "\n  "
	require.NoError(t, domain.CheckNotesLen(padded))
}

func TestValidateTradeRejectsNotesOverLimit(t *testing.T) {
	tr := validTrade()
	tr.Notes = strings.Repeat("ắ", domain.MaxNotesLen+1)
	require.ErrorIs(t, domain.ValidateTrade(&tr), domain.ErrNotesTooLong)

	tr = validTrade()
	tr.Notes = " " + strings.Repeat("ắ", domain.MaxNotesLen) + " "
	require.NoError(t, domain.ValidateTrade(&tr))
}

// Mẫu ghi chú được NỐI vào ghi chú, nên trần ghi chú phải chứa vừa ít nhất
// một mẫu dài tối đa cộng nội dung đã có.
func TestNotesLimitLeavesRoomForAFullTemplate(t *testing.T) {
	require.GreaterOrEqual(t, domain.MaxNotesLen, 2*domain.MaxTemplateBodyLen)
}
