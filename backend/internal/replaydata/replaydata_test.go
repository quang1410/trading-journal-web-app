package replaydata

import (
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
