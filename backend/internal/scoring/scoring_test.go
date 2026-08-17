package scoring

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func TestEntry(t *testing.T) {
	cases := map[string]int{
		"":                    0,
		domain.EntryPlanned:   25,
		domain.EntryTooEarly:  10,
		domain.EntryTooLate:   10,
		domain.EntryImpulse:   0,
		"chuỗi lạ không khớp": 0,
	}
	for in, want := range cases {
		require.Equal(t, want, Entry(in), "Entry(%q)", in)
	}
}

func TestExit(t *testing.T) {
	cases := map[string]int{
		"":                   0,
		domain.ExitHitTP:     25,
		domain.ExitHitSL:     25, // chạm SL đúng kế hoạch vẫn là kỷ luật tốt
		domain.ExitTechnical: 15,
		domain.ExitEmotional: 0,
	}
	for in, want := range cases {
		require.Equal(t, want, Exit(in), "Exit(%q)", in)
	}
}

func TestInTrade(t *testing.T) {
	cases := map[string]int{
		"":                     0,
		domain.InTradeFollowed: 25,
		domain.InTradeMovedTP:  10,
		domain.InTradeMovedSL:  0,
		domain.InTradeWantExit: 5,
	}
	for in, want := range cases {
		require.Equal(t, want, InTrade(in), "InTrade(%q)", in)
	}
}

func TestPsych(t *testing.T) {
	cases := map[string]int{
		"":                      0,
		domain.PsychNoError:     25,
		domain.PsychFOMO:        0,
		domain.PsychFear:        5,
		domain.PsychHope:        5,
		domain.PsychGreed:       5,
		domain.PsychRevenge:     0,
		domain.PsychAlwaysRight: 0,
	}
	for in, want := range cases {
		require.Equal(t, want, Psych(in), "Psych(%q)", in)
	}
}

func TestTotalNilKhiCaBonRong(t *testing.T) {
	require.Nil(t, Total("", "", "", ""))
}

func TestTotalKhongNilKhiCoItNhatMotField(t *testing.T) {
	got := Total("", "", "", domain.PsychFOMO)
	require.NotNil(t, got)
	require.Equal(t, 0, *got, "FOMO được 0 điểm nhưng lệnh vẫn coi là đã chấm")
}

func TestTotalVaClassify(t *testing.T) {
	tests := []struct {
		name      string
		entry     string
		inTrade   string
		exit      string
		psych     string
		wantTotal int
		wantClass string
	}{
		{"tất cả tốt nhất = 100", domain.EntryPlanned, domain.InTradeFollowed, domain.ExitHitTP, domain.PsychNoError, 100, domain.ClassPlanned},
		{"biên 80", domain.EntryPlanned, domain.InTradeFollowed, domain.ExitHitTP, domain.PsychFear, 80, domain.ClassPlanned},
		{"75", domain.EntryPlanned, domain.InTradeFollowed, domain.ExitHitTP, domain.PsychFOMO, 75, domain.ClassNeedsWork},
		{"biên 55", domain.EntryPlanned, domain.InTradeMovedTP, domain.ExitTechnical, domain.PsychFear, 55, domain.ClassNeedsWork},
		{"65", domain.EntryPlanned, domain.InTradeMovedTP, domain.ExitHitSL, domain.PsychFear, 65, domain.ClassNeedsWork},
		{"biên 30", domain.EntryTooEarly, domain.InTradeWantExit, domain.ExitTechnical, domain.PsychFOMO, 30, domain.ClassImpulsive},
		{"25", domain.EntryTooEarly, domain.InTradeMovedTP, domain.ExitEmotional, domain.PsychFear, 25, domain.ClassRevenge},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			total := Total(tt.entry, tt.inTrade, tt.exit, tt.psych)
			require.NotNil(t, total)
			require.Equal(t, tt.wantTotal, *total)
			require.Equal(t, tt.wantClass, Classify(total))
		})
	}
}

func TestClassifyNilLaChuaDanhGia(t *testing.T) {
	require.Equal(t, domain.ClassNotEvaluated, Classify(nil))
}

func TestClassifyBienChinhXac(t *testing.T) {
	tests := []struct {
		total int
		want  string
	}{
		{100, domain.ClassPlanned},
		{80, domain.ClassPlanned},
		{79, domain.ClassNeedsWork},
		{55, domain.ClassNeedsWork},
		{54, domain.ClassImpulsive},
		{30, domain.ClassImpulsive},
		{29, domain.ClassRevenge},
		{0, domain.ClassRevenge},
	}
	for _, tt := range tests {
		total := tt.total
		require.Equal(t, tt.want, Classify(&total), "Classify(%d)", tt.total)
	}
}
