package service_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/service"
)

type hopThu struct {
	A service.Tri[string] `json:"a"`
	B service.Tri[int]    `json:"b"`
}

func TestTriKhoaVangMatThiKhongSet(t *testing.T) {
	var h hopThu
	require.NoError(t, json.Unmarshal([]byte(`{"b":7}`), &h))

	require.False(t, h.A.Set, "khoá không có trong body thì Set phải là false")
	require.True(t, h.B.Set)
}

// Đây là lý do Tri tồn tại. Nếu "vắng mặt" và "null" cùng cho Value == nil
// mà không có cờ Set thì không cách nào phân biệt "đừng đụng vào trường này"
// với "xoá trường này đi".
func TestTriKhoaCoMatMangNullThiSetNhungValueNil(t *testing.T) {
	var h hopThu
	require.NoError(t, json.Unmarshal([]byte(`{"a":null}`), &h))

	require.True(t, h.A.Set, "khoá có mặt thì Set phải là true, kể cả khi giá trị là null")
	require.Nil(t, h.A.Value)
}

func TestTriKhoaCoMatMangGiaTri(t *testing.T) {
	var h hopThu
	require.NoError(t, json.Unmarshal([]byte(`{"a":"xin chao"}`), &h))

	require.True(t, h.A.Set)
	require.NotNil(t, h.A.Value)
	require.Equal(t, "xin chao", *h.A.Value)
}

func TestTriChuoiRongKhacVoiVangMat(t *testing.T) {
	var h hopThu
	require.NoError(t, json.Unmarshal([]byte(`{"a":""}`), &h))

	require.True(t, h.A.Set, "chuỗi rỗng là một giá trị, không phải sự vắng mặt")
	require.NotNil(t, h.A.Value)
	require.Equal(t, "", *h.A.Value)
}

func TestTriKieuSaiThiBaoLoi(t *testing.T) {
	var h hopThu
	require.Error(t, json.Unmarshal([]byte(`{"b":"khong-phai-so"}`), &h))
}

func TestTriGet(t *testing.T) {
	var h hopThu
	require.NoError(t, json.Unmarshal([]byte(`{"a":null,"b":3}`), &h))

	v, ok := h.A.Get()
	require.True(t, ok)
	require.Nil(t, v)

	n, ok := h.B.Get()
	require.True(t, ok)
	require.Equal(t, 3, *n)

	var chua service.Tri[string]
	_, ok = chua.Get()
	require.False(t, ok)
}
