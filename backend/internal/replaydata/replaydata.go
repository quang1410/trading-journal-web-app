// Package replaydata đọc data nến 1m đóng gói cho trang /replay (frontend/public/replay-data:
// manifest.json + <MÃ>.bin do scripts/replay-data/build.mjs tạo), cho các lệnh backtest / xem
// trước tin chạy offline.
package replaydata

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"journal/internal/ict"
)

type manifest struct {
	Symbols []struct {
		Name   string    `json:"name"`
		File   string    `json:"file"`
		N      int       `json:"n"`
		Scales []float64 `json:"scales"`
	} `json:"symbols"`
}

// Load giải file .bin của mã name: gzip của 6 cột Int32 (little-endian) nối liền, mỗi cột là hiệu
// số so với giá trị trước; cột 0 là phút Unix, cột 1–4 là giá × scale.
func Load(dir, name string) ([]ict.Bar, error) {
	raw, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}
	var m manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("decode manifest: %w", err)
	}
	for _, s := range m.Symbols {
		if !strings.EqualFold(s.Name, name) {
			continue
		}
		f, err := os.Open(filepath.Join(dir, s.File))
		if err != nil {
			return nil, fmt.Errorf("open %s: %w", s.File, err)
		}
		defer f.Close()
		zr, err := gzip.NewReader(f)
		if err != nil {
			return nil, fmt.Errorf("gunzip %s: %w", s.File, err)
		}
		data, err := io.ReadAll(zr)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", s.File, err)
		}
		if len(data) != s.N*6*4 || len(s.Scales) < 5 {
			return nil, fmt.Errorf("%s: %d bytes for %d bars", s.File, len(data), s.N)
		}
		vals := make([]int32, s.N*6)
		if err := binary.Read(bytes.NewReader(data), binary.LittleEndian, vals); err != nil {
			return nil, fmt.Errorf("decode %s: %w", s.File, err)
		}
		col := func(k int) []float64 {
			out := make([]float64, s.N)
			var acc int64
			for i := 0; i < s.N; i++ {
				acc += int64(vals[k*s.N+i])
				out[i] = float64(acc) / s.Scales[k]
			}
			return out
		}
		t, o, h, l, c := col(0), col(1), col(2), col(3), col(4)
		bars := make([]ict.Bar, s.N)
		for i := range bars {
			bars[i] = ict.Bar{T: int64(t[i]) * 60, O: o[i], H: h[i], L: l[i], C: c[i]}
		}
		return bars, nil
	}
	return nil, fmt.Errorf("symbol %s not in manifest", name)
}
