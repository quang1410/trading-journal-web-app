package ict

import (
	"math"
	"sort"
	"strings"
	"time"
)

// Brief là mọi dữ kiện tin trước phiên cần, dựng từ Analysis lúc cutoff = giờ gửi − độ trễ data.
// Không chứa lời dự đoán: backtest cho thấy luật bias đã mã hoá quanh 50% (docs/ict-backtest-*).
type Brief struct {
	Notice Notice
	Cutoff int64
	Price  float64
	PriceT int64

	Range   *Range
	Skipped []string // khung nhỏ hơn khung tham chiếu, không có range hợp lệ
	Trend   Dir      // cấu trúc khung tham chiếu

	HasES bool
	SMT   Dir
	SMTTF Timeframe
	SMTAt int64

	BSL, SSL []Level // đỉnh (BSL) / đáy (SSL) của phiên: chưa quét trước, gần giá nhất trước

	RefOpenName string // "Midnight Open" (NY AM) hoặc "Giá mở 18:00" (Asia)
	RefOpen     float64
	HasRefOpen  bool

	Held, Broken []FVG // FVG khung tham chiếu → 4H được chạm (giữ) / bị phá trong 24 giờ
	FreshAbove   []FVG // FVG giảm chưa chạm lần nào phía trên giá (gần nhất trước)
	FreshBelow   []FVG // FVG tăng chưa chạm lần nào phía dưới giá

	Step1     Dir // DOL tiềm năng theo luật (bước 1) — chưa kiểm chứng
	CameLevel *Level

	// Hai kịch bản "nếu… thì…" theo IFVG model; nil khi thiếu thanh khoản để quét hoặc để về.
	Long, Short *Scenario
	// Winrate lịch sử của nhóm kịch bản tương ứng (người gọi gắn vào, xem AttachStats); nil = không in.
	LongStat, ShortStat *ScenarioTally
}

// AttachStats gắn winrate lịch sử của nhóm kịch bản (walk-forward: stats phải dựng từ các phiên
// trước ngày tin).
func (b *Brief) AttachStats(stats ScenarioStats) {
	if b.Long != nil {
		b.LongStat = stats[KeyOf(b.Notice.Session, *b.Long)]
	}
	if b.Short != nil {
		b.ShortStat = stats[KeyOf(b.Notice.Session, *b.Short)]
	}
}

// Scenario: nếu giá quét Sweep, vào FVG khung lớn (nếu có) rồi IFVG, thì về Target. Preferred khi
// cùng chiều DOL của range HR/LR (chưa kiểm chứng — chỉ để biết phía nào luật nghiêng về).
type Scenario struct {
	Dir       Dir
	Sweep     Level
	FVG       *FVG
	Target    Level
	Preferred bool
}

// sessionLevelPrefixes: mức thanh khoản mỗi phiên dùng. NY AM: ngày trước, Asia, London. Asia:
// ngày vừa đóng, NY AM, NY PM.
var sessionLevelPrefixes = map[string][]string{
	"NY AM": {"PD ", "Asia ", "London "},
	"Asia":  {"PD ", "NY AM ", "NY PM "},
}

// NewBrief phân tích lúc n.At − delay (data CME miễn phí trễ ~10 phút).
func NewBrief(nq, es *Chart, n Notice, delay time.Duration, o Options) Brief {
	cutoff := n.At.Add(-delay).Unix()
	a := Analyze(nq, es, cutoff, o)
	b := Brief{Notice: n, Cutoff: cutoff, Price: a.Price, PriceT: a.PriceT, Range: a.Range,
		HasES: es != nil, SMT: a.SMT, SMTTF: a.SMTTF, SMTAt: a.SMTAt, Step1: a.Step1, CameLevel: a.CameLevel}
	refRank := len(Timeframes) - 1
	if a.Range != nil {
		refRank = a.Range.TF.Rank
		b.Trend = a.RangeTrend
	}
	for _, tf := range Timeframes[o.MinRank:min(refRank, len(Timeframes))] {
		if a.Range != nil {
			b.Skipped = append(b.Skipped, tf.Name)
		}
	}

	for _, lv := range a.Levels {
		if !hasAnyPrefix(lv.Name, sessionLevelPrefixes[n.Session]) {
			continue
		}
		if lv.High {
			b.BSL = append(b.BSL, lv)
		} else {
			b.SSL = append(b.SSL, lv)
		}
	}
	// mức chưa bị quét trước (gần giá nhất trước), mức đã quét xếp sau
	order := func(ls []Level) {
		sort.SliceStable(ls, func(i, j int) bool {
			if (ls[i].Swept == 0) != (ls[j].Swept == 0) {
				return ls[i].Swept == 0
			}
			return math.Abs(ls[i].P-a.Price) < math.Abs(ls[j].P-a.Price)
		})
	}
	order(b.BSL)
	order(b.SSL)

	day := n.At.In(NY)
	refAt := nyTime(day.Year(), day.Month(), day.Day(), 0, 0)
	b.RefOpenName = "Midnight Open"
	if n.Session == "Asia" {
		refAt = nyTime(day.Year(), day.Month(), day.Day(), 18, 0)
		b.RefOpenName = "Giá mở 18:00"
	}
	if bars := between(nq.M1, refAt.Unix(), cutoff); len(bars) > 0 && bars[0].T < refAt.Unix()+15*60 {
		b.RefOpen, b.HasRefOpen = bars[0].O, true
	}

	since := cutoff - 24*3600
	hiRank := max(refRank, min(4, len(Timeframes)-1))
	for _, st := range a.TFs {
		if st.TF.Rank < refRank || st.TF.Rank > hiRank {
			continue
		}
		for _, f := range st.FVGs {
			switch {
			case f.Broken != 0 && f.Broken >= since:
				b.Broken = append(b.Broken, f)
			case f.Respected() && f.Touched >= since:
				b.Held = append(b.Held, f)
			case f.Touched == 0 && f.Broken == 0 && !f.Bull && f.Bottom > a.Price:
				b.FreshAbove = append(b.FreshAbove, f)
			case f.Touched == 0 && f.Broken == 0 && f.Bull && f.Top < a.Price:
				b.FreshBelow = append(b.FreshBelow, f)
			}
		}
	}
	b.Long, b.Short = scenarios(a, b, refRank, hiRank)

	near := func(fs []FVG) []FVG {
		sort.Slice(fs, func(i, j int) bool {
			return math.Abs(fs[i].Mid()-a.Price) < math.Abs(fs[j].Mid()-a.Price)
		})
		return fs[:min(len(fs), 3)]
	}
	b.Held, b.Broken, b.FreshAbove, b.FreshBelow = near(b.Held), near(b.Broken), near(b.FreshAbove), near(b.FreshBelow)
	return b
}

