package repository_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/repository"
	"journal/internal/testdb"
)

func TestUserCountStartsEmpty(t *testing.T) {
	repo := repository.NewUserRepo(testdb.New(t))

	n, err := repo.Count(context.Background())

	require.NoError(t, err)
	require.Equal(t, int64(0), n)
}

func TestUserCreateThenReadBack(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewUserRepo(testdb.New(t))

	created, err := repo.Create(ctx, "a@example.com", "hash-gia")
	require.NoError(t, err)
	require.NotZero(t, created.ID)
	require.False(t, created.CreatedAt.IsZero(), "DEFAULT now() phải đọc ngược về struct")

	byEmail, err := repo.ByEmail(ctx, "a@example.com")
	require.NoError(t, err)
	require.Equal(t, created.ID, byEmail.ID)
	require.Equal(t, "hash-gia", byEmail.PasswordHash)

	byID, err := repo.ByID(ctx, created.ID)
	require.NoError(t, err)
	require.Equal(t, "a@example.com", byID.Email)

	n, err := repo.Count(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(1), n)
}

func TestUserCreateDuplicateEmailReturnsErrDuplicate(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewUserRepo(testdb.New(t))
	_, err := repo.Create(ctx, "a@example.com", "hash-gia")
	require.NoError(t, err)

	_, err = repo.Create(ctx, "a@example.com", "hash-khac")

	require.ErrorIs(t, err, repository.ErrDuplicate)
}

func TestUserNotFoundReturnsErrNotFound(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewUserRepo(testdb.New(t))

	_, err := repo.ByEmail(ctx, "khong-co@example.com")
	require.ErrorIs(t, err, repository.ErrNotFound)

	_, err = repo.ByID(ctx, 999)
	require.ErrorIs(t, err, repository.ErrNotFound)
}
