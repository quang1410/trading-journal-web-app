package service_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/service"
)

type inbox struct {
	A service.Tristate[string] `json:"a"`
	B service.Tristate[int]    `json:"b"`
}

func TestTristateAbsentKeyIsNotSet(t *testing.T) {
	var h inbox
	require.NoError(t, json.Unmarshal([]byte(`{"b":7}`), &h))

	require.False(t, h.A.Set, "khoá không có trong body thì Set phải là false")
	require.True(t, h.B.Set)
}

// Đây là lý do Tri tồn tại. Nếu "vắng mặt" và "null" cùng cho Value == nil
// mà không có cờ Set thì không cách nào phân biệt "đừng đụng vào trường này"
// với "xoá trường này đi".
func TestTristateKeyPresentWithNullSetsButValueNil(t *testing.T) {
	var h inbox
	require.NoError(t, json.Unmarshal([]byte(`{"a":null}`), &h))

	require.True(t, h.A.Set, "khoá có mặt thì Set phải là true, kể cả khi giá trị là null")
	require.Nil(t, h.A.Value)
}

func TestTristateKeyPresentWithValue(t *testing.T) {
	var h inbox
	require.NoError(t, json.Unmarshal([]byte(`{"a":"xin chao"}`), &h))

	require.True(t, h.A.Set)
	require.NotNil(t, h.A.Value)
	require.Equal(t, "xin chao", *h.A.Value)
}

func TestTristateEmptyStringDiffersFromAbsent(t *testing.T) {
	var h inbox
	require.NoError(t, json.Unmarshal([]byte(`{"a":""}`), &h))

	require.True(t, h.A.Set, "chuỗi rỗng là một giá trị, không phải sự vắng mặt")
	require.NotNil(t, h.A.Value)
	require.Equal(t, "", *h.A.Value)
}

func TestTristateWrongTypeReturnsError(t *testing.T) {
	var h inbox
	require.Error(t, json.Unmarshal([]byte(`{"b":"khong-phai-so"}`), &h))
}

func TestTristateGet(t *testing.T) {
	var h inbox
	require.NoError(t, json.Unmarshal([]byte(`{"a":null,"b":3}`), &h))

	v, ok := h.A.Get()
	require.True(t, ok)
	require.Nil(t, v)

	n, ok := h.B.Get()
	require.True(t, ok)
	require.Equal(t, 3, *n)

	var notYet service.Tristate[string]
	_, ok = notYet.Get()
	require.False(t, ok)
}
