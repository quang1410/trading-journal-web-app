package ict

// Dir là hướng: +1 tăng (DOL là BSL), -1 giảm (DOL là SSL), 0 trung lập.
type Dir int

const (
	Down    Dir = -1
	Neutral Dir = 0
	Up      Dir = 1
)

// String: "tăng" / "giảm" / "trung lập" — text hiển thị trong tin và báo cáo.
func (d Dir) String() string {
	switch d {
	case Up:
		return "tăng"
	case Down:
		return "giảm"
	}
	return "trung lập"
}

func sign(x float64) Dir {
	switch {
	case x > 0:
		return Up
	case x < 0:
		return Down
	}
	return Neutral
}

// Swing là một pivot đã xác nhận: cao (thấp) nhất trong pivot nến mỗi bên. I là chỉ số trong mảng
// nến của khung đó.
type Swing struct {
	I    int
	T    int64
	P    float64
	High bool
}

// Swings tìm pivot như ta.pivothigh/low của Pine (và smt.ts): nến bên phải chỉ cần không vượt,
// nến bên trái bằng giá cũng loại. Chỉ trả pivot đã đủ `pivot` nến bên phải — không lộ tương lai.
func Swings(bars []Bar, pivot int) (highs, lows []Swing) {
	for k := pivot; k+pivot < len(bars); k++ {
		if isPivot(bars, k, pivot, true) {
			highs = append(highs, Swing{I: k, T: bars[k].T, P: bars[k].H, High: true})
		}
		if isPivot(bars, k, pivot, false) {
			lows = append(lows, Swing{I: k, T: bars[k].T, P: bars[k].L})
		}
	}
	return highs, lows
}

func isPivot(bars []Bar, k, pivot int, high bool) bool {
	for j := k - pivot; j <= k+pivot; j++ {
		if j == k {
			continue
		}
		var beaten, tie bool
		if high {
			beaten, tie = bars[j].H > bars[k].H, bars[j].H == bars[k].H
		} else {
			beaten, tie = bars[j].L < bars[k].L, bars[j].L == bars[k].L
		}
		if beaten || (j < k && tie) {
			return false
		}
	}
	return true
}

// Trend đọc cấu trúc từ hai swing high và hai swing low gần nhất: HH + HL là tăng, LH + LL là giảm,
// còn lại (thiếu swing, hoặc lẫn lộn) là trung lập.
func Trend(highs, lows []Swing) Dir {
	if len(highs) < 2 || len(lows) < 2 {
		return Neutral
	}
	h1, h2 := highs[len(highs)-2].P, highs[len(highs)-1].P
	l1, l2 := lows[len(lows)-2].P, lows[len(lows)-1].P
	switch {
	case h2 > h1 && l2 > l1:
		return Up
	case h2 < h1 && l2 < l1:
		return Down
	}
	return Neutral
}

// FVG là khoảng trống 3 nến. Touched / Broken là giờ ĐÓNG của nến lần đầu chạm vào vùng / nến có
// thân đóng vượt mép xa (FVG thành IFVG); 0 = chưa.
type FVG struct {
	TF          Timeframe
	Bull        bool
	Top, Bottom float64
	I           int   // chỉ số nến thứ ba
	Formed      int64 // giờ đóng nến thứ ba
	Touched     int64
	Broken      int64
}

// Respected: giá đã chạm vào FVG mà chưa nến nào đóng vượt mép xa.
func (f FVG) Respected() bool { return f.Touched != 0 && f.Broken == 0 }

// Mid là giữa vùng FVG.
func (f FVG) Mid() float64 { return (f.Top + f.Bottom) / 2 }

// FindFVGs tìm FVG trên nến một khung và theo dõi trạng thái của chúng tới nến cuối của mảng.
// FVG tăng: đáy nến 3 > đỉnh nến 1, vùng [đỉnh nến 1, đáy nến 3]. FVG giảm ngược lại. "Bị phá" là
// nến cùng khung đóng cửa vượt mép xa (dưới đáy FVG tăng, trên đỉnh FVG giảm).
func FindFVGs(bars []Bar, tf Timeframe) []FVG {
	var out []FVG
	for i := 2; i < len(bars); i++ {
		a, c := bars[i-2], bars[i]
		var f FVG
		switch {
		case c.L > a.H:
			f = FVG{Bull: true, Bottom: a.H, Top: c.L}
		case c.H < a.L:
			f = FVG{Bull: false, Bottom: c.H, Top: a.L}
		default:
			continue
		}
		f.TF, f.I, f.Formed = tf, i, c.T+tf.Sec()
		for j := i + 1; j < len(bars); j++ {
			x := bars[j]
			end := x.T + tf.Sec()
			if f.Bull {
				if f.Touched == 0 && x.L <= f.Top {
					f.Touched = end
				}
				if x.C < f.Bottom {
					f.Broken = end
					break
				}
			} else {
				if f.Touched == 0 && x.H >= f.Bottom {
					f.Touched = end
				}
				if x.C > f.Top {
					f.Broken = end
					break
				}
			}
		}
		out = append(out, f)
	}
	return out
}

// fvgLean là bước 1b của DOL: tôn trọng FVG tăng và phá FVG giảm nghiêng về BSL, ngược lại nghiêng
// về SSL. Chỉ tính sự kiện (chạm hoặc phá) xảy ra từ `since`. Khung lớn nặng ký hơn (trọng số
// rank+1).
func fvgLean(fvgs []FVG, since int64) (bull, bear float64) {
	for _, f := range fvgs {
		w := float64(f.TF.Rank + 1)
		switch {
		case f.Broken >= since && f.Broken != 0:
			if f.Bull {
				bear += w
			} else {
				bull += w
			}
		case f.Respected() && f.Touched >= since:
			if f.Bull {
				bull += w
			} else {
				bear += w
			}
		}
	}
	return bull, bear
}
