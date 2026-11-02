package ict

import (
	"fmt"
	"math"
	"strings"
	"time"
)

// Phần soạn tin Telegram. Văn bản thuần (không parse_mode), tiếng Việt vì là text cho người dùng.

var weekdayVI = [...]string{"Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"}

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

func trendText(d Dir) string {
	switch d {
	case Up:
		return "↑ (HH + HL)"
	case Down:
		return "↓ (LH + LL)"
	}
	return "↔ (chưa rõ)"
}

func fvgText(f FVG) string {
	kind := "giảm"
	if f.Bull {
		kind = "tăng"
	}
	return fmt.Sprintf("%s %s %s–%s", f.TF.Name, kind, fmtPrice(f.Bottom), fmtPrice(f.Top))
}

func joinFVGs(fs []FVG) string {
	parts := make([]string, len(fs))
	for i, f := range fs {
		parts[i] = fvgText(f)
	}
	return strings.Join(parts, " · ")
}

func joinLevels(ls []Level, ref time.Time) string {
	if len(ls) == 0 {
		return "—"
	}
	parts := make([]string, len(ls))
	for i, l := range ls {
		parts[i] = levelName(l.Name) + " " + fmtPrice(l.P)
		if l.Swept != 0 {
			parts[i] += " (đã quét " + fmtHM(l.Swept, ref) + ")"
		}
	}
	return strings.Join(parts, " · ")
}

func sideReason(s Side) string {
	if s.HR() {
		return "HR: quét · chạm FVG khung lớn · displacement"
	}
	var have []string
	if s.Swept {
		have = append(have, "quét")
	}
	if s.Tapped {
		have = append(have, "chạm FVG khung lớn")
	}
	if s.Displaced {
		have = append(have, "displacement")
	}
	if len(have) == 0 {
		return "LR"
	}
	return "LR: chỉ có " + strings.Join(have, ", ")
}

