package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHealthzReturnsOKEnvelope(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	NewRouter().ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var body struct {
		Code int `json:"code"`
		Data struct {
			Status string `json:"status"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, 0, body.Code)
	require.Equal(t, "ok", body.Data.Status)
}

func TestUnknownRouteReturns404Envelope(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/khong-ton-tai", nil)
	rec := httptest.NewRecorder()

	NewRouter().ServeHTTP(rec, req)

	require.Equal(t, http.StatusNotFound, rec.Code)

	var body struct {
		Code int `json:"code"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.NotEqual(t, 0, body.Code)
}
