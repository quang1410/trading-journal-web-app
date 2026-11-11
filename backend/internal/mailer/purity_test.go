package mailer_test

import (
	"go/parser"
	"go/token"
	"strconv"
	"testing"

	"github.com/stretchr/testify/require"
)

// mailer chỉ mô tả thư và nội dung thư; chuyển thư qua mạng là việc của
// mailer/resend. Service import mailer, nên một import net/http lọt vào đây là
// service gián tiếp phụ thuộc vào HTTP client.
func TestMailerDoesNotImportNetHTTP(t *testing.T) {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", nil, parser.ImportsOnly)
	require.NoError(t, err)
	for _, p := range pkgs {
		for name, f := range p.Files {
			for _, imp := range f.Imports {
				path, err := strconv.Unquote(imp.Path.Value)
				require.NoError(t, err)
				require.NotEqual(t, "net/http", path, "%s imports net/http", name)
			}
		}
	}
}
