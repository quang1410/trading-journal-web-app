package domain_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func minuteBarsAt(ts ...int64) domain.MinuteBars {
	var b domain.MinuteBars
	for _, t := range ts {
		b.Append(t, "29227.25", "29361.25", "29226", "29349.75", "1299")
	}
	return b
}

func TestMinuteBarsValidate(t *testing.T) {
	ragged := minuteBarsAt(60, 120)
	ragged.C = ragged.C[:1]
	for _, tc := range []struct {
		name string
		bars domain.MinuteBars
		ok   bool
	}{
		{"empty", domain.MinuteBars{}, true},
		{"increasing", minuteBarsAt(60, 120, 180), true},
		{"ragged columns", ragged, false},
		{"same minute twice", minuteBarsAt(60, 60), false},
		{"time goes back", minuteBarsAt(120, 60), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.ok {
				require.NoError(t, tc.bars.Validate())
			} else {
				require.Error(t, tc.bars.Validate())
			}
		})
	}
}

func TestMinuteBarsAfter(t *testing.T) {
	b := minuteBarsAt(60, 120, 180)
	for _, tc := range []struct {
		name  string
		since int64
		want  []int64
	}{
		{"before everything", 0, []int64{60, 120, 180}},
		{"excludes since itself", 60, []int64{120, 180}},
		{"between bars", 150, []int64{180}},
		{"after everything", 180, []int64{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := b.After(tc.since)
			require.Equal(t, tc.want, got.T)
			require.Equal(t, len(tc.want), len(got.O))
			require.Equal(t, len(tc.want), len(got.V))
		})
	}
}

func TestMinuteBarsBefore(t *testing.T) {
	b := minuteBarsAt(60, 120, 180)
	for _, tc := range []struct {
		name  string
		until int64
		want  []int64
	}{
		{"before everything", 60, []int64{}},
		{"excludes until itself", 180, []int64{60, 120}},
		{"between bars", 150, []int64{60, 120}},
		{"after everything", 999, []int64{60, 120, 180}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := b.Before(tc.until)
			require.Equal(t, tc.want, got.T)
			require.Equal(t, len(tc.want), len(got.C))
		})
	}
}

// Nguồn phụ chỉ lấp phút trống; phút trùng giữ giá của nguồn chính.
func TestMinuteBarsFillFrom(t *testing.T) {
	bars := func(open string, ts ...int64) domain.MinuteBars {
		var b domain.MinuteBars
		for _, t := range ts {
			b.Append(t, json.Number(open), "2", "1", "1.5", "10")
		}
		return b
	}
	for _, tc := range []struct {
		name         string
		main, backup domain.MinuteBars
		wantT        []int64
		wantO        []json.Number
	}{
		{"backup fills gaps around and between", bars("tv", 120, 240), bars("yh", 60, 120, 180, 300), []int64{60, 120, 180, 240, 300}, []json.Number{"yh", "tv", "yh", "tv", "yh"}},
		{"no backup", bars("tv", 60), domain.MinuteBars{}, []int64{60}, []json.Number{"tv"}},
		{"no main", domain.MinuteBars{}, bars("yh", 60), []int64{60}, []json.Number{"yh"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := tc.main.FillFrom(tc.backup)
			require.Equal(t, tc.wantT, got.T)
			require.Equal(t, tc.wantO, got.O)
			require.NoError(t, got.Validate())
		})
	}
}

func TestMinuteBarsExcept(t *testing.T) {
	for _, tc := range []struct {
		name        string
		bars, other domain.MinuteBars
		want        []int64
	}{
		{"drops minutes the other has", minuteBarsAt(60, 120, 180, 240), minuteBarsAt(120, 240, 300), []int64{60, 180}},
		{"nothing to drop", minuteBarsAt(60, 120), domain.MinuteBars{}, []int64{60, 120}},
		{"everything dropped", minuteBarsAt(60), minuteBarsAt(0, 60), nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := tc.bars.Except(tc.other)
			require.Equal(t, tc.want, got.T)
			require.Equal(t, len(tc.want), len(got.V))
		})
	}
}

// Cột nil ra JSON [] chứ không ra null; cột đã có giữ nguyên.
func TestMinuteBarsOrEmptyMarshalsEmptyArrays(t *testing.T) {
	raw, err := json.Marshal(domain.MinuteBars{}.OrEmpty())
	require.NoError(t, err)
	require.JSONEq(t, `{"t":[],"o":[],"h":[],"l":[],"c":[],"v":[]}`, string(raw))

	b := minuteBarsAt(60).OrEmpty()
	require.Equal(t, []json.Number{"29227.25"}, b.O)
}