// RenderOpen soạn tin trước phiên.
func RenderOpen(b Brief) string {
	n := b.Notice
	at := n.At.In(NY)
	var w strings.Builder
	line := func(format string, args ...any) { fmt.Fprintf(&w, format+"\n", args...) }

	line("NQ · Trước phiên %s · %s %s", n.Session, weekdayVI[at.Weekday()], at.Format("02/01/2006"))
	if b.PriceT == 0 {
		line("Chưa có data.")
		return strings.TrimRight(w.String(), "\n")
	}
	line("Giá %s (nến %s NY · data trễ ~%d phút)", fmtPrice(b.Price), fmtHM(b.PriceT, at),
		int(n.At.Sub(time.Unix(b.PriceT+60, 0)).Minutes()+0.5))
	line("")

	if b.Range != nil {
		tf := b.Range.TF.Name
		if len(b.Skipped) > 0 {
			line("KHUNG THAM CHIẾU %s (%s chưa có range hợp lệ)", tf, strings.Join(b.Skipped, ", "))
		} else {
			line("KHUNG THAM CHIẾU %s", tf)
		}
		line("Cấu trúc %s: %s", tf, trendText(b.Trend))
	} else {
		line("KHUNG THAM CHIẾU: chưa có range hợp lệ từ 15m tới Daily")
	}
	switch {
	case !b.HasES:
		line("SMT với ES: không có data ES")
	case b.SMT == Neutral:
		line("SMT với ES: không có (15m → D)")
	case b.SMT == Up:
		line("SMT với ES: %s tăng lúc %s (NQ đáy thấp hơn, ES đáy cao hơn)", b.SMTTF.Name, fmtHM(b.SMTAt, at))
	default:
		line("SMT với ES: %s giảm lúc %s (NQ đỉnh cao hơn, ES đỉnh thấp hơn)", b.SMTTF.Name, fmtHM(b.SMTAt, at))
	}
	line("")

	line("THANH KHOẢN")
	line("BSL  %s", joinLevels(b.BSL, at))
	line("SSL  %s", joinLevels(b.SSL, at))
	if b.HasRefOpen {
		zone := "Discount"
		if b.Price > b.RefOpen {
			zone = "Premium"
		}
		line("%s %s → giá đang ở %s", b.RefOpenName, fmtPrice(b.RefOpen), zone)
	}
	line("")

	from := "15m"
	if b.Range != nil {
		from = b.Range.TF.Name
	}
	line("FVG (%s → 4H)", from)
	if len(b.Held) > 0 {
		line("Giữ 24h: %s", joinFVGs(b.Held))
	}
	if len(b.Broken) > 0 {
		line("Phá 24h: %s", joinFVGs(b.Broken))
	}
	if len(b.FreshAbove) > 0 {
		line("Mới, phía trên: %s", joinFVGs(b.FreshAbove))
	}
	if len(b.FreshBelow) > 0 {
		line("Mới, phía dưới: %s", joinFVGs(b.FreshBelow))
	}
	if len(b.Held)+len(b.Broken)+len(b.FreshAbove)+len(b.FreshBelow) == 0 {
		line("Không có FVG đáng chú ý")
	}
	line("")

	if rg := b.Range; rg != nil {
		line("RANGE %s: %s", rg.TF.Name, rg.Kind())
		line("Đỉnh %s (%s)", fmtPrice(rg.High.P), sideReason(rg.High))
		line("Đáy %s (%s)", fmtPrice(rg.Low.P), sideReason(rg.Low))
		line("")
		switch {
		case rg.Cond != nil && rg.Dir == Up:
			line("KỊCH BẢN (điều kiện FVG %s)", fvgText(*rg.Cond))
			line("A. Tôn trọng → về BSL %s", fmtPrice(rg.High.P))
			line("B. Nến %s đóng dưới %s → về SSL %s", rg.Cond.TF.Name, fmtPrice(rg.Cond.Bottom), fmtPrice(rg.Low.P))
		case rg.Cond != nil && rg.Dir == Down:
			line("KỊCH BẢN (điều kiện FVG %s)", fvgText(*rg.Cond))
			line("A. Tôn trọng → về SSL %s", fmtPrice(rg.Low.P))
			line("B. Nến %s đóng trên %s → về BSL %s", rg.Cond.TF.Name, fmtPrice(rg.Cond.Top), fmtPrice(rg.High.P))
		case rg.High.HR() && rg.Low.HR():
			line("KỊCH BẢN (HR vs HR, Equilibrium %s)", fmtPrice(rg.EQ()))
			line("Tôn trọng FVG giảm ở Premium + phá FVG tăng ở Discount → về đáy %s; ngược lại → về đỉnh %s",
				fmtPrice(rg.Low.P), fmtPrice(rg.High.P))
		default:
			line("KỊCH BẢN (LR vs LR): không vào lệnh khi giá còn trong range")
			line("Nến %s đóng trên %s → tiếp diễn lên · đóng dưới %s → tiếp diễn xuống",
				rg.TF.Name, fmtPrice(rg.High.P), fmtPrice(rg.Low.P))
		}
		line("")
	}

	dol := map[Dir]string{Up: "BSL", Down: "SSL", Neutral: "chưa rõ"}[b.Step1]
	if b.CameLevel != nil {
		line("DOL tiềm năng theo luật: %s (vừa quét %s %s) — chưa kiểm chứng, backtest ~50%%",
			dol, levelName(b.CameLevel.Name), fmtPrice(b.CameLevel.P))
	} else {
		line("DOL tiềm năng theo luật: %s — chưa kiểm chứng, backtest ~50%%", dol)
	}
	line("Checklist A+: tích lũy → quét giả → FVG ≥15m (ES cũng vào FVG / SMT) → PO3 nến 15m → IFVG thân đầy · stop raid · stop sạch")
	return strings.TrimRight(w.String(), "\n")
}
