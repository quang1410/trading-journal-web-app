package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
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

// Retry-After là con số máy đọc được — FE khoá nút đúng chừng đó, không đoán.
func TestFailErrSetsRetryAfterHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)

	rec := httptest.NewRecorder()
	FailErr(rec, req, apperr.RetryLater(90*time.Second))
	require.Equal(t, http.StatusTooManyRequests, rec.Code)
	require.Equal(t, "90", rec.Header().Get("Retry-After"))

	rec = httptest.NewRecorder()
	FailErr(rec, req, apperr.TooManyRequests("chậm lại"))
	require.Empty(t, rec.Header().Get("Retry-After"), "no wait known, no header")
}
