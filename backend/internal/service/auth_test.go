package service_test

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/auth"
	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

func newAuthService(t *testing.T) *service.AuthService {
	t.Helper()
	return newAuthServiceWith(t, newMemRefreshTokenStore())
}

// newAuthServiceWith cho test thay kho refresh token, vd để dựng lại race.
func newAuthServiceWith(t *testing.T, tokens service.RefreshTokenStore) *service.AuthService {
	t.Helper()
	return service.NewAuthService(
		newMemUserStore(),
		tokens,
		auth.NewSigner("test-key", 15*time.Minute),
		720*time.Hour,
	)
}

func TestRegisterFirstUserSucceeds(t *testing.T) {
	svc := newAuthService(t)

	s, err := svc.Register(context.Background(), service.RegisterInput{Email: "a@example.com", Password: "mat-khau-du-dai"})

	require.NoError(t, err)
	require.NotEmpty(t, s.AccessToken)
	require.NotEmpty(t, s.RefreshToken)
	require.Equal(t, "a@example.com", s.User.Email)
	require.NotEqual(t, "mat-khau-du-dai", s.User.PasswordHash, "mật khẩu phải được băm")
}

// Đăng ký đóng sau user đầu tiên — quyết định #4 của spec 2a.
func TestRegisterSecondTimeRejected(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	_, err := svc.Register(ctx, service.RegisterInput{Email: "a@example.com", Password: "mat-khau-du-dai"})
	require.NoError(t, err)

	_, err = svc.Register(ctx, service.RegisterInput{Email: "b@example.com", Password: "mat-khau-du-dai"})

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 403, e.Status)
	require.Equal(t, 1403, e.Code)
	require.Equal(t, "đã có tài khoản, đăng ký đã đóng", e.Msg)
}

func TestRegisterRejectsBadInput(t *testing.T) {
	cases := map[string]struct{ email, password string }{
		"email rỗng":        {"", "mat-khau-du-dai"},
		"email không có @":  {"khong-phai-email", "mat-khau-du-dai"},
		"mật khẩu quá ngắn": {"a@example.com", "ngan"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			svc := newAuthService(t)

			_, err := svc.Register(context.Background(), service.RegisterInput{Email: c.email, Password: c.password})

			e := apperr.As(err)
			require.NotNil(t, e)
			require.Equal(t, 400, e.Status)
		})
	}
}

func TestLoginCorrectPassword(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	_, err := svc.Register(ctx, service.RegisterInput{Email: "a@example.com", Password: "mat-khau-du-dai"})
	require.NoError(t, err)

	s, err := svc.Login(ctx, "a@example.com", "mat-khau-du-dai", testIP)

	require.NoError(t, err)
	require.NotEmpty(t, s.AccessToken)
	require.NotEmpty(t, s.RefreshToken)
}

// Sai email và sai mật khẩu phải KHÔNG phân biệt được từ phía client.
func TestLoginWrongEmailAndWrongPasswordReturnSameError(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	_, err := svc.Register(ctx, service.RegisterInput{Email: "a@example.com", Password: "mat-khau-du-dai"})
	require.NoError(t, err)

	_, errWrongPassword := svc.Login(ctx, "a@example.com", "mat-khau-sai", testIP)
	_, errWrongEmail := svc.Login(ctx, "khong-co@example.com", "mat-khau-du-dai", testIP)

	a, b := apperr.As(errWrongPassword), apperr.As(errWrongEmail)
	require.NotNil(t, a)
	require.NotNil(t, b)
	require.Equal(t, 401, a.Status)
	require.Equal(t, a.Code, b.Code)
	require.Equal(t, a.Msg, b.Msg)
	require.Equal(t, "email hoặc mật khẩu không đúng", a.Msg)
}

