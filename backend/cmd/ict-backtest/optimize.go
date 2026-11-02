package main

import (
	"fmt"
	"math"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"journal/internal/ict"
)

// Tối ưu có kiểm chứng (walk-forward một lần): dò mọi tổ hợp bộ lọc / mục tiêu / cách vào lệnh /
// phiên CHỈ trên phần đầu data (train), chọn bộ tốt nhất, rồi chấm bộ đó trên phần sau (test) mà
// nó chưa thấy. Bộ nào vẫn lời ở test mới là lợi thế; bộ chỉ đẹp ở train là khớp ngẫu nhiên.

type optConfig struct {
	name  string
	rules ict.TradeRules
}

type optStat struct {
	n, win  int
	sumR    float64
	sumRisk float64
}

func (s *optStat) add(t *ict.Trade) {
	s.n++
	if t.Result == ict.Win {
		s.win++
	}
	s.sumR += t.R
	s.sumRisk += t.Risk()
}

func (s optStat) avgR() float64 {
	if s.n == 0 {
		return math.NaN()
	}
	return s.sumR / float64(s.n)
}

func (s optStat) rate() float64 {
	if s.n == 0 {
		return math.NaN()
	}
	return float64(s.win) / float64(s.n)
}

// optGrid: 10 bộ lọc bật/tắt × 5 mục tiêu × 2 cách vào lệnh = 10 240 bộ luật.
func optGrid() []optConfig {
	type flag struct {
		name string
		set  func(r *ict.TradeRules)
	}
	flags := []flag{
		{"FVG≥15m", func(r *ict.TradeRules) { r.NeedHTFFVG = true }},
		{"raid", func(r *ict.TradeRules) { r.NeedStopRaid = true }},
		{"DOL", func(r *ict.TradeRules) { r.NeedDOL = true }},
		{"PO3-1H", func(r *ict.TradeRules) { r.NeedPO3 = true }},
		{"AMD", func(r *ict.TradeRules) { r.NeedAccum = true }},
		{"trueManip", func(r *ict.TradeRules) { r.NeedTrueManip = true }},
		{"PO3-15m", func(r *ict.TradeRules) { r.NeedPO3Open = true }},
		{"stopSạch", func(r *ict.TradeRules) { r.NeedCleanStop = true }},
		{"CISD", func(r *ict.TradeRules) { r.NeedCISD = true }},
		{"IFVGmạnh", func(r *ict.TradeRules) { r.MaxWick, r.MaxInvertBars = 0.2, 3 }},
	}
	targets := []struct {
		name string
		set  func(r *ict.TradeRules)
	}{
		{"1R", func(r *ict.TradeRules) { r.RR = 1 }},
		{"1.5R", func(r *ict.TradeRules) { r.RR = 1.5 }},
		{"2R", func(r *ict.TradeRules) { r.RR = 2 }},
		{"3R", func(r *ict.TradeRules) { r.RR = 3 }},
		{"đỉnh tích lũy", func(r *ict.TradeRules) { r.TargetAccum = true }},
	}
	var out []optConfig
	for mask := 0; mask < 1<<len(flags); mask++ {
		for _, tg := range targets {
			for _, limit := range []bool{false, true} {
				r := ict.DefaultTradeRules()
				r.NeedHTFFVG = false
				var parts []string
				for k, f := range flags {
					if mask&(1<<k) != 0 {
						f.set(&r)
						parts = append(parts, f.name)
					}
				}
				tg.set(&r)
				entry := "đóng nến"
				if limit {
					r.LimitEntry = true
					entry = "lệnh chờ"
				}
				name := strings.Join(parts, "+")
				if name == "" {
					name = "chỉ quét+IFVG"
				}
				out = append(out, optConfig{name: fmt.Sprintf("%s · TP %s · %s", name, tg.name, entry), rules: r})
			}
		}
	}
	return out
}

