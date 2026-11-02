package main

import (
	"fmt"
	"math"
	"sort"
	"time"

	"journal/internal/ict"
)

type variant struct {
	name  string
	rules ict.TradeRules
}

func tradeVariants() []variant {
	base := ict.DefaultTradeRules()
	with := func(f func(r *ict.TradeRules)) ict.TradeRules {
		r := base
		f(&r)
		return r
	}
	return []variant{
		{"Chỉ quét + IFVG (không cần FVG khung lớn)", with(func(r *ict.TradeRules) { r.NeedHTFFVG = false })},
		{"IFVG model: quét + FVG ≥15m + IFVG", base},
		{"+ stop raid", with(func(r *ict.TradeRules) { r.NeedStopRaid = true })},
		{"+ SMT với ES", with(func(r *ict.TradeRules) { r.NeedSMT = true })},
		{"+ cùng hướng DOL (bước 1)", with(func(r *ict.TradeRules) { r.NeedDOL = true })},
		{"+ discount/premium theo nến 1H (OXXC/PO3)", with(func(r *ict.TradeRules) { r.NeedPO3 = true })},
		{"+ stop raid + PO3", with(func(r *ict.TradeRules) { r.NeedStopRaid, r.NeedPO3 = true, true })},
		{"Đủ checklist: stop raid + SMT + DOL + PO3", with(func(r *ict.TradeRules) {
			r.NeedStopRaid, r.NeedSMT, r.NeedDOL, r.NeedPO3 = true, true, true, true
		})},
	}
}

type tradeStats struct {
	name                  string
	n, win, loss, timeout int
	sumR, sumRisk, sumNet float64
	maxDD, peak, cum      float64
	risks                 []float64
}

// costPts: phí + trượt giá giả định mỗi lệnh (điểm), để xem kỳ vọng còn dương không.
const costPts = 1.0

func (s *tradeStats) add(t *ict.Trade) {
	s.n++
	switch t.Result {
	case ict.Win:
		s.win++
	case ict.Loss:
		s.loss++
	default:
		s.timeout++
	}
	s.sumR += t.R
	risk := t.Risk()
	s.sumRisk += risk
	s.risks = append(s.risks, risk)
	s.sumNet += t.R - costPts/risk
	s.cum += t.R
	s.peak = math.Max(s.peak, s.cum)
	s.maxDD = math.Max(s.maxDD, s.peak-s.cum)
}

func printTradeTable(stats []*tradeStats) {
	fmt.Println()
	fmt.Println("| Luật | Lệnh | TP | SL | Hết giờ | Winrate (TP/lệnh) | 95% CI | R TB | Tổng R | Sụt tối đa (R) | Rủi ro TB (điểm) | R TB sau phí 1 điểm |")
	fmt.Println("|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|")
	for _, s := range stats {
		if s.n == 0 {
			fmt.Printf("| %s | 0 | | | | — | — | — | — | — | — | — |\n", s.name)
			continue
		}
		t := ict.Tally{Win: s.win, Loss: s.loss + s.timeout}
		p, lo, hi := t.Rate()
		fmt.Printf("| %s | %d | %d | %d | %d | **%.1f%%** | %.0f–%.0f%% | %+.2f | %+.1f | %.1f | %.1f | %+.2f |\n",
			s.name, s.n, s.win, s.loss, s.timeout, p*100, lo*100, hi*100,
			s.sumR/float64(s.n), s.sumR, s.maxDD, s.sumRisk/float64(s.n), s.sumNet/float64(s.n))
	}
	fmt.Println()
}