// Thông điệp giống nhau chưa đủ: nếu đường "email không tồn tại" trả lời nhanh
// hơn hẳn đường "sai mật khẩu" thì kẻ tấn công vẫn dò được email nào đã đăng ký,
// chỉ bằng đồng hồ bấm giờ. auth.VerifyDummy tồn tại CHỈ vì tính chất này, và
// không có test nào ở trên đo nó — xoá dòng đó đi thì cả suite vẫn xanh.
//
// Ngưỡng 0.5 nằm giữa hai thái cực đo được, không phải số chọn bừa: có
// VerifyDummy tỷ lệ ~0.85, bỏ đi còn ~0.02 (một truy vấn DB so với một lần
// argon2). Khoảng cách 40 lần nên test này không mong manh.
func TestLoginWrongEmailTakesSameTimeAsWrongPassword(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	_, err := svc.Register(ctx, service.RegisterInput{Email: "a@example.com", Password: "mat-khau-du-dai"})
	require.NoError(t, err)

	wrongPassword := median(func() { _, _ = svc.Login(ctx, "a@example.com", "mat-khau-sai", testIP) })
	wrongEmail := median(func() { _, _ = svc.Login(ctx, "khong-co@example.com", "mat-khau-du-dai", testIP) })

	ratio := float64(wrongEmail) / float64(wrongPassword)
	require.Greater(t, ratio, 0.5,
		"sai email (%v) phải tốn thời gian xấp xỉ sai mật khẩu (%v); tỷ lệ %.2f nghĩa là "+
			"đường email-không-tồn-tại đã bỏ qua bước băm và làm lộ email nào đã đăng ký",
		wrongEmail, wrongPassword, ratio)
}

// median chạy f năm lần và trả thời gian trung vị, để một lần GC hay một lần
// container khựng không quyết định kết quả.
func median(f func()) time.Duration {
	list := make([]time.Duration, 5)
	for i := range list {
		start := time.Now()
		f()
		list[i] = time.Since(start)
	}
	sort.Slice(list, func(i, j int) bool { return list[i] < list[j] })
	return list[len(list)/2]
}

func TestRefreshRotatesOldToken(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	first, err := svc.Register(ctx, service.RegisterInput{Email: "a@example.com", Password: "mat-khau-du-dai"})
	require.NoError(t, err)

	second, err := svc.Refresh(ctx, first.RefreshToken)

	require.NoError(t, err)
	require.NotEqual(t, first.RefreshToken, second.RefreshToken, "refresh phải phát token mới")
	require.NotEmpty(t, second.AccessToken)
}

// ĐÂY LÀ TEST QUAN TRỌNG NHẤT CỦA TASK: dùng lại một token đã xoay vòng nghĩa
// là token đó bị đánh cắp — mọi phiên của user đó phải chết, kể cả phiên hợp lệ.
func TestRefreshReusingRotatedTokenKillsAllSessions(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	first, err := svc.Register(ctx, service.RegisterInput{Email: "a@example.com", Password: "mat-khau-du-dai"})
	require.NoError(t, err)
	second, err := svc.Refresh(ctx, first.RefreshToken)
	require.NoError(t, err)

	// Kẻ tấn công dùng lại token đã chết.
	_, err = svc.Refresh(ctx, first.RefreshToken)

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 401, e.Status)
	require.Equal(t, "phiên đăng nhập không hợp lệ, đăng nhập lại", e.Msg)

	// Và token HỢP LỆ của người dùng thật cũng phải chết theo.
	_, err = svc.Refresh(ctx, second.RefreshToken)
	require.NotNil(t, apperr.As(err), "phiên hợp lệ phải bị giết theo khi phát hiện tái sử dụng")
}

// staleReadTokens trả bản ghi như lúc CHƯA ai thu hồi — đúng thứ hai request
// refresh song song cùng một token đều đọc thấy trước khi một trong hai kịp ghi.
// Dựng lại race một cách tất định, không cần goroutine.
type staleReadTokens struct{ *memRefreshTokenStore }

func (s staleReadTokens) ByHash(ctx context.Context, tokenHash string) (repository.RefreshTokenRow, error) {
	row, err := s.memRefreshTokenStore.ByHash(ctx, tokenHash)
	row.RevokedAt = nil
	return row, err
}

