package domain

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

func TestOneR(t *testing.T) {
	tests := []struct {
		name    string
		balance string
		risk    string
		want    string
	}{
		{"golden fixture: 5000 x 1%", "5000", "0.01", "50"},
		{"risk 0 -> 1R bằng 0", "5000", "0", "0"},
		{"số lẻ không mất precision", "1234.56", "0.0125", "15.432"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			acc := Account{
				InitialBalance: decimal.RequireFromString(tt.balance),
				RiskPerTrade:   decimal.RequireFromString(tt.risk),
			}
			require.True(t, acc.OneR().Equal(decimal.RequireFromString(tt.want)),
				"OneR() = %s, muốn %s", acc.OneR(), tt.want)
		})
	}
}
