package ict

import (
	"math"
	"sort"
)

// Mô phỏng vào lệnh trên nến 1m theo ghi chú video ReeseTradesNQ mà chủ sản phẩm cung cấp (IFVG
// model, stop raid, SMT, OXXC + PO3, DOL), định nghĩa thuật ngữ đối chiếu với skill "ICT Smart Money":
//
//   - Thao túng (AMD): giá tích lũy đi ngang chặt rồi có cú phá giả quét thanh khoản của vùng tích
//     lũy — hoặc quét một mức thanh khoản phiên.
//   - FVG khung lớn: cực trị thao túng chạm FVG 15m–4H chưa bị phá (A+: FVG còn mới, chưa chạm lần nào).
//   - True manipulation: ES cũng vào FVG khung lớn của nó, hoặc có SMT (ngoại lệ double SMT).
//   - PO3: cực trị thao túng hình thành trong 10 phút đầu một nến 15m và nằm vượt giá mở nến đó.
//   - IFVG: FVG 1m ngược chiều của chân thao túng bị nến thân đầy đóng xuyên qua (displacement: thân
//     lớn, râu phía đóng cửa nhỏ, phá nhanh kể từ lần chạm đầu).
//   - Stop raid: sau cú quét, một swing 1m hình thành rồi bị quét trước nến IFVG.
//   - Stop sạch: không còn đáy 1m chưa bị quét hay FVG 15m chưa chạm nằm ngay dưới stop (0,5R).
//   - CISD (định nghĩa của Reese): nến đóng vượt giá mở của nến ngược chiều cuối cùng ở đầu chân
//     thao túng.
//   - OXXC / PO3 1H: giá vào còn ở discount (long) / premium (short) so với giá mở nến 1H.
//
// Code viết cho lệnh LONG; lệnh SHORT chạy cùng code trên dữ liệu lật dấu giá (mirror), nên hai
// chiều luôn đối xứng.

// TradeRules là luật vào lệnh. Các cờ Need* bật từng bộ lọc để so sánh.
type TradeRules struct {
	RR          float64 // TP = RR × rủi ro (khi TargetAccum = false)
	TargetAccum bool    // TP ở đỉnh vùng tích lũy (đáy với short) — mục tiêu Reese dùng
	LimitEntry  bool    // vào bằng lệnh chờ ở mép IFVG khi giá quay lại, thay vì giá đóng nến IFVG
	LimitBars   int     // lệnh chờ huỷ sau chừng này nến 1m

	BodyRatio     float64 // nến IFVG: thân ≥ BodyRatio × biên độ
	MaxWick       float64 // nến IFVG: râu phía đóng cửa ≤ MaxWick × biên độ (1 = không giới hạn)
	MaxInvertBars int     // nến IFVG cách lần chạm đầu vào FVG tối đa chừng này nến (< 0 = không giới hạn)

	LegLookback int     // FVG 1m của chân thao túng tính từ chừng này nến trước lúc quét
	MinRisk     float64 // bỏ lệnh có SL quá gần (điểm)
	StopBuffer  float64 // SL cách cực trị thao túng
	Pivot       int     // swing 1m cho stop raid / stop sạch
	AccBars     int     // số nến 1m của vùng tích lũy
	AccMult     float64 // vùng tích lũy: biên độ ≤ AccMult × biên độ TB một nến 1m

	NeedHTFFVG    bool // cực trị thao túng chạm FVG khung ≥ 15m chưa bị phá
	NeedFreshFVG  bool // ... và FVG đó chưa được chạm lần nào trước phiên
	NeedAccum     bool // thao túng phải là cú phá giả của vùng tích lũy (AMD)
	NeedKeyLiq    bool // cực trị thao túng phải quét một mức thanh khoản phiên / range
	NeedTrueManip bool
	NeedPO3Open   bool
	NeedStopRaid  bool
	NeedCleanStop bool
	NeedCISD      bool
	NeedSMT       bool
	NeedDOL       bool
	NeedPO3       bool // OXXC: giá vào ở discount / premium theo nến 1H
}

// DefaultTradeRules: IFVG model cơ bản — quét mức thanh khoản, FVG khung lớn, IFVG; TP 2R.
func DefaultTradeRules() TradeRules {
	return TradeRules{RR: 2, LimitBars: 10, BodyRatio: 0.6, MaxWick: 1, MaxInvertBars: -1,
		LegLookback: 30, MinRisk: 2, StopBuffer: 0.25, Pivot: 2, AccBars: 20, AccMult: 4, NeedHTFFVG: true}
}

