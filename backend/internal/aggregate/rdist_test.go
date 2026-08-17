package aggregate

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

func bucketByLabel(t *testing.T, buckets []RBucket, label string) RBucket {
	t.Helper()
	for _, b := range buckets {
		if b.Label == label {
			return b
		}
	}
	t.Fatalf("không tìm thấy bucket %q", label)
	return RBucket{}
}

func TestRDistributionGiuDuThuTu22Bucket(t *testing.T) {
	buckets := RDistribution(nil, dec("50"))
	require.Len(t, buckets, 22)
	require.Equal(t, "Dưới -20R", buckets[0].Label)
	require.Equal(t, "0R to -1R", buckets[10].Label)
	require.Equal(t, "0R to 1R", buckets[11].Label)
	require.Equal(t, "Trên 20R", buckets[21].Label)
	for _, b := range buckets {
		require.Equal(t, 0, b.Count)
	}
}

func TestRDistributionPhanBucketDungBien(t *testing.T) {
	// oneR = 50 nên net 100 = 2R, net -50 = -1R, ...
	// Quy ước: mỗi bucket là nửa mở [lo, hi) trên trục số, nghĩa là bucket âm
	// CHỨA đầu sâu hơn và KHÔNG chứa đầu gần 0. Đúng -1R nằm ở "0R to -1R",
	// đúng -2R nằm ở "-1R to -2R".
	rows := enrichProfits(t,
		"100",   // 2R    -> "2R to 3R"
		"-50",   // -1R   -> "0R to -1R"
		"-100",  // -2R   -> "-1R to -2R"
		"25",    // 0.5R  -> "0R to 1R"
		"-25",   // -0.5R -> "0R to -1R"
		"1050",  // 21R   -> "Trên 20R"
		"-1050", // -21R  -> "Dưới -20R"
		"0",     // 0R    -> "0R to 1R"
	)

	buckets := RDistribution(rows, dec("50"))

	require.Equal(t, 1, bucketByLabel(t, buckets, "2R to 3R").Count)
	require.Equal(t, 2, bucketByLabel(t, buckets, "0R to -1R").Count, "đúng -1R và -0.5R")
	require.Equal(t, 1, bucketByLabel(t, buckets, "-1R to -2R").Count, "đúng -2R")
	require.Equal(t, 2, bucketByLabel(t, buckets, "0R to 1R").Count, "0.5R và đúng 0R")
	require.Equal(t, 1, bucketByLabel(t, buckets, "Trên 20R").Count)
	require.Equal(t, 1, bucketByLabel(t, buckets, "Dưới -20R").Count)
}

func TestRDistributionTachThangThua(t *testing.T) {
	rows := enrichProfits(t, "100", "150", "-100")

	buckets := RDistribution(rows, dec("50"))

	b2R := bucketByLabel(t, buckets, "2R to 3R")
	require.Equal(t, 1, b2R.Wins)
	require.Equal(t, 0, b2R.Losses)

	b3R := bucketByLabel(t, buckets, "3R to 4R")
	require.Equal(t, 1, b3R.Wins)

	bLoss := bucketByLabel(t, buckets, "-1R to -2R")
	require.Equal(t, 0, bLoss.Wins)
	require.Equal(t, 1, bLoss.Losses)
}

func TestRDistributionNetBangKhongKhongTinhLaThangHayThua(t *testing.T) {
	// net = 0 có win_loss = 1 nhưng KHÔNG được tính vào win lẫn loss (quy tắc
	// ràng buộc, giống hệt cách groupBy trong pivot.go xử lý). Regression cho
	// lỗi trong bản mẫu ban đầu: else-nhánh gộp net = 0 vào Wins.
	rows := enrichProfits(t, "0")

	buckets := RDistribution(rows, dec("50"))

	b := bucketByLabel(t, buckets, "0R to 1R")
	require.Equal(t, 1, b.Count, "net = 0 vẫn được đếm vào Count")
	require.Equal(t, 0, b.Wins, "net = 0 không phải Win")
	require.Equal(t, 0, b.Losses, "net = 0 không phải Loss")
}

func TestRDistributionOneRBangKhongTraBucketRong(t *testing.T) {
	rows := enrichProfits(t, "100", "-50")

	buckets := RDistribution(rows, decimal.Zero)

	require.Len(t, buckets, 22, "vẫn trả đủ nhãn để biểu đồ không vỡ")
	for _, b := range buckets {
		require.Equal(t, 0, b.Count, "không chia được cho 0 thì không xếp lệnh nào")
	}
}
