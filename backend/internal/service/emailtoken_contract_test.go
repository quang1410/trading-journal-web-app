package service_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/repository"
	"journal/internal/service"
	"journal/internal/testdb"
)

// Hợp đồng của UserStore phần locale/xác minh (K-56). Tách file khỏi
// store_contract_test.go cho dễ đọc; cùng khuôn "một bộ test, hai adapter".
func userLocaleContract(t *testing.T, eachStore func(t *testing.T) service.UserStore) {
	t.Run("new user has locale vi and is unverified", func(t *testing.T) {
		st := eachStore(t)
		u, err := st.Create(newCtx(), "loc@example.com", "hash")
		require.NoError(t, err)
		got, err := st.ByID(newCtx(), u.ID)
		require.NoError(t, err)
		require.Equal(t, "vi", got.Locale)
		require.Nil(t, got.EmailVerifiedAt)
	})

	t.Run("SetLocale changes locale", func(t *testing.T) {
		st := eachStore(t)
		u, err := st.Create(newCtx(), "loc@example.com", "hash")
		require.NoError(t, err)
		require.NoError(t, st.SetLocale(newCtx(), u.ID, "en"))
		got, err := st.ByEmail(newCtx(), "loc@example.com")
		require.NoError(t, err)
		require.Equal(t, "en", got.Locale)
	})

	t.Run("SetLocale on unknown user returns ErrNotFound", func(t *testing.T) {
		st := eachStore(t)
		require.ErrorIs(t, st.SetLocale(newCtx(), 987654, "en"), repository.ErrNotFound)
	})
}

// emailTokenStoreContract: eachStore trả kho token và kho user DÙNG CHUNG dữ
// liệu, vì ConsumeVerify ghi cả hai bảng trong một transaction.
func emailTokenStoreContract(t *testing.T, eachStore func(t *testing.T) (service.EmailTokenStore, service.UserStore)) {
	now := time.Date(2026, 11, 10, 8, 0, 0, 0, time.UTC)
	later := now.Add(24 * time.Hour)

	setup := func(t *testing.T) (service.EmailTokenStore, service.UserStore, int64) {
		tokens, users := eachStore(t)
		u, err := users.Create(newCtx(), "tok@example.com", "hash")
		require.NoError(t, err)
		return tokens, users, u.ID
	}

	t.Run("consuming a live verify token returns userID and marks verified", func(t *testing.T) {
		tokens, users, uid := setup(t)
		require.NoError(t, tokens.Create(newCtx(), uid, service.TokenPurposeVerify, "h1", later))

		got, err := tokens.ConsumeVerify(newCtx(), "h1", now)
		require.NoError(t, err)
		require.Equal(t, uid, got)

		u, err := users.ByID(newCtx(), uid)
		require.NoError(t, err)
		require.NotNil(t, u.EmailVerifiedAt)
		require.True(t, u.EmailVerifiedAt.Equal(now))
	})

	t.Run("second consume returns ErrNotFound", func(t *testing.T) {
		tokens, _, uid := setup(t)
		require.NoError(t, tokens.Create(newCtx(), uid, service.TokenPurposeVerify, "h1", later))
		_, err := tokens.ConsumeVerify(newCtx(), "h1", now)
		require.NoError(t, err)
		_, err = tokens.ConsumeVerify(newCtx(), "h1", now)
		require.ErrorIs(t, err, repository.ErrNotFound)
	})

	t.Run("expired token (expires_at == now) returns ErrNotFound and leaves user unverified", func(t *testing.T) {
		tokens, users, uid := setup(t)
		require.NoError(t, tokens.Create(newCtx(), uid, service.TokenPurposeVerify, "h1", now))
		_, err := tokens.ConsumeVerify(newCtx(), "h1", now)
		require.ErrorIs(t, err, repository.ErrNotFound)
		u, err := users.ByID(newCtx(), uid)
		require.NoError(t, err)
		require.Nil(t, u.EmailVerifiedAt)
	})

	t.Run("wrong purpose or unknown token returns ErrNotFound", func(t *testing.T) {
		tokens, _, uid := setup(t)
		require.NoError(t, tokens.Create(newCtx(), uid, service.TokenPurposeReset, "h-reset", later))
		_, err := tokens.ConsumeVerify(newCtx(), "h-reset", now)
		require.ErrorIs(t, err, repository.ErrNotFound)
		_, err = tokens.ConsumeVerify(newCtx(), "khong-co", now)
		require.ErrorIs(t, err, repository.ErrNotFound)
	})

	t.Run("second token does not move the first verification time", func(t *testing.T) {
		tokens, users, uid := setup(t)
		require.NoError(t, tokens.Create(newCtx(), uid, service.TokenPurposeVerify, "h1", later))
		require.NoError(t, tokens.Create(newCtx(), uid, service.TokenPurposeVerify, "h2", later))
		_, err := tokens.ConsumeVerify(newCtx(), "h1", now)
		require.NoError(t, err)
		_, err = tokens.ConsumeVerify(newCtx(), "h2", now.Add(time.Hour))
		require.NoError(t, err)
		u, err := users.ByID(newCtx(), uid)
		require.NoError(t, err)
		require.True(t, u.EmailVerifiedAt.Equal(now))
	})

	t.Run("Create with duplicate hash returns ErrDuplicate", func(t *testing.T) {
		tokens, _, uid := setup(t)
		require.NoError(t, tokens.Create(newCtx(), uid, service.TokenPurposeVerify, "h1", later))
		require.ErrorIs(t, tokens.Create(newCtx(), uid, service.TokenPurposeVerify, "h1", later), repository.ErrDuplicate)
	})
}

func TestUserLocaleContract_InMemory(t *testing.T) {
	userLocaleContract(t, func(t *testing.T) service.UserStore { return newMemUserStore() })
}

func TestUserLocaleContract_Postgres(t *testing.T) {
	if testing.Short() {
		t.Skip("needs Postgres; run `make test` to include this pass")
	}
	userLocaleContract(t, func(t *testing.T) service.UserStore {
		return repository.NewUserRepo(testdb.New(t))
	})
}

func TestEmailTokenStoreContract_InMemory(t *testing.T) {
	emailTokenStoreContract(t, func(t *testing.T) (service.EmailTokenStore, service.UserStore) {
		users := newMemUserStore()
		return newMemEmailTokenStore(users), users
	})
}

func TestEmailTokenStoreContract_Postgres(t *testing.T) {
	if testing.Short() {
		t.Skip("needs Postgres; run `make test` to include this pass")
	}
	emailTokenStoreContract(t, func(t *testing.T) (service.EmailTokenStore, service.UserStore) {
		db := testdb.New(t)
		return repository.NewEmailTokenRepo(db), repository.NewUserRepo(db)
	})
}
