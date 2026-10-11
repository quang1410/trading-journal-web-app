package domain_test

import (
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func TestNormalizeEmail(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"plain", "toi@gmail.com", "toi@gmail.com", false},
		{"upper case and spaces", "  Toi@Gmail.COM ", "toi@gmail.com", false},
		{"plus tag", "toi+fx@gmail.com", "toi+fx@gmail.com", false},
		{"subdomain", "a@mail.example.vn", "a@mail.example.vn", false},
		{"empty", "", "", true},
		{"only spaces", "   ", "", true},
		{"missing at", "toigmail.com", "", true},
		{"missing dot in domain", "toi@localhost", "", true},
		{"domain starts with dot", "toi@.gmail.com", "", true},
		{"domain ends with dot", "toi@gmail.", "", true},
		{"display name form", "Toi <toi@gmail.com>", "", true},
		{"quoted local part with space", `"a b"@gmail.com`, "", true},
		{"two at signs", "a@b@gmail.com", "", true},
		{"too long", strings.Repeat("a", 250) + "@x.com", "", true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := domain.NormalizeEmail(tc.input)
			if tc.wantErr {
				require.Error(t, err)
				require.Equal(t, "email không hợp lệ", err.Error())
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.want, got)
		})
	}
}

func TestNormalizeSource(t *testing.T) {
	str := func(s string) *string { return &s }
	tests := []struct {
		name  string
		input string
		want  *string
	}{
		{"empty", "", nil},
		{"plain", "fb-group-forex", str("fb-group-forex")},
		{"lower cased", "FB_Group", str("fb_group")},
		{"strips unsafe characters", "fb group<script>", str("fbgroupscript")},
		{"drops non ascii", "nhóm-zalo", str("nhm-zalo")},
		{"only unsafe", "<>!!", nil},
		{"capped at 64", strings.Repeat("a", 80), str(strings.Repeat("a", 64))},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, domain.NormalizeSource(tc.input))
		})
	}
}

func TestNormalizeLocale(t *testing.T) {
	require.Equal(t, "en", domain.NormalizeLocale("en"))
	require.Equal(t, "vi", domain.NormalizeLocale("vi"))
	require.Equal(t, "vi", domain.NormalizeLocale(""))
	require.Equal(t, "vi", domain.NormalizeLocale("fr"))
	require.Equal(t, "vi", domain.NormalizeLocale("EN"))
}

func TestParseAnswers(t *testing.T) {
	t.Run("all empty is valid", func(t *testing.T) {
		got, err := domain.ParseAnswers(domain.WaitlistAnswerCodes{})
		require.NoError(t, err)
		require.Nil(t, got.JournalTool)
		require.Nil(t, got.PropStatus)
		require.Equal(t, "", got.Markets)
	})
	t.Run("valid codes", func(t *testing.T) {
		got, err := domain.ParseAnswers(domain.WaitlistAnswerCodes{
			JournalTool: "spreadsheet", Markets: []string{"vn_stocks", "crypto"}, PropStatus: "active",
		})
		require.NoError(t, err)
		require.Equal(t, "spreadsheet", *got.JournalTool)
		require.Equal(t, "active", *got.PropStatus)
		require.Equal(t, "crypto,vn_stocks", got.Markets, "markets are sorted")
	})
	t.Run("duplicate markets collapse", func(t *testing.T) {
		got, err := domain.ParseAnswers(domain.WaitlistAnswerCodes{Markets: []string{"crypto", "crypto", "fx_gold"}})
		require.NoError(t, err)
		require.Equal(t, "crypto,fx_gold", got.Markets)
	})
	t.Run("unknown journal tool", func(t *testing.T) {
		_, err := domain.ParseAnswers(domain.WaitlistAnswerCodes{JournalTool: "excel"})
		require.EqualError(t, err, `công cụ ghi nhật ký không hợp lệ: "excel"`)
	})
	t.Run("unknown market", func(t *testing.T) {
		_, err := domain.ParseAnswers(domain.WaitlistAnswerCodes{Markets: []string{"stocks"}})
		require.EqualError(t, err, `thị trường không hợp lệ: "stocks"`)
	})
	t.Run("unknown prop status", func(t *testing.T) {
		_, err := domain.ParseAnswers(domain.WaitlistAnswerCodes{PropStatus: "yes"})
		require.EqualError(t, err, `trạng thái thi quỹ không hợp lệ: "yes"`)
	})
}

// Mã câu trả lời nằm ở hai nơi: list Go và CHECK của migration 0007. Thêm mã
// ở Go mà quên CHECK thì mọi câu trả lời chọn mã mới đều thành lỗi 500.
func TestWaitlistCodesMatchMigrationChecks(t *testing.T) {
	sql, err := os.ReadFile("../../migrations/0007_waitlist.up.sql")
	require.NoError(t, err)
	for column, want := range map[string][]string{
		"journal_tool": domain.JournalTools,
		"prop_status":  domain.PropStatuses,
	} {
		re := regexp.MustCompile(`CHECK \(` + column + ` IN \(([^)]*)\)\)`)
		m := re.FindSubmatch(sql)
		require.NotNil(t, m, "CHECK for %s not found", column)
		var got []string
		for _, part := range strings.Split(string(m[1]), ",") {
			got = append(got, strings.Trim(strings.TrimSpace(part), "'"))
		}
		require.Equal(t, want, got, column)
	}
}
