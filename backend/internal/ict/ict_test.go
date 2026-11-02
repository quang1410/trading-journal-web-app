package ict

import (
	"math"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// bar dựng nến mở lúc t (giờ New York) với OHLC cho trước.
func bar(t time.Time, o, h, l, c float64) Bar { return Bar{T: t.Unix(), O: o, H: h, L: l, C: c} }

// seq dựng chuỗi nến khung tf phút bắt đầu từ start, mỗi phần tử là {o, h, l, c}.
func seq(start time.Time, tf int, ohlc [][4]float64) []Bar {
	out := make([]Bar, len(ohlc))
	for i, v := range ohlc {
		out[i] = bar(start.Add(time.Duration(i*tf)*time.Minute), v[0], v[1], v[2], v[3])
	}
	return out
}

func TestResampleAnchorsAt1800NewYork(t *testing.T) {
	cases := []struct {
		name  string
		at    time.Time
		tf    int
		start time.Time
	}{
		{"4h bar opens at 18:00", nyTime(2026, 3, 2, 19, 7), 240, nyTime(2026, 3, 2, 18, 0)},
		{"4h bar after midnight opens at 22:00", nyTime(2026, 3, 3, 1, 30), 240, nyTime(2026, 3, 2, 22, 0)},
		{"8h bar opens at 10:00", nyTime(2026, 3, 3, 11, 0), 480, nyTime(2026, 3, 3, 10, 0)},
		{"12h bar opens at 06:00", nyTime(2026, 3, 3, 9, 30), 720, nyTime(2026, 3, 3, 6, 0)},
		{"daily bar opens at 18:00 the day before", nyTime(2026, 3, 3, 9, 30), 1440, nyTime(2026, 3, 2, 18, 0)},
		{"summer time (EDT) keeps New York anchor", nyTime(2026, 7, 7, 9, 45), 1440, nyTime(2026, 7, 6, 18, 0)},
		{"15m bar", nyTime(2026, 7, 7, 9, 44), 15, nyTime(2026, 7, 7, 9, 30)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			m1 := []Bar{bar(c.at, 1, 2, 0.5, 1.5)}
			got := resample(m1, []int{c.at.Hour()*60 + c.at.Minute()}, c.tf)
			require.Len(t, got, 1)
			require.Equal(t, c.start.Unix(), got[0].T)
		})
	}
}

func TestNewChartAggregatesOHLC(t *testing.T) {
	start := nyTime(2026, 3, 3, 9, 30)
	m1 := seq(start, 1, [][4]float64{{10, 12, 9, 11}, {11, 15, 10, 14}, {14, 14, 8, 9}})
	c := NewChart(m1)
	got := c.Bars[0] // 15m
	require.Len(t, got, 1)
	require.Equal(t, Bar{T: start.Unix(), O: 10, H: 15, L: 8, C: 9}, got[0])
}

func TestClosedByHidesFormingBar(t *testing.T) {
	start := nyTime(2026, 3, 3, 9, 0)
	bars := seq(start, 15, [][4]float64{{1, 1, 1, 1}, {1, 1, 1, 1}, {1, 1, 1, 1}})
	require.Len(t, closedBy(bars, 900, nyTime(2026, 3, 3, 9, 30).Unix()), 2)
	require.Len(t, closedBy(bars, 900, nyTime(2026, 3, 3, 9, 29).Unix()), 1)
}

func TestSwingsAndTrend(t *testing.T) {
	start := nyTime(2026, 3, 3, 0, 0)
	// đáy 1 → đỉnh 1 → đáy 2 (cao hơn) → đỉnh 2 (cao hơn) → kéo xuống xác nhận
	h := []float64{5, 4, 3, 4, 5, 8, 6, 5, 4, 5, 6, 10, 7, 6, 5}
	l := []float64{4, 3, 2, 3, 4, 7, 5, 4, 3, 4, 5, 9, 6, 5, 4}
	ohlc := make([][4]float64, len(h))
	for i := range h {
		ohlc[i] = [4]float64{l[i], h[i], l[i], h[i]}
	}
	bars := seq(start, 60, ohlc)
	highs, lows := Swings(bars, 2)
	require.Equal(t, []float64{8, 10}, prices(highs))
	require.Equal(t, []float64{2, 3}, prices(lows))
	require.Equal(t, Up, Trend(highs, lows))
	require.Equal(t, Neutral, Trend(highs[:1], lows))

	// đảo dấu giá: cấu trúc giảm
	neg := make([]Bar, len(bars))
	for i, b := range bars {
		neg[i] = Bar{T: b.T, O: -b.O, H: -b.L, L: -b.H, C: -b.C}
	}
	nh, nl := Swings(neg, 2)
	require.Equal(t, Down, Trend(nh, nl))
}

