package ict

import (
	"sort"
	"time"
)

// Level là một mức thanh khoản: đỉnh (BSL) hoặc đáy (SSL) của ngày trước hay của một phiên.
// Formed là lúc mức chốt (hết phiên); Swept là giờ mở nến 1m đầu tiên giao dịch vượt qua nó sau
// lúc chốt (0 = chưa bị quét tới cutoff).
type Level struct {
	Name   string
	P      float64
	High   bool
	Formed int64
	Swept  int64
}

// sessionWindow là một phiên theo giờ New York; End có thể qua nửa đêm (Asia 20:00 → 24:00).
type sessionWindow struct {
	Name                       string
	StartH, StartM, EndH, EndM int
}

// liquiditySessions: các phiên lấy High/Low làm thanh khoản, giống killzone của indicator "My ICT".
var liquiditySessions = []sessionWindow{
	{"Asia", 20, 0, 24, 0},
	{"London", 2, 0, 5, 0},
	{"NY AM", 9, 30, 11, 0},
	{"NY PM", 13, 30, 16, 0},
}

// tradingDayStart trả 18:00 New York mở ngày CME chứa thời điểm t.
func tradingDayStart(t int64) time.Time {
	lt := time.Unix(t, 0).In(NY)
	s := nyTime(lt.Year(), lt.Month(), lt.Day(), 18, 0)
	if lt.Hour() < 18 {
		s = s.AddDate(0, 0, -1)
	}
	return s
}

// SessionLevels trả PDH/PDL (ngày CME gần nhất đã đóng) và High/Low của lần gần nhất đã kết thúc
// của mỗi phiên thanh khoản, kèm thời điểm bị quét. Chỉ đọc nến 1m mở trước cutoff.
func SessionLevels(m1 []Bar, cutoff int64) []Level {
	m1 = between(m1, cutoff-8*86400, cutoff)
	var out []Level
	add := func(name string, from, to time.Time) bool {
		bars := between(m1, from.Unix(), to.Unix())
		if len(bars) == 0 {
			return false
		}
		hi, lo := bars[0].H, bars[0].L
		for _, b := range bars {
			hi, lo = max(hi, b.H), min(lo, b.L)
		}
		end := to.Unix()
		out = append(out,
			Level{Name: name + " High", P: hi, High: true, Formed: end},
			Level{Name: name + " Low", P: lo, Formed: end})
		return true
	}

	// ngày CME đã đóng gần nhất: lùi từng ngày, bỏ qua cuối tuần / ngày nghỉ không có nến
	day := tradingDayStart(cutoff)
	for k := 1; k <= 5; k++ {
		from := day.AddDate(0, 0, -k)
		if add("PD", from, from.AddDate(0, 0, 1)) {
			break
		}
	}
	lt := time.Unix(cutoff, 0).In(NY)
	for _, s := range liquiditySessions {
		for k := 0; k <= 5; k++ {
			d := lt.AddDate(0, 0, -k)
			from := nyTime(d.Year(), d.Month(), d.Day(), s.StartH, s.StartM)
			to := nyTime(d.Year(), d.Month(), d.Day(), 0, 0).Add(time.Duration(s.EndH*60+s.EndM) * time.Minute)
			if to.Unix() > cutoff {
				continue
			}
			if add(s.Name, from, to) {
				break
			}
		}
	}
	for i := range out {
		out[i].Swept = sweptAt(m1, out[i], cutoff)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].P > out[j].P })
	return out
}

// sweptAt trả giờ mở nến 1m đầu tiên (sau khi mức chốt, trước cutoff) giao dịch vượt qua mức.
func sweptAt(m1 []Bar, lv Level, cutoff int64) int64 {
	for _, b := range between(m1, lv.Formed, cutoff) {
		if b.T+60 > cutoff {
			break
		}
		if (lv.High && b.H > lv.P) || (!lv.High && b.L < lv.P) {
			return b.T
		}
	}
	return 0
}

// lastSweep là bước 1a của DOL: mức nào bị quét gần nhất? Quét đỉnh (đi ra từ BSL) thì DOL tiềm
// năng là SSL (Down), quét đáy thì là BSL (Up).
func lastSweep(levels []Level) (Dir, *Level) {
	var best *Level
	for i := range levels {
		if levels[i].Swept != 0 && (best == nil || levels[i].Swept > best.Swept) {
			best = &levels[i]
		}
	}
	if best == nil {
		return Neutral, nil
	}
	if best.High {
		return Down, best
	}
	return Up, best
}