// APlusRules: đủ các tiêu chí BẮT BUỘC của IFVG model trong ghi chú (AMD, FVG khung lớn còn mới, true
// manipulation, PO3 theo nến 15m, IFVG có displacement). SMT / CISD là tuỳ chọn nên không bật.
func APlusRules() TradeRules {
	r := DefaultTradeRules()
	r.NeedFreshFVG, r.NeedAccum, r.NeedTrueManip, r.NeedPO3Open = true, true, true, true
	r.MaxWick, r.MaxInvertBars = 0.2, 3
	return r
}

// Trade là một lệnh mô phỏng.
type Trade struct {
	Session                                      string
	Dir                                          Dir
	Level                                        string // mức thanh khoản bị quét
	EntryT, ExitT                                int64
	Entry, Stop, Target                          float64
	Exit                                         float64
	Result                                       Result // Win, Loss, hoặc Open (hết giờ, đóng ở giá cuối)
	R                                            float64
	SweepT, ExtremeT                             int64
	SMT, StopRaid, InPO3, TrueManip, CISD, Clean bool
}

// Risk là khoảng cách vào lệnh → SL (điểm).
func (t Trade) Risk() float64 { return (t.Entry - t.Stop) * float64(t.Dir) }

// sideSetup là dữ liệu một chiều lệnh, đã lật dấu nếu là SHORT.
type sideSetup struct {
	m1, es     []Bar
	start, end int     // khung vào lệnh trong m1: [start, end)
	liq        []Level // mức thanh khoản phía bị quét (đáy với LONG)
	esLiq      map[string]Level
	fvgs       []FVG // FVG khung 15m–4H của NQ cùng chiều lệnh, chưa bị phá lúc mở phiên
	esFVGs     []FVG // như trên, của ES
	dolOK      bool
}

// leg là trạng thái chân thao túng đang theo dõi.
type leg struct {
	lv                Level
	sweepI, extremeI  int
	extreme, minClose float64
	accHigh           float64
	viaAccum          bool
}

type entry struct {
	i, fillI               int
	price, stop, target    float64
	ifvgTop                float64 // mép xa của FVG mà nến IFVG vừa đóng xuyên qua
	level                  Level
	sweepT, extremeT       int64
	smt, raid, discount    bool
	trueManip, cisd, clean bool
}

// SimulateSession chạy một phiên: phân tích lúc mở phiên (không lộ tương lai), tìm lệnh đầu tiên
// trong khung giờ trade, rồi theo lệnh tới TP / SL hoặc hết s.Horizon. nil = không có lệnh.
func SimulateSession(nq, es *Chart, s Slot, rules TradeRules, o Options) *Trade {
	p := PrepareSession(nq, es, s, o)
	if p == nil {
		return nil
	}
	return p.Simulate(rules)
}

// PreparedSession là phần chuẩn bị của một phiên (phân tích lúc mở phiên, thanh khoản, FVG khung
// lớn của NQ và ES), không phụ thuộc luật vào lệnh — dựng một lần, thử được nhiều bộ luật (tối ưu).
type PreparedSession struct {
	Slot        Slot
	m1          []Bar
	long, short sideSetup
}

// prepareBack: số phút nến 1m lấy trước giờ mở phiên — đủ cho chân thao túng (LegLookback 30), vùng
// tích lũy (AccBars 20) và biên độ trung bình (60), dư cho stop sạch (120).
const prepareBack = 180

