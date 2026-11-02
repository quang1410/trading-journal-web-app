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
	for _, n := range ict.LatestOpenNotices(last) {
		msgs = append(msgs, ict.RenderOpen(ict.NewBrief(nq, es, n, *delay, ict.DefaultOptions())))
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
