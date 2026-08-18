package apperr_test

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
)

func TestConstructorsCarryStatusVaCode(t *testing.T) {
	cases := []struct {
		name       string
		err        *apperr.Error
		wantStatus int
		wantCode   int
	}{
		{"validate", apperr.Validation("sai"), 400, 1400},
		{"chưa auth", apperr.Unauthorized("chưa đăng nhập"), 401, 1401},
		{"cấm", apperr.Forbidden("không phải của bạn"), 403, 1403},
		{"không thấy", apperr.NotFound("không có"), 404, 1404},
		{"trùng", apperr.Conflict("đã tồn tại"), 409, 1409},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			require.Equal(t, c.wantStatus, c.err.Status)
			require.Equal(t, c.wantCode, c.err.Code)
			require.NotEmpty(t, c.err.Msg)
		})
	}
}

// As phải xuyên qua được lớp bọc %w — service hay bọc lỗi khi đi qua nhiều tầng.
func TestAsXuyenQuaLopBoc(t *testing.T) {
	wrapped := fmt.Errorf("tầng ngoài: %w", apperr.NotFound("không có account"))

	got := apperr.As(wrapped)

	require.NotNil(t, got)
	require.Equal(t, 404, got.Status)
	require.Equal(t, "không có account", got.Msg)
}

func TestAsTraNilVoiLoiThuong(t *testing.T) {
	require.Nil(t, apperr.As(fmt.Errorf("lỗi thường")))
	require.Nil(t, apperr.As(nil))
}