// PrepareSession dựng phần chuẩn bị; nil khi phiên không có nến.
func PrepareSession(nq, es *Chart, s Slot, o Options) *PreparedSession {
	a := Analyze(nq, es, s.Open, o)
	if a.PriceT == 0 {
		return nil
	}
	back := int64(prepareBack) * 60
	lo := sort.Search(len(nq.M1), func(i int) bool { return nq.M1[i].T >= s.Open-back })
	hi := sort.Search(len(nq.M1), func(i int) bool { return nq.M1[i].T >= s.Horizon })
	m1 := nq.M1[lo:hi]
	start := sort.Search(len(m1), func(i int) bool { return m1[i].T >= s.Open })
	end := sort.Search(len(m1), func(i int) bool { return m1[i].T >= s.WinEnd })
	if start >= end {
		return nil
	}
	var esM1 []Bar
	esLevels := map[string]Level{}
	var esBull, esBear []FVG
	if es != nil {
		esM1 = between(es.M1, s.Open-back, s.Horizon)
		for _, lv := range SessionLevels(es.M1, s.Open) {
			esLevels[lv.Name] = lv
		}
		esBull, esBear = htfFVGs(Analyze(es, nil, s.Open, o), o)
	}

	// thanh khoản chưa bị quét lúc mở phiên, cộng hai đầu range khung tham chiếu
	var bsl, ssl []Level
	for _, lv := range a.Levels {
		if lv.Swept != 0 {
			continue
		}
		if lv.High && lv.P > a.Price {
			bsl = append(bsl, lv)
		}
		if !lv.High && lv.P < a.Price {
			ssl = append(ssl, lv)
		}
	}
	if a.Range != nil {
		bsl = append(bsl, Level{Name: "Range " + a.Range.TF.Name + " High", P: a.Range.High.P, High: true})
		ssl = append(ssl, Level{Name: "Range " + a.Range.TF.Name + " Low", P: a.Range.Low.P})
	}
	bullF, bearF := htfFVGs(a, o)

	return &PreparedSession{Slot: s, m1: m1,
		long: sideSetup{m1: m1, es: esM1, start: start, end: end, liq: ssl, esLiq: esLevels,
			fvgs: bullF, esFVGs: esBull, dolOK: a.Step1 == Up},
		short: sideSetup{m1: mirrorBars(m1), es: mirrorBars(esM1), start: start, end: end,
			liq: mirrorLevels(bsl), esLiq: mirrorLevelMap(esLevels), fvgs: mirrorFVGs(bearF),
			esFVGs: mirrorFVGs(esBear), dolOK: a.Step1 == Down}}
}

// Simulate chạy một bộ luật trên phiên đã chuẩn bị. LegLookback + AccBars + 60 phải ≤ prepareBack.
func (p *PreparedSession) Simulate(rules TradeRules) *Trade {
	s, m1, long, short := p.Slot, p.m1, p.long, p.short
	le, lok := findLong(long, rules)
	se, sok := findLong(short, rules)
	var e entry
	var dir Dir
	switch {
	case lok && (!sok || le.fillI <= se.fillI):
		e, dir = le, Up
	case sok:
		e, dir = se, Down
		e.price, e.stop, e.target = -e.price, -e.stop, -e.target
	default:
		return nil
	}
	t := &Trade{Session: s.Session, Dir: dir, Level: e.level.Name, Entry: e.price, Stop: e.stop, Target: e.target,
		SweepT: e.sweepT, ExtremeT: e.extremeT, SMT: e.smt, StopRaid: e.raid, InPO3: e.discount,
		TrueManip: e.trueManip, CISD: e.cisd, Clean: e.clean}
	fill := m1[e.fillI]
	if rules.LimitEntry {
		t.EntryT = fill.T
		// nến khớp lệnh chờ cũng chạm stop: tính là thua (không biết thứ tự trong nến)
		if (dir == Up && fill.L <= t.Stop) || (dir == Down && fill.H >= t.Stop) {
			t.ExitT, t.Exit, t.Result = fill.T, t.Stop, Loss
		} else {
			t.ExitT, t.Exit, t.Result = followTrade(m1[e.fillI+1:], t.Dir, t.Stop, t.Target)
		}
	} else {
		t.EntryT = fill.T + 60
		t.ExitT, t.Exit, t.Result = followTrade(m1[e.fillI+1:], t.Dir, t.Stop, t.Target)
	}
	t.R = (t.Exit - t.Entry) / (t.Entry - t.Stop)
	return t
}

// htfFVGs: FVG 15m–4H (từ MinRank) chưa bị phá lúc phân tích, tách tăng / giảm.
func htfFVGs(a Analysis, o Options) (bull, bear []FVG) {
	for _, st := range a.TFs {
		if st.TF.Rank > 4 || st.TF.Rank < o.MinRank {
			continue
		}
		for _, f := range st.FVGs {
			if f.Broken != 0 {
				continue
			}
			if f.Bull {
				bull = append(bull, f)
			} else {
				bear = append(bear, f)
			}
		}
	}
	return bull, bear
}

