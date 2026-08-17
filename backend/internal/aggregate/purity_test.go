package aggregate_test

import (
	"os/exec"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Ba package lõi phải thuần. Test này canh ranh giới đó — nếu ai đó lỡ import
// GORM hay net/http vào chúng, test đỏ ngay thay vì phát hiện sau nhiều tháng.
//
// Chỉ soi import TRỰC TIẾP, không soi `go list -deps`: shopspring/decimal có
// import database/sql/driver để cài Scanner/Valuer, và đó là chuyện bình thường
// của một thư viện số — không phải dấu hiệu package của ta chạm DB.
func TestPurePackagesKhongImportHaTang(t *testing.T) {
	forbidden := []string{"gorm.io", "net/http", "database/sql", "context"}
	pkgs := []string{
		"journal/internal/scoring",
		"journal/internal/metrics",
		"journal/internal/aggregate",
	}

	for _, p := range pkgs {
		out, err := exec.Command("go", "list", "-f", `{{join .Imports "\n"}}`, p).Output()
		require.NoError(t, err, "go list %s", p)

		for _, imp := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			for _, bad := range forbidden {
				require.False(t, imp == bad || strings.HasPrefix(imp, bad+"/"),
					"%s import %s — ba package lõi phải thuần", p, imp)
			}
		}
	}
}
