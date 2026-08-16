package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOKWrapsDataInEnvelope(t *testing.T) {
	rec := httptest.NewRecorder()

	OK(rec, map[string]string{"hello": "world"})

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/json", rec.Header().Get("Content-Type"))

	var body struct {
		Code int               `json:"code"`
		Msg  string            `json:"msg"`
		Data map[string]string `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, 0, body.Code)
	require.Equal(t, "ok", body.Msg)
	require.Equal(t, map[string]string{"hello": "world"}, body.Data)
}

func TestFailUsesGivenStatusAndCode(t *testing.T) {
	rec := httptest.NewRecorder()

	Fail(rec, http.StatusBadRequest, 1001, "thiếu offset trong entered_at")

	require.Equal(t, http.StatusBadRequest, rec.Code)

	var body struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data any    `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, 1001, body.Code)
	require.Equal(t, "thiếu offset trong entered_at", body.Msg)
	require.Nil(t, body.Data)
}