func TestSwingsRejectsLeftTie(t *testing.T) {
	start := nyTime(2026, 3, 3, 0, 0)
	bars := seq(start, 60, [][4]float64{{1, 1, 0, 1}, {1, 1, 0, 1}, {1, 5, 0, 1}, {1, 5, 0, 1}, {1, 1, 0, 1}, {1, 1, 0, 1}, {1, 1, 0, 1}})
	highs, _ := Swings(bars, 2)
	require.Len(t, highs, 1)
	require.Equal(t, 2, highs[0].I, "the first of two equal highs is the pivot")
}

func prices(sw []Swing) []float64 {
	out := make([]float64, len(sw))
	for i, s := range sw {
		out[i] = s.P
	}
	return out
}

func TestFindFVGsStates(t *testing.T) {
	tf := Timeframes[0]
	start := nyTime(2026, 3, 3, 9, 30)
	cases := []struct {
		name      string
		after     [][4]float64
		touched   bool
		broken    bool
		respected bool
	}{
		{"untouched", [][4]float64{{20, 22, 16, 21}}, false, false, false},
		{"respected: wick into the gap, close stays above", [][4]float64{{20, 20, 13, 18}}, true, false, true},
		{"broken: body closes below the gap", [][4]float64{{20, 20, 8, 9}}, true, true, false},
		{"wick below the gap without close is still respected", [][4]float64{{20, 20, 8, 12}}, true, false, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// nến 1 đỉnh 10, nến 3 đáy 15 → FVG tăng [10, 15]
			ohlc := append([][4]float64{{9, 10, 8, 10}, {10, 16, 10, 16}, {16, 18, 15, 17}}, c.after...)
			fvgs := FindFVGs(seq(start, 15, ohlc), tf)
			require.Len(t, fvgs, 1)
			f := fvgs[0]
			require.True(t, f.Bull)
			require.Equal(t, 10.0, f.Bottom)
			require.Equal(t, 15.0, f.Top)
			require.Equal(t, c.touched, f.Touched != 0)
			require.Equal(t, c.broken, f.Broken != 0)
			require.Equal(t, c.respected, f.Respected())
		})
	}
}

func TestFindFVGsBearish(t *testing.T) {
	start := nyTime(2026, 3, 3, 9, 30)
	fvgs := FindFVGs(seq(start, 15, [][4]float64{{20, 21, 19, 19}, {19, 19, 14, 14}, {14, 16, 13, 13}, {13, 30, 13, 25}}), Timeframes[0])
	require.Len(t, fvgs, 1)
	require.False(t, fvgs[0].Bull)
	require.Equal(t, 16.0, fvgs[0].Bottom)
	require.Equal(t, 19.0, fvgs[0].Top)
	require.NotZero(t, fvgs[0].Broken)
}

func TestFVGLeanWeightsAndWindow(t *testing.T) {
	tf15, tf4h := Timeframes[0], Timeframes[4]
	fvgs := []FVG{
		{TF: tf15, Bull: true, Touched: 100},              // tôn trọng FVG tăng: +1
		{TF: tf4h, Bull: true, Touched: 100, Broken: 200}, // phá FVG tăng 4H: giảm 5
		{TF: tf15, Bull: false, Touched: 10},              // ngoài cửa sổ: bỏ
	}
	bull, bear := fvgLean(fvgs, 50)
	require.Equal(t, 1.0, bull)
	require.Equal(t, 5.0, bear)
}

