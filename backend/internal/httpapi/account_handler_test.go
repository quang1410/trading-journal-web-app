package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/auth"
	"journal/internal/httpapi"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

// twoUserServer dựng server thật với HAI user đã tồn tại, trả access token
// của từng người. Đăng ký chỉ mở cho user đầu tiên nên user thứ hai được tạo
// thẳng qua repository.
func twoUserServer(t *testing.T) (srv *httptest.Server, tokenA, tokenB string) {
	t.Helper()
	db := testdb.New(t)
	signer := auth.NewSigner("khoa-test", 15*time.Minute)
	users := repository.NewUserRepo(db)
	accountSvc := service.NewAccountService(repository.NewAccountRepo(db))
	authSvc := service.NewAuthService(users, repository.NewRefreshTokenRepo(db), signer, 720*time.Hour)

	cashRepo := repository.NewCashFlowRepo(db)
	tradeRepo := repository.NewTradeRepo(db)
	srv = httptest.NewServer(httpapi.NewRouter(httpapi.Deps{
		Auth:         authSvc,
		Account:      accountSvc,
		CashFlow:     service.NewCashFlowService(cashRepo, accountSvc),
		Trade:        service.NewTradeService(tradeRepo, cashRepo, accountSvc),
		Import:       service.NewImportService(tradeRepo),
		NoteTemplate: service.NewNoteTemplateService(repository.NewNoteTemplateRepo(db)),
		JournalNote:  service.NewJournalNoteService(repository.NewJournalNoteRepo(db)),
		Signer:       signer,
	}))
	t.Cleanup(srv.Close)

	sessionA, err := authSvc.Register(context.Background(), "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)
	userB, err := users.Create(context.Background(), "b@example.com", "hash-gia")
	require.NoError(t, err)
	tokenB, err = signer.SignAccess(userB.ID)
	require.NoError(t, err)
	return srv, sessionA.AccessToken, tokenB
}

func do(t *testing.T, method, url, token, body string) (*http.Response, envelopeBody) {
	t.Helper()
	var rdr *strings.Reader
	if body == "" {
		rdr = strings.NewReader("")
	} else {
		rdr = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, url, rdr)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })
	var env envelopeBody
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&env))
	return resp, env
}

const bodyACC1 = `{"code":"ACC1","name":"Chính","currency":"USD","timezone":"Asia/Ho_Chi_Minh","initial_balance":"10000","risk_per_trade":"0.01"}`

func TestCreateAccountThenList(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Equal(t, 0, env.Code)

	// Tiền phải serialize thành CHUỖI, không phải số — spec §5.
	require.Contains(t, string(env.Data), `"initial_balance":"10000"`,
		"tiền phải là chuỗi JSON, thực tế: %s", env.Data)
	require.Contains(t, string(env.Data), `"one_r":"100"`,
		"1R = 10000 × 0.01, thực tế: %s", env.Data)

	listResp, listEnv := do(t, http.MethodGet, srv.URL+"/api/accounts", tokenA, "")
	require.Equal(t, http.StatusOK, listResp.StatusCode)
	var list []struct {
		ID   int64  `json:"id"`
		Code string `json:"code"`
	}
	require.NoError(t, json.Unmarshal(listEnv.Data, &list))
	require.Len(t, list, 1)
	require.Equal(t, "ACC1", list[0].Code)
}

func TestMissingTokenReturns401(t *testing.T) {
	srv, _, _ := twoUserServer(t)

	for _, c := range []struct{ method, path, body string }{
		{http.MethodGet, "/api/accounts", ""},
		{http.MethodPost, "/api/accounts", bodyACC1},
		{http.MethodPatch, "/api/accounts/1", `{"name":"x"}`},
	} {
		resp, env := do(t, c.method, srv.URL+c.path, "", c.body)
		require.Equal(t, http.StatusUnauthorized, resp.StatusCode, "%s %s", c.method, c.path)
		require.Equal(t, 1401, env.Code)
	}
}

// Cô lập khẳng định DƯƠNG: B không thấy account của A, và A vẫn thấy của A.
func TestUserBCannotSeeUserAsAccount(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	_, _ = do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)

	_, envB := do(t, http.MethodGet, srv.URL+"/api/accounts", tokenB, "")
	// Phải là [] chứ KHÔNG phải null. require.Empty ở dưới không phân biệt được
	// hai thứ đó — unmarshal "null" vào slice cho ra nil, và nil cũng Empty.
	// Với frontend thì khác hẳn: null.map(...) là crash, và đây đúng là trạng
	// thái của một user vừa đăng ký xong, chưa có account nào.
	require.JSONEq(t, `[]`, string(envB.Data),
		"danh sách rỗng phải serialize thành [] chứ không phải null, thực tế: %s", envB.Data)
	var listB []json.RawMessage
	require.NoError(t, json.Unmarshal(envB.Data, &listB))
	require.Empty(t, listB, "B không được thấy account nào")

	_, envA := do(t, http.MethodGet, srv.URL+"/api/accounts", tokenA, "")
	var listA []json.RawMessage
	require.NoError(t, json.Unmarshal(envA.Data, &listA))
	require.Len(t, listA, 1, "A vẫn phải thấy account của mình")
}