// accumulation: AccBars nến 1m trước nến i có đi ngang chặt không (biên độ ≤ AccMult × biên độ TB
// một nến của 60 nến trước đó). Trả đáy / đỉnh vùng.
func accumulation(m1 []Bar, i int, r TradeRules) (lo, hi float64, ok bool) {
	from := i - r.AccBars
	if from-60 < 0 {
		return 0, 0, false
	}
	lo, hi = m1[from].L, m1[from].H
	for _, b := range m1[from:i] {
		lo, hi = min(lo, b.L), max(hi, b.H)
	}
	var avg float64
	for _, b := range m1[from-60 : from] {
		avg += b.H - b.L
	}
	avg /= 60
	return lo, hi, avg > 0 && hi-lo <= r.AccMult*avg
}

// findLong tìm lệnh LONG đầu tiên: thao túng → (các bộ lọc) → nến IFVG → (lệnh chờ).
func findLong(in sideSetup, rules TradeRules) (entry, bool) {
	m1 := in.m1
	var g leg
	armed := false
	for i := in.start; i < in.end; i++ {
		b := m1[i]
		if armed {
			g2 := g
			if b.L < g2.extreme {
				g2.extreme, g2.extremeI = b.L, i
			}
			if e, ok := tryEntry(in, rules, i, g2); ok {
				if !rules.LimitEntry {
					return e, true
				}
				if e, ok := waitLimit(in, rules, e); ok {
					return e, true
				}
			}
		}
		if !armed {
			if rules.NeedAccum {
				if lo, hi, ok := accumulation(m1, i, rules); ok && b.L < lo {
					armed = true
					g = leg{lv: Level{Name: "Đáy tích lũy", P: lo}, sweepI: i, extremeI: i, extreme: b.L,
						minClose: b.C, accHigh: hi, viaAccum: true}
					continue
				}
			} else {
				for _, l := range in.liq {
					if b.L < l.P && (!armed || l.P < g.lv.P) {
						if !armed {
							_, hi, _ := accumulation(m1, i, rules)
							g = leg{sweepI: i, extremeI: i, extreme: b.L, minClose: b.C, accHigh: hi}
						}
						armed, g.lv = true, l
					}
				}
				if armed {
					continue
				}
			}
		}
		if armed {
			if b.L < g.extreme {
				g.extreme, g.extremeI = b.L, i
			}
			g.minClose = min(g.minClose, b.C)
		}
	}
	return entry{}, false
}

