// Lệnh ict-backtest chạy phân tích bias của package ict trên data nến 1m có sẵn trong repo
// (frontend/public/replay-data/*.bin) và in báo cáo tỉ lệ đúng dạng Markdown.
//
//	go run ./cmd/ict-backtest -data ../frontend/public/replay-data -nq US100 -es US500
//
// Mỗi phiên (Asia 18:55, NY AM 09:25 giờ New York) bot chỉ thấy nến đóng trước giờ gửi tin 10 phút
// (mô phỏng data CME miễn phí bị trễ), rồi dự đoán phía nào của range bị lấy trước.
package main

import (
	"flag"
	"fmt"
	"log"
	"sort"
	"time"

	"journal/internal/ict"
	"journal/internal/replaydata"
)

func main() {
	dir := flag.String("data", "../frontend/public/replay-data", "directory holding manifest.json and *.bin")
	nqName := flag.String("nq", "US100", "symbol standing in for NQ")
	esName := flag.String("es", "US500", "symbol standing in for ES (SMT); empty = no SMT")
	minTF := flag.String("min-tf", "15m", "smallest timeframe allowed as the range")
	optimize2 := flag.Bool("optimize2", false, "rolling monthly walk-forward over both ICT models (sweep/MECH and BNQ)")
	wfFrom := flag.String("wf-from", "2026-04-01", "first month traded out of sample by -optimize2")
	optimize := flag.Bool("optimize", false, "grid-search entry rules on the first part of the data and score them on the rest")
	split := flag.String("split", "2026-07-01", "first day of the out-of-sample (test) period for -optimize")
	minTrain := flag.Int("min-train", 30, "minimum trades in the training period for a rule set to be ranked")
	trades := flag.Bool("trades", false, "simulate M1 entries (IFVG model, TP 2R) instead of scoring the bias")
	warmup := flag.Int("warmup-days", 20, "skip the first N days so higher timeframes have enough bars")
	flag.Parse()

	nqBars, err := replaydata.Load(*dir, *nqName)
	if err != nil {
		log.Fatal(err)
	}
	nq := ict.NewChart(nqBars)
	var es *ict.Chart
	if *esName != "" {
		esBars, err := replaydata.Load(*dir, *esName)
		if err != nil {
			log.Fatal(err)
		}
		es = ict.NewChart(esBars)
	}

	o := ict.DefaultOptions()
	for _, tf := range ict.Timeframes {
		if tf.Name == *minTF {
			o.MinRank = tf.Rank
		}
	}
	first := time.Unix(nqBars[0].T, 0).AddDate(0, 0, *warmup)
	lastT := nqBars[len(nqBars)-1].T
	slots := ict.BiasSlots(first, time.Unix(lastT, 0))
	if *optimize2 {
		wf, err := time.ParseInLocation("2006-01-02", *wfFrom, ict.NY)
		if err != nil {
			log.Fatal(err)
		}
		runOptimizeV2(nq, es, o, slots, lastT, wf, *minTrain)
		return
	}
	if *optimize {
		sp, err := time.ParseInLocation("2006-01-02", *split, ict.NY)
		if err != nil {
			log.Fatal(err)
		}
		runOptimize(nq, es, o, slots, lastT, sp, *minTrain)
		return
	}
	if *trades {
		runTrades(nq, es, o, slots, lastT, *nqName, *esName)
		return
	}
	run(nq, es, o, slots, lastT, *nqName, *esName, *minTF)
}

type predictor struct {
	name string
	f    func(a ict.Analysis) ict.Dir
}

var predictors = []predictor{
	{"Luôn long (mốc so sánh)", func(ict.Analysis) ict.Dir { return ict.Up }},
	{"Hướng nến Daily trước (mốc so sánh)", func(a ict.Analysis) ict.Dir {
		d := a.TFs[len(a.TFs)-1].Bars
		if len(d) == 0 {
			return ict.Neutral
		}
		return dirOf(d[len(d)-1].C - d[len(d)-1].O)
	}},
	{"1a. Đi ra từ BSL/SSL", func(a ict.Analysis) ict.Dir { return a.CameFrom }},
	{"1b. Hành vi FVG 15m–4H", func(a ict.Analysis) ict.Dir { return a.FVGLean }},
	{"Bước 1: DOL tiềm năng", func(a ict.Analysis) ict.Dir { return a.Step1 }},
	{"Cấu trúc khung tham chiếu (khung range)", func(a ict.Analysis) ict.Dir { return a.RangeTrend }},
	{"SMT với ES, khung nhỏ nhất có SMT", func(a ict.Analysis) ict.Dir { return a.SMT }},
	{"Range HR/LR = BIAS CUỐI", func(a ict.Analysis) ict.Dir { return a.Bias }},
	{"Bias cuối + Bước 1 cùng hướng", func(a ict.Analysis) ict.Dir { return agree(a.Bias, a.Step1) }},
	{"Bias cuối + SMT cùng hướng", func(a ict.Analysis) ict.Dir { return agree(a.Bias, a.SMT) }},
	{"Bước 1 + SMT cùng hướng", func(a ict.Analysis) ict.Dir { return agree(a.Step1, a.SMT) }},
}

