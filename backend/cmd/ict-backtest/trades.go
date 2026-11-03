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
	aplus := ict.APlusRules()
	with := func(r ict.TradeRules, f func(r *ict.TradeRules)) ict.TradeRules {
		f(&r)
		return r
	}
	bnq := base
	bnq.Model, bnq.NeedTrendWith, bnq.TargetERL = ict.ModelTrend, true, true
	mech := with(base, func(r *ict.TradeRules) {
		r.NeedStopRaid, r.NeedFreshFVG, r.NeedPO3Open, r.TargetEQ = true, true, true, true
	})
	full := with(aplus, func(r *ict.TradeRules) { r.NeedStopRaid, r.NeedCleanStop, r.NeedKeyLiq = true, true, true })
	return []variant{
		{"IFVG cơ bản: quét mức + FVG ≥15m + IFVG · TP 2R", base},
		{"Cơ bản + stop raid · TP 2R", with(base, func(r *ict.TradeRules) { r.NeedStopRaid = true })},
		{"A+ (AMD + FVG mới + true manip + PO3 15m + IFVG mạnh) · TP 2R", aplus},
		{"A+ · TP 1R", with(aplus, func(r *ict.TradeRules) { r.RR = 1 })},
		{"A+ · TP đỉnh/đáy tích lũy (mục tiêu Reese)", with(aplus, func(r *ict.TradeRules) { r.TargetAccum = true })},
		{"A+ · lệnh chờ ở mép IFVG · TP 2R", with(aplus, func(r *ict.TradeRules) { r.LimitEntry = true })},
		{"A+ + CISD · TP 2R", with(aplus, func(r *ict.TradeRules) { r.NeedCISD = true })},
		{"A+ + SMT · TP 2R", with(aplus, func(r *ict.TradeRules) { r.NeedSMT = true })},
		{"A+ đủ (+ stop raid + stop sạch + quét mức phiên) · TP 2R", full},
		{"A+ đủ · TP 1R", with(full, func(r *ict.TradeRules) { r.RR = 1 })},
		{"A+ đủ · TP đỉnh/đáy tích lũy", with(full, func(r *ict.TradeRules) { r.TargetAccum = true })},
		{"A+ đủ · lệnh chờ ở mép IFVG · TP 2R", with(full, func(r *ict.TradeRules) { r.LimitEntry = true })},
		{"BNQ (theo xu hướng 1H, hồi vào FVG, stop hunt, IFVG) · TP ERL", bnq},
		{"BNQ · TP ERL · SL thân", with(bnq, func(r *ict.TradeRules) { r.StopBody = true })},
		{"BNQ · TP 2R", with(bnq, func(r *ict.TradeRules) { r.TargetERL, r.RR = false, 2 })},
		{"BNQ · TP 1R", with(bnq, func(r *ict.TradeRules) { r.TargetERL, r.RR = false, 1 })},
		{"BNQ + 2 giá mở · TP ERL", with(bnq, func(r *ict.TradeRules) { r.NeedOpens2 = true })},
		{"BNQ + true manip · TP ERL", with(bnq, func(r *ict.TradeRules) { r.NeedTrueManip = true })},
		{"BNQ không lọc xu hướng · TP ERL (kiểm tra vai trò xu hướng)", with(bnq, func(r *ict.TradeRules) { r.NeedTrendWith = false })},
		{"MECH (quét + raid + FVG mới + PO3 15m) · TP EQ", mech},
		{"MECH + không ngược xu hướng · TP EQ", with(mech, func(r *ict.TradeRules) { r.NeedNotAgainst = true })},
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
			if i == 2 {
				sample = append(sample, t)
			}
		}
	}

	fmt.Printf("# Backtest vào lệnh M1 — %s (SMT với %s)\n\n", nqName, orNone(esName))
	fmt.Printf("- %d phiên (Asia 19:00–21:00, NY AM 09:30–11:00 giờ New York), %s → %s; tối đa 1 lệnh mỗi phiên.\n",
		sessions, firstT.Format("2006-01-02"), lastUsed.Format("2006-01-02"))
	fmt.Println("- Vào lệnh ở giá đóng nến IFVG 1m (hoặc lệnh chờ ở mép IFVG); SL = cực trị thao túng ± 0,25; SL và TP cùng nến tính là SL.")
	fmt.Println("- Lệnh chưa chạm TP/SL thì đóng lúc 16:00 (NY) / 05:00 (Asia). Hoà vốn: TP 2R cần winrate 33,3%, TP 1R cần 50%.")
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
	fmt.Println("## 15 lệnh gần nhất của A+ · TP 2R (để soát trên /replay)")
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
