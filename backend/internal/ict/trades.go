package ict

import (
	"sort"
)

// Mô phỏng vào lệnh trên nến 1m theo ghi chú video ReeseTradesNQ mà chủ sản phẩm cung cấp:
//
//   - IFVG model: quét thanh khoản (true manipulation) vào FVG khung ≥ 15m, rồi một nến thân đầy
//     đóng xuyên qua FVG của chân sóng thao túng (IFVG) → vào lệnh, SL ở cực trị thao túng.
//   - Stop raid: chỉ vào khi trong chân thao túng có một swing nhỏ bị quét trước IFVG.
//   - SMT: NQ quét mức mà ES không quét (chỉ là xác nhận thêm).
//   - DOL: lệnh cùng hướng DOL tiềm năng (bước 1).
//   - OXXC / PO3: mua khi giá vào lệnh còn dưới giá mở nến 1H đang chạy (discount theo giờ), bán
//     khi còn trên (premium).
//
// Code viết cho lệnh LONG; lệnh SHORT chạy cùng code trên dữ liệu lật dấu giá (mirror), nên hai
// chiều luôn đối xứng.

// TradeRules là luật vào lệnh. Các cờ Need* bật từng bộ lọc để so sánh.
type TradeRules struct {
	RR          float64 // TP = RR × rủi ro
	BodyRatio   float64 // nến IFVG: thân ≥ BodyRatio × biên độ (displacement)
	LegLookback int     // FVG 1m của chân thao túng tính từ chừng này nến trước lúc quét
	MinRisk     float64 // bỏ lệnh có SL quá gần (điểm)
	StopBuffer  float64 // SL cách cực trị thao túng
	Pivot       int     // swing 1m cho stop raid

	NeedHTFFVG   bool // cực trị thao túng chạm FVG khung ≥ 15m chưa bị phá
	NeedStopRaid bool
	NeedSMT      bool
	NeedDOL      bool
	NeedPO3      bool
}

// DefaultTradeRules: TP 2R, bắt buộc FVG khung lớn (lõi của IFVG model), các bộ lọc khác tắt.
func DefaultTradeRules() TradeRules {
	return TradeRules{RR: 2, BodyRatio: 0.6, LegLookback: 30, MinRisk: 2, StopBuffer: 0.25, Pivot: 2, NeedHTFFVG: true}
}

// Trade là một lệnh mô phỏng.
type Trade struct {
	Session              string
	Dir                  Dir
	Level                string // mức thanh khoản bị quét
	EntryT, ExitT        int64
	Entry, Stop, Target  float64
	Exit                 float64
	Result               Result // Win, Loss, hoặc Open (hết giờ, đóng ở giá cuối)
	R                    float64
	SweepT, ExtremeT     int64
	SMT, StopRaid, InPO3 bool
}

// Risk là khoảng cách vào lệnh → SL (điểm).
func (t Trade) Risk() float64 { return (t.Entry - t.Stop) * float64(t.Dir) }

// sideSetup là dữ liệu một chiều lệnh, đã lật dấu nếu là SHORT.
type sideSetup struct {
	m1, es     []Bar
	start, end int     // khung vào lệnh trong m1: [start, end)
	liq        []Level // mức thanh khoản phía bị quét (đáy với LONG)
	esLiq      map[string]Level
	fvgs       []FVG // FVG khung ≥ 15m cùng chiều lệnh, chưa bị phá lúc mở phiên
	dolOK      bool
}

type entry struct {
	i                   int
	price, stop         float64
	level               Level
	sweepT, extremeT    int64
	smt, raid, discount bool
}

