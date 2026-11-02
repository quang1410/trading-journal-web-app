package ict

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// longSetup dựng một chân thao túng giảm: FVG giảm 1m ở nến 5 [102, 103.5], nến 6 quét Asia Low 100.
// withRaid: sau cú quét có swing đáy (nến 6) bị đáy thấp hơn quét (nến 9) trước nến IFVG.
func longSetup(withRaid bool) ([]Bar, int) {
	start := nyTime(2026, 3, 3, 10, 0)
	ohlc := [][4]float64{
		{105, 106, 104, 105},
		{105, 105.5, 104, 104.5},
		{104.5, 104.6, 103, 103.2},
		{104, 104.5, 103.5, 103.8},
		{103.8, 103.8, 101, 101.2},
		{101.2, 102, 100.5, 100.8}, // FVG giảm: đỉnh 102 < đáy nến 3 là 103.5
		{100.8, 101, 99, 99.5},     // quét Asia Low 100
		{99.5, 100.5, 99.3, 100.3},
	}
	if withRaid {
		ohlc = append(ohlc,
			[4]float64{100.3, 100.6, 99.8, 100.0},
			[4]float64{100, 100.2, 98.5, 98.8},   // quét swing đáy 99 của nến 6: stop raid
			[4]float64{98.8, 104.2, 98.7, 104.0}, // IFVG
		)
	} else {
		ohlc = append(ohlc, [4]float64{100.3, 104.2, 100.2, 104.0}) // IFVG
	}
	return seq(start, 1, ohlc), len(ohlc) - 1
}

func setupFor(m1 []Bar) sideSetup {
	return sideSetup{
		m1: m1, start: 3, end: len(m1),
		liq:   []Level{{Name: "Asia Low", P: 100}},
		fvgs:  []FVG{{Bull: true, Bottom: 98, Top: 101}},
		esLiq: map[string]Level{},
		dolOK: true,
	}
}

func TestFindLongIFVGEntry(t *testing.T) {
	m1, trigger := longSetup(false)
	e, ok := findLong(setupFor(m1), DefaultTradeRules())
	require.True(t, ok)
	require.Equal(t, trigger, e.i)
	require.Equal(t, 104.0, e.price)
	require.Equal(t, 98.75, e.stop, "stop = manipulation low 99 - 0.25")
	require.Equal(t, "Asia Low", e.level.Name)
	require.False(t, e.raid)
	require.True(t, e.discount, "entry 104 is below the 10:00 hourly open 105")
}

func TestFindLongFilters(t *testing.T) {
	plain, _ := longSetup(false)
	raided, raidTrigger := longSetup(true)
	cases := []struct {
		name  string
		m1    []Bar
		edit  func(s *sideSetup, r *TradeRules)
		ok    bool
		raid  bool
		trigI int
	}{
		{"no HTF FVG under the manipulation low", plain, func(s *sideSetup, r *TradeRules) {
			s.fvgs = []FVG{{Bull: true, Bottom: 90, Top: 95}}
		}, false, false, 0},
		{"HTF FVG not required", plain, func(s *sideSetup, r *TradeRules) {
			s.fvgs, r.NeedHTFFVG = nil, false
		}, true, false, 8},
		{"stop raid required but the leg is one move", plain, func(s *sideSetup, r *TradeRules) { r.NeedStopRaid = true }, false, false, 0},
		{"stop raid after the sweep", raided, func(s *sideSetup, r *TradeRules) { r.NeedStopRaid = true }, true, true, raidTrigger},
		{"DOL against the trade", plain, func(s *sideSetup, r *TradeRules) { s.dolOK, r.NeedDOL = false, true }, false, false, 0},
		{"risk below minimum", plain, func(s *sideSetup, r *TradeRules) { r.MinRisk = 10 }, false, false, 0},
		{"no liquidity swept", plain, func(s *sideSetup, r *TradeRules) { s.liq = []Level{{Name: "PD Low", P: 90}} }, false, false, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s, r := setupFor(c.m1), DefaultTradeRules()
			c.edit(&s, &r)
			e, ok := findLong(s, r)
			require.Equal(t, c.ok, ok)
			if ok {
				require.Equal(t, c.trigI, e.i)
				require.Equal(t, c.raid, e.raid)
			}
		})
	}
}

