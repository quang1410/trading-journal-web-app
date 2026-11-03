package main

import (
	"fmt"
	"strings"
	"time"

	"journal/internal/ict"
)

// Gộp 7 bài + skill ICT bằng forward selection có kiểm soát: bắt đầu từ luật định sẵn tốt nhất
// (BNQ + 2 giá mở, TP ERL), thêm lần lượt từng thành phần mà một bài coi là quan trọng. Hai cách chọn,
// đều CHỈ nhìn train:
//   - tham lam: nhận thành phần làm R TB của train gộp tăng ≥ 0,05R;
//   - bền: thành phần phải làm R TB tốt hơn ở CẢ HAI nửa của train (trước / từ 01/04).
// Luật cuối được chấm trên test — phần data không dùng để chọn.

type component struct {
	name, source string
	set          func(r *ict.TradeRules)
	session      string // "" = không đổi phiên; "Asia" / "NY AM" = chỉ phiên đó
}

func components() []component {
	return []component{
		{"true manipulation", "IFVG model, BNQ", func(r *ict.TradeRules) { r.NeedTrueManip = true }, ""},
		{"stop raid trong chân thao túng", "Stop raid", func(r *ict.TradeRules) { r.NeedStopRaid = true }, ""},
		{"stop sạch", "Stop raid", func(r *ict.TradeRules) { r.NeedCleanStop = true }, ""},
		{"cùng hướng DOL bước 1", "DOL", func(r *ict.TradeRules) { r.NeedDOL = true }, ""},
		{"PO3: cực trị trong 10 phút đầu nến 15m", "IFVG model, OXXC", func(r *ict.TradeRules) { r.NeedPO3Open = true }, ""},
		{"Silver Bullet 10–11h / 20–21h", "Skill ICT", func(r *ict.TradeRules) { r.NeedSilverBullet = true }, ""},
		{"macro :50 → :10", "MECH, skill", func(r *ict.TradeRules) { r.NeedMacro = true }, ""},
		{"discount / premium của dealing range", "Skill ICT, DOL", func(r *ict.TradeRules) { r.NeedRangeDiscount = true }, ""},
		{"xu hướng 4H cùng chiều", "BNQ", func(r *ict.TradeRules) { r.NeedTrend4H = true }, ""},
		{"FVG khung lớn còn mới", "MECH, skill", func(r *ict.TradeRules) { r.NeedFreshFVG = true }, ""},
		{"IFVG phá trong ≤ 4 nến", "BNQ", func(r *ict.TradeRules) { r.MaxInvertBars = 4 }, ""},
		{"IFVG mạnh (râu ≤ 20%, ≤ 3 nến)", "IFVG model", func(r *ict.TradeRules) { r.MaxWick, r.MaxInvertBars = 0.2, 3 }, ""},
		{"CISD", "BNQ, IFVG model", func(r *ict.TradeRules) { r.NeedCISD = true }, ""},
		{"SMT với ES", "SMT", func(r *ict.TradeRules) { r.NeedSMT = true }, ""},
		{"SL ở thân nến", "MECH", func(r *ict.TradeRules) { r.StopBody = true }, ""},
		{"lệnh chờ ở mép IFVG", "Skill ICT", func(r *ict.TradeRules) { r.LimitEntry = true }, ""},
		{"chỉ phiên NY AM", "BNQ, Reese", func(*ict.TradeRules) {}, "NY AM"},
		{"chỉ phiên Asia", "—", func(*ict.TradeRules) {}, "Asia"},
	}
}

type combo struct {
	rules   ict.TradeRules
	session string
	names   []string
}

// comboStats: kết quả của một luật trên các đoạn thời gian.
type comboStats struct {
	train, test, trainA, trainB, h1, h2, all optStat
}

type combiner struct {
	preps    []*ict.PreparedSession
	split    time.Time // bắt đầu test
	sub      time.Time // chia train làm hai
	h1End    time.Time // chia toàn bộ làm hai nửa năm
	minTrain int
}

func (cb combiner) eval(c combo) comboStats {
	var st comboStats
	for _, p := range cb.preps {
		if p == nil || (c.session != "" && p.Slot.Session != c.session) {
			continue
		}
		t := p.Simulate(c.rules)
		if t == nil {
			continue
		}
		d := p.Slot.Decision
		st.all.add(t)
		if d.Before(cb.split) {
			st.train.add(t)
			if d.Before(cb.sub) {
				st.trainA.add(t)
			} else {
				st.trainB.add(t)
			}
		} else {
			st.test.add(t)
		}
		if d.Before(cb.h1End) {
			st.h1.add(t)
		} else {
			st.h2.add(t)
		}
	}
	return st
}

func (cb combiner) header(first string) {
	fmt.Printf("| %s | Train (trước %s): lệnh · winrate · R TB | Hai nửa train | Test: lệnh · winrate · R TB | Nửa năm đầu / sau | Toàn bộ |\n",
		first, cb.split.Format("02/01"))
	fmt.Println("|---|---|---|---|---|---|")
}

