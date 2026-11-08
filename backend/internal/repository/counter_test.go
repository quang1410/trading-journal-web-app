package repository_test

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"journal/internal/repository"
	"journal/internal/testdb"
)

var t0 = time.Date(2026, 11, 1, 9, 0, 0, 0, time.UTC)

func TestCounterHitCountsWithinWindowAndRestartsAfter(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewCounterRepo(testdb.New(t))

	for i := 1; i <= 3; i++ {
		hits, resetAt, err := repo.Hit(ctx, "login:ip:203.0.113.7", time.Minute, t0.Add(time.Duration(i)*time.Second))
		require.NoError(t, err)
		require.Equal(t, i, hits)
		// Cửa sổ cố định: mốc hết hạn tính từ lượt ĐẦU, lượt sau không đẩy lùi.
		require.True(t, resetAt.Equal(t0.Add(time.Second+time.Minute)), "got %v", resetAt)
	}

	hits, resetAt, err := repo.Hit(ctx, "login:ip:203.0.113.7", time.Minute, t0.Add(2*time.Minute))
	require.NoError(t, err)
	require.Equal(t, 1, hits, "an expired window starts over")
	require.True(t, resetAt.Equal(t0.Add(3*time.Minute)))

	hits, _, err = repo.Hit(ctx, "login:ip:198.51.100.2", time.Minute, t0.Add(2*time.Minute))
	require.NoError(t, err)
	require.Equal(t, 1, hits, "another key has its own counter")
}

// Nhiều instance tăng cùng một khoá cùng lúc: mỗi lượt phải thấy một con số
// khác nhau, từ 1 tới N, không mất lượt nào. Đọc-rồi-ghi sẽ trả trùng số.
func TestCounterHitIsAtomicUnderConcurrency(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewCounterRepo(testdb.New(t))

	const n = 20
	var wg sync.WaitGroup
	got := make(chan int, n)
	errs := make(chan error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			hits, _, err := repo.Hit(ctx, "login:ip:203.0.113.7", time.Minute, t0)
			errs <- err
			got <- hits
		}()
	}
	wg.Wait()
	close(got)
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}
	var all []int
	for h := range got {
		all = append(all, h)
	}
	sort.Ints(all)
	want := make([]int, n)
	for i := range want {
		want[i] = i + 1
	}
	require.Equal(t, want, all)
}

func TestCounterPeekDoesNotCount(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewCounterRepo(testdb.New(t))

	hits, _, err := repo.Peek(ctx, "lock:a", t0)
	require.NoError(t, err)
	require.Zero(t, hits, "absent key")

	_, _, err = repo.Hit(ctx, "lock:a", 15*time.Minute, t0)
	require.NoError(t, err)
	for i := 0; i < 2; i++ {
		hits, resetAt, err := repo.Peek(ctx, "lock:a", t0.Add(time.Minute))
		require.NoError(t, err)
		require.Equal(t, 1, hits)
		require.True(t, resetAt.Equal(t0.Add(15*time.Minute)))
	}

	hits, _, err = repo.Peek(ctx, "lock:a", t0.Add(15*time.Minute))
	require.NoError(t, err)
	require.Zero(t, hits, "expired counts as absent")
}

func TestCounterDelete(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewCounterRepo(testdb.New(t))

	_, _, err := repo.Hit(ctx, "fail:a", time.Hour, t0)
	require.NoError(t, err)
	require.NoError(t, repo.Delete(ctx, "fail:a"))
	require.NoError(t, repo.Delete(ctx, "fail:never-existed"))

	hits, _, err := repo.Hit(ctx, "fail:a", time.Hour, t0)
	require.NoError(t, err)
	require.Equal(t, 1, hits)
}

// Kẻ tấn công xoay email liên tục sinh mỗi email một dòng. Dòng hết hạn phải
// tự biến mất khi có ghi mới, không chờ cron.
func TestCounterSweepsExpiredRows(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewCounterRepo(db)

	for i := 0; i < 50; i++ {
		_, _, err := repo.Hit(ctx, fmt.Sprintf("fail:%d", i), time.Minute, t0)
		require.NoError(t, err)
	}
	_, _, err := repo.Hit(ctx, "fail:new", time.Minute, t0.Add(time.Hour))
	require.NoError(t, err)

	var n int64
	require.NoError(t, db.Raw(`SELECT count(*) FROM rate_limit_counters`).Scan(&n).Error)
	require.EqualValues(t, 1, n)
}

// Khoá đếm có thể chứa email của người lạ — chỉ lưu bản băm.
func TestCounterStoresOnlyHashedKeys(t *testing.T) {
	ctx := context.Background()
	db := testdb.New(t)
	repo := repository.NewCounterRepo(db)

	_, _, err := repo.Hit(ctx, "login:email:victim@example.com", time.Hour, t0)
	require.NoError(t, err)

	var n int64
	require.NoError(t, db.Raw(
		`SELECT count(*) FROM rate_limit_counters WHERE position(convert_to('victim', 'UTF8') in key_hash) > 0`,
	).Scan(&n).Error)
	require.Zero(t, n)
	require.NoError(t, db.Raw(`SELECT count(*) FROM rate_limit_counters WHERE octet_length(key_hash) = 32`).Scan(&n).Error)
	require.EqualValues(t, 1, n)
}

// Undo trả lại một lượt trong cửa sổ đang chạy; không có, đã hết hạn, hay đã
// về 0 thì không làm gì.
func TestCounterUndo(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewCounterRepo(testdb.New(t))

	for i := 0; i < 2; i++ {
		_, _, err := repo.Hit(ctx, "attempt:a", time.Hour, t0)
		require.NoError(t, err)
	}
	require.NoError(t, repo.Undo(ctx, "attempt:a", t0))
	hits, _, err := repo.Peek(ctx, "attempt:a", t0)
	require.NoError(t, err)
	require.Equal(t, 1, hits)

	require.NoError(t, repo.Undo(ctx, "attempt:a", t0))
	require.NoError(t, repo.Undo(ctx, "attempt:a", t0))
	hits, _, err = repo.Hit(ctx, "attempt:a", time.Hour, t0)
	require.NoError(t, err)
	require.Equal(t, 1, hits, "never below zero")

	require.NoError(t, repo.Undo(ctx, "attempt:never", t0))
}