// Kiểm RevokedAt rồi mới thu hồi là check-then-act: request thua cuộc vẫn qua
// được bước kiểm. Chỉ phát hiện được ở chính câu UPDATE bên trong Rotate.
func TestConcurrentRefreshOfSameTokenIsTreatedAsReuse(t *testing.T) {
	ctx := context.Background()
	tokens := staleReadTokens{newMemRefreshTokenStore()}
	svc := newAuthServiceWith(t, tokens)
	first, err := svc.Register(ctx, service.RegisterInput{Email: "a@example.com", Password: "long-enough-password"})
	require.NoError(t, err)

	winner, err := svc.Refresh(ctx, first.RefreshToken)
	require.NoError(t, err)

	_, err = svc.Refresh(ctx, first.RefreshToken)

	e := apperr.As(err)
	require.NotNil(t, e, "the losing refresh must not get a session")
	require.Equal(t, 401, e.Status)

	row, err := tokens.memRefreshTokenStore.ByHash(ctx, auth.HashRefreshToken(winner.RefreshToken))
	require.NoError(t, err)
	require.NotNil(t, row.RevokedAt, "reuse detection must also kill the winner's session")
}

// rotateHookTokens chạy hook ngay sau khi một lần Rotate thành công — thời điểm
// SỚM NHẤT mà request song song có thể thấy token cũ đã chết.
type rotateHookTokens struct {
	*memRefreshTokenStore
	afterRotate func()
}

func (s *rotateHookTokens) Rotate(ctx context.Context, oldID, userID int64, newHash string, newExpiry, at time.Time) (bool, error) {
	rotated, err := s.memRefreshTokenStore.Rotate(ctx, oldID, userID, newHash, newExpiry, at)
	if rotated && s.afterRotate != nil {
		hook := s.afterRotate
		s.afterRotate = nil
		hook()
	}
	return rotated, err
}

// Bản sửa đầu tiên thu hồi token cũ rồi MỚI lưu token mới, ở hai lệnh riêng.
// RevokeAllForUser của bên thua chen vào giữa thì bỏ sót token mới, và kẻ
// thắng cuộc đua giữ được phiên. Rotate gộp hai bước nên bên thua chạy sớm
// nhất cũng đã thấy token mới.
func TestLoserRunningRightAfterWinnerRotateStillKillsWinnerSession(t *testing.T) {
	ctx := context.Background()
	tokens := &rotateHookTokens{memRefreshTokenStore: newMemRefreshTokenStore()}
	svc := newAuthServiceWith(t, tokens)
	first, err := svc.Register(ctx, service.RegisterInput{Email: "a@example.com", Password: "long-enough-password"})
	require.NoError(t, err)

	var loserErr error
	tokens.afterRotate = func() { _, loserErr = svc.Refresh(ctx, first.RefreshToken) }
	winner, err := svc.Refresh(ctx, first.RefreshToken)
	require.NoError(t, err)
	require.NotNil(t, apperr.As(loserErr), "the loser must be rejected")

	_, err = svc.Refresh(ctx, winner.RefreshToken)
	require.NotNil(t, apperr.As(err), "the winner's session must be killed by reuse detection")
}

