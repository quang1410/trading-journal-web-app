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
func TestMetaEnumsNeedsNoAuth(t *testing.T) {
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

func TestCORSOnlyAllowsListedOrigin(t *testing.T) {
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

func TestCORSPreflightReturns204(t *testing.T) {
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

func TestMetaEnumsIncludesAccountEnums(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{}))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/meta/enums")
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()

	var env struct {
		Data struct {
			AccountTypes      []string `json:"account_types"`
			ChallengePhases   []string `json:"challenge_phases"`
			ChallengeStatuses []string `json:"challenge_statuses"`
		} `json:"data"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&env))
	require.Equal(t, domain.AccountTypes, env.Data.AccountTypes)
	require.Equal(t, domain.ChallengePhases, env.Data.ChallengePhases)
	require.Equal(t, domain.ChallengeStatuses, env.Data.ChallengeStatuses)
}

// Landing dựng phiếu chấm điểm từ hai khoá này, nên chúng phải khớp bảng §2
// và §2.6 của trading-journal-plan.md. Số chép tay, không gọi scoring.
func TestMetaEnumsExposesScoring(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{}))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/api/meta/enums")
	require.NoError(t, err)
	defer func() { _ = resp.Body.Close() }()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var env struct {
		Data struct {
			ScorePoints map[string]map[string]int `json:"score_points"`
			ClassBands  []struct {
				Min   int    `json:"min"`
				Class string `json:"class"`
			} `json:"class_bands"`
		} `json:"data"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&env))

	require.Equal(t, map[string]int{
		domain.EntryPlanned: 25, domain.EntryTooEarly: 10,
		domain.EntryTooLate: 10, domain.EntryImpulse: 0,
	}, env.Data.ScorePoints["entry_qualities"])
	require.Equal(t, map[string]int{
		domain.InTradeFollowed: 25, domain.InTradeMovedTP: 10,
		domain.InTradeMovedSL: 0, domain.InTradeWantExit: 5,
	}, env.Data.ScorePoints["in_trade_qualities"])
	require.Equal(t, map[string]int{
		domain.ExitHitTP: 25, domain.ExitHitSL: 25,
		domain.ExitTechnical: 15, domain.ExitEmotional: 0,
	}, env.Data.ScorePoints["exit_qualities"])
	require.Equal(t, map[string]int{
		domain.PsychNoError: 25, domain.PsychFOMO: 0, domain.PsychFear: 5,
		domain.PsychHope: 5, domain.PsychGreed: 5, domain.PsychRevenge: 0,
		domain.PsychAlwaysRight: 0,
	}, env.Data.ScorePoints["psychologies"])

	require.Len(t, env.Data.ClassBands, 4)
	wantMins := []int{80, 55, 30, 0}
	wantClasses := []string{domain.ClassPlanned, domain.ClassNeedsWork, domain.ClassImpulsive, domain.ClassRevenge}
	for i, b := range env.Data.ClassBands {
		require.Equal(t, wantMins[i], b.Min, "band %d", i)
		require.Equal(t, wantClasses[i], b.Class, "band %d", i)
	}
}