func TestFindLongSMT(t *testing.T) {
	m1, _ := longSetup(false)
	esBars := func(low float64) []Bar {
		out := make([]Bar, len(m1))
		for i, b := range m1 {
			out[i] = Bar{T: b.T, O: 60, H: 61, L: 59, C: 60}
		}
		out[6].L = low
		return out
	}
	for _, c := range []struct {
		name  string
		esLow float64
		smt   bool
	}{
		{"ES holds its Asia Low: SMT", 55, true},
		{"ES also sweeps: no SMT", 49, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			s, r := setupFor(m1), DefaultTradeRules()
			s.es = esBars(c.esLow)
			s.esLiq = map[string]Level{"Asia Low": {Name: "Asia Low", P: 50}}
			r.NeedSMT = true
			e, ok := findLong(s, r)
			require.Equal(t, c.smt, ok)
			if ok {
				require.True(t, e.smt)
			}
		})
	}
}

func TestShortIsMirrorOfLong(t *testing.T) {
	// Lệnh SHORT chạy findLong trên dữ liệu lật dấu. Một kịch bản short thật (lật dấu kịch bản long)
	// sau khi SimulateSession lật lại phải trùng khớp dữ liệu long ban đầu, nên tìm ra cùng nến vào.
	m1, trigger := longSetup(true)
	s := setupFor(m1)
	realShortBars, realBSL, realBearFVG := mirrorBars(m1), mirrorLevels(s.liq), mirrorFVGs(s.fvgs)
	require.True(t, realBSL[0].High)
	require.Equal(t, -100.0, realBSL[0].P)
	require.False(t, realBearFVG[0].Bull)
	require.Equal(t, -101.0, realBearFVG[0].Bottom)

	short := sideSetup{m1: mirrorBars(realShortBars), start: s.start, end: s.end,
		liq: mirrorLevels(realBSL), fvgs: mirrorFVGs(realBearFVG), esLiq: map[string]Level{}, dolOK: true}
	require.Equal(t, s.m1, short.m1)
	require.Equal(t, s.liq, short.liq)
	require.Equal(t, s.fvgs, short.fvgs)
	e, ok := findLong(short, DefaultTradeRules())
	require.True(t, ok)
	require.Equal(t, trigger, e.i)
}

func TestFollowTrade(t *testing.T) {
	start := nyTime(2026, 3, 3, 10, 0)
	cases := []struct {
		name string
		dir  Dir
		bars [][4]float64
		res  Result
		exit float64
	}{
		{"long hits target", Up, [][4]float64{{100, 103, 99, 102}, {102, 111, 101, 110}}, Win, 110},
		{"long hits stop", Up, [][4]float64{{100, 101, 94, 95}}, Loss, 95},
		{"stop and target in one bar count as a loss", Up, [][4]float64{{100, 111, 94, 100}}, Loss, 95},
		{"long times out at last close", Up, [][4]float64{{100, 101, 99, 100}, {100, 104, 99, 103}}, Open, 103},
		{"short hits target", Down, [][4]float64{{100, 101, 89, 90}}, Win, 90},
		{"short hits stop", Down, [][4]float64{{100, 106, 99, 104}}, Loss, 105},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			stop, target := 95.0, 110.0
			if c.dir == Down {
				stop, target = 105, 90
			}
			_, exit, res := followTrade(seq(start, 1, c.bars), c.dir, stop, target)
			require.Equal(t, c.res, res)
			require.Equal(t, c.exit, exit)
		})
	}
}

