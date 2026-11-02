package ict

import "math"

// Options là các tham số của phân tích; DefaultOptions là bản dùng cho tin Telegram.
type Options struct {
	// MinRank: khung nhỏ nhất được xét khi chọn range (0 = 15m).
	MinRank int
	// Window: số nến gần nhất mỗi khung đưa vào phân tích.
	Window int
	// Pivot: số nến mỗi bên của một swing.
	Pivot int
	// LeanHours: bước 1b chỉ tính FVG được chạm / bị phá trong chừng này giờ trước cutoff.
	LeanHours int
}

func DefaultOptions() Options { return Options{MinRank: 0, Window: 300, Pivot: 2, LeanHours: 24} }

// TFState là phân tích của một khung.
type TFState struct {
	TF          Timeframe
	Bars        []Bar
	Highs, Lows []Swing
	FVGs        []FVG
	Trend       Dir
	// SMT với ES ở hai swing gần nhất: Up = SMT tăng (ở đáy), Down = SMT giảm (ở đỉnh). SMTAt là giờ
	// mở nến của swing sau.
	SMT   Dir
	SMTAt int64
}

// Side là một đầu của range. HR (High Resistance) khi đủ cả ba: đã quét swing cũ, chạm FVG khung
// lớn hơn, và để lại FVG ngược chiều (displacement). Thiếu một là LR.
type Side struct {
	Swing
	Swept, Tapped, Displaced bool
}

func (s Side) HR() bool { return s.Swept && s.Tapped && s.Displaced }

// Range là range khung lớn được chọn: khung nhỏ nhất (từ MinRank) có swing high còn nguyên ở trên giá,
// swing low còn nguyên ở dưới giá, và ít nhất một FVG chưa bị phá (khung ≥ khung range) nằm trong.
type Range struct {
	TF        Timeframe
	High, Low Side
	// Dir: DOL theo loại range. HR vs LR: về phía LR. LR vs LR: trung lập (không vào lệnh trong
	// range). HR vs HR: theo FVG ở Premium / Discount quanh Equilibrium.
	Dir Dir
	// Cond: FVG điều kiện (tôn trọng → đi về Dir, bị phá → quay về phía còn lại). nil khi LR vs LR.
	Cond *FVG
}

// Kind là "HR vs LR", "LR vs HR", "LR vs LR" hoặc "HR vs HR" (đỉnh trước, đáy sau).
func (r Range) Kind() string {
	k := func(s Side) string {
		if s.HR() {
			return "HR"
		}
		return "LR"
	}
	return k(r.High) + " vs " + k(r.Low)
}

// EQ là Equilibrium 50% của range.
func (r Range) EQ() float64 { return (r.High.P + r.Low.P) / 2 }

// Analysis là kết quả phân tích tại một thời điểm.
type Analysis struct {
	Cutoff int64
	Price  float64 // giá đóng nến 1m cuối trước cutoff
	PriceT int64
	TFs    []TFState
	Levels []Level

	// Bước 1a: đi ra từ đâu (mức bị quét gần nhất).
	CameFrom  Dir
	CameLevel *Level
	// Bước 1b: hành vi FVG (15m → 4H) trong LeanHours giờ gần nhất.
	FVGBull, FVGBear float64
	FVGLean          Dir
	// Step1: DOL tiềm năng. FVG quyết định, chỉ khi FVG hoà mới lấy hướng của bước 1a.
	Step1 Dir
	// Phiếu của tám khung: cấu trúc và SMT với ES.
	TrendVote, SMTVote Dir
	// Bước 2–3: range và điều kiện.
	Range *Range
	// Bias là DOL cuối cùng (theo range); trung lập khi không có range hoặc LR vs LR.
	Bias Dir
}

