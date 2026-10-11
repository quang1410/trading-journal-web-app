package httpapi_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"journal/internal/domain"
	"journal/internal/httpapi"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

const waitlistPath = "/api/waitlist"

func waitlistServer(t *testing.T) (*httptest.Server, *gorm.DB) {
	t.Helper()
	db := testdb.New(t)
	srv := httptest.NewServer(httpapi.NewRouter(httpapi.Deps{
		Waitlist: service.NewWaitlistService(repository.NewWaitlistRepo(db)),
	}))
	t.Cleanup(srv.Close)
	return srv, db
}

func countSignups(t *testing.T, db *gorm.DB) int64 {
	t.Helper()
	var n int64
	require.NoError(t, db.Model(&domain.WaitlistSignup{}).Count(&n).Error)
	return n
}

func TestWaitlistJoinNeedsNoAuth(t *testing.T) {
	srv, db := waitlistServer(t)

	resp, env := do(t, http.MethodPost, srv.URL+waitlistPath, "",
		`{"email":"toi@gmail.com","locale":"vi","source":"fb-group","website":""}`)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.JSONEq(t, `{"joined":true}`, string(env.Data))
	require.EqualValues(t, 1, countSignups(t, db))
}

// Email mới, email đã có và bot nhận phản hồi GIỐNG HỆT nhau: không ai dò
// được email nào đã nằm trong danh sách.
func TestWaitlistJoinResponsesAreIdentical(t *testing.T) {
	srv, db := waitlistServer(t)
	bodies := []string{
		`{"email":"toi@gmail.com","locale":"vi","source":"","website":""}`,
		`{"email":"TOI@gmail.com","locale":"en","source":"","website":""}`,
		`{"email":"bot@example.com","locale":"vi","source":"","website":"http://spam"}`,
	}
	var first string
	for i, b := range bodies {
		resp, env := do(t, http.MethodPost, srv.URL+waitlistPath, "", b)
		require.Equal(t, http.StatusOK, resp.StatusCode, "request %d", i)
		if i == 0 {
			first = string(env.Data)
			continue
		}
		require.Equal(t, first, string(env.Data), "request %d", i)
	}
	require.EqualValues(t, 1, countSignups(t, db))
}

func TestWaitlistJoinInvalidEmail(t *testing.T) {
	srv, _ := waitlistServer(t)

	resp, env := do(t, http.MethodPost, srv.URL+waitlistPath, "",
		`{"email":"toi@localhost","locale":"vi","source":"","website":""}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
	require.Equal(t, "email không hợp lệ", env.Msg)
}

func TestWaitlistJoinRejectsUnknownField(t *testing.T) {
	srv, _ := waitlistServer(t)

	resp, env := do(t, http.MethodPost, srv.URL+waitlistPath, "", `{"email":"toi@gmail.com","admin":true}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, 1400, env.Code)
}

func TestWaitlistAnswersSavedOnce(t *testing.T) {
	srv, db := waitlistServer(t)
	_, _ = do(t, http.MethodPost, srv.URL+waitlistPath, "",
		`{"email":"toi@gmail.com","locale":"vi","source":"","website":""}`)

	resp, env := do(t, http.MethodPut, srv.URL+waitlistPath+"/answers", "",
		`{"email":"toi@gmail.com","journal_tool":"spreadsheet","markets":["crypto"],"prop_status":"active"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.JSONEq(t, `{"saved":true}`, string(env.Data))

	resp, _ = do(t, http.MethodPut, srv.URL+waitlistPath+"/answers", "",
		`{"email":"toi@gmail.com","journal_tool":"none","markets":[],"prop_status":"never"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	var row domain.WaitlistSignup
	require.NoError(t, db.Where("email = ?", "toi@gmail.com").Take(&row).Error)
	require.Equal(t, "spreadsheet", *row.JournalTool)
	require.Equal(t, "crypto", row.Markets)
}

func TestWaitlistAnswersUnknownCode(t *testing.T) {
	srv, _ := waitlistServer(t)

	resp, env := do(t, http.MethodPut, srv.URL+waitlistPath+"/answers", "",
		`{"email":"toi@gmail.com","journal_tool":"excel","markets":[],"prop_status":""}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
	require.Equal(t, `công cụ ghi nhật ký không hợp lệ: "excel"`, env.Msg)
}

// Sáu request trong một phút từ cùng một IP: lần thứ sáu bị chặn, cả khi nó
// là PUT /answers chứ không phải POST — hai endpoint dùng chung một bộ đếm.
func TestWaitlistRateLimited(t *testing.T) {
	srv, _ := waitlistServer(t)
	body := `{"email":"toi@gmail.com","locale":"vi","source":"","website":""}`
	for i := 0; i < 5; i++ {
		resp, _ := do(t, http.MethodPost, srv.URL+waitlistPath, "", body)
		require.Equal(t, http.StatusOK, resp.StatusCode, "request %d", i+1)
	}
	resp, env := do(t, http.MethodPut, srv.URL+waitlistPath+"/answers", "",
		`{"email":"toi@gmail.com","journal_tool":"","markets":[],"prop_status":""}`)
	require.Equal(t, http.StatusTooManyRequests, resp.StatusCode)
	require.Equal(t, 1429, env.Code)
	require.Equal(t, "gửi quá nhiều lần, thử lại sau một phút", env.Msg)
}

// Client tự gửi True-Client-IP / X-Forwarded-For được, nên khoá đếm không được
// lấy từ chúng. X-Real-IP thì proxy (nginx, Vercel) ghi đè bằng IP thật — đổi
// True-Client-IP mỗi lần cũng không thoát được giới hạn.
func TestWaitlistRateLimitIgnoresSpoofedClientIPHeaders(t *testing.T) {
	srv, _ := waitlistServer(t)
	body := `{"email":"toi@gmail.com","locale":"vi","source":"","website":""}`
	status := 0
	for i := 0; i < 6; i++ {
		req, err := http.NewRequest(http.MethodPost, srv.URL+waitlistPath, strings.NewReader(body))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Real-IP", "203.0.113.7")
		req.Header.Set("True-Client-IP", fmt.Sprintf("198.51.100.%d", i+1))
		req.Header.Set("X-Forwarded-For", fmt.Sprintf("192.0.2.%d", i+1))
		resp, err := http.DefaultClient.Do(req)
		require.NoError(t, err)
		_ = resp.Body.Close()
		status = resp.StatusCode
	}
	require.Equal(t, http.StatusTooManyRequests, status, "6th request from the same real IP must be limited")
}
