package ict

import (
	"sort"
	"time"
)

// NoticeKind: tin trước phiên hay tin trước macro.
type NoticeKind int

const (
	NoticeOpen NoticeKind = iota
	NoticeMacro
)

// MaxNoticesPerDay: chặn cứng số tin mỗi ngày (theo ngày New York).
const MaxNoticesPerDay = 6

// Notice là một tin theo lịch. Giờ đều theo New York.
type Notice struct {
	ID          string
	Session     string // "Asia" hoặc "NY AM"
	Kind        NoticeKind
	At          time.Time // giờ gửi
	SessionOpen time.Time
	SessionEnd  time.Time
	MacroStart  time.Time // chỉ với tin macro
	MacroEnd    time.Time
}

// Key là khoá chống gửi trùng: "<ngày New York>/<ID>".
func (n Notice) Key() string { return n.At.In(NY).Format("2006-01-02") + "/" + n.ID }

// noticeSpec: lịch chủ sản phẩm chốt. Phiên Asia 19:00–21:00, NY AM 09:30–11:00; tin trước phiên
// gửi trước 5 phút, tin macro trước 2 phút.
var noticeSpecs = []struct {
	id, session              string
	kind                     NoticeKind
	h, m                     int // giờ gửi
	macroH, macroM           int
	openH, openM, endH, endM int
}{
	{"asia-open", "Asia", NoticeOpen, 18, 55, 0, 0, 19, 0, 21, 0},
	{"asia-macro-1950", "Asia", NoticeMacro, 19, 48, 19, 50, 19, 0, 21, 0},
	{"asia-macro-2050", "Asia", NoticeMacro, 20, 48, 20, 50, 19, 0, 21, 0},
	{"ny-open", "NY AM", NoticeOpen, 9, 25, 0, 0, 9, 30, 11, 0},
	{"ny-macro-0950", "NY AM", NoticeMacro, 9, 48, 9, 50, 9, 30, 11, 0},
	{"ny-macro-1050", "NY AM", NoticeMacro, 10, 48, 10, 50, 9, 30, 11, 0},
}

// NoticesOn trả các tin của một ngày New York, theo giờ gửi tăng dần: tin Asia các tối Chủ nhật →
// thứ Năm, tin NY AM thứ Hai → thứ Sáu.
func NoticesOn(day time.Time) []Notice {
	d := day.In(NY)
	y, mo, dd := d.Date()
	wd := d.Weekday()
	var out []Notice
	for _, s := range noticeSpecs {
		if s.session == "Asia" && wd > time.Thursday {
			continue
		}
		if s.session == "NY AM" && (wd == time.Saturday || wd == time.Sunday) {
			continue
		}
		n := Notice{ID: s.id, Session: s.session, Kind: s.kind, At: nyTime(y, mo, dd, s.h, s.m),
			SessionOpen: nyTime(y, mo, dd, s.openH, s.openM), SessionEnd: nyTime(y, mo, dd, s.endH, s.endM)}
		if s.kind == NoticeMacro {
			n.MacroStart = nyTime(y, mo, dd, s.macroH, s.macroM)
			n.MacroEnd = n.MacroStart.Add(20 * time.Minute)
		}
		out = append(out, n)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].At.Before(out[j].At) })
	return out
}

// DueNotice trả tin đến hạn lúc now: At ≤ now < At + grace.
func DueNotice(now time.Time, grace time.Duration) (Notice, bool) {
	for _, n := range NoticesOn(now) {
		if !now.Before(n.At) && now.Before(n.At.Add(grace)) {
			return n, true
		}
	}
	return Notice{}, false
}

// LatestOpenNotices trả tin trước phiên gần nhất của mỗi phiên có giờ gửi ≤ until (lùi tối đa 10
// ngày), cũ trước mới sau.
func LatestOpenNotices(until time.Time) []Notice {
	got := map[string]Notice{}
	for k := 0; k <= 10 && len(got) < 2; k++ {
		for _, n := range NoticesOn(until.AddDate(0, 0, -k)) {
			if n.Kind != NoticeOpen || n.At.After(until) {
				continue
			}
			if old, ok := got[n.Session]; !ok || n.At.After(old.At) {
				got[n.Session] = n
			}
		}
	}
	var out []Notice
	for _, n := range got {
		out = append(out, n)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].At.Before(out[j].At) })
	return out
}