func runOptimize(nq, es *ict.Chart, o ict.Options, slots []ict.Slot, lastT int64, split time.Time, minTrain int) {
	// chuẩn bị mỗi phiên một lần (phân tích là phần tốn thời gian), song song
	var preps []*ict.PreparedSession
	{
		var usable []ict.Slot
		for _, s := range slots {
			if s.Horizon <= lastT && hasBars(nq.M1, s.Open, s.WinEnd) {
				usable = append(usable, s)
			}
		}
		preps = make([]*ict.PreparedSession, len(usable))
		var wg sync.WaitGroup
		sem := make(chan struct{}, runtime.NumCPU())
		for i, s := range usable {
			wg.Add(1)
			sem <- struct{}{}
			go func() {
				defer wg.Done()
				preps[i] = ict.PrepareSession(nq, es, s, o)
				<-sem
			}()
		}
		wg.Wait()
	}

	grid := optGrid()
	sessions := []string{"Asia", "NY AM", "cả hai"}
	// stats[config][phiên][0 = train, 1 = test]
	stats := make([][3][2]optStat, len(grid))
	var wg sync.WaitGroup
	jobs := make(chan int)
	for w := 0; w < runtime.NumCPU(); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for c := range jobs {
				for _, p := range preps {
					if p == nil {
						continue
					}
					t := p.Simulate(grid[c].rules)
					if t == nil {
						continue
					}
					part := 0
					if !p.Slot.Decision.Before(split) {
						part = 1
					}
					si := 1
					if p.Slot.Session == "Asia" {
						si = 0
					}
					stats[c][si][part].add(t)
					stats[c][2][part].add(t)
				}
			}
		}()
	}
	for c := range grid {
		jobs <- c
	}
	close(jobs)
	wg.Wait()

	type row struct {
		name        string
		train, test optStat
	}
	var rows []row
	for c, g := range grid {
		for si, sn := range sessions {
			min := minTrain
			if si < 2 {
				min = minTrain * 2 / 3
			}
			st := stats[c][si]
			if st[0].n < min {
				continue
			}
			rows = append(rows, row{name: g.name + " · " + sn, train: st[0], test: st[1]})
		}
	}

	var trainPos, bothPos int
	var xs, ys []float64
	for _, r := range rows {
		if r.train.avgR() > 0 {
			trainPos++
			if r.test.n > 0 && r.test.avgR() > 0 {
				bothPos++
			}
		}
		if r.test.n >= 10 {
			xs, ys = append(xs, r.train.avgR()), append(ys, r.test.avgR())
		}
	}

	fmt.Printf("# Tối ưu có kiểm chứng — train trước %s, test từ %s\n\n", split.Format("02/01/2006"), split.Format("02/01/2006"))
	fmt.Printf("- %d bộ luật × 3 lựa chọn phiên; giữ %d tổ hợp có ≥ %d lệnh ở train (≥ %d nếu một phiên).\n",
		len(grid), len(rows), minTrain, minTrain*2/3)
	fmt.Printf("- Lời ở train (R TB > 0): %d tổ hợp; trong đó vẫn lời ở test: %d (%.0f%%).\n",
		trainPos, bothPos, 100*float64(bothPos)/math.Max(float64(trainPos), 1))
	fmt.Printf("- Tương quan R TB train ↔ test (tổ hợp có ≥ 10 lệnh test): %.2f — gần 0 nghĩa là train không đoán được test.\n\n", pearson(xs, ys))

	table := func(title string, rs []row) {
		fmt.Println("## " + title)
		fmt.Println()
		fmt.Println("| Bộ luật · phiên | Train: lệnh | Train: winrate | Train: R TB | Test: lệnh | Test: winrate | Test: R TB | Test: tổng R |")
		fmt.Println("|---|---:|---:|---:|---:|---:|---:|---:|")
		for _, r := range rs {
			fmt.Printf("| %s | %d | %.0f%% | %+.2f | %d | %s | %s | %+.1f |\n", r.name, r.train.n, 100*r.train.rate(),
				r.train.avgR(), r.test.n, pct(r.test), signed(r.test), r.test.sumR)
		}
		fmt.Println()
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].train.avgR() > rows[j].train.avgR() })

	// mốc so sánh: test có phải tự nó là giai đoạn dễ thắng? So R TB test của nhóm chọn theo train với
	// R TB test của mọi tổ hợp cùng phiên.
	meanTest := func(rs []row, filter func(row) bool) (float64, int) {
		var sum float64
		var n int
		for _, r := range rs {
			if r.test.n > 0 && filter(r) {
				sum += r.test.avgR()
				n++
			}
		}
		return sum / math.Max(float64(n), 1), n
	}
	all := func(row) bool { return true }
	for _, k := range []int{15, 50, 200} {
		top := rows[:min(k, len(rows))]
		m, n := meanTest(top, all)
		fmt.Printf("- Top %d theo train: R TB ở test trung bình %+.2f (%d tổ hợp có lệnh test).\n", k, m, n)
	}
	for _, sn := range sessions {
		m, n := meanTest(rows, func(r row) bool { return strings.HasSuffix(r.name, " · "+sn) })
		fmt.Printf("- Mọi tổ hợp phiên %s: R TB ở test trung bình %+.2f (%d tổ hợp) — mốc so sánh.\n", sn, m, n)
	}
	fmt.Println()
	table("15 bộ tốt nhất ở TRAIN — và kết quả thật của chúng ở TEST", rows[:min(15, len(rows))])

	// mức tốt nhất "nhìn lại" ở test, chỉ để thấy độ chênh do chọn sau khi biết kết quả
	var withTest []row
	for _, r := range rows {
		if r.test.n >= 15 {
			withTest = append(withTest, r)
		}
	}
	sort.Slice(withTest, func(i, j int) bool { return withTest[i].test.avgR() > withTest[j].test.avgR() })
	table("5 bộ tốt nhất ở TEST nếu chọn sau khi đã biết kết quả (≥ 15 lệnh test) — không dùng được để trade", withTest[:min(5, len(withTest))])
}

func pct(s optStat) string {
	if s.n == 0 {
		return "—"
	}
	return fmt.Sprintf("%.0f%%", 100*s.rate())
}

func signed(s optStat) string {
	if s.n == 0 {
		return "—"
	}
	return fmt.Sprintf("%+.2f", s.avgR())
}

func pearson(xs, ys []float64) float64 {
	n := float64(len(xs))
	if n < 3 {
		return math.NaN()
	}
	var mx, my float64
	for i := range xs {
		mx += xs[i]
		my += ys[i]
	}
	mx, my = mx/n, my/n
	var sxy, sxx, syy float64
	for i := range xs {
		dx, dy := xs[i]-mx, ys[i]-my
		sxy += dx * dy
		sxx += dx * dx
		syy += dy * dy
	}
	return sxy / math.Sqrt(sxx*syy)
}