// tryEntry kiểm nến i có phải nến IFVG hợp lệ không, và các bộ lọc đang bật.
func tryEntry(in sideSetup, rules TradeRules, i int, g leg) (entry, bool) {
	m1 := in.m1
	b := m1[i]
	rng := b.H - b.L
	if b.C <= b.O || rng <= 0 || b.C-b.O < rules.BodyRatio*rng || b.H-b.C > rules.MaxWick*rng {
		return entry{}, false
	}
	// IFVG: FVG giảm 1m của chân thao túng, chưa bị đảo trước nến i, nay nến i đóng trên mép trên
	legStart := max(g.sweepI-rules.LegLookback, 2)
	found := false
	ifvgTop := math.Inf(-1)
	for k := legStart; k < i; k++ {
		a, c := m1[k-2], m1[k]
		if !(c.H < a.L) {
			continue
		}
		bot, top := c.H, a.L
		if b.C <= top {
			continue
		}
		inverted, touch := false, -1
		for j := k + 1; j < i; j++ {
			if touch < 0 && m1[j].H >= bot {
				touch = j
			}
			if m1[j].C > top {
				inverted = true
				break
			}
		}
		if inverted {
			continue
		}
		if touch < 0 {
			touch = i
		}
		if rules.MaxInvertBars >= 0 && i-touch > rules.MaxInvertBars {
			continue
		}
		// FVG mà thân nến IFVG đóng xuyên qua; nến mở trên mép (gap) thì vẫn nhận nhưng ưu tiên
		// FVG nằm trong thân nến
		if !found || (top > b.O && (ifvgTop <= b.O || top > ifvgTop)) {
			ifvgTop = top
		}
		found = true
	}
	if !found {
		return entry{}, false
	}
	e := entry{i: i, fillI: i, price: b.C, ifvgTop: ifvgTop, stop: g.extreme - rules.StopBuffer, level: g.lv,
		sweepT: m1[g.sweepI].T, extremeT: m1[g.extremeI].T}
	if e.price-e.stop < rules.MinRisk {
		return entry{}, false
	}
	e.target = e.price + rules.RR*(e.price-e.stop)
	if rules.TargetAccum {
		if g.accHigh <= e.price {
			return entry{}, false // mục tiêu đã nằm dưới giá vào
		}
		e.target = g.accHigh
	}
	if rules.NeedHTFFVG {
		ok := false
		for _, f := range in.fvgs {
			if g.extreme <= f.Top && g.minClose >= f.Bottom && (!rules.NeedFreshFVG || f.Touched == 0) {
				ok = true
				break
			}
		}
		if !ok {
			return entry{}, false
		}
	}
	if rules.NeedKeyLiq {
		ok := false
		for _, l := range in.liq {
			if g.extreme < l.P {
				ok = true
				break
			}
		}
		if !ok {
			return entry{}, false
		}
	}
	// stop raid: SAU cú quét (trong chân thao túng), một swing đáy 1m hình thành rồi bị một đáy
	// thấp hơn quét, trước nến IFVG. Swing trước cú quét không tính: cú quét luôn lấy nó.
	p := rules.Pivot
	for j := max(g.sweepI, p); j+p < i && !e.raid; j++ {
		if !isPivot(m1, j, p, false) {
			continue
		}
		for m := j + p + 1; m < i; m++ {
			if m1[m].L < m1[j].L {
				e.raid = true
				break
			}
		}
	}
	// SMT: ES không quét mức cùng tên từ lúc mức chốt tới nến IFVG. Với cú phá vùng tích lũy: ES
	// không phá đáy vùng tích lũy của chính nó trong cùng khoảng thời gian.
	if g.viaAccum {
		sweepT := m1[g.sweepI].T
		esAccLo, seen := math.Inf(1), false
		e.smt = true
		for _, x := range in.es {
			if x.T < sweepT-int64(rules.AccBars)*60 {
				continue
			}
			if x.T > b.T {
				break
			}
			if x.T < sweepT {
				esAccLo, seen = min(esAccLo, x.L), true
			} else if x.L < esAccLo {
				e.smt = false
				break
			}
		}
		e.smt = e.smt && seen
	} else if el, ok := in.esLiq[g.lv.Name]; ok && el.Swept == 0 {
		e.smt = true
		for _, x := range in.es {
			if x.T < m1[in.start].T {
				continue
			}
			if x.T > b.T {
				break
			}
			if x.L < el.P {
				e.smt = false
				break
			}
		}
	}
	// true manipulation: ES trong chân thao túng chạm FVG khung lớn của nó (hoặc có SMT)
	e.trueManip = e.smt
	if !e.trueManip && len(in.es) > 0 {
		esLo, esMinC := math.Inf(1), math.Inf(1)
		for _, x := range in.es {
			if x.T < m1[g.sweepI].T {
				continue
			}
			if x.T > b.T {
				break
			}
			esLo, esMinC = min(esLo, x.L), min(esMinC, x.C)
		}
		for _, f := range in.esFVGs {
			if esLo <= f.Top && esMinC >= f.Bottom {
				e.trueManip = true
				break
			}
		}
	}
	// PO3 theo nến 15m: cực trị thao túng trong 10 phút đầu nến 15m và dưới giá mở nến đó
	q := m1[g.extremeI].T - m1[g.extremeI].T%900
	k := g.extremeI
	for k > 0 && m1[k-1].T >= q {
		k--
	}
	po3Open := m1[g.extremeI].T-q < 600 && g.extreme < m1[k].O
	// OXXC: giá vào còn dưới giá mở nến 1H (nến 1H mở đúng giờ tròn)
	ht := b.T - b.T%3600
	k = i
	for k > 0 && m1[k-1].T >= ht {
		k--
	}
	e.discount = e.price < m1[k].O
	// CISD (Reese): đóng trên giá mở của nến giảm đầu chuỗi nến giảm dẫn vào cực trị
	k = g.extremeI
	for k > 0 && m1[k].C >= m1[k].O && k > g.extremeI-3 {
		k-- // cực trị có thể nằm ở nến tăng ngay sau chuỗi giảm
	}
	if m1[k].C < m1[k].O {
		for k > 0 && m1[k-1].C < m1[k-1].O {
			k--
		}
		e.cisd = b.C > m1[k].O
	}
	// stop sạch: không có đáy 1m chưa bị quét hay FVG 15m chưa chạm ngay dưới stop (0,5R)
	risk := e.price - e.stop
	e.clean = true
	for j := max(i-120, p); j+p < i && e.clean; j++ {
		lj := m1[j].L
		if lj >= e.stop || lj < e.stop-0.5*risk || !isPivot(m1, j, p, false) {
			continue
		}
		swept := false
		for m := j + 1; m <= i; m++ {
			if m1[m].L < lj {
				swept = true
				break
			}
		}
		if !swept {
			e.clean = false
		}
	}
	for _, f := range in.fvgs {
		if f.TF.Rank == 0 && f.Touched == 0 && f.Top < e.stop && f.Top >= e.stop-0.5*risk {
			e.clean = false
		}
	}
	if (rules.NeedStopRaid && !e.raid) || (rules.NeedSMT && !e.smt) || (rules.NeedDOL && !in.dolOK) ||
		(rules.NeedPO3 && !e.discount) || (rules.NeedTrueManip && !e.trueManip) ||
		(rules.NeedPO3Open && !po3Open) || (rules.NeedCISD && !e.cisd) || (rules.NeedCleanStop && !e.clean) {
		return entry{}, false
	}
	return e, true
}

