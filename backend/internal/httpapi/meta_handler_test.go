package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/httpapi"
)

// /api/meta/enums là dữ liệu tham chiếu tĩnh: không cần đăng nhập, và không
// cần DB — nên nó dựng được từ Deps rỗng.
func TestMetaEnumsKhongCanAuth(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{}))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/meta/enums")
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var env struct {
		Code int `json:"code"`
		Data struct {
			Directions    []string `json:"directions"`
			Psychologies  []string `json:"psychologies"`
			CashFlowTypes []string `json:"cash_flow_types"`
			DefaultSetup  string   `json:"default_setup"`
		} `json:"data"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&env))
	require.Equal(t, 0, env.Code)
	require.Equal(t, domain.Directions, env.Data.Directions)
	require.Equal(t, domain.Psychologies, env.Data.Psychologies)
	require.Equal(t, domain.CashFlowTypes, env.Data.CashFlowTypes)
	require.Equal(t, domain.DefaultSetup, env.Data.DefaultSetup)
}

func TestCORSChiChoOriginTrongDanhSach(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{
		CORSOrigins: []string{"https://duoc-phep.example"},
	}))
	defer srv.Close()

	cases := map[string]struct {
		origin     string
		wantHeader string
	}{
		"origin được phép":       {"https://duoc-phep.example", "https://duoc-phep.example"},
		"origin không được phép": {"https://ke-tan-cong.example", ""},
		"không có origin":        {"", ""},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodGet, srv.URL+"/api/meta/enums", nil)
			require.NoError(t, err)
			if c.origin != "" {
				req.Header.Set("Origin", c.origin)
			}
			resp, err := http.DefaultClient.Do(req)
			require.NoError(t, err)
			defer func() { _ = resp.Body.Close() }()

			require.Equal(t, c.wantHeader, resp.Header.Get("Access-Control-Allow-Origin"))
		})
	}
}

func TestCORSPreflightTra204(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{
		CORSOrigins: []string{"https://duoc-phep.example"},
	}))
	defer srv.Close()
	req, err := http.NewRequest(http.MethodOptions, srv.URL+"/api/accounts", nil)
	require.NoError(t, err)
	req.Header.Set("Origin", "https://duoc-phep.example")
	req.Header.Set("Access-Control-Request-Method", "POST")

	resp, err := http.DefaultClient.Do(req)

	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusNoContent, resp.StatusCode)
	require.Equal(t, "https://duoc-phep.example", resp.Header.Get("Access-Control-Allow-Origin"))
	require.Contains(t, resp.Header.Get("Access-Control-Allow-Headers"), "Authorization")
	require.Equal(t, "true", resp.Header.Get("Access-Control-Allow-Credentials"))
}