func TestUserBUpdatingUserAsAccountReturns403(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	_, envA := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)
	var created struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(envA.Data, &created))

	resp, env := do(t, http.MethodPatch,
		srv.URL+"/api/accounts/"+itoa(created.ID), tokenB, `{"name":"cướp"}`)

	require.Equal(t, http.StatusForbidden, resp.StatusCode)
	require.Equal(t, 1403, env.Code)
}

func TestUpdateMissingAccountReturns404(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodPatch, srv.URL+"/api/accounts/999999", tokenA, `{"name":"x"}`)

	require.Equal(t, http.StatusNotFound, resp.StatusCode)
	require.Equal(t, 1404, env.Code)
}

func TestNonNumericIDReturns400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodPatch, srv.URL+"/api/accounts/abc", tokenA, `{"name":"x"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}

func TestPatchLaPartial(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	_, envA := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)
	var created struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(envA.Data, &created))

	resp, env := do(t, http.MethodPatch,
		srv.URL+"/api/accounts/"+itoa(created.ID), tokenA, `{"name":"Tên mới"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.Contains(t, string(env.Data), `"name":"Tên mới"`)
	require.Contains(t, string(env.Data), `"code":"ACC1"`, "code không gửi lên thì giữ nguyên")
	require.Contains(t, string(env.Data), `"initial_balance":"10000"`)
}

func TestCreateAccountBadTimezoneReturns400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA,
		`{"code":"ACC1","name":"x","currency":"USD","timezone":"Mars/Phobos","initial_balance":"10000","risk_per_trade":"0.01"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
	require.Contains(t, env.Msg, "Mars/Phobos")
}

func TestCreateAccountDuplicateCodeReturns409(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	_, _ = do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)

	resp, env := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)

	require.Equal(t, http.StatusConflict, resp.StatusCode)
	require.Equal(t, 1409, env.Code)
}

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}

const bodyProp = `{"code":"FT1","name":"FTMO 100k","currency":"USD","timezone":"UTC",` +
	`"initial_balance":"100000","risk_per_trade":"0.01",` +
	`"account_type":"prop","prop_firm":"FTMO","profit_target":"0.1","max_drawdown_limit":"0.1"}`

func TestCreatePropAccountRoundTrip(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyProp)

	require.Equal(t, http.StatusOK, resp.StatusCode, env.Msg)
	body := string(env.Data)
	require.Contains(t, body, `"account_type":"prop"`)
	require.Contains(t, body, `"prop_firm":"FTMO"`)
	require.Contains(t, body, `"challenge_phase":"phase_1"`)
	require.Contains(t, body, `"challenge_status":"in_progress"`)
	require.Contains(t, body, `"profit_target":"0.1"`, "ratios are JSON strings: %s", body)
	require.Contains(t, body, `"max_drawdown_limit":"0.1"`)
}

func TestPersonalAccountHasNullChallenge(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	_, env := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyACC1)

	body := string(env.Data)
	require.Contains(t, body, `"account_type":"personal"`)
	require.Contains(t, body, `"prop_firm":""`)
	require.Contains(t, body, `"challenge_phase":null`)
	require.Contains(t, body, `"challenge_status":null`)
	require.Contains(t, body, `"profit_target":null`)
	require.Contains(t, body, `"max_drawdown_limit":null`)
}

func TestPatchNullClearsProfitTarget(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	_, created := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyProp)
	var acc struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(created.Data, &acc))

	resp, env := do(t, http.MethodPatch, srv.URL+"/api/accounts/"+itoa(acc.ID), tokenA,
		`{"profit_target":null}`)

	require.Equal(t, http.StatusOK, resp.StatusCode, env.Msg)
	require.Contains(t, string(env.Data), `"profit_target":null`)
	require.Contains(t, string(env.Data), `"max_drawdown_limit":"0.1"`, "omitted key is left unchanged")
}

func TestPatchAdvancePhaseResetsStatus(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	_, created := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyProp)
	var acc struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(created.Data, &acc))
	url := srv.URL + "/api/accounts/" + itoa(acc.ID)
	_, _ = do(t, http.MethodPatch, url, tokenA, `{"challenge_status":"passed"}`)

	resp, env := do(t, http.MethodPatch, url, tokenA, `{"challenge_phase":"phase_2"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode, env.Msg)
	require.Contains(t, string(env.Data), `"challenge_phase":"phase_2"`)
	require.Contains(t, string(env.Data), `"challenge_status":"in_progress"`)
}

func TestPatchFundedPassedReturns400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	_, created := do(t, http.MethodPost, srv.URL+"/api/accounts", tokenA, bodyProp)
	var acc struct {
		ID int64 `json:"id"`
	}
	require.NoError(t, json.Unmarshal(created.Data, &acc))

	resp, env := do(t, http.MethodPatch, srv.URL+"/api/accounts/"+itoa(acc.ID), tokenA,
		`{"challenge_phase":"funded","challenge_status":"passed"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}
