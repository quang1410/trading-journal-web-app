package replaydata

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

const dir = "../../../frontend/public/replay-data"

func TestLoadBundledNQ(t *testing.T) {
	bars, err := Load(dir, "NQ")
	require.NoError(t, err)
	require.NotEmpty(t, bars)
	for i := 1; i < len(bars); i++ {
		require.Greater(t, bars[i].T, bars[i-1].T, "time increases at %d", i)
		require.GreaterOrEqual(t, bars[i].H, bars[i].L)
	}
	require.Greater(t, bars[0].C, 1000.0, "prices are scaled back to index points")
}

func TestLoadUnknownSymbol(t *testing.T) {
	_, err := Load(dir, "XYZ")
	require.ErrorContains(t, err, "not in manifest")
}

func TestLoadCSV(t *testing.T) {
	path := filepath.Join(t.TempDir(), "US100.csv")
	body := "time,open,high,low,close,volume\n" +
		"1704189600000,16800.5,16810,16795.25,16805,12\n" +
		"1704189660000,16805,16806,16800,16801.75,8\n" +
		"1704189660000,16805,16806,16800,16801.75,8\n" + // trùng ở ranh giới tháng: bỏ
		"1704189720000,16801.75,16802,16790,16791,5\n"
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	bars, err := LoadCSV(path)
	require.NoError(t, err)
	require.Len(t, bars, 3)
	require.Equal(t, int64(1704189600), bars[0].T)
	require.Equal(t, 16810.0, bars[0].H)
	require.Equal(t, 16791.0, bars[2].C)

	bad := filepath.Join(t.TempDir(), "bad.csv")
	require.NoError(t, os.WriteFile(bad, []byte("time,open,high,low,close\n1704189600000,x,1,1,1\n"), 0o600))
	_, err = LoadCSV(bad)
	require.ErrorContains(t, err, "bad price")
}
