package ict

import (
	"fmt"
	"time"
)

// Winrate lịch sử của từng loại kịch bản "nếu… thì…" trong tin trước phiên. Walk-forward: tin ngày D
// chỉ dùng các phiên trước D, nên con số không nhìn thấy tương lai.

// ScenarioOutcome là kết quả một kịch bản trong phiên của nó.
type ScenarioOutcome struct {
	Swept   bool // giá quét mức của kịch bản trong khung giờ trade
	Entered bool // sau cú quét có nến IFVG hợp lệ để vào lệnh
	Result  Result
	R       float64
}

// ScenarioRules: luật vào lệnh khi chấm kịch bản — IFVG ở giá đóng nến, stop ở cực trị thao túng,
// mục tiêu là thanh khoản của kịch bản. FVG chỉ bắt buộc khi kịch bản có FVG.
func ScenarioRules() TradeRules {
	r := DefaultTradeRules()
	r.NeedHTFFVG = false
	return r
}

// SimulateScenario chấm một kịch bản trên phiên đã chuẩn bị.
func (p *PreparedSession) SimulateScenario(sc Scenario, rules TradeRules) ScenarioOutcome {
	in := p.long
	sweep, target := sc.Sweep, sc.Target
	var fvgs []FVG
	if sc.FVG != nil {
		fvgs = []FVG{*sc.FVG}
	}
	if sc.Dir == Down {
		in = p.short
		sweep.P, sweep.High = -sweep.P, !sweep.High
		target.P = -target.P
		fvgs = mirrorFVGs(fvgs)
	}
	in.liq, in.fvgs, in.target = []Level{sweep}, fvgs, target.P
	rules.NeedHTFFVG = sc.FVG != nil

	var out ScenarioOutcome
	for _, b := range in.m1[in.start:in.end] {
		if b.L < sweep.P {
			out.Swept = true
			break
		}
	}
	e, ok := findLong(in, rules)
	if !out.Swept || !ok {
		return out
	}
	out.Entered = true
	_, exit, res := followTrade(in.m1[e.fillI+1:], Up, e.stop, e.target)
	out.Result, out.R = res, (exit-e.price)/(e.price-e.stop)
	return out
}

// ScenarioKey gom kịch bản cùng loại: phiên, có FVG hay không.
type ScenarioKey struct {
	Session string
	HasFVG  bool
}

// KeyOf trả nhóm của một kịch bản.
func KeyOf(session string, sc Scenario) ScenarioKey {
	return ScenarioKey{Session: session, HasFVG: sc.FVG != nil}
}

// ScenarioTally đếm kết quả của một nhóm kịch bản.
type ScenarioTally struct {
	Count, Swept, Entered, Win, Loss, Open int
	SumR                                   float64
}

func (t *ScenarioTally) Add(o ScenarioOutcome) {
	t.Count++
	if o.Swept {
		t.Swept++
	}
	if !o.Entered {
		return
	}
	t.Entered++
	t.SumR += o.R
	switch o.Result {
	case Win:
		t.Win++
	case Loss:
		t.Loss++
	default:
		t.Open++
	}
}

// WinRate: số lệnh chạm mục tiêu / số lệnh đã vào.
func (t ScenarioTally) WinRate() float64 {
	if t.Entered == 0 {
		return 0
	}
	return float64(t.Win) / float64(t.Entered)
}

// MinEntered: dưới chừng này lệnh thì tin ghi "chưa đủ mẫu" thay vì một tỉ lệ.
const MinEntered = 10

// AvgR: R trung bình mỗi lệnh đã vào (chưa trừ phí). Cần đi kèm winrate: mục tiêu kịch bản có thể
// gần (thắng nhiều mà lời ít) hoặc xa (thắng ít mà lời nhiều).
func (t ScenarioTally) AvgR() float64 {
	if t.Entered == 0 {
		return 0
	}
	return t.SumR / float64(t.Entered)
}

// Short trả chuỗi gọn cho tin: "thắng 31%, TB +0.91R (67 lệnh)" hoặc "chưa đủ mẫu (6 lệnh)".
func (t ScenarioTally) Short() string {
	if t.Entered < MinEntered {
		return fmt.Sprintf("chưa đủ mẫu (%d lệnh)", t.Entered)
	}
	return fmt.Sprintf("thắng %.0f%%, TB %+.2fR (%d lệnh)", 100*t.WinRate(), t.AvgR(), t.Entered)
}

// ScenarioStats: winrate lịch sử theo nhóm, dựng từ mọi tin trước phiên mở trong [from, to).
type ScenarioStats map[ScenarioKey]*ScenarioTally

// BuildScenarioStats chạy lại tin trước phiên trên lịch sử: mỗi phiên dựng Brief như lúc gửi tin
// (trễ delay), rồi chấm hai kịch bản của nó.
func BuildScenarioStats(nq, es *Chart, from, to time.Time, delay time.Duration, o Options) ScenarioStats {
	stats := ScenarioStats{}
	rules := ScenarioRules()
	last := nq.M1[len(nq.M1)-1].T
	for _, s := range BiasSlots(from, to) {
		if s.Horizon > last {
			continue
		}
		n := noticeAt(s)
		b := NewBrief(nq, es, n, delay, o)
		if b.PriceT == 0 || b.PriceT < s.Cutoff-30*60 {
			continue // ngày nghỉ: không có nến gần giờ gửi tin
		}
		p := PrepareSession(nq, es, s, o)
		if p == nil {
			continue
		}
		for _, sc := range []*Scenario{b.Long, b.Short} {
			if sc == nil {
				continue
			}
			k := KeyOf(n.Session, *sc)
			if stats[k] == nil {
				stats[k] = &ScenarioTally{}
			}
			stats[k].Add(p.SimulateScenario(*sc, rules))
		}
	}
	return stats
}

// noticeAt tìm lại tin trước phiên ứng với Slot.
func noticeAt(s Slot) Notice {
	for _, n := range NoticesOn(s.Decision) {
		if n.Kind == NoticeOpen && n.At.Equal(s.Decision) {
			return n
		}
	}
	return Notice{}
}
