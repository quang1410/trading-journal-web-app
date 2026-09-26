package domain_test

import (
	"testing"

	"journal/internal/domain"
)

func TestParsePeriod(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    domain.Period
		wantErr bool
	}{
		{"day", "day", domain.PeriodDay, false},
		{"week", "week", domain.PeriodWeek, false},
		{"month is not supported", "month", "", true},
		{"empty", "", "", true},
		{"case sensitive", "Day", "", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := domain.ParsePeriod(tc.input)
			if tc.wantErr != (err != nil) {
				t.Fatalf("ParsePeriod(%q) err = %v, wantErr %v", tc.input, err, tc.wantErr)
			}
			if got != tc.want {
				t.Fatalf("ParsePeriod(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestParsePeriodRef(t *testing.T) {
	tests := []struct {
		name    string
		period  string
		key     string
		wantErr bool
	}{
		{"day ok", "day", "2026-09-21", false},
		{"day rejects week key", "day", "2026-W39", true},
		{"day rejects short year", "day", "26-09-21", true},
		{"day rejects missing pad", "day", "2026-9-21", true},
		{"day rejects trailing time", "day", "2026-09-21T00:00:00Z", true},
		{"week ok", "week", "2026-W39", false},
		{"week ok week 01", "week", "2026-W01", false},
		{"week rejects unpadded", "week", "2026-W9", true},
		{"week rejects lowercase w", "week", "2026-w39", true},
		{"week rejects day key", "week", "2026-09-21", true},
		{"unknown period", "month", "2026-09", true},
		{"empty key", "day", "", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ref, err := domain.ParsePeriodRef(tc.period, tc.key)
			if tc.wantErr && err == nil {
				t.Fatalf("ParsePeriodRef(%q, %q) = nil, want error", tc.period, tc.key)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("ParsePeriodRef(%q, %q) = %v, want nil", tc.period, tc.key, err)
			}
			if !tc.wantErr && (string(ref.Period) != tc.period || ref.Key != tc.key) {
				t.Fatalf("ParsePeriodRef(%q, %q) = %+v", tc.period, tc.key, ref)
			}
		})
	}
}

func TestIsBlankNoteHTML(t *testing.T) {
	tests := []struct {
		name string
		html string
		want bool
	}{
		{"empty string", "", true},
		{"whitespace only", "   \n", true},
		{"quill empty paragraph", "<p><br></p>", true},
		{"quill empty padded", "  <p><br></p>\n", true},
		{"empty paragraph", "<p></p>", true},
		{"self-closing br", "<p><br/></p>", true},
		{"self-closing br spaced", "<p><br /></p>", true},
		{"text", "<p>x</p>", false},
		{"two empty paragraphs is content", "<p><br></p><p><br></p>", false},
		{"image only is content", `<p><img src="a.png"></p>`, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := domain.IsBlankNoteHTML(tc.html); got != tc.want {
				t.Fatalf("IsBlankNoteHTML(%q) = %v, want %v", tc.html, got, tc.want)
			}
		})
	}
}
