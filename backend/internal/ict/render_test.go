package ict

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestLevelLineMergesEqualPricesAndSkipsSwept(t *testing.T) {
	ls := []Level{{Name: "PD Low", P: 29033}, {Name: "NY PM Low", P: 29033}, {Name: "NY AM Low", P: 29250, Swept: 1}, {Name: "Asia Low", P: 29000}}
	require.Equal(t, "29 033 PDL = NY PM L · 29 000 Asia L", levelLine(ls))
	require.Equal(t, "đã quét hết", levelLine([]Level{{Name: "London Low", P: 1, Swept: 1}}))
	require.Equal(t, "—", levelLine(nil))
}

func TestFmtShort(t *testing.T) {
	cases := map[float64]string{29471: "29 471", 29568.5: "29 568.5", 29446.25: "29 446.25"}
	for in, want := range cases {
		require.Equal(t, want, fmtShort(in))
	}
}

func TestFmtPrice(t *testing.T) {
	cases := map[float64]string{21345.25: "21 345.25", 999.5: "999.50", 1000: "1 000.00", 123456.789: "123 456.79", -5432.1: "-5 432.10"}
	for in, want := range cases {
		require.Equal(t, want, fmtPrice(in))
	}
}

func TestRenderOpenGolden(t *testing.T) {
	n := NoticesOn(nyTime(2026, 11, 3, 12, 0))[0] // NY AM thứ Ba
	tf30 := Timeframes[1]
	cond := FVG{TF: Timeframes[2], Bull: true, Bottom: 21290, Top: 21310}
	b := Brief{
		Notice: n, Price: 21345.25, PriceT: nyTime(2026, 11, 3, 9, 14).Unix(),
		Range: &Range{TF: tf30,
			High: Side{Swing: Swing{P: 21420, High: true}},
			Low:  Side{Swing: Swing{P: 21300}, Swept: true, Tapped: true, Displaced: true},
			Dir:  Up, Cond: &cond},
		Skipped: []string{"15m"}, Trend: Up,
		HasES: true, SMT: Up, SMTTF: Timeframes[0], SMTAt: nyTime(2026, 11, 3, 8, 45).Unix(),
		BSL:         []Level{{Name: "London High", P: 21380, High: true}, {Name: "PD High", P: 21420, High: true}},
		SSL:         []Level{{Name: "London Low", P: 21280}, {Name: "Asia Low", P: 21250, Swept: nyTime(2026, 11, 3, 3, 12).Unix()}},
		RefOpenName: "Midnight Open", RefOpen: 21300, HasRefOpen: true,
		Held:       []FVG{cond},
		FreshAbove: []FVG{{TF: Timeframes[2], Bottom: 21400, Top: 21415}},
		Step1:      Up, CameLevel: &Level{Name: "Asia Low", P: 21250},
	}
	want := `NQ · Trước phiên NY AM · T3 03/11
Giá 21 345.25 · Premium (Midnight Open 21 300)
30m ↑ · SMT ES: tăng 15m 08:45
Range 21 300–21 420 · LR/HR
→ Giữ FVG 21 290–21 310 (1H) → BSL 21 420 · đóng dưới 21 290 → SSL 21 300
BSL 21 380 London H · 21 420 PDH
SSL 21 280 London L
FVG mới ↓ 21 400–21 415 (1H)`
	require.Equal(t, want, RenderOpen(b))
}

func TestRenderOpenWithoutRangeOrES(t *testing.T) {
	n := NoticesOn(nyTime(2026, 11, 3, 12, 0))[3] // Asia
	out := RenderOpen(Brief{Notice: n, Price: 100, PriceT: n.At.Add(-11 * time.Minute).Unix()})
	require.Contains(t, out, "Trước phiên Asia")
	require.Contains(t, out, "Chưa có range 15m → D · SMT ES: không có data ES")
	require.NotContains(t, out, "Range")
}

func TestNewBriefOnRandomWalk(t *testing.T) {
	start := nyTime(2026, 3, 2, 18, 0)
	nq := NewChart(walk(start, 6*1440, 11, 20000))
	es := NewChart(walk(start, 6*1440, 12, 6000))
	for _, n := range []Notice{NoticesOn(nyTime(2026, 3, 6, 12, 0))[0], NoticesOn(nyTime(2026, 3, 5, 12, 0))[3]} {
		b := NewBrief(nq, es, n, DataDelay, DefaultOptions())
		require.LessOrEqual(t, b.PriceT+60, n.At.Add(-DataDelay).Unix(), "no bar after the cutoff")
		for _, l := range append(append([]Level{}, b.BSL...), b.SSL...) {
			require.True(t, hasAnyPrefix(l.Name, sessionLevelPrefixes[n.Session]), "%s level in %s brief", l.Name, n.Session)
		}
		for _, l := range b.BSL {
			require.True(t, l.High)
		}
		if b.Range != nil {
			for _, f := range append(append(b.Held, b.Broken...), append(b.FreshAbove, b.FreshBelow...)...) {
				require.GreaterOrEqual(t, f.TF.Rank, b.Range.TF.Rank, "FVG below the reference timeframe")
			}
		}
		require.True(t, b.HasRefOpen)
		msg := RenderOpen(b)
		require.Less(t, len(msg), 4096)
		require.False(t, strings.Contains(msg, "%!"), "format error in %q", msg)
	}
}