// Bất biến trên Postgres thật: nhiều request refresh cùng MỘT token chạy song
// song thì tối đa một bên nhận phiên, và một khi đã có bên bị coi là tái sử
// dụng thì không còn token nào của user sống sót — kể cả token của bên thắng.
// Test hook ở trên chứng minh thứ tự xấu nhất; test này canh khoá dòng và
// transaction của repo thật, thứ memstore chỉ mô phỏng.
func TestConcurrentRefreshInvariantOnPostgres(t *testing.T) {
	if testing.Short() {
		t.Skip("needs Postgres")
	}
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	tokens := repository.NewRefreshTokenRepo(db)
	svc := service.NewAuthService(users, tokens, auth.NewSigner("test-key", 15*time.Minute), 720*time.Hour)

	const rounds, racers = 30, 4
	for i := range rounds {
		u, err := users.Create(ctx, fmt.Sprintf("race-%d@example.com", i), "hash")
		require.NoError(t, err)
		raw, err := auth.NewRefreshToken()
		require.NoError(t, err)
		require.NoError(t, tokens.Create(ctx, u.ID, auth.HashRefreshToken(raw), time.Now().Add(time.Hour)))

		var wg sync.WaitGroup
		errs := make([]error, racers)
		for r := range racers {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_, errs[r] = svc.Refresh(ctx, raw)
			}()
		}
		wg.Wait()

		successes := 0
		for _, err := range errs {
			if err == nil {
				successes++
				continue
			}
			require.NotNil(t, apperr.As(err), "round %d: unexpected infrastructure error: %v", i, err)
		}
		require.LessOrEqual(t, successes, 1, "round %d: more than one racer got a session", i)

		var live int64
		require.NoError(t, db.Model(&repository.RefreshTokenRow{}).
			Where("user_id = ? AND revoked_at IS NULL", u.ID).Count(&live).Error)
		require.Zero(t, live, "round %d: a session survived reuse detection", i)
	}
}

// failingRotateTokens giả lỗi hạ tầng ở bước Rotate.
type failingRotateTokens struct{ *memRefreshTokenStore }

func (failingRotateTokens) Rotate(context.Context, int64, int64, string, time.Time, time.Time) (bool, error) {
	return false, errors.New("connection reset")
}

// Lỗi DB không được trá hình thành 401 "phiên không hợp lệ": người dùng bị đá
// ra trang đăng nhập vì một sự cố của server. Phải là lỗi nội bộ (→ 500).
func TestRefreshRotateFailureIsInternalError(t *testing.T) {
	ctx := context.Background()
	svc := newAuthServiceWith(t, failingRotateTokens{newMemRefreshTokenStore()})
	s, err := svc.Register(ctx, service.RegisterInput{Email: "a@example.com", Password: "long-enough-password"})
	require.NoError(t, err)

	_, err = svc.Refresh(ctx, s.RefreshToken)

	require.Error(t, err)
	require.Nil(t, apperr.As(err), "infrastructure error must not become a business error")
}

func TestRefreshRejectsUnknownToken(t *testing.T) {
	svc := newAuthService(t)

	_, err := svc.Refresh(context.Background(), "token-bia-ra")

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 401, e.Status)
}

func TestRefreshRejectsExpiredToken(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	base := time.Date(2026, 8, 18, 10, 0, 0, 0, time.UTC)
	svc.Now = func() time.Time { return base }
	s, err := svc.Register(ctx, service.RegisterInput{Email: "a@example.com", Password: "mat-khau-du-dai"})
	require.NoError(t, err)

	svc.Now = func() time.Time { return base.Add(721 * time.Hour) } // refreshTTL là 720h

	_, err = svc.Refresh(ctx, s.RefreshToken)

	e := apperr.As(err)
	require.NotNil(t, e)
	require.Equal(t, 401, e.Status)
}

func TestLogoutRevokesActiveToken(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	s, err := svc.Register(ctx, service.RegisterInput{Email: "a@example.com", Password: "mat-khau-du-dai"})
	require.NoError(t, err)

	require.NoError(t, svc.Logout(ctx, s.RefreshToken))

	_, err = svc.Refresh(ctx, s.RefreshToken)
	require.NotNil(t, apperr.As(err), "token đã logout không được refresh nữa")
}

// Logout là idempotent: gọi hai lần, gọi với token rác, đều không phải lỗi.
func TestLogoutIdempotent(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	s, err := svc.Register(ctx, service.RegisterInput{Email: "a@example.com", Password: "mat-khau-du-dai"})
	require.NoError(t, err)

	require.NoError(t, svc.Logout(ctx, s.RefreshToken))
	require.NoError(t, svc.Logout(ctx, s.RefreshToken))
	require.NoError(t, svc.Logout(ctx, "token-bia-ra"))
	require.NoError(t, svc.Logout(ctx, ""))
}