// waitLimit đặt lệnh chờ mua ở mép trên IFVG (FVG giảm vừa bị đảo, nay là hỗ trợ). Khớp khi giá
// quay về; huỷ nếu giá chạm mục tiêu trước hoặc quá LimitBars nến.
func waitLimit(in sideSetup, rules TradeRules, e entry) (entry, bool) {
	m1 := in.m1
	top := e.ifvgTop
	if math.IsInf(top, -1) || top-e.stop < rules.MinRisk {
		return entry{}, false
	}
	target := top + rules.RR*(top-e.stop)
	if rules.TargetAccum {
		target = e.target
	}
	for j := e.i + 1; j < len(m1) && j <= e.i+rules.LimitBars; j++ {
		x := m1[j]
		if x.L <= top {
			e.fillI, e.price, e.target = j, min(top, x.O), target
			if e.price-e.stop < rules.MinRisk {
				return entry{}, false
			}
			return e, true
		}
		if x.H >= target {
			return entry{}, false
		}
	}
	return entry{}, false
}

// followTrade theo lệnh trên các nến sau nến vào lệnh. SL kiểm trước TP trong cùng một nến (thận
// trọng: không biết nến 1m chạm cái nào trước). Hết nến thì đóng ở giá cuối (Result = Open).
func followTrade(bars []Bar, d Dir, stop, target float64) (int64, float64, Result) {
	for _, b := range bars {
		if d == Up {
			if b.L <= stop {
				return b.T, stop, Loss
			}
			if b.H >= target {
				return b.T, target, Win
			}
		} else {
			if b.H >= stop {
				return b.T, stop, Loss
			}
			if b.L <= target {
				return b.T, target, Win
			}
		}
	}
	if len(bars) == 0 {
		return 0, stop, Loss
	}
	last := bars[len(bars)-1]
	return last.T, last.C, Open
}

func mirrorBars(b []Bar) []Bar {
	out := make([]Bar, len(b))
	for i, x := range b {
		out[i] = Bar{T: x.T, O: -x.O, H: -x.L, L: -x.H, C: -x.C}
	}
	return out
}

func mirrorLevels(ls []Level) []Level {
	out := make([]Level, len(ls))
	for i, l := range ls {
		l.P, l.High = -l.P, !l.High
		out[i] = l
	}
	return out
}

func mirrorLevelMap(m map[string]Level) map[string]Level {
	out := make(map[string]Level, len(m))
	// lệnh SHORT quét đỉnh: mức "X High" của ES, lật dấu thành đáy
	for k, l := range m {
		l.P, l.High = -l.P, !l.High
		out[k] = l
	}
	return out
}

func mirrorFVGs(fs []FVG) []FVG {
	out := make([]FVG, len(fs))
	for i, f := range fs {
		f.Bull, f.Top, f.Bottom = !f.Bull, -f.Bottom, -f.Top
		out[i] = f
	}
	return out
}