// nearer: phía nào của [lo, hi] gần giá hơn.
func nearer(price, hi, lo float64) ict.Dir {
	if hi-price < price-lo {
		return ict.Up
	}
	return ict.Down
}

func agree(x, y ict.Dir) ict.Dir {
	if x == y {
		return x
	}
	return ict.Neutral
}

func dirOf(x float64) ict.Dir {
	switch {
	case x > 0:
		return ict.Up
	case x < 0:
		return ict.Down
	}
	return ict.Neutral
}

func run(nq, es *ict.Chart, o ict.Options, slots []ict.Slot, lastT int64, nqName, esName, minTF string) {
	nearR := ict.Tally{Name: "Phía gần giá hơn (mốc so sánh)"}
	nearL := ict.Tally{Name: "Phía gần giá hơn (mốc so sánh)"}
	var biasNear, biasCount int
	symK := []float64{40, 80, 150}
	symT := make([][]ict.Tally, len(symK))
	for k := range symT {
		symT[k] = make([]ict.Tally, len(predictors))
		for i, p := range predictors {
			symT[k][i].Name = p.name
		}
	}
	rangeT := make([]ict.Tally, len(predictors))
	levelT := make([]ict.Tally, len(predictors))
	for i, p := range predictors {
		rangeT[i].Name, levelT[i].Name = p.name, p.name
	}
	bySession := map[string]*ict.Tally{}
	byTF := map[string]*ict.Tally{}
	byKind := map[string]*ict.Tally{}
	window := ict.Tally{Name: "Bias cuối, chỉ trong khung giờ trade"}
	cond := ict.Tally{Name: "Hai kịch bản (tôn trọng / phá điều kiện)"}
	rangeHeight := map[string][]float64{}
	smtTF := map[string]int{}
	var used, noData, noRange int
	var dirs [3]int
	var firstUsed, lastUsed time.Time

	for _, s := range slots {
		if s.Horizon > lastT {
			break
		}
		// cần nến trong 30 phút trước cutoff và nến sau giờ mở phiên (bỏ ngày nghỉ)
		if !hasBars(nq.M1, s.Cutoff-30*60, s.Cutoff) || !hasBars(nq.M1, s.Open, s.WinEnd) {
			noData++
			continue
		}
		a := ict.Analyze(nq, es, s.Cutoff, o)
		if a.Range == nil {
			noRange++
			continue
		}
		used++
		if firstUsed.IsZero() {
			firstUsed = s.Decision
		}
		lastUsed = s.Decision
		rg := a.Range
		dirs[int(a.Bias)+1]++
		if a.SMT != ict.Neutral {
			smtTF[a.SMT.String()+" "+a.SMTTF.Name]++
		} else {
			smtTF["không có"]++
		}
		rangeHeight[rg.TF.Name] = append(rangeHeight[rg.TF.Name], rg.High.P-rg.Low.P)

		got, tie, _ := ict.FirstHit(nq.M1, s.Cutoff, s.Horizon, rg.High.P, rg.Low.P)
		bsl, ssl, okLv := nearestLevels(a)
		var lgot ict.Dir
		var ltie bool
		if okLv {
			lgot, ltie, _ = ict.FirstHit(nq.M1, s.Cutoff, s.Horizon, bsl, ssl)
		}
		for i, p := range predictors {
			pred := p.f(a)
			rangeT[i].Add(ict.Score(pred, got, tie))
			if okLv {
				levelT[i].Add(ict.Score(pred, lgot, ltie))
			} else {
				levelT[i].Add(ict.Skip)
			}
		}
		for k, d := range symK {
			sgot, stie, _ := ict.FirstHit(nq.M1, s.Cutoff, s.Horizon, a.Price+d, a.Price-d)
			for i, p := range predictors {
				symT[k][i].Add(ict.Score(p.f(a), sgot, stie))
			}
		}
		nd := nearer(a.Price, rg.High.P, rg.Low.P)
		nearR.Add(ict.Score(nd, got, tie))
		if okLv {
			nearL.Add(ict.Score(nearer(a.Price, bsl, ssl), lgot, ltie))
		}
		if a.Bias != ict.Neutral {
			biasCount++
			if a.Bias == nd {
				biasNear++
			}
		}
		r := ict.Score(a.Bias, got, tie)
		tally(bySession, s.Session, r)
		tally(byTF, rg.TF.Name, r)
		tally(byKind, rg.Kind(), r)
		wgot, wtie, _ := ict.FirstHit(nq.M1, s.Cutoff, s.WinEnd, rg.High.P, rg.Low.P)
		window.Add(ict.Score(a.Bias, wgot, wtie))
		cond.Add(ict.ScoreConditional(nq, rg, s.Cutoff, s.Horizon))
	}

	fmt.Printf("# Backtest bias ICT — %s (SMT với %s), range từ khung %s\n\n", nqName, orNone(esName), minTF)
	fmt.Printf("- Khoảng chấm: %s → %s (giờ New York)\n", firstUsed.Format("2006-01-02"), lastUsed.Format("2006-01-02"))
	fmt.Printf("- Phiên dùng được: %d · bỏ vì thiếu data/ngày nghỉ: %d · bỏ vì không tìm được range: %d\n", used, noData, noRange)
	fmt.Printf("- Bias cuối: tăng %d · giảm %d · trung lập (LR vs LR / không rõ) %d\n\n", dirs[2], dirs[0], dirs[1])

	fmt.Println("## A. Mục tiêu = đỉnh / đáy của range đã chọn (chấm tới 16:00 với NY, 05:00 với Asia)")
	printTable(append([]ict.Tally{nearR}, rangeT...))
	if biasCount > 0 {
		fmt.Printf("Bias cuối chỉ về phía gần giá hơn ở %d/%d lần (%.0f%%).\n\n", biasNear, biasCount, 100*float64(biasNear)/float64(biasCount))
	}
	fmt.Println("## B. Mục tiêu = BSL / SSL phiên gần nhất chưa bị quét (PDH/PDL, Asia, London, NY AM/PM)")
	printTable(append([]ict.Tally{nearL}, levelT...))
	for k, d := range symK {
		fmt.Printf("## D%d. Mục tiêu cách đều: giá ± %.0f điểm (đoán bừa = 50%%)\n", k+1, d)
		printTable(symT[k])
	}
	fmt.Println("## C. Bias cuối, tách nhỏ (mục tiêu như A)")
	printTable([]ict.Tally{window, cond})
	fmt.Println("Theo phiên:")
	printTable(sorted(bySession))
	fmt.Println("Theo khung của range:")
	printTable(sorted(byTF))
	fmt.Println("Theo loại range:")
	printTable(sorted(byKind))
	fmt.Println("SMT với ES được tìm thấy ở khung:")
	fmt.Println()
	keys := make([]string, 0, len(smtTF))
	for k := range smtTF {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Printf("- %s: %d\n", k, smtTF[k])
	}
	fmt.Println()
	fmt.Println("Độ rộng range trung bình (điểm):")
	fmt.Println()
	for _, tf := range ict.Timeframes {
		if h := rangeHeight[tf.Name]; len(h) > 0 {
			var s float64
			for _, x := range h {
				s += x
			}
			fmt.Printf("- %s: %.1f (%d lần)\n", tf.Name, s/float64(len(h)), len(h))
		}
	}
	fmt.Println()
}