func TestSessionLevelsAndLastSweep(t *testing.T) {
	// ngày CME thứ Hai 02/03 (Chủ nhật 18:00 → thứ Hai 17:00) rồi Asia/London của thứ Ba 03/03
	var m1 []Bar
	add := func(t time.Time, h, l float64) { m1 = append(m1, bar(t, (h+l)/2, h, l, (h+l)/2)) }
	add(nyTime(2026, 3, 1, 18, 0), 100, 90) // ngày trước: PDH 100, PDL 90
	add(nyTime(2026, 3, 2, 12, 0), 98, 92)
	add(nyTime(2026, 3, 2, 20, 0), 97, 94)  // Asia 20:00–00:00: 97 / 94
	add(nyTime(2026, 3, 3, 2, 0), 99, 96)   // London: quét Asia High 97
	add(nyTime(2026, 3, 3, 6, 0), 97, 95.5) // quét London Low 96
	add(nyTime(2026, 3, 3, 7, 0), 96, 93)   // quét Asia Low 94 → gần nhất
	cutoff := nyTime(2026, 3, 3, 9, 15).Unix()

	levels := SessionLevels(m1, cutoff)
	byName := map[string]Level{}
	for _, lv := range levels {
		byName[lv.Name] = lv
	}
	require.Equal(t, 100.0, byName["PD High"].P)
	require.Equal(t, 90.0, byName["PD Low"].P)
	require.Equal(t, 97.0, byName["Asia High"].P)
	require.Equal(t, nyTime(2026, 3, 3, 2, 0).Unix(), byName["Asia High"].Swept)
	require.Equal(t, nyTime(2026, 3, 3, 7, 0).Unix(), byName["Asia Low"].Swept)
	require.Zero(t, byName["PD High"].Swept)
	_, hasNYAM := byName["NY AM High"]
	require.False(t, hasNYAM, "no NY AM bars in the data")

	dir, lv := lastSweep(levels)
	require.Equal(t, Up, dir, "swept a low last: came from SSL, DOL is BSL")
	require.Equal(t, "Asia Low", lv.Name)
}

func TestTradingDayStartSkipsWeekend(t *testing.T) {
	// thứ Hai 09:15: ngày CME bắt đầu Chủ nhật 18:00; ngày đã đóng gần nhất là thứ Sáu
	var m1 []Bar
	m1 = append(m1, bar(nyTime(2026, 2, 27, 10, 0), 50, 60, 40, 55)) // thứ Sáu
	m1 = append(m1, bar(nyTime(2026, 3, 1, 19, 0), 55, 56, 54, 55))  // Chủ nhật tối
	levels := SessionLevels(m1, nyTime(2026, 3, 2, 9, 15).Unix())
	var pdh float64
	for _, lv := range levels {
		if lv.Name == "PD High" {
			pdh = lv.P
		}
	}
	require.Equal(t, 60.0, pdh)
}

func TestBiasSlots(t *testing.T) {
	// Chủ nhật 01/03 → thứ Bảy 07/03/2026
	slots := BiasSlots(nyTime(2026, 3, 1, 0, 0), nyTime(2026, 3, 8, 0, 0))
	var asia, ny int
	for _, s := range slots {
		wd := s.Decision.Weekday()
		switch s.Session {
		case "Asia":
			asia++
			require.True(t, wd <= time.Thursday, "Asia on %s", wd)
			require.Equal(t, 18, s.Decision.Hour())
		case "NY AM":
			ny++
			require.True(t, wd >= time.Monday && wd <= time.Friday)
		}
		require.Equal(t, s.Decision.Add(-DataDelay).Unix(), s.Cutoff)
	}
	require.Equal(t, 5, asia, "Sunday to Thursday")
	require.Equal(t, 5, ny, "Monday to Friday")
}

func TestFirstHitAndScore(t *testing.T) {
	start := nyTime(2026, 3, 3, 9, 30)
	m1 := seq(start, 1, [][4]float64{{50, 55, 45, 50}, {50, 61, 49, 60}, {60, 60, 30, 31}})
	cases := []struct {
		name   string
		hi, lo float64
		want   Dir
		tie    bool
	}{
		{"high first", 60, 40, Up, false},
		{"low first", 70, 46, Down, false},
		{"both in one bar is a tie", 54, 46, Neutral, true},
		{"neither", 100, 0, Neutral, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, tie, _ := FirstHit(m1, start.Unix(), start.Add(time.Hour).Unix(), c.hi, c.lo)
			require.Equal(t, c.want, got)
			require.Equal(t, c.tie, tie)
		})
	}
	require.Equal(t, Win, Score(Up, Up, false))
	require.Equal(t, Loss, Score(Down, Up, false))
	require.Equal(t, Skip, Score(Neutral, Up, false))
	require.Equal(t, Tie, Score(Up, Neutral, true))
	require.Equal(t, Open, Score(Up, Neutral, false))
}

