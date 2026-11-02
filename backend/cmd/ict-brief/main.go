// Lệnh ict-brief soạn tin phân tích trước phiên (Asia, NY AM) gần nhất trên data replay-data và in
// ra; cờ -send thì gửi qua Telegram (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID trong biến môi trường).
//
//	go run ./cmd/ict-brief -nq NQ -es ES
//	TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... go run ./cmd/ict-brief -send
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"journal/internal/ict"
	"journal/internal/replaydata"
	"journal/internal/telegram"
)

func main() {
	dir := flag.String("data", "../frontend/public/replay-data", "directory holding manifest.json and *.bin")
	nqName := flag.String("nq", "NQ", "symbol standing in for NQ")
	esName := flag.String("es", "ES", "symbol standing in for ES (SMT); empty = no SMT")
	delay := flag.Duration("delay", ict.DataDelay, "simulated data delay")
	histNQ := flag.String("hist-nq", "US100", "symbol used for the historical scenario winrates (empty = none)")
	histES := flag.String("hist-es", "US500", "ES stand-in for the historical winrates")
	intro := flag.String("intro", "", "optional first message sent before the briefs")
	send := flag.Bool("send", false, "send the messages to Telegram")
	flag.Parse()

	nqBars, err := replaydata.Load(*dir, *nqName)
	if err != nil {
		log.Fatal(err)
	}
	nq := ict.NewChart(nqBars)
	var es *ict.Chart
	if *esName != "" {
		esBars, err := replaydata.Load(*dir, *esName)
		if err != nil {
			log.Fatal(err)
		}
		es = ict.NewChart(esBars)
	}

	last := time.Unix(nqBars[len(nqBars)-1].T+60, 0).Add(*delay)
	var msgs []string
	if *intro != "" {
		msgs = append(msgs, *intro)
	}
	var hnq, hes *ict.Chart
	if *histNQ != "" {
		hb, err := replaydata.Load(*dir, *histNQ)
		if err != nil {
			log.Fatal(err)
		}
		hnq = ict.NewChart(hb)
		if *histES != "" {
			eb, err := replaydata.Load(*dir, *histES)
			if err != nil {
				log.Fatal(err)
			}
			hes = ict.NewChart(eb)
		}
	}
	for _, n := range ict.LatestOpenNotices(last) {
		b := ict.NewBrief(nq, es, n, *delay, ict.DefaultOptions())
		if hnq != nil {
			// walk-forward: chỉ các phiên trước ngày của tin, bỏ 20 ngày đầu cho khung lớn đủ nến
			from := time.Unix(hnq.M1[0].T, 0).AddDate(0, 0, 20)
			d := n.At.In(ict.NY)
			to := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, ict.NY)
			stats := ict.BuildScenarioStats(hnq, hes, from, to, *delay, ict.DefaultOptions())
			b.AttachStats(stats)
			for k, t := range stats {
				log.Printf("stats %s fvg=%v: %d kịch bản, quét %d, vào %d, thắng %d, thua %d, hết giờ %d, R TB %+.2f",
					k.Session, k.HasFVG, t.Count, t.Swept, t.Entered, t.Win, t.Loss, t.Open, t.SumR/float64(max(t.Entered, 1)))
			}
		}
		msgs = append(msgs, ict.RenderOpen(b))
	}

	var tg telegram.Client
	if *send {
		tg = telegram.Client{Token: os.Getenv("TELEGRAM_BOT_TOKEN"), ChatID: os.Getenv("TELEGRAM_CHAT_ID")}
	}
	for _, m := range msgs {
		fmt.Println(m)
		fmt.Println("────────")
		if *send {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			err := tg.Send(ctx, m)
			cancel()
			if err != nil {
				log.Fatal(err)
			}
		}
	}
}
