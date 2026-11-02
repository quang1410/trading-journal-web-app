package ict

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

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
		Held:   []FVG{cond},
		Broken: []FVG{{TF: Timeframes[2], Bottom: 21400, Top: 21415}},
		Step1:  Up, CameLevel: &Level{Name: "Asia Low", P: 21250},
	}
	want := `NQ · Trước phiên NY AM · Thứ Ba 03/11/2026
Giá 21 345.25 (nến 09:14 NY · data trễ ~10 phút)

KHUNG THAM CHIẾU 30m (15m chưa có range hợp lệ)
Cấu trúc 30m: ↑ (HH + HL)
SMT với ES: 15m tăng lúc 08:45 (NQ đáy thấp hơn, ES đáy cao hơn)

THANH KHOẢN
BSL  London High 21 380.00 · PDH 21 420.00
SSL  London Low 21 280.00 · Asia Low 21 250.00 (đã quét 03:12)
Midnight Open 21 300.00 → giá đang ở Premium

FVG (30m → 4H)
Giữ 24h: 1H tăng 21 290.00–21 310.00
Phá 24h: 1H giảm 21 400.00–21 415.00

RANGE 30m: LR vs HR
Đỉnh 21 420.00 (LR)
Đáy 21 300.00 (HR: quét · chạm FVG khung lớn · displacement)

KỊCH BẢN (điều kiện FVG 1H tăng 21 290.00–21 310.00)
A. Tôn trọng → về BSL 21 420.00
B. Nến 1H đóng dưới 21 290.00 → về SSL 21 300.00

DOL tiềm năng theo luật: BSL (vừa quét Asia Low 21 250.00) — chưa kiểm chứng, backtest ~50%
Checklist A+: tích lũy → quét giả → FVG ≥15m (ES cũng vào FVG / SMT) → PO3 nến 15m → IFVG thân đầy · stop raid · stop sạch`
	require.Equal(t, want, RenderOpen(b))
}

func TestRenderOpenWithoutRangeOrES(t *testing.T) {
	n := NoticesOn(nyTime(2026, 11, 3, 12, 0))[3] // Asia
	out := RenderOpen(Brief{Notice: n, Price: 100, PriceT: n.At.Add(-11 * time.Minute).Unix()})
	require.Contains(t, out, "Trước phiên Asia")
	require.Contains(t, out, "chưa có range hợp lệ từ 15m tới Daily")
	require.Contains(t, out, "SMT với ES: không có data ES")
	require.NotContains(t, out, "KỊCH BẢN")
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