func TestTallyRate(t *testing.T) {
	var tl Tally
	p, _, _ := tl.Rate()
	require.True(t, math.IsNaN(p))
	for i := 0; i < 60; i++ {
		tl.Add(Win)
	}
	for i := 0; i < 40; i++ {
		tl.Add(Loss)
	}
	tl.Add(Open)
	p, lo, hi := tl.Rate()
	require.InDelta(t, 0.60, p, 1e-9)
	require.InDelta(t, 0.502, lo, 0.002) // Wilson 95%
	require.InDelta(t, 0.691, hi, 0.002)
	require.Equal(t, 1, tl.Open)
}

func TestPickRangeHRvsLR(t *testing.T) {
	// 15m: swing high cũ 110 → đáy 90 quét đáy cũ 95 rồi bật lên để lại FVG tăng (HR),
	// đỉnh 108 không quét được 110 (LR). Giá 100 ở giữa → DOL là đỉnh (LR): Up.
	tf := Timeframes[0]
	start := nyTime(2026, 3, 3, 0, 0)
	ohlc := [][4]float64{
		{100, 101, 99, 100}, {100, 104, 99, 103}, {103, 110, 102, 104}, {104, 105, 101, 102}, {102, 103, 98, 99},
		{99, 100, 95, 97}, {97, 99, 96, 98}, {98, 102, 97, 101}, {101, 103, 99, 100}, {100, 101, 94, 95},
		{95, 96, 90, 91}, {91, 93, 91, 92}, {92, 99, 92, 98}, {98, 104, 97, 103}, {103, 108, 102, 105},
		{105, 106, 101, 102}, {102, 103, 100, 101}, {101, 102, 99, 100},
	}
	bars := seq(start, tf.Min, ohlc)
	st := TFState{TF: tf, Bars: bars}
	st.Highs, st.Lows = Swings(bars, 2)
	st.FVGs = FindFVGs(bars, tf)
	// khung lớn hơn: một FVG tăng 30m bao lấy đáy 90 (đáy chạm FVG khung lớn)
	tf30 := Timeframes[1]
	big := TFState{TF: tf30, FVGs: []FVG{{TF: tf30, Bull: true, Bottom: 88, Top: 93, Formed: start.Unix()}}}
	tfs := []TFState{st, big}

	rg := pickRange(tfs, 100, DefaultOptions())
	require.NotNil(t, rg)
	require.Equal(t, "15m", rg.TF.Name)
	require.Equal(t, 108.0, rg.High.P)
	require.Equal(t, 90.0, rg.Low.P)
	require.False(t, rg.High.HR(), "failed high is LR")
	require.True(t, rg.Low.Swept && rg.Low.Tapped && rg.Low.Displaced, "low %+v", rg.Low)
	require.Equal(t, "LR vs HR", rg.Kind())
	require.Equal(t, Up, rg.Dir)
	require.NotNil(t, rg.Cond)
	require.True(t, rg.Cond.Bull)
}

func TestPickRangeNeedsBothSides(t *testing.T) {
	tf := Timeframes[0]
	start := nyTime(2026, 3, 3, 0, 0)
	// chỉ đi lên: không có swing high nào ở trên giá
	ohlc := make([][4]float64, 12)
	for i := range ohlc {
		v := float64(100 + i)
		ohlc[i] = [4]float64{v, v + 1, v - 1, v + 0.5}
	}
	bars := seq(start, tf.Min, ohlc)
	st := TFState{TF: tf, Bars: bars}
	st.Highs, st.Lows = Swings(bars, 2)
	require.Nil(t, pickRange([]TFState{st}, 120, DefaultOptions()))
}

// walk dựng chuỗi nến 1m giả định (random walk tất định) từ start, n phút.
func walk(start time.Time, n int, seed uint64, base float64) []Bar {
	out := make([]Bar, n)
	p := base
	for i := range out {
		seed = seed*6364136223846793005 + 1442695040888963407
		step := float64(int64(seed>>33)%9-4) * 0.25
		o := p
		p += step
		hi, lo := max(o, p)+0.25, min(o, p)-0.25
		out[i] = Bar{T: start.Unix() + int64(i)*60, O: o, H: hi, L: lo, C: p}
	}
	return out
}

