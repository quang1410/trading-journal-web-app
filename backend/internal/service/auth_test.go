package service_test

import (
	"context"
	"sort"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/auth"
	"journal/internal/service"
)

func newAuthService(t *testing.T) *service.AuthService {
	t.Helper()
	return service.NewAuthService(
		newMemUserStore(),
		newMemRefreshTokenStore(),
		auth.NewSigner("khoa-test", 15*time.Minute),
		720*time.Hour,
	)
}

func TestRegisterFirstUserSucceeds(t *testing.T) {
	svc := newAuthService(t)

	s, err := svc.Register(context.Background(), "a@example.com", "mat-khau-du-dai")

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
	_, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	_, err = svc.Register(ctx, "b@example.com", "mat-khau-du-dai")

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

			_, err := svc.Register(context.Background(), c.email, c.password)

			e := apperr.As(err)
			require.NotNil(t, e)
			require.Equal(t, 400, e.Status)
		})
	}
}

func TestLoginCorrectPassword(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	_, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	s, err := svc.Login(ctx, "a@example.com", "mat-khau-du-dai")

	require.NoError(t, err)
	require.NotEmpty(t, s.AccessToken)
	require.NotEmpty(t, s.RefreshToken)
}

// Sai email và sai mật khẩu phải KHÔNG phân biệt được từ phía client.
func TestLoginWrongEmailAndWrongPasswordReturnSameError(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	_, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	_, errWrongPassword := svc.Login(ctx, "a@example.com", "mat-khau-sai")
	_, errWrongEmail := svc.Login(ctx, "khong-co@example.com", "mat-khau-du-dai")

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
	_, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	wrongPassword := median(func() { _, _ = svc.Login(ctx, "a@example.com", "mat-khau-sai") })
	wrongEmail := median(func() { _, _ = svc.Login(ctx, "khong-co@example.com", "mat-khau-du-dai") })

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
	first, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
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
	first, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
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
	s, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
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
	s, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	require.NoError(t, svc.Logout(ctx, s.RefreshToken))

	_, err = svc.Refresh(ctx, s.RefreshToken)
	require.NotNil(t, apperr.As(err), "token đã logout không được refresh nữa")
}

// Logout là idempotent: gọi hai lần, gọi với token rác, đều không phải lỗi.
func TestLogoutIdempotent(t *testing.T) {
	ctx := context.Background()
	svc := newAuthService(t)
	s, err := svc.Register(ctx, "a@example.com", "mat-khau-du-dai")
	require.NoError(t, err)

	require.NoError(t, svc.Logout(ctx, s.RefreshToken))
	require.NoError(t, svc.Logout(ctx, s.RefreshToken))
	require.NoError(t, svc.Logout(ctx, "token-bia-ra"))
	require.NoError(t, svc.Logout(ctx, ""))
}