// SimulateSession chạy một phiên: phân tích lúc mở phiên (không lộ tương lai), tìm lệnh đầu tiên
// trong khung giờ trade, rồi theo lệnh tới TP / SL hoặc hết s.Horizon. nil = không có lệnh.
func SimulateSession(nq, es *Chart, s Slot, rules TradeRules, o Options) *Trade {
	a := Analyze(nq, es, s.Open, o)
	if a.PriceT == 0 {
		return nil
	}
	lo := sort.Search(len(nq.M1), func(i int) bool { return nq.M1[i].T >= s.Open-int64(rules.LegLookback+rules.Pivot+5)*60 })
	hi := sort.Search(len(nq.M1), func(i int) bool { return nq.M1[i].T >= s.Horizon })
	m1 := nq.M1[lo:hi]
	start := sort.Search(len(m1), func(i int) bool { return m1[i].T >= s.Open })
	end := sort.Search(len(m1), func(i int) bool { return m1[i].T >= s.WinEnd })
	if start >= end {
		return nil
	}
	var esM1 []Bar
	esLevels := map[string]Level{}
	if es != nil {
		esM1 = between(es.M1, s.Open, s.Horizon)
		for _, lv := range SessionLevels(es.M1, s.Open) {
			esLevels[lv.Name] = lv
		}
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
	var bullF, bearF []FVG
	for _, st := range a.TFs {
		if st.TF.Rank > 4 || st.TF.Rank < o.MinRank {
			continue
		}
		for _, f := range st.FVGs {
			if f.Broken != 0 {
				continue
			}
			if f.Bull {
				bullF = append(bullF, f)
			} else {
				bearF = append(bearF, f)
			}
		}
	}

	long := sideSetup{m1: m1, es: esM1, start: start, end: end, liq: ssl, esLiq: esLevels, fvgs: bullF, dolOK: a.Step1 == Up}
	short := sideSetup{m1: mirrorBars(m1), es: mirrorBars(esM1), start: start, end: end,
		liq: mirrorLevels(bsl), esLiq: mirrorLevelMap(esLevels), fvgs: mirrorFVGs(bearF), dolOK: a.Step1 == Down}

	le, lok := findLong(long, rules)
	se, sok := findLong(short, rules)
	var e entry
	var dir Dir
	switch {
	case lok && (!sok || le.i <= se.i):
		e, dir = le, Up
	case sok:
		e, dir = se, Down
		e.price, e.stop = -e.price, -e.stop
	default:
		return nil
	}
	t := &Trade{Session: s.Session, Dir: dir, Level: e.level.Name, EntryT: m1[e.i].T + 60, Entry: e.price, Stop: e.stop,
		SweepT: e.sweepT, ExtremeT: e.extremeT, SMT: e.smt, StopRaid: e.raid, InPO3: e.discount}
	t.Target = t.Entry + rules.RR*(t.Entry-t.Stop)
	t.ExitT, t.Exit, t.Result = followTrade(m1[e.i+1:], t.Dir, t.Stop, t.Target)
	t.R = (t.Exit - t.Entry) / (t.Entry - t.Stop)
	return t
}

// findLong tìm lệnh LONG đầu tiên: quét đáy thanh khoản → (các bộ lọc) → nến IFVG.
func findLong(in sideSetup, rules TradeRules) (entry, bool) {
	m1 := in.m1
	armed := false
	var lv Level
	var sweepI int
	var extreme, minClose float64
	extremeI := 0
	for i := in.start; i < in.end; i++ {
		b := m1[i]
		if armed {
			if e, ok := tryEntry(in, rules, i, lv, sweepI, min(extreme, b.L), minClose, extremeI); ok {
				return e, true
			}
		}
		// quét (hoặc quét sâu hơn) một mức thanh khoản
		for _, l := range in.liq {
			if b.L < l.P && (!armed || l.P < lv.P) {
				if !armed {
					sweepI, extreme, minClose, extremeI = i, b.L, b.C, i
				}
				armed, lv = true, l
			}
		}
		if armed {
			if b.L < extreme {
				extreme, extremeI = b.L, i
			}
			minClose = min(minClose, b.C)
		}
	}
	return entry{}, false
}

// tryEntry kiểm nến i có phải nến IFVG hợp lệ không, và các bộ lọc đang bật.
func tryEntry(in sideSetup, rules TradeRules, i int, lv Level, sweepI int, extreme, minClose float64, extremeI int) (entry, bool) {
	m1 := in.m1
	b := m1[i]
	rng := b.H - b.L
	if b.C <= b.O || rng <= 0 || b.C-b.O < rules.BodyRatio*rng {
		return entry{}, false
	}
	// IFVG: FVG giảm 1m của chân thao túng, chưa bị đảo trước nến i, nay nến i đóng trên mép trên
	legStart := max(sweepI-rules.LegLookback, 2)
	found := false
	for k := legStart; k < i && !found; k++ {
		a, c := m1[k-2], m1[k]
		if !(c.H < a.L) {
			continue
		}
		top := a.L
		inverted := false
		for j := k + 1; j < i; j++ {
			if m1[j].C > top {
				inverted = true
				break
			}
		}
		if !inverted && b.C > top {
			found = true
		}
	}
	if !found {
		return entry{}, false
	}
	e := entry{i: i, price: b.C, stop: extreme - rules.StopBuffer, level: lv, sweepT: m1[sweepI].T, extremeT: m1[extremeI].T}
	if e.price-e.stop < rules.MinRisk {
		return entry{}, false
	}
	if rules.NeedHTFFVG {
		ok := false
		for _, f := range in.fvgs {
			if extreme <= f.Top && minClose >= f.Bottom {
				ok = true
				break
			}
		}
		if !ok {
			return entry{}, false
		}
	}
	// stop raid: SAU cú quét thanh khoản (trong chân thao túng), một swing đáy 1m hình thành rồi bị
	// một đáy thấp hơn quét, trước nến IFVG. Swing trước cú quét không tính: cú quét luôn lấy nó.
	p := rules.Pivot
	for j := max(sweepI, p); j+p < i && !e.raid; j++ {
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
	// SMT: ES không quét mức cùng tên từ lúc mức chốt tới nến IFVG
	if el, ok := in.esLiq[lv.Name]; ok && el.Swept == 0 {
		e.smt = true
		for _, x := range in.es {
			if x.T > b.T {
				break
			}
			if x.L < el.P {
				e.smt = false
				break
			}
		}
	}
	// OXXC / PO3: giá vào lệnh còn ở discount theo giờ — dưới giá mở nến 1H đang chạy (nến 1H mở
	// đúng giờ tròn: New York lệch UTC số giờ chẵn).
	ht := b.T - b.T%3600
	k := i
	for k > 0 && m1[k-1].T >= ht {
		k--
	}
	e.discount = e.price < m1[k].O
	if (rules.NeedStopRaid && !e.raid) || (rules.NeedSMT && !e.smt) || (rules.NeedDOL && !in.dolOK) || (rules.NeedPO3 && !e.discount) {
		return entry{}, false
	}
	return e, true
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
