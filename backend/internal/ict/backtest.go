package ict

import (
	"math"
	"sort"
	"time"
)

// Slot là một lần gửi tin bias trước phiên.
type Slot struct {
	Session  string    // "Asia" hoặc "NY AM"
	Decision time.Time // giờ gửi tin (New York)
	Cutoff   int64     // nến cuối bot thấy được: Decision − DataDelay (data CME miễn phí trễ ~10 phút)
	Open     int64     // giờ mở phiên trade
	WinEnd   int64     // hết khung giờ trade
	Horizon  int64     // hết thời gian chấm DOL
}

// DataDelay mô phỏng độ trễ của data CME miễn phí.
const DataDelay = 10 * time.Minute

// SlotFor dựng Slot chấm điểm từ tin trước phiên: chấm DOL / theo lệnh tới 16:00 với NY AM, tới
// 05:00 hôm sau (hết London) với Asia.
func SlotFor(n Notice) Slot {
	d := n.At.In(NY)
	horizon := nyTime(d.Year(), d.Month(), d.Day(), 16, 0)
	if n.Session == "Asia" {
		horizon = nyTime(d.Year(), d.Month(), d.Day(), 0, 0).AddDate(0, 0, 1).Add(5 * time.Hour)
	}
	return Slot{Session: n.Session, Decision: n.At, Cutoff: n.At.Add(-DataDelay).Unix(),
		Open: n.SessionOpen.Unix(), WinEnd: n.SessionEnd.Unix(), Horizon: horizon.Unix()}
}

// BiasSlots liệt kê các lần gửi tin trước phiên trong [from, to): Asia 18:55 (Chủ nhật → thứ Năm,
// phiên 19:00–21:00) và NY AM 09:25 (thứ Hai → thứ Sáu, phiên 09:30–11:00). Cùng lịch với NoticesOn.
func BiasSlots(from, to time.Time) []Slot {
	var out []Slot
	d := from.In(NY)
	for day := nyTime(d.Year(), d.Month(), d.Day(), 0, 0); day.Before(to); day = day.AddDate(0, 0, 1) {
		for _, n := range NoticesOn(day) {
			if n.Kind == NoticeOpen {
				out = append(out, SlotFor(n))
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Cutoff < out[j].Cutoff })
	return out
}

// Result là kết quả chấm một dự đoán.
type Result int

const (
	Skip Result = iota // dự đoán trung lập: không tính
	Win
	Loss
	Tie  // cả hai mục tiêu bị chạm trong cùng một nến 1m: không biết cái nào trước
	Open // chưa mục tiêu nào bị chạm trước khi hết giờ chấm
)

// FirstHit tìm mục tiêu nào bị giao dịch vượt qua trước trong các nến 1m mở trong [from, to):
// Up = đỉnh hi, Down = đáy lo. tie = cả hai trong cùng một nến. at là giờ mở nến đó.
func FirstHit(m1 []Bar, from, to int64, hi, lo float64) (d Dir, tie bool, at int64) {
	for _, b := range between(m1, from, to) {
		up, down := b.H > hi, b.L < lo
		switch {
		case up && down:
			return Neutral, true, b.T
		case up:
			return Up, false, b.T
		case down:
			return Down, false, b.T
		}
	}
	return Neutral, false, 0
}

// Score chấm dự đoán pred với kết quả thật.
func Score(pred, got Dir, tie bool) Result {
	switch {
	case pred == Neutral:
		return Skip
	case tie:
		return Tie
	case got == Neutral:
		return Open
	case got == pred:
		return Win
	}
	return Loss
}

// ScoreConditional chấm đúng cách tin bias viết hai kịch bản: điều kiện được tôn trọng thì giá về DOL
// (rg.Dir); nến khung điều kiện đóng vượt mép xa thì giá quay về phía còn lại. Chấm kịch bản nào xảy
// ra trước. Không có điều kiện thì trả Skip.
func ScoreConditional(c *Chart, rg *Range, from, to int64) Result {
	if rg == nil || rg.Cond == nil || rg.Dir == Neutral {
		return Skip
	}
	cond := *rg.Cond
	// lần đầu nến khung điều kiện (đóng sau from, trước to) đóng vượt mép xa
	var broken int64
	for _, b := range c.Bars[cond.TF.Rank] {
		end := b.T + cond.TF.Sec()
		if end <= from {
			continue
		}
		if end > to {
			break
		}
		if (cond.Bull && b.C < cond.Bottom) || (!cond.Bull && b.C > cond.Top) {
			broken = end
			break
		}
	}
	got, tie, at := FirstHit(c.M1, from, to, rg.High.P, rg.Low.P)
	if broken == 0 || (got != Neutral && at+60 <= broken) {
		return Score(rg.Dir, got, tie) // điều kiện còn giữ tới lúc chạm mục tiêu
	}
	// điều kiện bị phá trước: kỳ vọng quay về phía còn lại
	got, tie, _ = FirstHit(c.M1, broken, to, rg.High.P, rg.Low.P)
	return Score(-rg.Dir, got, tie)
}

// Tally đếm kết quả của một cách dự đoán.
type Tally struct {
	Name                       string
	Win, Loss, Tie, Open, Skip int
}

func (t *Tally) Add(r Result) {
	switch r {
	case Win:
		t.Win++
	case Loss:
		t.Loss++
	case Tie:
		t.Tie++
	case Open:
		t.Open++
	default:
		t.Skip++
	}
}

// Rate là tỉ lệ thắng trên số lần có kết quả (thắng + thua) và khoảng tin cậy 95% Wilson.
func (t Tally) Rate() (p, lo, hi float64) {
	n := float64(t.Win + t.Loss)
	if n == 0 {
		return math.NaN(), math.NaN(), math.NaN()
	}
	p = float64(t.Win) / n
	const z = 1.96
	den := 1 + z*z/n
	mid := (p + z*z/(2*n)) / den
	half := z * math.Sqrt(p*(1-p)/n+z*z/(4*n*n)) / den
	return p, mid - half, mid + half
}
