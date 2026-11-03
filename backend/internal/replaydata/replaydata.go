// Package replaydata đọc data nến 1m đóng gói cho trang /replay (frontend/public/replay-data:
// manifest.json + <MÃ>.bin do scripts/replay-data/build.mjs tạo), cho các lệnh backtest / xem
// trước tin chạy offline.
package replaydata

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
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

// LoadCSV đọc csv/<MÃ>.csv do scripts/replay-data/download.mjs ghi: dòng tiêu đề, rồi mỗi dòng
// "time(ms),open,high,low,close,volume", tăng dần. Dùng cho backtest trên nhiều năm data (quá lớn để
// đóng gói vào .bin của trang /replay).
func LoadCSV(path string) ([]ict.Bar, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()
	r := csv.NewReader(bufio.NewReaderSize(f, 1<<20))
	r.FieldsPerRecord = -1
	r.ReuseRecord = true
	var bars []ict.Bar
	for line := 1; ; line++ {
		rec, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read %s line %d: %w", path, line, err)
		}
		if len(rec) < 5 {
			return nil, fmt.Errorf("%s line %d: want at least 5 columns, got %d", path, line, len(rec))
		}
		ms, err := strconv.ParseFloat(rec[0], 64)
		if err != nil {
			if line == 1 {
				continue // dòng tiêu đề
			}
			return nil, fmt.Errorf("%s line %d: bad time %q", path, line, rec[0])
		}
		var v [4]float64
		for k := 0; k < 4; k++ {
			if v[k], err = strconv.ParseFloat(rec[k+1], 64); err != nil {
				return nil, fmt.Errorf("%s line %d: bad price %q", path, line, rec[k+1])
			}
		}
		t := int64(ms / 1000)
		if n := len(bars); n > 0 && t <= bars[n-1].T {
			continue // trùng / lùi giờ ở ranh giới tháng
		}
		bars = append(bars, ict.Bar{T: t, O: v[0], H: v[1], L: v[2], C: v[3]})
	}
	return bars, nil
}
