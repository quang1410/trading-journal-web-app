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