func runTrades(nq, es *ict.Chart, o ict.Options, slots []ict.Slot, lastT int64, nqName, esName string) {
	vars := tradeVariants()
	all := make([]*tradeStats, len(vars))
	bySession := map[string][]*tradeStats{}
	byHalf := map[string][]*tradeStats{} // chia đôi thời gian: luật tốt thật thì tốt ở cả hai nửa
	for i, v := range vars {
		all[i] = &tradeStats{name: v.name}
	}
	var sample []*ict.Trade
	var sessions int
	var firstT, lastUsed time.Time
	for _, s := range slots {
		if s.Horizon > lastT {
			break
		}
		if !hasBars(nq.M1, s.Open, s.WinEnd) {
			continue
		}
		sessions++
		if firstT.IsZero() {
			firstT = s.Decision
		}
		lastUsed = s.Decision
		for i, v := range vars {
			t := ict.SimulateSession(nq, es, s, v.rules, o)
			if t == nil {
				continue
			}
			all[i].add(t)
			if _, ok := bySession[s.Session]; !ok {
				bySession[s.Session] = make([]*tradeStats, len(vars))
				for k, vv := range vars {
					bySession[s.Session][k] = &tradeStats{name: vv.name}
				}
			}
			bySession[s.Session][i].add(t)
			half := "tháng 1–5"
			if s.Decision.Month() >= time.June {
				half = "tháng 6–10"
			}
			for _, key := range []string{"Tất cả phiên, " + half, s.Session + ", " + half} {
				if _, ok := byHalf[key]; !ok {
					byHalf[key] = make([]*tradeStats, len(vars))
					for k, vv := range vars {
						byHalf[key][k] = &tradeStats{name: vv.name}
					}
				}
				byHalf[key][i].add(t)
			}
			if i == 1 {
				sample = append(sample, t)
			}
		}
	}

	fmt.Printf("# Backtest vào lệnh M1, TP %.0fR — %s (SMT với %s)\n\n", ict.DefaultTradeRules().RR, nqName, orNone(esName))
	fmt.Printf("- %d phiên (Asia 19:00–21:00, NY AM 09:30–11:00 giờ New York), %s → %s; tối đa 1 lệnh mỗi phiên.\n",
		sessions, firstT.Format("2006-01-02"), lastUsed.Format("2006-01-02"))
	fmt.Println("- Vào lệnh ở giá đóng nến IFVG 1m; SL = cực trị thao túng ± 0,25; TP = 2R; SL và TP cùng nến tính là SL.")
	fmt.Println("- Lệnh chưa chạm TP/SL thì đóng lúc 16:00 (NY) / 05:00 (Asia). Hoà vốn ở TP 2R cần winrate 33,3%.")
	fmt.Println()
	fmt.Println("## Tất cả phiên")
	printTradeTable(all)
	keys := make([]string, 0, len(bySession))
	for k := range bySession {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Printf("## Phiên %s\n", k)
		printTradeTable(bySession[k])
	}
	hk := make([]string, 0, len(byHalf))
	for k := range byHalf {
		hk = append(hk, k)
	}
	sort.Strings(hk)
	for _, k := range hk {
		fmt.Printf("## Kiểm tra độ bền: %s\n", k)
		printTradeTable(byHalf[k])
	}
	fmt.Println("## 15 lệnh gần nhất của IFVG model (để soát trên /replay)")
	fmt.Println()
	fmt.Println("| Vào lệnh (NY) | Phiên | Hướng | Quét | Entry | SL | TP | Kết quả | R |")
	fmt.Println("|---|---|---|---|---:|---:|---:|---|---:|")
	if len(sample) > 15 {
		sample = sample[len(sample)-15:]
	}
	for _, t := range sample {
		res := map[ict.Result]string{ict.Win: "TP", ict.Loss: "SL", ict.Open: "hết giờ"}[t.Result]
		side := "LONG"
		if t.Dir == ict.Down {
			side = "SHORT"
		}
		fmt.Printf("| %s | %s | %s | %s | %.2f | %.2f | %.2f | %s | %+.2f |\n",
			time.Unix(t.EntryT, 0).In(ict.NY).Format("2006-01-02 15:04"), t.Session, side, t.Level,
			t.Entry, t.Stop, t.Target, res, t.R)
	}
	fmt.Println()
}
