package aggregate_test

import (
	"go/parser"
	"go/token"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// Các package lõi (scoring, metrics, aggregate, csvformat, domain) phải THUẦN: chỉ tính toán, không
// chạm hạ tầng (CLAUDE.md quy tắc 3). Nhờ vậy test của chúng chạy không cần
// Docker — `make test-pure` phải xong dưới một giây.
//
// Kiểm bằng cách đọc import thật trong mã nguồn, không tin vào quy ước: một
// dòng import GORM lọt vào đây là cả ba package lập tức cần Postgres để test,
// và ranh giới mất đi mà không ai nhận ra cho tới lúc CI chậm gấp mười lần.
func TestCorePackagesMustBePure(t *testing.T) {
	denyImport := []string{
		"gorm.io/",
		"net/http",
		"database/sql",
		"context",
		"journal/internal/repository",
		"journal/internal/httpapi",
		"journal/internal/service",
	}

	// csvformat và domain nhập nhóm này ở Phase 6: cả hai tự khai là package
	// thuần trong doc comment và cả hai đã nằm trong lane `make test-pure`,
	// nên nếu không canh ở đây thì lời khai đó chỉ là thiện chí.
	for _, pkg := range []string{"scoring", "metrics", "aggregate", "csvformat", "domain"} {
		t.Run(pkg, func(t *testing.T) {
			dir := filepath.Join("..", pkg)
			fset := token.NewFileSet()
			pkgs, err := parser.ParseDir(fset, dir, nil, parser.ImportsOnly)
			require.NoError(t, err)
			require.NotEmpty(t, pkgs, "không đọc được file nào trong %s", dir)

			var fileCount int
			for _, p := range pkgs {
				for name, file := range p.Files {
					fileCount++
					for _, imp := range file.Imports {
						path, err := strconv.Unquote(imp.Path.Value)
						require.NoError(t, err)
						for _, banned := range denyImport {
							require.False(t, path == banned || strings.HasPrefix(path, banned),
								"%s import %q — package thuần không được chạm hạ tầng",
								filepath.Base(name), path)
						}
					}
				}
			}
			require.NotZero(t, fileCount, "%s không có file .go nào", dir)
		})
	}
}
