package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/repository"
	"journal/internal/testdb"
)

func seedUser(t *testing.T, repo *repository.UserRepo, email string) int64 {
	t.Helper()
	u, err := repo.Create(context.Background(), email, "hash-gia")
	require.NoError(t, err)
	return u.ID
}

func TestRefreshTokenCreateThenReadByHash(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	tokens := repository.NewRefreshTokenRepo(db)
	userID := seedUser(t, users, "a@example.com")
	expires := time.Now().Add(24 * time.Hour).UTC().Truncate(time.Second)

	require.NoError(t, tokens.Create(ctx, userID, "hash-1", expires))

	got, err := tokens.ByHash(ctx, "hash-1")
	require.NoError(t, err)
	require.Equal(t, userID, got.UserID)
	require.Nil(t, got.RevokedAt, "token mới phải còn sống")
	require.WithinDuration(t, expires, got.ExpiresAt.UTC(), time.Second)
}

func TestRefreshTokenHashNotFound(t *testing.T) {
	db := testdb.New(t)
	tokens := repository.NewRefreshTokenRepo(db)

	_, err := tokens.ByHash(context.Background(), "khong-co")

	require.ErrorIs(t, err, repository.ErrNotFound)
}

func TestRefreshTokenRevokeSetsRevokedAt(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	tokens := repository.NewRefreshTokenRepo(db)
	userID := seedUser(t, users, "a@example.com")
	require.NoError(t, tokens.Create(ctx, userID, "hash-1", time.Now().Add(time.Hour)))
	row, err := tokens.ByHash(ctx, "hash-1")
	require.NoError(t, err)
	at := time.Now().UTC().Truncate(time.Second)

	require.NoError(t, tokens.Revoke(ctx, row.ID, at))

	after, err := tokens.ByHash(ctx, "hash-1")
	require.NoError(t, err, "thu hồi KHÔNG xoá bản ghi — phải còn để phát hiện tái sử dụng")
	require.NotNil(t, after.RevokedAt)
	require.WithinDuration(t, at, after.RevokedAt.UTC(), time.Second)
}

// Guard `revoked_at IS NULL` của Revoke là phòng tuyến cuối: tầng service đã
// kiểm RevokedAt trước khi gọi, nhưng hai lần refresh CÙNG token chạy song song
// đều đọc thấy NULL rồi cùng gọi Revoke. Không có guard thì lần sau ghi đè thời
// điểm thu hồi của lần đầu, xoá mất dấu vết token chết lúc nào.
func TestRevokeDoesNotOverwriteAlreadyRevoked(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	tokens := repository.NewRefreshTokenRepo(db)
	userID := seedUser(t, users, "a@example.com")
	require.NoError(t, tokens.Create(ctx, userID, "hash-1", time.Now().Add(time.Hour)))
	row, err := tokens.ByHash(ctx, "hash-1")
	require.NoError(t, err)
	first := time.Now().UTC().Add(-time.Hour).Truncate(time.Second)
	require.NoError(t, tokens.Revoke(ctx, row.ID, first))

	// Thu hồi lần hai, thời điểm khác hẳn.
	require.NoError(t, tokens.Revoke(ctx, row.ID, time.Now()))

	after, err := tokens.ByHash(ctx, "hash-1")
	require.NoError(t, err)
	require.WithinDuration(t, first, after.RevokedAt.UTC(), time.Second,
		"lần thu hồi ĐẦU TIÊN phải thắng")
}

// Đây là hàm mà phát hiện tái sử dụng dựa vào: một token bị replay thì mọi
// phiên của user đó phải chết, không chỉ token bị replay.
func TestRevokeAllForUserTouchesOnlyThatUser(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	tokens := repository.NewRefreshTokenRepo(db)
	nan := seedUser(t, users, "nan@example.com")
	otherUser := seedUser(t, users, "khac@example.com")
	require.NoError(t, tokens.Create(ctx, nan, "hash-nan-1", time.Now().Add(time.Hour)))
	require.NoError(t, tokens.Create(ctx, nan, "hash-nan-2", time.Now().Add(time.Hour)))
	require.NoError(t, tokens.Create(ctx, otherUser, "hash-khac", time.Now().Add(time.Hour)))

	require.NoError(t, tokens.RevokeAllForUser(ctx, nan, time.Now()))

	for _, h := range []string{"hash-nan-1", "hash-nan-2"} {
		row, err := tokens.ByHash(ctx, h)
		require.NoError(t, err)
		require.NotNil(t, row.RevokedAt, "%s phải bị thu hồi", h)
	}
	other, err := tokens.ByHash(ctx, "hash-khac")
	require.NoError(t, err)
	require.Nil(t, other.RevokedAt, "token của user khác KHÔNG được đụng tới")
}

// Thu hồi lần hai không được ghi đè thời điểm thu hồi lần đầu.
func TestRevokeAllForUserDoesNotOverwriteAlreadyRevoked(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	users := repository.NewUserRepo(db)
	tokens := repository.NewRefreshTokenRepo(db)
	userID := seedUser(t, users, "a@example.com")
	require.NoError(t, tokens.Create(ctx, userID, "hash-1", time.Now().Add(time.Hour)))
	row, err := tokens.ByHash(ctx, "hash-1")
	require.NoError(t, err)
	first := time.Now().UTC().Add(-time.Hour).Truncate(time.Second)
	require.NoError(t, tokens.Revoke(ctx, row.ID, first))

	require.NoError(t, tokens.RevokeAllForUser(ctx, userID, time.Now()))

	after, err := tokens.ByHash(ctx, "hash-1")
	require.NoError(t, err)
	require.WithinDuration(t, first, after.RevokedAt.UTC(), time.Second)
}