// Analyze phân tích NQ (es có thể nil: khi đó không có SMT) chỉ với nến đã đóng trước cutoff.
func Analyze(nq, es *Chart, cutoff int64, o Options) Analysis {
	a := Analysis{Cutoff: cutoff}
	m1 := closedBy(nq.M1, 60, cutoff)
	if len(m1) == 0 {
		return a
	}
	last := m1[len(m1)-1]
	a.Price, a.PriceT = last.C, last.T

	var trendSum, smtSum float64
	var leanFVGs []FVG
	for r, tf := range Timeframes {
		st := tfState(nq.Bars[r], tf, cutoff, o)
		if es != nil {
			est := tfState(es.Bars[r], tf, cutoff, o)
			st.SMT, st.SMTAt = smt(st, est, o.Pivot)
		}
		trendSum += float64(st.Trend)
		smtSum += float64(st.SMT)
		if tf.Rank <= 4 { // 15m → 4H
			leanFVGs = append(leanFVGs, st.FVGs...)
		}
		a.TFs = append(a.TFs, st)
	}
	a.TrendVote, a.SMTVote = sign(trendSum), sign(smtSum)

	a.Levels = SessionLevels(nq.M1, cutoff)
	a.CameFrom, a.CameLevel = lastSweep(a.Levels)
	a.FVGBull, a.FVGBear = fvgLean(leanFVGs, cutoff-int64(o.LeanHours)*3600)
	a.FVGLean = sign(a.FVGBull - a.FVGBear)
	a.Step1 = a.FVGLean
	if a.Step1 == Neutral {
		a.Step1 = a.CameFrom
	}

	a.Range = pickRange(a.TFs, a.Price, o)
	if a.Range != nil {
		a.Bias = a.Range.Dir
	}
	return a
}

func tfState(all []Bar, tf Timeframe, cutoff int64, o Options) TFState {
	bars := tail(closedBy(all, tf.Sec(), cutoff), o.Window)
	st := TFState{TF: tf, Bars: bars}
	st.Highs, st.Lows = Swings(bars, o.Pivot)
	st.FVGs = FindFVGs(bars, tf)
	st.Trend = Trend(st.Highs, st.Lows)
	return st
}

// smt so hai swing gần nhất của NQ với cực trị của ES quanh cùng các nến (±pivot nến): NQ đỉnh cao
// hơn mà ES đỉnh thấp hơn (hoặc ngược lại) là SMT giảm; tương tự ở đáy là SMT tăng. Có cả hai thì lấy
// cái mới hơn.
func smt(nq, es TFState, pivot int) (Dir, int64) {
	idx := make(map[int64]int, len(es.Bars))
	for i, b := range es.Bars {
		idx[b.T] = i
	}
	near := func(s Swing) float64 {
		r := math.NaN()
		for j := s.I - pivot; j <= s.I+pivot; j++ {
			if j < 0 || j >= len(nq.Bars) {
				continue
			}
			k, ok := idx[nq.Bars[j].T]
			if !ok {
				continue
			}
			v := es.Bars[k].L
			if s.High {
				v = es.Bars[k].H
			}
			switch {
			case math.IsNaN(r):
				r = v
			case s.High:
				r = max(r, v)
			default:
				r = min(r, v)
			}
		}
		return r
	}
	diverge := func(sw []Swing) (bool, int64) {
		if len(sw) < 2 {
			return false, 0
		}
		s1, s2 := sw[len(sw)-2], sw[len(sw)-1]
		e1, e2 := near(s1), near(s2)
		if math.IsNaN(e1) || math.IsNaN(e2) {
			return false, 0
		}
		return (s2.P > s1.P && e2 < e1) || (s2.P < s1.P && e2 > e1), s2.T
	}
	bear, bearT := diverge(nq.Highs)
	bull, bullT := diverge(nq.Lows)
	switch {
	case bear && bull:
		if bearT >= bullT {
			return Down, bearT
		}
		return Up, bullT
	case bear:
		return Down, bearT
	case bull:
		return Up, bullT
	}
	return Neutral, 0
}

// pickRange xét khung từ MinRank lên Daily, lấy khung đầu tiên có range hợp lệ.
func pickRange(tfs []TFState, price float64, o Options) *Range {
	for r := o.MinRank; r < len(tfs); r++ {
		st := tfs[r]
		hi, okH := intactSwing(st.Bars, st.Highs, price)
		lo, okL := intactSwing(st.Bars, st.Lows, price)
		if !okH || !okL {
			continue
		}
		inside := unbrokenFVGs(tfs[r:], lo.P, hi.P)
		if len(inside) == 0 {
			continue
		}
		rg := &Range{TF: st.TF, High: classify(tfs, r, hi), Low: classify(tfs, r, lo)}
		switch {
		case rg.High.HR() && !rg.Low.HR():
			rg.Dir = Down
			rg.Cond = pickCond(inside, false, price, hi.P)
		case !rg.High.HR() && rg.Low.HR():
			rg.Dir = Up
			rg.Cond = pickCond(inside, true, lo.P, price)
		case rg.High.HR() && rg.Low.HR():
			rg.Dir = eqLean(inside, rg.EQ())
			if rg.Dir == Up {
				rg.Cond = pickCond(inside, true, lo.P, rg.EQ())
			} else if rg.Dir == Down {
				rg.Cond = pickCond(inside, false, rg.EQ(), hi.P)
			}
		}
		return rg
	}
	return nil
}