func tally(m map[string]*ict.Tally, k string, r ict.Result) {
	t, ok := m[k]
	if !ok {
		t = &ict.Tally{Name: k}
		m[k] = t
	}
	t.Add(r)
}

func sorted(m map[string]*ict.Tally) []ict.Tally {
	var out []ict.Tally
	for _, t := range m {
		out = append(out, *t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func printTable(ts []ict.Tally) {
	fmt.Println()
	fmt.Println("| Cách dự đoán | Thắng | Thua | Tỉ lệ đúng | 95% CI | Hoà nến | Chưa chạm | Trung lập |")
	fmt.Println("|---|---:|---:|---:|---|---:|---:|---:|")
	for _, t := range ts {
		p, lo, hi := t.Rate()
		rate, ci := "—", "—"
		if t.Win+t.Loss > 0 {
			rate = fmt.Sprintf("**%.1f%%**", p*100)
			ci = fmt.Sprintf("%.0f–%.0f%%", lo*100, hi*100)
		}
		fmt.Printf("| %s | %d | %d | %s | %s | %d | %d | %d |\n", t.Name, t.Win, t.Loss, rate, ci, t.Tie, t.Open, t.Skip)
	}
	fmt.Println()
}

// nearestLevels: BSL chưa bị quét gần nhất ở trên giá và SSL chưa bị quét gần nhất ở dưới giá.
func nearestLevels(a ict.Analysis) (bsl, ssl float64, ok bool) {
	var okH, okL bool
	for _, lv := range a.Levels {
		if lv.Swept != 0 {
			continue
		}
		if lv.High && lv.P > a.Price && (!okH || lv.P < bsl) {
			bsl, okH = lv.P, true
		}
		if !lv.High && lv.P < a.Price && (!okL || lv.P > ssl) {
			ssl, okL = lv.P, true
		}
	}
	return bsl, ssl, okH && okL
}

func hasBars(m1 []ict.Bar, from, to int64) bool {
	i := sort.Search(len(m1), func(i int) bool { return m1[i].T >= from })
	return i < len(m1) && m1[i].T < to
}

func orNone(s string) string {
	if s == "" {
		return "không"
	}
	return s
}
