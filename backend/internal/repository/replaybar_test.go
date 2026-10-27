package repository_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/repository"
	"journal/internal/testdb"
)

// Hành vi chung của kho nến (ghi đè, chia trang) nằm ở contract test của service. Ở đây chỉ kiểm
// thứ riêng của Postgres: NUMERIC trả lại đúng chuỗi đã ghi, và dữ liệu hỏng bị chặn trước khi ghi.

// Mỗi giá đọc ra đúng chuỗi đã ghi: NUMERIC giữ nguyên số chữ số thập phân, không qua float.
func TestReplayBarsNumericRoundTrip(t *testing.T) {
	ctx := context.Background()
	repo := repository.NewReplayBarRepo(testdb.New(t))
	prices := []json.Number{"29227.25", "29226", "29227.0", "6100.75", "0.000001", "123456789012.5"}
	var b domain.MinuteBars
	for i, p := range prices {
		b.Append(1792360800+int64(i)*60, p, p, p, p, p)
	}
	require.NoError(t, repo.Upsert(ctx, "NQ", b))

	got, _, err := repo.After(ctx, "NQ", 0, 100)
	require.NoError(t, err)
	for _, col := range [][]json.Number{got.O, got.H, got.L, got.C, got.V} {
		require.Equal(t, prices, col)
	}
}

func TestReplayBarsUpsertRejectsBadInput(t *testing.T) {
	repo := repository.NewReplayBarRepo(testdb.New(t))
	ragged := domain.MinuteBars{}
	ragged.Append(60, "1", "1", "1", "1", "1")
	ragged.Append(120, "1", "1", "1", "1", "1")
	ragged.C = ragged.C[:1]
	backwards := domain.MinuteBars{}
	backwards.Append(120, "1", "1", "1", "1", "1")
	backwards.Append(60, "1", "1", "1", "1", "1")
	for name, b := range map[string]domain.MinuteBars{"ragged columns": ragged, "time goes back": backwards} {
		t.Run(name, func(t *testing.T) {
			require.Error(t, repo.Upsert(context.Background(), "NQ", b))
			got, _, err := repo.After(context.Background(), "NQ", 0, 100)
			require.NoError(t, err)
			require.Zero(t, got.Len(), "nothing half-written")
		})
	}
}