// intactSwing tìm swing gần nhất ở phía bên kia giá (đỉnh trên giá / đáy dưới giá) chưa nến nào
// đóng vượt qua.
func intactSwing(bars []Bar, sw []Swing, price float64) (Swing, bool) {
	for i := len(sw) - 1; i >= 0; i-- {
		s := sw[i]
		if (s.High && s.P <= price) || (!s.High && s.P >= price) {
			continue
		}
		ok := true
		for _, b := range bars[s.I+1:] {
			if (s.High && b.C > s.P) || (!s.High && b.C < s.P) {
				ok = false
				break
			}
		}
		if ok {
			return s, true
		}
	}
	return Swing{}, false
}

// unbrokenFVGs: FVG chưa bị phá của các khung trong tfs, giao với [lo, hi].
func unbrokenFVGs(tfs []TFState, lo, hi float64) []FVG {
	var out []FVG
	for _, st := range tfs {
		for _, f := range st.FVGs {
			if f.Broken == 0 && f.Bottom < hi && f.Top > lo {
				out = append(out, f)
			}
		}
	}
	return out
}

// classify chấm một đầu range là HR hay LR (xem Side).
func classify(tfs []TFState, r int, s Swing) Side {
	st := tfs[r]
	side := Side{Swing: s}
	// đã quét swing cùng loại liền trước
	sw := st.Lows
	if s.High {
		sw = st.Highs
	}
	for i := len(sw) - 1; i >= 0; i-- {
		if sw[i].I < s.I {
			side.Swept = (s.High && s.P > sw[i].P) || (!s.High && s.P < sw[i].P)
			break
		}
	}
	// chạm FVG ngược chiều của khung lớn hơn (Daily thì xét chính nó) còn hiệu lực lúc swing
	swingEnd := s.T + st.TF.Sec()
	from := min(r+1, len(tfs)-1)
	for _, ht := range tfs[from:] {
		for _, f := range ht.FVGs {
			if f.Bull == s.High || f.Formed > swingEnd || (f.Broken != 0 && f.Broken < s.T) {
				continue
			}
			if (s.High && s.P >= f.Bottom) || (!s.High && s.P <= f.Top) {
				side.Tapped = true
				break
			}
		}
		if side.Tapped {
			break
		}
	}
	// displacement: FVG ngược chiều cùng khung hình thành trong vài nến sau swing
	for _, f := range st.FVGs {
		if f.Bull != s.High && f.I > s.I && f.I <= s.I+3+2 {
			side.Displaced = true
			break
		}
	}
	return side
}

// eqLean cho range HR vs HR: tôn trọng FVG giảm ở Premium và phá FVG tăng ở Discount là giảm; ngược
// lại là tăng. Chỉ còn FVG chưa bị phá nên ở đây đếm FVG được tôn trọng ở đúng vùng.
func eqLean(fvgs []FVG, eq float64) Dir {
	var s float64
	for _, f := range fvgs {
		w := float64(f.TF.Rank + 1)
		switch {
		case !f.Bull && f.Mid() > eq && f.Respected():
			s -= w
		case f.Bull && f.Mid() < eq && f.Respected():
			s += w
		}
	}
	return sign(s)
}

// pickCond chọn FVG điều kiện cùng chiều bull nằm trong [lo, hi]: khung cao nhất, rồi gần giá nhất
// (mép trên với FVG tăng, mép dưới với FVG giảm).
func pickCond(fvgs []FVG, bull bool, lo, hi float64) *FVG {
	var best *FVG
	for i := range fvgs {
		f := fvgs[i]
		if f.Bull != bull || f.Bottom >= hi || f.Top <= lo {
			continue
		}
		if best == nil || f.TF.Rank > best.TF.Rank ||
			(f.TF.Rank == best.TF.Rank && ((bull && f.Top > best.Top) || (!bull && f.Bottom < best.Bottom))) {
			best = &fvgs[i]
		}
	}
	if best == nil {
		return nil
	}
	c := *best
	return &c
}