func TestSimulateSessionOnRandomWalk(t *testing.T) {
	start := nyTime(2026, 3, 2, 18, 0)
	nq := NewChart(walk(start, 8*1440, 7, 20000))
	es := NewChart(walk(start, 8*1440, 8, 6000))
	slots := BiasSlots(nyTime(2026, 3, 5, 0, 0), nyTime(2026, 3, 9, 0, 0))
	r := DefaultTradeRules()
	r.NeedHTFFVG = false
	for _, s := range slots {
		tr := SimulateSession(nq, es, s, r, DefaultOptions())
		if tr == nil {
			continue
		}
		require.GreaterOrEqual(t, tr.EntryT, s.Open)
		require.Less(t, tr.EntryT, s.WinEnd+60)
		require.Greater(t, tr.Risk(), 0.0)
		require.InDelta(t, tr.Entry+2*(tr.Entry-tr.Stop), tr.Target, 1e-9)
		require.Contains(t, []Result{Win, Loss, Open}, tr.Result)
		if tr.Result == Win {
			require.InDelta(t, 2.0, tr.R, 1e-9)
		}
		if tr.Result == Loss {
			require.InDelta(t, -1.0, tr.R, 1e-9)
		}
		require.True(t, time.Unix(tr.EntryT, 0).After(time.Unix(s.Open, 0)) || tr.EntryT == s.Open)
	}
}

// amdSetup: 80 nến tích lũy chặt quanh 105–106, rồi nến 80 phá đáy tích lũy 105, chân giảm để lại
// FVG giảm [103.5, 104] ở nến 82, cực trị 101 ở nến 83, nến 84 là IFVG. dip: thêm một đáy 99.5 chưa
// bị quét ở nến 45 (nằm ngay dưới stop 100.75). start là giờ mở nến đầu.
func amdSetup(start time.Time, dip bool) []Bar {
	ohlc := make([][4]float64, 0, 90)
	for i := 0; i < 80; i++ {
		ohlc = append(ohlc, [4]float64{105.5, 106, 105, 105.5})
	}
	if dip {
		ohlc[45] = [4]float64{105.5, 106, 99.5, 105.5}
	}
	ohlc = append(ohlc,
		[4]float64{105.5, 105.6, 104, 104.2},
		[4]float64{104.2, 104.3, 102, 102.2},
		[4]float64{102.2, 103.5, 101.5, 101.8},
		[4]float64{101.8, 102, 101, 101.5},
		[4]float64{101.5, 104.6, 101.4, 104.5},
		[4]float64{104.5, 104.8, 103.2, 103.6},
	)
	return seq(start, 1, ohlc)
}

func amdSide(m1 []Bar) sideSetup {
	return sideSetup{m1: m1, start: 80, end: len(m1), esLiq: map[string]Level{},
		fvgs: []FVG{{Bull: true, Bottom: 100, Top: 102}}, dolOK: true}
}

func TestAccumulation(t *testing.T) {
	m1 := amdSetup(nyTime(2026, 3, 3, 9, 0), false)
	lo, hi, ok := accumulation(m1, 80, DefaultTradeRules())
	require.True(t, ok)
	require.Equal(t, 105.0, lo)
	require.Equal(t, 106.0, hi)
	_, _, ok = accumulation(m1, 10, DefaultTradeRules())
	require.False(t, ok, "not enough history")
	wide := amdSetup(nyTime(2026, 3, 3, 9, 0), false)
	wide[70] = Bar{T: wide[70].T, O: 105.5, H: 112, L: 105, C: 105.5}
	_, _, ok = accumulation(wide, 80, DefaultTradeRules())
	require.False(t, ok, "a 7-point spike inside the window is not a tight range")
}

