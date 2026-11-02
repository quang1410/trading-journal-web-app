package ict

import (
	"fmt"
	"math"
	"strings"
	"time"
)

// Phần soạn tin Telegram. Văn bản thuần (không parse_mode), tiếng Việt vì là text cho người dùng.

// fmtPrice: 21345.25 → "21 345.25" (2 chữ số thập phân, khoảng trắng tách hàng nghìn).
func fmtPrice(p float64) string {
	s := fmt.Sprintf("%.2f", math.Abs(p))
	intPart, frac := s[:len(s)-3], s[len(s)-3:]
	var b strings.Builder
	for i, ch := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			b.WriteByte(' ')
		}
		b.WriteRune(ch)
	}
	if p < 0 {
		return "-" + b.String() + frac
	}
	return b.String() + frac
}

// fmtHM: giờ New York "HH:MM"; khác ngày với ref thì thêm "dd/mm".
func fmtHM(t int64, ref time.Time) string {
	lt := time.Unix(t, 0).In(NY)
	r := ref.In(NY)
	if lt.YearDay() != r.YearDay() || lt.Year() != r.Year() {
		return lt.Format("15:04 02/01")
	}
	return lt.Format("15:04")
}

// levelName: "PD High" → "PDH", còn lại giữ nguyên ("Asia High", "London Low"…).
func levelName(n string) string {
	switch n {
	case "PD High":
		return "PDH"
	case "PD Low":
		return "PDL"
	}
	return n
}

var weekdayShort = [...]string{"CN", "T2", "T3", "T4", "T5", "T6", "T7"}

// fmtShort: giá gọn — bỏ phần thập phân bằng 0 ("29 471", "29 568.5", "29 446.25").
func fmtShort(p float64) string {
	s := fmtPrice(p)
	s = strings.TrimSuffix(s, ".00")
	if strings.Contains(s, ".") {
		s = strings.TrimRight(s, "0")
	}
	return s
}

// shortLevel: "PD High" → "PDH", "London Low" → "London L".
func shortLevel(n string) string {
	if v := levelName(n); v != n {
		return v
	}
	n = strings.TrimSuffix(n, " High") + map[bool]string{true: " H", false: ""}[strings.HasSuffix(n, " High")]
	return strings.Replace(n, " Low", " L", 1)
}

// unswept: tối đa k mức chưa bị quét, gần giá nhất trước (Brief đã sắp sẵn).
func unswept(ls []Level, k int) []Level {
	var out []Level
	for _, l := range ls {
		if l.Swept == 0 && len(out) < k {
			out = append(out, l)
		}
	}
	return out
}

func levelLine(ls []Level) string {
	// gộp các mức trùng giá trước khi lấy 2 mức gần nhất: "29 033 PDL = NY PM L"
	var free []Level
	for _, l := range unswept(ls, len(ls)) {
		if k := len(free) - 1; k >= 0 && free[k].P == l.P {
			free[k].Name += " = " + shortLevel(l.Name)
			continue
		}
		l.Name = shortLevel(l.Name)
		free = append(free, l)
	}
	free = free[:min(len(free), 2)]
	if len(free) == 0 {
		if len(ls) == 0 {
			return "—"
		}
		return "đã quét hết"
	}
	parts := make([]string, len(free))
	for i, l := range free {
		parts[i] = fmtShort(l.P) + " " + l.Name
	}
	return strings.Join(parts, " · ")
}

func zoneText(f FVG) string {
	return fmt.Sprintf("%s–%s (%s)", fmtShort(f.Bottom), fmtShort(f.Top), f.TF.Name)
}

// RenderOpen soạn tin trước phiên, gọn khoảng 8 dòng: vị trí giá, khung tham chiếu + SMT, range và
// kịch bản, thanh khoản gần nhất chưa quét, FVG mới gần nhất.
func RenderOpen(b Brief) string {
	n := b.Notice
	at := n.At.In(NY)
	var w strings.Builder
	line := func(format string, args ...any) { fmt.Fprintf(&w, format+"\n", args...) }

	line("NQ · Trước phiên %s · %s %s", n.Session, weekdayShort[at.Weekday()], at.Format("02/01"))
	if b.PriceT == 0 {
		line("Chưa có data.")
		return strings.TrimRight(w.String(), "\n")
	}
	if b.HasRefOpen {
		zone := "Discount"
		if b.Price > b.RefOpen {
			zone = "Premium"
		}
		line("Giá %s · %s (%s %s)", fmtShort(b.Price), zone, b.RefOpenName, fmtShort(b.RefOpen))
	} else {
		line("Giá %s", fmtShort(b.Price))
	}

	smt := "không"
	switch {
	case !b.HasES:
		smt = "không có data ES"
	case b.SMT == Up:
		smt = fmt.Sprintf("tăng %s %s", b.SMTTF.Name, fmtHM(b.SMTAt, at))
	case b.SMT == Down:
		smt = fmt.Sprintf("giảm %s %s", b.SMTTF.Name, fmtHM(b.SMTAt, at))
	}
	arrow := map[Dir]string{Up: "↑", Down: "↓", Neutral: "↔"}[b.Trend]
	if rg := b.Range; rg != nil {
		line("%s %s · SMT ES: %s", rg.TF.Name, arrow, smt)
		kind := strings.ReplaceAll(rg.Kind(), " vs ", "/")
		line("Range %s–%s · %s", fmtShort(rg.Low.P), fmtShort(rg.High.P), kind)
		switch {
		case rg.Cond != nil && rg.Dir == Up:
			line("→ Giữ FVG %s → BSL %s · đóng dưới %s → SSL %s", zoneText(*rg.Cond),
				fmtShort(rg.High.P), fmtShort(rg.Cond.Bottom), fmtShort(rg.Low.P))
		case rg.Cond != nil && rg.Dir == Down:
			line("→ Giữ FVG %s → SSL %s · đóng trên %s → BSL %s", zoneText(*rg.Cond),
				fmtShort(rg.Low.P), fmtShort(rg.Cond.Top), fmtShort(rg.High.P))
		case rg.High.HR() && rg.Low.HR():
			line("→ EQ %s: giữ FVG giảm ở Premium → đáy · giữ FVG tăng ở Discount → đỉnh", fmtShort(rg.EQ()))
		default:
			line("→ Chờ nến %s đóng ngoài range", rg.TF.Name)
		}
	} else {
		line("Chưa có range 15m → D · SMT ES: %s", smt)
	}

	line("BSL %s", levelLine(b.BSL))
	line("SSL %s", levelLine(b.SSL))

	var fresh []string
	if len(b.FreshAbove) > 0 {
		fresh = append(fresh, "↓ "+zoneText(b.FreshAbove[0]))
	}
	if len(b.FreshBelow) > 0 {
		fresh = append(fresh, "↑ "+zoneText(b.FreshBelow[0]))
	}
	if len(fresh) > 0 {
		line("FVG mới %s", strings.Join(fresh, " · "))
	}
	return strings.TrimRight(w.String(), "\n")
}
