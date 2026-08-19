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

// Ba package scoring, metrics, aggregate phải THUẦN: chỉ tính toán, không
// chạm hạ tầng (CLAUDE.md quy tắc 3). Nhờ vậy test của chúng chạy không cần
// Docker — `make test-pure` phải xong dưới một giây.
//
// Kiểm bằng cách đọc import thật trong mã nguồn, không tin vào quy ước: một
// dòng import GORM lọt vào đây là cả ba package lập tức cần Postgres để test,
// và ranh giới mất đi mà không ai nhận ra cho tới lúc CI chậm gấp mười lần.
func TestBaPackageLoiPhaiThuan(t *testing.T) {
	camImport := []string{
		"gorm.io/",
		"net/http",
		"database/sql",
		"context",
		"journal/internal/repository",
		"journal/internal/httpapi",
		"journal/internal/service",
	}

	for _, pkg := range []string{"scoring", "metrics", "aggregate"} {
		t.Run(pkg, func(t *testing.T) {
			dir := filepath.Join("..", pkg)
			fset := token.NewFileSet()
			pkgs, err := parser.ParseDir(fset, dir, nil, parser.ImportsOnly)
			require.NoError(t, err)
			require.NotEmpty(t, pkgs, "không đọc được file nào trong %s", dir)

			var soFile int
			for _, p := range pkgs {
				for name, file := range p.Files {
					soFile++
					for _, imp := range file.Imports {
						path, err := strconv.Unquote(imp.Path.Value)
						require.NoError(t, err)
						for _, cam := range camImport {
							require.False(t, path == cam || strings.HasPrefix(path, cam),
								"%s import %q — package thuần không được chạm hạ tầng",
								filepath.Base(name), path)
						}
					}
				}
			}
			require.NotZero(t, soFile, "%s không có file .go nào", dir)
		})
	}
}
