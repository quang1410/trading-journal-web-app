package main

import (
	"fmt"
	"math"
	"runtime"
	"strings"
	"sync"
	"time"

	"journal/internal/ict"
)

// Tối ưu bản 2: thêm hai mô hình từ hai bài bổ sung (BNQ Model theo xu hướng IRL → ERL; MECH của
// Reese ERL → IRL) và walk-forward CUỐN CHIẾU theo tháng: đầu mỗi tháng chọn bộ luật tốt nhất chỉ
// bằng data trước tháng đó, rồi trade đúng bộ đó trong tháng. Gộp các tháng lại là kết quả thật của
// cách "luôn dùng bộ tối ưu" — không có số nào được chọn sau khi biết kết quả.

type flagDef struct {
	name string
	set  func(r *ict.TradeRules)
}

func optGridV2() []optConfig {
	var out []optConfig
	add := func(model string, base ict.TradeRules, flags []flagDef, targets []flagDef) {
		for mask := 0; mask < 1<<len(flags); mask++ {
			for _, tg := range targets {
				for _, body := range []bool{false, true} {
					for _, limit := range []bool{false, true} {
						r := base
						parts := []string{model}
						for k, f := range flags {
							if mask&(1<<k) != 0 {
								f.set(&r)
								parts = append(parts, f.name)
							}
						}
						tg.set(&r)
						stop, entry := "SL râu", "đóng nến"
						if body {
							r.StopBody, stop = true, "SL thân"
						}
						if limit {
							r.LimitEntry, entry = true, "lệnh chờ"
						}
						out = append(out, optConfig{
							name:  fmt.Sprintf("%s · TP %s · %s · %s", strings.Join(parts, "+"), tg.name, stop, entry),
							rules: r,
						})
					}
				}
			}
		}
	}

	// Quét thanh khoản (IFVG model / MECH): bắt buộc FVG khung lớn
	sweep := ict.DefaultTradeRules()
	add("Quét", sweep, []flagDef{
		{"raid", func(r *ict.TradeRules) { r.NeedStopRaid = true }},
		{"FVGmới", func(r *ict.TradeRules) { r.NeedFreshFVG = true }},
		{"PO3-15m", func(r *ict.TradeRules) { r.NeedPO3Open = true }},
		{"CISD", func(r *ict.TradeRules) { r.NeedCISD = true }},
		{"trueManip", func(r *ict.TradeRules) { r.NeedTrueManip = true }},
		{"khôngNgượcTrend", func(r *ict.TradeRules) { r.NeedNotAgainst = true }},
		{"2giáMở", func(r *ict.TradeRules) { r.NeedOpens2 = true }},
		{"IFVG≤4", func(r *ict.TradeRules) { r.MaxInvertBars = 4 }},
	}, []flagDef{
		{"2R", func(r *ict.TradeRules) { r.RR = 2 }},
		{"3R", func(r *ict.TradeRules) { r.RR = 3 }},
		{"EQ", func(r *ict.TradeRules) { r.TargetEQ = true }},
	})

	// BNQ: theo xu hướng 1H, hồi vào FVG khung lớn, stop hunt swing 1m
	trend := ict.DefaultTradeRules()
	trend.Model, trend.NeedTrendWith = ict.ModelTrend, true
	add("BNQ", trend, []flagDef{
		{"2giáMở", func(r *ict.TradeRules) { r.NeedOpens2 = true }},
		{"trueManip", func(r *ict.TradeRules) { r.NeedTrueManip = true }},
		{"IFVG≤4", func(r *ict.TradeRules) { r.MaxInvertBars = 4 }},
		{"CISD", func(r *ict.TradeRules) { r.NeedCISD = true }},
		{"raid", func(r *ict.TradeRules) { r.NeedStopRaid = true }},
	}, []flagDef{
		{"ERL", func(r *ict.TradeRules) { r.TargetERL = true }},
		{"2R", func(r *ict.TradeRules) { r.RR = 2 }},
		{"3R", func(r *ict.TradeRules) { r.RR = 3 }},
	})
	return out
}

// outcome gọn của một lệnh: đủ để chấm winrate / R theo thời gian.
type outcome struct {
	ok  bool
	win bool
	r   float32
}

// pick là một lựa chọn bộ luật × phiên.
type pick struct {
	cfg     int
	session int // 0 Asia, 1 NY AM, 2 cả hai
}

