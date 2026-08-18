package repository_test

import (
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"journal/internal/domain"
	"journal/internal/testdb"
)

// Migration 0001 để entry/exit/volume/profit_theory NULLable. Trước bản sửa
// con trỏ, decimal.Decimal.Scan(nil) lỗi "could not convert value '<nil>' to
// byte array". Test này là bằng chứng chạy thật, không chỉ bằng chứng biên dịch.
func TestTradeNullDecimalRoundTrip(t *testing.T) {
	db := testdb.New(t)

	var userID int64
	require.NoError(t, db.Raw(
		`INSERT INTO users (email, password_hash) VALUES ('a@example.com', 'x') RETURNING id`,
	).Scan(&userID).Error)

	var accountID int64
	require.NoError(t, db.Raw(
		`INSERT INTO accounts (user_id, code, initial_balance) VALUES (?, 'ACC1', 10000) RETURNING id`,
		userID,
	).Scan(&accountID).Error)

	tr := domain.Trade{
		AccountID: accountID,
		STT:       1,
		EnteredAt: time.Date(2026, 6, 9, 8, 30, 0, 0, time.UTC),
		Symbol:    "XAUUSD",
		Direction: domain.DirectionLong,
		Profit:    decimal.NewFromInt(100),
		Fee:       decimal.Zero,
		Setup:     domain.DefaultSetup,
	}
	require.NoError(t, db.Create(&tr).Error)
	require.NotZero(t, tr.ID, "GORM phải nhận lại id do BIGSERIAL cấp")

	var got domain.Trade
	require.NoError(t, db.First(&got, tr.ID).Error)

	require.Nil(t, got.Entry, "entry NULL phải đọc ra nil, không phải lỗi Scan")
	require.Nil(t, got.Exit)
	require.Nil(t, got.Volume)
	require.Nil(t, got.ProfitTheory)
	require.Equal(t, 1, got.STT, "cột stt phải map đúng, không bị GORM đổi thành s_t_t")
	require.True(t, got.Profit.Equal(decimal.NewFromInt(100)))
}

// NUMERIC(18,5) phải giữ nguyên 5 chữ số thập phân qua một vòng ghi/đọc.
func TestTradeDecimalGiuNguyenDoChinhXac(t *testing.T) {
	db := testdb.New(t)

	var userID int64
	require.NoError(t, db.Raw(
		`INSERT INTO users (email, password_hash) VALUES ('b@example.com', 'x') RETURNING id`,
	).Scan(&userID).Error)
	var accountID int64
	require.NoError(t, db.Raw(
		`INSERT INTO accounts (user_id, code, initial_balance) VALUES (?, 'ACC1', 10000) RETURNING id`,
		userID,
	).Scan(&accountID).Error)

	entry := decimal.RequireFromString("2345.67891")
	tr := domain.Trade{
		AccountID: accountID,
		STT:       1,
		EnteredAt: time.Date(2026, 6, 9, 8, 30, 0, 0, time.UTC),
		Symbol:    "XAUUSD",
		Direction: domain.DirectionLong,
		Entry:     &entry,
		Profit:    decimal.RequireFromString("-123.45"),
		Fee:       decimal.RequireFromString("2.50"),
		Setup:     domain.DefaultSetup,
	}
	require.NoError(t, db.Create(&tr).Error)

	var got domain.Trade
	require.NoError(t, db.First(&got, tr.ID).Error)

	require.NotNil(t, got.Entry)
	require.True(t, got.Entry.Equal(entry), "đọc ra %s, mong đợi %s", got.Entry, entry)
	require.True(t, got.Profit.Equal(decimal.RequireFromString("-123.45")))
}
