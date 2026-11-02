package ict

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestNoticesOn(t *testing.T) {
	cases := []struct {
		name string
		day  time.Time
		ids  []string
	}{
		{"Monday has all six", nyTime(2026, 11, 2, 12, 0),
			[]string{"ny-open", "ny-macro-0950", "ny-macro-1050", "asia-open", "asia-macro-1950", "asia-macro-2050"}},
		{"Sunday has only Asia", nyTime(2026, 11, 1, 12, 0), []string{"asia-open", "asia-macro-1950", "asia-macro-2050"}},
		{"Friday has only NY AM", nyTime(2026, 11, 6, 12, 0), []string{"ny-open", "ny-macro-0950", "ny-macro-1050"}},
		{"Saturday has none", nyTime(2026, 11, 7, 12, 0), nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var ids []string
			for _, n := range NoticesOn(c.day) {
				ids = append(ids, n.ID)
			}
			require.Equal(t, c.ids, ids)
			require.LessOrEqual(t, len(ids), MaxNoticesPerDay)
		})
	}
}

func TestNoticeTimesFollowNewYorkAcrossDST(t *testing.T) {
	for _, day := range []time.Time{nyTime(2026, 3, 9, 12, 0), nyTime(2026, 11, 2, 12, 0)} {
		ns := NoticesOn(day)
		require.Equal(t, "09:25", ns[0].At.In(NY).Format("15:04"))
		require.Equal(t, "09:30", ns[0].SessionOpen.In(NY).Format("15:04"))
		require.Equal(t, "09:50", ns[1].MacroStart.In(NY).Format("15:04"))
		require.Equal(t, "18:55", ns[3].At.In(NY).Format("15:04"))
	}
	// 09:25 New York = 13:25 UTC mùa hè, 14:25 UTC mùa đông
	require.Equal(t, 13, NoticesOn(nyTime(2026, 3, 9, 12, 0))[0].At.UTC().Hour())
	require.Equal(t, 14, NoticesOn(nyTime(2026, 11, 2, 12, 0))[0].At.UTC().Hour())
}

func TestDueNotice(t *testing.T) {
	at := nyTime(2026, 11, 2, 9, 48)
	cases := []struct {
		now time.Time
		ok  bool
	}{
		{at.Add(-time.Second), false},
		{at, true},
		{at.Add(2*time.Minute + 59*time.Second), true},
		{at.Add(3 * time.Minute), false},
	}
	for _, c := range cases {
		n, ok := DueNotice(c.now, 3*time.Minute)
		require.Equal(t, c.ok, ok, "now %s", c.now.In(NY).Format("15:04:05"))
		if ok {
			require.Equal(t, "ny-macro-0950", n.ID)
			require.Equal(t, "2026-11-02/ny-macro-0950", n.Key())
		}
	}
}

func TestLatestOpenNotices(t *testing.T) {
	// thứ Bảy: phiên gần nhất là NY AM thứ Sáu và Asia tối thứ Năm
	got := LatestOpenNotices(nyTime(2026, 11, 7, 12, 0))
	require.Len(t, got, 2)
	require.Equal(t, "Asia", got[0].Session)
	require.Equal(t, time.Thursday, got[0].At.In(NY).Weekday())
	require.Equal(t, "NY AM", got[1].Session)
	require.Equal(t, time.Friday, got[1].At.In(NY).Weekday())
}