func TestFindLongAMDAndAPlusFilters(t *testing.T) {
	cases := []struct {
		name   string
		start  time.Time
		dip    bool
		edit   func(r *TradeRules)
		ok     bool
		target float64
		clean  bool
	}{
		{"A+ entry after the false break of accumulation", nyTime(2026, 3, 3, 9, 0), false,
			func(r *TradeRules) {}, true, 104.5 + 2*(104.5-100.75), true},
		{"target at the accumulation high", nyTime(2026, 3, 3, 9, 0), false,
			func(r *TradeRules) { r.TargetAccum = true }, true, 106, true},
		{"PO3: extreme 12 minutes into the 15m candle is too late", nyTime(2026, 3, 3, 9, 4), false,
			func(r *TradeRules) {}, false, 0, false},
		{"PO3 not required", nyTime(2026, 3, 3, 9, 4), false,
			func(r *TradeRules) { r.NeedPO3Open = false }, true, 112, true},
		{"open liquidity just under the stop is not clean", nyTime(2026, 3, 3, 9, 0), true,
			func(r *TradeRules) {}, true, 112, false},
		{"clean stop required", nyTime(2026, 3, 3, 9, 0), true,
			func(r *TradeRules) { r.NeedCleanStop = true }, false, 0, false},
		{"IFVG wick too long for a strict rule", nyTime(2026, 3, 3, 9, 0), false,
			func(r *TradeRules) { r.MaxWick = 0.01 }, false, 0, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r := APlusRules()
			r.NeedTrueManip = false // không có ES trong test này
			c.edit(&r)
			e, ok := findLong(amdSide(amdSetup(c.start, c.dip)), r)
			require.Equal(t, c.ok, ok)
			if !ok {
				return
			}
			require.Equal(t, 84, e.i)
			require.Equal(t, "Đáy tích lũy", e.level.Name)
			require.Equal(t, 100.75, e.stop)
			require.InDelta(t, c.target, e.target, 1e-9)
			require.Equal(t, c.clean, e.clean)
			require.Equal(t, 104.0, e.ifvgTop)
		})
	}
}

func TestFindLongLimitEntryAtIFVG(t *testing.T) {
	m1 := amdSetup(nyTime(2026, 3, 3, 9, 0), false)
	r := APlusRules()
	r.NeedTrueManip, r.LimitEntry = false, true
	e, ok := findLong(amdSide(m1), r)
	require.True(t, ok)
	require.Equal(t, 85, e.fillI, "the next bar dips to the IFVG top 104")
	require.Equal(t, 104.0, e.price)
	require.InDelta(t, 104+2*(104-100.75), e.target, 1e-9)

	// giá chạy thẳng không quay lại mép IFVG: lệnh chờ không khớp
	m1[85] = Bar{T: m1[85].T, O: 104.5, H: 106, L: 104.4, C: 105.8}
	_, ok = findLong(amdSide(m1), r)
	require.False(t, ok)
}

func TestTrueManipAndAccumulationSMT(t *testing.T) {
	m1 := amdSetup(nyTime(2026, 3, 3, 9, 0), false)
	es := func(breakLow bool) []Bar {
		out := make([]Bar, len(m1))
		for i, b := range m1 {
			out[i] = Bar{T: b.T, O: 50.5, H: 51, L: 50, C: 50.5}
		}
		if breakLow {
			out[82].L = 49
		}
		return out
	}
	cases := []struct {
		name     string
		breakLow bool
		esFVG    []FVG
		manip    bool
		smt      bool
	}{
		{"ES holds its accumulation low: SMT, counts as true manipulation", false, nil, true, true},
		{"ES breaks too, no FVG under it: no true manipulation", true, nil, false, false},
		{"ES breaks into its own HTF FVG: true manipulation", true, []FVG{{Bull: true, Bottom: 48, Top: 49.5}}, true, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s := amdSide(m1)
			s.es, s.esFVGs = es(c.breakLow), c.esFVG
			r := APlusRules()
			r.NeedTrueManip = false
			e, ok := findLong(s, r)
			require.True(t, ok)
			require.Equal(t, c.smt, e.smt)
			require.Equal(t, c.manip, e.trueManip)

			r.NeedTrueManip = true
			_, ok = findLong(s, r)
			require.Equal(t, c.manip, ok)
		})
	}
}

func TestIFVGSpeed(t *testing.T) {
	m1, _ := longSetup(false)
	// nến 7 chạm vào FVG giảm [102, 103.5] nhưng không phá: nến IFVG tới sau 1 nến
	m1[7] = Bar{T: m1[7].T, O: 99.5, H: 102.5, L: 99.3, C: 100.3}
	r := DefaultTradeRules()
	r.MaxInvertBars = 1
	_, ok := findLong(setupFor(m1), r)
	require.True(t, ok)
	r.MaxInvertBars = 0
	_, ok = findLong(setupFor(m1), r)
	require.False(t, ok, "first contact did not invert the gap")
}
