package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/service"
)

func TestRateLimiterAllowsUpToLimitThenTellsHowLongToWait(t *testing.T) {
	ctx := context.Background()
	lim := service.NewRateLimiter(newMemCounterStore())
	now := time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)
	lim.Now = func() time.Time { return now }

	for i := 0; i < 3; i++ {
		require.NoError(t, lim.Allow(ctx, "ip:login:203.0.113.7", 3, time.Minute))
	}
	now = now.Add(20 * time.Second)
	e := apperr.As(lim.Allow(ctx, "ip:login:203.0.113.7", 3, time.Minute))
	require.NotNil(t, e)
	require.Equal(t, 429, e.Status)
	require.Equal(t, 40, e.RetryAfterSeconds)

	require.NoError(t, lim.Allow(ctx, "ip:login:198.51.100.2", 3, time.Minute), "another key")

	now = now.Add(40 * time.Second)
	require.NoError(t, lim.Allow(ctx, "ip:login:203.0.113.7", 3, time.Minute), "a new window")
}

// DB sập thì CHẶN (500), không mở cửa: login vốn đã cần DB, mở cửa chẳng được
// gì mà mất luôn hàng rào.
func TestRateLimiterStoreErrorIsNotAllowed(t *testing.T) {
	store := newMemCounterStore()
	store.err = errors.New("connection refused")
	lim := service.NewRateLimiter(store)

	err := lim.Allow(context.Background(), "ip:login:203.0.113.7", 3, time.Minute)
	require.Error(t, err)
	require.Nil(t, apperr.As(err), "an infrastructure error, not a business one")
}

func TestDisabledRateLimiterAllowsEverythingWithoutCounting(t *testing.T) {
	store := newMemCounterStore()
	store.err = errors.New("must not be called")
	lim := service.NewRateLimiter(store)
	lim.Disabled = true

	for i := 0; i < 5; i++ {
		require.NoError(t, lim.Allow(context.Background(), "ip:login:203.0.113.7", 1, time.Minute))
	}
}