func TestAnalyzeIgnoresFutureBars(t *testing.T) {
	start := nyTime(2026, 3, 2, 18, 0)
	nqAll := walk(start, 6*1440, 1, 20000)
	esAll := walk(start, 6*1440, 2, 6000)
	cutoff := nyTime(2026, 3, 6, 9, 15).Unix()
	cut := func(b []Bar) []Bar { return between(b, 0, cutoff) }

	full := Analyze(NewChart(nqAll), NewChart(esAll), cutoff, DefaultOptions())
	past := Analyze(NewChart(cut(nqAll)), NewChart(cut(esAll)), cutoff, DefaultOptions())

	require.Equal(t, past.Price, full.Price)
	require.Equal(t, past.Bias, full.Bias)
	require.Equal(t, past.Step1, full.Step1)
	require.Equal(t, past.SMT, full.SMT)
	require.Equal(t, past.SMTTF, full.SMTTF)
	require.Equal(t, past.RangeTrend, full.RangeTrend)
	require.Equal(t, past.Levels, full.Levels)
	require.Equal(t, past.Range == nil, full.Range == nil)
	if past.Range != nil {
		require.Equal(t, past.Range.High.P, full.Range.High.P)
		require.Equal(t, past.Range.Low.P, full.Range.Low.P)
		require.Equal(t, past.Range.Kind(), full.Range.Kind())
	}
}

func TestSMT(t *testing.T) {
	tf := Timeframes[2]
	start := nyTime(2026, 3, 3, 0, 0)
	mk := func(lows []float64) TFState {
		ohlc := make([][4]float64, len(lows))
		for i, l := range lows {
			ohlc[i] = [4]float64{l + 1, l + 2, l, l + 1}
		}
		st := TFState{TF: tf, Bars: seq(start, tf.Min, ohlc)}
		st.Highs, st.Lows = Swings(st.Bars, 2)
		return st
	}
	// NQ: đáy sau thấp hơn (LL); ES: đáy sau cao hơn (HL) → SMT tăng
	nq := mk([]float64{10, 8, 5, 8, 10, 8, 4, 8, 10})
	es := mk([]float64{10, 8, 5, 8, 10, 8, 6, 8, 10})
	d, at := smt(nq, es, 2)
	require.Equal(t, Up, d)
	require.Equal(t, nq.Bars[6].T, at)

	// cùng tạo đáy thấp hơn: không SMT
	es2 := mk([]float64{10, 8, 5, 8, 10, 8, 3, 8, 10})
	d, _ = smt(nq, es2, 2)
	require.Equal(t, Neutral, d)
}

func TestPickSMTPrefersSmallestFreshTimeframe(t *testing.T) {
	cutoff := nyTime(2026, 3, 3, 9, 15).Unix()
	at := func(hoursAgo int) int64 { return cutoff - int64(hoursAgo)*3600 }
	st := func(rank int, d Dir, smtAt int64) TFState {
		return TFState{TF: Timeframes[rank], SMT: d, SMTAt: smtAt}
	}
	cases := []struct {
		name    string
		tfs     []TFState
		minRank int
		want    Dir
		wantTF  string
	}{
		{"15m wins over larger timeframes",
			[]TFState{st(0, Up, at(1)), st(1, Down, at(1)), st(2, Down, at(2))}, 0, Up, "15m"},
		{"no SMT on 15m: climb to 30m",
			[]TFState{st(0, Neutral, 0), st(1, Down, at(2)), st(2, Up, at(2))}, 0, Down, "30m"},
		{"stale 15m SMT (older than 20 bars) is skipped",
			[]TFState{st(0, Up, at(6)), st(1, Down, at(6))}, 0, Down, "30m"},
		{"minRank skips smaller timeframes",
			[]TFState{st(0, Up, at(1)), st(1, Neutral, 0), st(2, Down, at(3))}, 2, Down, "1H"},
		{"none", []TFState{st(0, Neutral, 0), st(1, Neutral, 0)}, 0, Neutral, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d, tf, _ := pickSMT(c.tfs, cutoff, c.minRank)
			require.Equal(t, c.want, d)
			require.Equal(t, c.wantTF, tf.Name)
		})
	}
}