func runOptimizeV2(nq, es *ict.Chart, o ict.Options, slots []ict.Slot, lastT int64, wfFrom time.Time, minTrain int) {
	var usable []ict.Slot
	for _, s := range slots {
		if s.Horizon <= lastT && hasBars(nq.M1, s.Open, s.WinEnd) {
			usable = append(usable, s)
		}
	}
	preps := make([]*ict.PreparedSession, len(usable))
	parallel(len(usable), func(i int) { preps[i] = ict.PrepareSession(nq, es, usable[i], o) })

	grid := optGridV2()
	res := make([][]outcome, len(grid)) // res[cfg][slot]
	parallel(len(grid), func(c int) {
		row := make([]outcome, len(preps))
		for i, p := range preps {
			if p == nil {
				continue
			}
			if t := p.Simulate(grid[c].rules); t != nil {
				row[i] = outcome{ok: true, win: t.Result == ict.Win, r: float32(t.R)}
			}
		}
		res[c] = row
	})

	inSession := func(i, session int) bool {
		return session == 2 || (session == 0) == (usable[i].Session == "Asia")
	}
	// thống kê của một lựa chọn trên các phiên [from, to)
	stat := func(pk pick, from, to time.Time) (n, win int, sumR, sumSq float64) {
		for i, s := range usable {
			if s.Decision.Before(from) || !s.Decision.Before(to) || !inSession(i, pk.session) {
				continue
			}
			if oc := res[pk.cfg][i]; oc.ok {
				n++
				if oc.win {
					win++
				}
				sumR += float64(oc.r)
				sumSq += float64(oc.r) * float64(oc.r)
			}
		}
		return
	}

	type criterion struct {
		name  string
		score func(n, win int, sumR, sumSq float64) float64
	}
	criteria := []criterion{
		{"R TB cao nhất", func(n, _ int, sumR, _ float64) float64 { return sumR / float64(n) }},
		{"winrate cao nhất", func(n, win int, _, _ float64) float64 { return float64(win) / float64(n) }},
		{"R TB ổn định nhất (t-stat)", func(n, _ int, sumR, sumSq float64) float64 {
			m := sumR / float64(n)
			v := sumSq/float64(n) - m*m
			if v <= 0 {
				return math.Inf(-1)
			}
			return m / math.Sqrt(v/float64(n))
		}},
	}

	start := usable[0].Decision
	end := usable[len(usable)-1].Decision.Add(time.Hour)
	var months []time.Time
	for m := time.Date(wfFrom.Year(), wfFrom.Month(), 1, 0, 0, 0, 0, ict.NY); m.Before(end); m = m.AddDate(0, 1, 0) {
		months = append(months, m)
	}
	sessionName := []string{"Asia", "NY AM", "cả hai"}

	fmt.Printf("# Tối ưu bản 2 — thêm BNQ Model và MECH, walk-forward cuốn chiếu theo tháng\n\n")
	fmt.Printf("- %d bộ luật (%d họ \"Quét\" / MECH, %d họ BNQ) × 3 lựa chọn phiên, trên %d phiên %s → %s.\n",
		len(grid), countPrefix(grid, "Quét"), countPrefix(grid, "BNQ"), len(usable),
		start.Format("02/01/2006"), usable[len(usable)-1].Decision.Format("02/01/2006"))
	fmt.Printf("- Đầu mỗi tháng từ %s: chọn bộ tốt nhất bằng mọi phiên TRƯỚC tháng đó (≥ %d lệnh; ≥ %d nếu một phiên), trade bộ đó cả tháng.\n\n",
		wfFrom.Format("01/2006"), minTrain, minTrain*2/3)

	for _, cr := range criteria {
		var oosN, oosWin int
		var oosR, cum, peak, dd float64
		var lines []string
		for mi, m := range months {
			to := end
			if mi+1 < len(months) {
				to = months[mi+1]
			}
			best, bestScore := pick{-1, 0}, math.Inf(-1)
			for c := range grid {
				for si := 0; si < 3; si++ {
					n, win, sumR, sumSq := stat(pick{c, si}, start, m)
					need := minTrain
					if si < 2 {
						need = minTrain * 2 / 3
					}
					if n < need {
						continue
					}
					if sc := cr.score(n, win, sumR, sumSq); sc > bestScore {
						best, bestScore = pick{c, si}, sc
					}
				}
			}
			if best.cfg < 0 {
				continue
			}
			tn, twin, tR, _ := stat(best, start, m)
			n, win, sumR, _ := stat(best, m, to)
			// sụt vốn theo thứ tự lệnh trong tháng
			for i, s := range usable {
				if s.Decision.Before(m) || !s.Decision.Before(to) || !inSession(i, best.session) {
					continue
				}
				if oc := res[best.cfg][i]; oc.ok {
					cum += float64(oc.r)
					peak = math.Max(peak, cum)
					dd = math.Max(dd, peak-cum)
				}
			}
			oosN, oosWin, oosR = oosN+n, oosWin+win, oosR+sumR
			lines = append(lines, fmt.Sprintf("| %s | %s · %s | %d lệnh, %.0f%%, %+.2fR | %d | %s | %s | %+.1f |",
				m.Format("01/2006"), grid[best.cfg].name, sessionName[best.session], tn, 100*float64(twin)/float64(tn), tR/float64(tn),
				n, pctOf(win, n), avgOf(sumR, n), sumR))
		}
		fmt.Printf("## Chọn theo: %s\n\n", cr.name)
		fmt.Println("| Tháng trade | Bộ được chọn (từ data trước tháng) | Lúc chọn (train) | Lệnh | Winrate | R TB | Tổng R |")
		fmt.Println("|---|---|---|---:|---:|---:|---:|")
		for _, l := range lines {
			fmt.Println(l)
		}
		fmt.Printf("\n**Gộp ngoài mẫu:** %d lệnh · winrate %s · R TB %s · tổng %+.1fR · sụt tối đa %.1fR\n\n",
			oosN, pctOf(oosWin, oosN), avgOf(oosR, oosN), oosR, dd)
	}

	// mốc so sánh: bộ cố định đơn giản trade suốt cùng các tháng
	fmt.Println("## Mốc so sánh: bộ cố định (không tối ưu) trong cùng các tháng")
	fmt.Println()
	fmt.Println("| Bộ cố định | Lệnh | Winrate | R TB | Tổng R |")
	fmt.Println("|---|---:|---:|---:|---:|")
	for c, g := range grid {
		if g.name != "Quét · TP 2R · SL râu · đóng nến" && g.name != "BNQ · TP ERL · SL râu · đóng nến" &&
			g.name != "Quét+raid+FVGmới+PO3-15m · TP EQ · SL râu · đóng nến" {
			continue
		}
		for si := 0; si < 3; si++ {
			n, win, sumR, _ := stat(pick{c, si}, months[0], end)
			fmt.Printf("| %s · %s | %d | %s | %s | %+.1f |\n", g.name, sessionName[si], n, pctOf(win, n), avgOf(sumR, n), sumR)
		}
	}
	fmt.Println()

	// bộ đang được chọn để dùng từ nay (dùng toàn bộ data), cho tin Telegram
	for _, cr := range criteria[:1] {
		best, bestScore := pick{-1, 0}, math.Inf(-1)
		for c := range grid {
			for si := 0; si < 3; si++ {
				n, win, sumR, sumSq := stat(pick{c, si}, start, end)
				need := minTrain
				if si < 2 {
					need = minTrain * 2 / 3
				}
				if n >= need {
					if sc := cr.score(n, win, sumR, sumSq); sc > bestScore {
						best, bestScore = pick{c, si}, sc
					}
				}
			}
		}
		if best.cfg >= 0 {
			n, win, sumR, _ := stat(best, start, end)
			fmt.Printf("Bộ tốt nhất trên TOÀN BỘ data (theo %s): %s · %s — %d lệnh, winrate %s, R TB %s (trong mẫu, sẽ cao hơn thực tế).\n",
				cr.name, grid[best.cfg].name, sessionName[best.session], n, pctOf(win, n), avgOf(sumR, n))
		}
	}
}

func countPrefix(g []optConfig, p string) int {
	n := 0
	for _, c := range g {
		if strings.HasPrefix(c.name, p) {
			n++
		}
	}
	return n
}

func pctOf(a, n int) string {
	if n == 0 {
		return "—"
	}
	return fmt.Sprintf("%.0f%%", 100*float64(a)/float64(n))
}

func avgOf(sum float64, n int) string {
	if n == 0 {
		return "—"
	}
	return fmt.Sprintf("%+.2f", sum/float64(n))
}

// parallel chạy f(0..n-1) trên mọi CPU.
func parallel(n int, f func(i int)) {
	var wg sync.WaitGroup
	jobs := make(chan int)
	for w := 0; w < runtime.NumCPU(); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range jobs {
				f(i)
			}
		}()
	}
	for i := 0; i < n; i++ {
		jobs <- i
	}
	close(jobs)
	wg.Wait()
}
