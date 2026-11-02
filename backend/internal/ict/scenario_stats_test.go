package ict

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestScenarioTally(t *testing.T) {
	var tl ScenarioTally
	tl.Add(ScenarioOutcome{})            // không quét
	tl.Add(ScenarioOutcome{Swept: true}) // quét nhưng không có IFVG
	for i := 0; i < 4; i++ {
		tl.Add(ScenarioOutcome{Swept: true, Entered: true, Result: Win, R: 3})
	}
	for i := 0; i < 6; i++ {
		tl.Add(ScenarioOutcome{Swept: true, Entered: true, Result: Loss, R: -1})
	}
	require.Equal(t, 12, tl.Count)
	require.Equal(t, 11, tl.Swept)
	require.Equal(t, 10, tl.Entered)
	require.InDelta(t, 0.4, tl.WinRate(), 1e-9)
	require.InDelta(t, 0.6, tl.AvgR(), 1e-9)
	require.Equal(t, "thắng 40%, TB +0.60R (10 lệnh)", tl.Short())

	small := ScenarioTally{Entered: 6}
	require.Equal(t, "chưa đủ mẫu (6 lệnh)", small.Short())
}

// prepared dựng PreparedSession bằng tay từ nến của amdSetup (giờ mở phiên = nến 80).
func preparedFrom(m1 []Bar) *PreparedSession {
	long := sideSetup{m1: m1, start: 80, end: len(m1), esLiq: map[string]Level{}}
	short := sideSetup{m1: mirrorBars(m1), start: 80, end: len(m1), esLiq: map[string]Level{}}
	return &PreparedSession{m1: m1, long: long, short: short}
}

func TestSimulateScenario(t *testing.T) {
	m1 := amdSetup(nyTime(2026, 3, 3, 9, 0), false)
	// nến sau IFVG chạy lên 106: chạm mục tiêu 105.8
	m1 = append(m1, Bar{T: m1[len(m1)-1].T + 60, O: 103.6, H: 106, L: 103.5, C: 105.9})
	p := preparedFrom(m1)
	sc := Scenario{Dir: Up, Sweep: Level{Name: "Asia Low", P: 104.5}, Target: Level{Name: "London High", P: 105.8, High: true}}

	o := p.SimulateScenario(sc, ScenarioRules())
	require.True(t, o.Swept)
	require.True(t, o.Entered)
	require.Equal(t, Win, o.Result)
	require.InDelta(t, (105.8-104.5)/(104.5-100.75), o.R, 1e-9)

	// kịch bản có FVG không nằm dưới cực trị thao túng: không vào lệnh
	sc.FVG = &FVG{TF: Timeframes[2], Bull: true, Bottom: 90, Top: 95}
	o = p.SimulateScenario(sc, ScenarioRules())
	require.True(t, o.Swept)
	require.False(t, o.Entered)

	// mức quét không bị chạm trong phiên
	o = p.SimulateScenario(Scenario{Dir: Up, Sweep: Level{P: 90}, Target: Level{P: 110}}, ScenarioRules())
	require.False(t, o.Swept)
	require.False(t, o.Entered)

	// SHORT: lật dấu — đỉnh 106 không bị quét trong data này
	o = p.SimulateScenario(Scenario{Dir: Down, Sweep: Level{P: 107, High: true}, Target: Level{P: 100}}, ScenarioRules())
	require.False(t, o.Swept)
}

func TestRenderOpenWithStats(t *testing.T) {
	n := NoticesOn(nyTime(2026, 11, 3, 12, 0))[0]
	b := Brief{Notice: n, Price: 100, PriceT: n.At.Add(-11 * time.Minute).Unix(),
		Long:     &Scenario{Dir: Up, Sweep: Level{Name: "Asia Low", P: 95}, Target: Level{Name: "PD High", P: 110, High: true}},
		LongStat: &ScenarioTally{Entered: 20, Win: 9, SumR: 4},
	}
	out := RenderOpen(b)
	require.Contains(t, out, "→ LONG về 110 PDH · lịch sử thắng 45%, TB +0.20R (20 lệnh)")
	require.Contains(t, out, "chưa trừ phí")
}

func TestSlotForMatchesBiasSlots(t *testing.T) {
	ns := NoticesOn(nyTime(2026, 11, 3, 12, 0))
	slots := BiasSlots(nyTime(2026, 11, 3, 0, 0), nyTime(2026, 11, 4, 0, 0))
	require.Len(t, slots, 2)
	require.Equal(t, SlotFor(ns[0]), slots[0])
	require.Equal(t, SlotFor(ns[3]), slots[1])
	require.Equal(t, "16:00", time.Unix(slots[0].Horizon, 0).In(NY).Format("15:04"))
	require.Equal(t, "05:00", time.Unix(slots[1].Horizon, 0).In(NY).Format("15:04"))
	require.Equal(t, ns[3], noticeAt(slots[1]))
}

func TestBuildScenarioStatsOnRandomWalk(t *testing.T) {
	start := nyTime(2026, 3, 1, 18, 0)
	nq := NewChart(walk(start, 12*1440, 21, 20000))
	es := NewChart(walk(start, 12*1440, 22, 6000))
	stats := BuildScenarioStats(nq, es, nyTime(2026, 3, 4, 0, 0), nyTime(2026, 3, 12, 0, 0), DataDelay, DefaultOptions())
	require.NotEmpty(t, stats)
	for k, tl := range stats {
		require.Contains(t, []string{"Asia", "NY AM"}, k.Session)
		require.LessOrEqual(t, tl.Entered, tl.Swept)
		require.LessOrEqual(t, tl.Swept, tl.Count)
		require.Equal(t, tl.Entered, tl.Win+tl.Loss+tl.Open)
	}
}