func (cb combiner) row(name string, st comboStats) {
	fmt.Printf("| %s | %d · %s · %s | %s / %s | %d · %s · %s | %s / %s | %d · %s · %s |\n", name,
		st.train.n, pct(st.train), signed(st.train), signed(st.trainA), signed(st.trainB),
		st.test.n, pct(st.test), signed(st.test), signed(st.h1), signed(st.h2), st.all.n, pct(st.all), signed(st.all))
}

// forward chạy forward selection; robust = thành phần phải tốt hơn ở cả hai nửa train.
func (cb combiner) forward(robust bool, start combo) (combo, comboStats) {
	cur, curSt := start, cb.eval(start)
	used := map[string]bool{}
	cb.row(strings.Join(cur.names, " + "), curSt)
	for {
		bestGain, bestI := 0.05, -1
		var bestC combo
		var bestSt comboStats
		for i, cp := range components() {
			if used[cp.name] || (cp.session != "" && cur.session != "") {
				continue
			}
			c := combo{rules: cur.rules, session: cur.session, names: append(append([]string{}, cur.names...), cp.name)}
			cp.set(&c.rules)
			if cp.session != "" {
				c.session = cp.session
			}
			st := cb.eval(c)
			if st.train.n < cb.minTrain {
				continue
			}
			if robust && (st.trainA.n == 0 || st.trainB.n == 0 ||
				st.trainA.avgR() <= curSt.trainA.avgR() || st.trainB.avgR() <= curSt.trainB.avgR()) {
				continue
			}
			if gain := st.train.avgR() - curSt.train.avgR(); gain > bestGain {
				bestGain, bestI, bestC, bestSt = gain, i, c, st
			}
		}
		if bestI < 0 {
			return cur, curSt
		}
		used[components()[bestI].name] = true
		cur, curSt = bestC, bestSt
		cb.row("+ "+components()[bestI].name, curSt)
	}
}

func runCombine(nq, es *ict.Chart, o ict.Options, slots []ict.Slot, lastT int64, split time.Time, minTrain int) {
	var usable []ict.Slot
	for _, s := range slots {
		if s.Horizon <= lastT && hasBars(nq.M1, s.Open, s.WinEnd) {
			usable = append(usable, s)
		}
	}
	cb := combiner{preps: make([]*ict.PreparedSession, len(usable)), split: split, minTrain: minTrain,
		sub: time.Date(2026, 4, 1, 0, 0, 0, 0, ict.NY), h1End: time.Date(2026, 6, 1, 0, 0, 0, 0, ict.NY)}
	parallel(len(usable), func(i int) { cb.preps[i] = ict.PrepareSession(nq, es, usable[i], o) })

	base := ict.DefaultTradeRules()
	base.Model, base.NeedTrendWith, base.TargetERL, base.NeedOpens2 = ict.ModelTrend, true, true, true
	start := combo{rules: base, names: []string{"BNQ + 2 giá mở · TP ERL"}}
	baseSt := cb.eval(start)

	fmt.Printf("# Gộp 7 bài + skill ICT — forward selection có kiểm soát\n\n")
	fmt.Printf("Xuất phát: BNQ (xu hướng 1H, hồi vào FVG khung lớn, stop hunt swing 1m, IFVG) + discount/premium của ≥ 2 giá mở, TP ở ERL. ")
	fmt.Printf("Chỉ nhận thành phần làm R TB ở train tăng ≥ 0,05R và còn ≥ %d lệnh train. Test không dùng để chọn.\n\n", minTrain)

	fmt.Println("## Tác dụng riêng của từng thành phần khi thêm vào BNQ")
	fmt.Println()
	cb.header("Thành phần (nguồn)")
	cb.row("— BNQ + 2 giá mở (xuất phát)", baseSt)
	for _, cp := range components() {
		c := combo{rules: base, session: cp.session}
		cp.set(&c.rules)
		cb.row(fmt.Sprintf("+ %s (%s)", cp.name, cp.source), cb.eval(c))
	}
	fmt.Println()

	for _, robust := range []bool{false, true} {
		title := "Chọn tham lam (train gộp)"
		if robust {
			title = "Chọn bền (phải tốt hơn ở cả hai nửa train)"
		}
		fmt.Println("## " + title)
		fmt.Println()
		cb.header("Bước")
		final, st := cb.forward(robust, start)
		fmt.Printf("\n**Luật cuối:** %s", strings.Join(final.names, " + "))
		if final.session != "" {
			fmt.Printf(" (phiên %s)", final.session)
		}
		fmt.Printf("\n\n- Train: %d lệnh, winrate %s, R TB %s\n- **Test (chưa dùng để chọn): %d lệnh, winrate %s, R TB %s, tổng %+.1fR**\n- Xuất phát ở test: %d lệnh, winrate %s, R TB %s\n\n",
			st.train.n, pct(st.train), signed(st.train), st.test.n, pct(st.test), signed(st.test), st.test.sumR,
			baseSt.test.n, pct(baseSt.test), signed(baseSt.test))
	}
}