func hasAnyPrefix(s string, ps []string) bool {
	for _, p := range ps {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}

// scenarios dựng hai kịch bản: LONG = quét thanh khoản dưới giá gần nhất (SSL chưa quét của phiên
// hoặc đáy range) → vào FVG tăng chưa bị phá (khung tham chiếu → 4H) gần mức quét nhất → IFVG → về
// thanh khoản trên giá gần nhất. SHORT ngược lại.
func scenarios(a Analysis, b Brief, refRank, hiRank int) (long, short *Scenario) {
	var bull, bear []FVG
	for _, st := range a.TFs {
		if st.TF.Rank < refRank || st.TF.Rank > hiRank {
			continue
		}
		for _, f := range st.FVGs {
			if f.Broken != 0 {
				continue
			}
			if f.Bull && f.Top < a.Price {
				bull = append(bull, f)
			}
			if !f.Bull && f.Bottom > a.Price {
				bear = append(bear, f)
			}
		}
	}
	below := append([]Level{}, b.SSL...)
	above := append([]Level{}, b.BSL...)
	if rg := a.Range; rg != nil {
		below = append(below, Level{Name: "đáy range", P: rg.Low.P})
		above = append(above, Level{Name: "đỉnh range", High: true, P: rg.High.P})
	}
	pick := func(ls []Level, wantBelow bool) (Level, bool) {
		var best Level
		ok := false
		for _, l := range ls {
			if l.Swept != 0 || (wantBelow && l.P >= a.Price) || (!wantBelow && l.P <= a.Price) {
				continue
			}
			if !ok || math.Abs(l.P-a.Price) < math.Abs(best.P-a.Price) {
				best, ok = l, true
			}
		}
		return best, ok
	}
	// FVG mà cú quét đi vào: với LONG là FVG tăng có đáy ≤ mức quét (giá quét xong nằm trong hoặc
	// tiếp tục xuống tới nó), với SHORT là FVG giảm có đỉnh ≥ mức quét; gần mức quét nhất.
	closest := func(fs []FVG, p float64) *FVG {
		var best *FVG
		dist := func(f FVG) float64 {
			switch {
			case p < f.Bottom:
				return f.Bottom - p
			case p > f.Top:
				return p - f.Top
			}
			return 0
		}
		for i := range fs {
			if (fs[i].Bull && fs[i].Bottom > p) || (!fs[i].Bull && fs[i].Top < p) {
				continue
			}
			if best == nil || dist(fs[i]) < dist(*best) {
				best = &fs[i]
			}
		}
		if best == nil {
			return nil
		}
		f := *best
		return &f
	}
	dir := Neutral
	if a.Range != nil {
		dir = a.Range.Dir
	}
	if sw, ok := pick(below, true); ok {
		if tg, ok := pick(above, false); ok {
			long = &Scenario{Dir: Up, Sweep: sw, FVG: closest(bull, sw.P), Target: tg, Preferred: dir == Up}
		}
	}
	if sw, ok := pick(above, false); ok {
		if tg, ok := pick(below, true); ok {
			short = &Scenario{Dir: Down, Sweep: sw, FVG: closest(bear, sw.P), Target: tg, Preferred: dir == Down}
		}
	}
	return long, short
}
