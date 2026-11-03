package ict

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// trendSetup: swing đáy 1m 102 (nến 2), chân giảm để lại FVG giảm [102.9, 103.5] (nến 6); nến 6 quét
// swing 102 và chạm FVG khung lớn [100, 101.5], nến 7 xuống tiếp 101 (cực trị), nến 8 là IFVG. Giờ
// phiên bắt đầu ở nến 3.
func trendSetup() []Bar {
	return seq(nyTime(2026, 3, 3, 10, 0), 1, [][4]float64{
		{105, 106, 104, 105},
		{105, 105.5, 103, 104},
		{104, 104.6, 102, 102.5},
		{102.5, 104.5, 102.5, 104},
		{104, 104.2, 103.5, 103.8},
		{103.8, 103.9, 102.6, 102.8},
		{102.8, 102.9, 101.5, 101.6},
		{101.6, 101.8, 101.0, 101.4},
		{101.4, 103.9, 101.3, 103.8},
	})
}

func trendSide(m1 []Bar) sideSetup {
	return sideSetup{m1: m1, start: 3, end: len(m1), esLiq: map[string]Level{},
		fvgs:  []FVG{{TF: Timeframes[0], Bull: true, Bottom: 100, Top: 101.5}},
		trend: Up, hasRange: true, rangeLo: 99, rangeHi: 108, above: []Level{{Name: "Asia High", P: 106, High: true}},
		refOpen: 105}
}

func trendRules() TradeRules {
	r := DefaultTradeRules()
	r.Model, r.NeedTrendWith, r.TargetERL = ModelTrend, true, true
	return r
}

func TestLastSwingLow(t *testing.T) {
	m1 := trendSetup()
	p, ok := lastSwingLow(m1, 6, 2, 0)
	require.True(t, ok)
	require.Equal(t, 102.0, p)
	_, ok = lastSwingLow(m1, 7, 2, 0)
	require.False(t, ok, "bar 6 already swept the swing low at bar 2")
	_, ok = lastSwingLow(m1, 4, 2, 0)
	require.False(t, ok, "the swing at bar 2 is not confirmed before bar 5")
}

func TestTrendModel(t *testing.T) {
	cases := []struct {
		name   string
		edit   func(s *sideSetup, r *TradeRules, m1 []Bar)
		ok     bool
		target float64
		stop   float64
	}{
		{"stop hunt in HTF FVG then IFVG: target nearest ERL", func(*sideSetup, *TradeRules, []Bar) {}, true, 106, 100.75},
		{"target range high when it is nearer", func(s *sideSetup, _ *TradeRules, _ []Bar) { s.rangeHi = 105 }, true, 105, 100.75},
		{"stop at the body of the extreme candle", func(_ *sideSetup, r *TradeRules, _ []Bar) { r.StopBody = true }, true, 106, 101.15},
		{"against the 1H trend", func(s *sideSetup, _ *TradeRules, _ []Bar) { s.trend = Down }, false, 0, 0},
		{"leg swept the range low (ERL): not a trend trade", func(s *sideSetup, _ *TradeRules, _ []Bar) { s.rangeLo = 101.2 }, false, 0, 0},
		{"no HTF FVG under the stop hunt", func(s *sideSetup, _ *TradeRules, _ []Bar) {
			s.fvgs = []FVG{{TF: Timeframes[0], Bull: true, Bottom: 90, Top: 95}}
		}, false, 0, 0},
		{"no liquidity ahead", func(s *sideSetup, _ *TradeRules, _ []Bar) { s.above, s.rangeHi = nil, 103 }, false, 0, 0},
		{"discount of two opens holds (session, 1H, 15m opens above entry)", func(_ *sideSetup, r *TradeRules, _ []Bar) {
			r.NeedOpens2 = true
		}, true, 106, 100.75},
		{"entry above the opens is not discount", func(s *sideSetup, r *TradeRules, m1 []Bar) {
			r.NeedOpens2, s.refOpen = true, 0
			m1[0].O = 100 // giá mở nến 1H / 15m
		}, false, 0, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			m1 := trendSetup()
			s, r := trendSide(m1), trendRules()
			c.edit(&s, &r, m1)
			e, ok := findLong(s, r)
			require.Equal(t, c.ok, ok)
			if ok {
				require.Equal(t, 8, e.i)
				require.Equal(t, "swing 1m", e.level.Name)
				require.Equal(t, c.target, e.target)
				require.InDelta(t, c.stop, e.stop, 1e-9)
			}
		})
	}
}

func TestTargetEQAndNotAgainst(t *testing.T) {
	m1, _ := longSetup(false) // vào 104, stop 98.75
	s := setupFor(m1)
	r := DefaultTradeRules()
	r.TargetEQ = true

	_, ok := findLong(s, r)
	require.False(t, ok, "no range")
	s.hasRange, s.rangeLo, s.rangeHi = true, 98, 120
	e, ok := findLong(s, r)
	require.True(t, ok)
	require.Equal(t, 109.0, e.target)
	s.rangeHi = 106 // EQ 102 nằm dưới giá vào
	_, ok = findLong(s, r)
	require.False(t, ok)

	s.rangeHi = 120
	r.NeedNotAgainst, s.trend = true, Down
	_, ok = findLong(s, r)
	require.False(t, ok, "1H trend against the trade")
	s.trend = Neutral
	_, ok = findLong(s, r)
	require.True(t, ok, "neutral trend is not against")
}
