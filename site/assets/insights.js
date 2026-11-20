// 數據觀察（2026-11-18 第十八版，SPEC「數據觀察（Insights）與搜尋」）：四章，每章「問題 → 一張圖 → 一兩句白話結論」。
// 數字全部來自 data/summary.json 的 insights（和主結論同一段程式、每天重算；第 4 章跟著每月同步），結論裡的數字由程式帶入。
// 圖是自己畫的 SVG（照容器的實際寬度畫，手機上字不會縮小），不載入外部套件、不向其他網站發請求。顏色照各語言（中文紅贏綠輸、英文綠贏紅輸）。
"use strict";
(async () => {
  const pct = (x, d = 1) => F.pct(x, d), share = (x) => F.share(x);
  const abs = (x, d = 1) => F.pct(Math.abs(x), d).replace("+", "");  // 沒有正負號的百分比（「輸大盤 10.2%」）
  const ZH_NUM = ["零", "一", "兩", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  const EN_NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  // 交易日 → 大約幾個月（約 21 個交易日一個月，取到半個月）：50 天 → 兩個半月
  const halfMonths = (days) => Math.round((days / 21) * 2) / 2;
  const TEXT = {
    zh: {
      n: (n) => `n = ${n} 檔`,
      // 頁面最上方的資料說明（2026-11-19）
      intro: (s, c) => `股價更新至 ${F.date(s.price_date)}，集數涵蓋到 EP${s.last_ep}。` +
        `第 1～3 章只算 2022 年起第一次提到、而且已經滿一年的 ${c.n} 檔：每一檔各自從第一次提到後的第一個交易日買進，抱 252 個交易日（約一年），和同一段時間的 S&amp;P 500 比。` +
        `每一檔的一年是不同的時間，不是統一切在某一天；和首頁泡泡的「至今」不同。` +
        `這 ${c.n} 檔第一次提到的日期，最早是 ${F.date(c.first_date)}，最晚是 ${F.date(c.last_date)}。`,
      name: (w) => w.zh,
      ch1: {
        q: "為什麼只有 42% 贏過大盤？", qf: (w) => `為什麼只有 ${w} 贏過大盤？`,
        note: (n) => `主結論那組 ${n} 檔（2022 年起首次提及、已滿 12 個月），每一條是一檔的 12 個月超額報酬（對 S&amp;P 500），由高到低。超過圖右邊的，數字寫在旁邊。`,
        axis: "一年後，和 S&amp;P 500 比的報酬差（%）",
        // 2026-11-19 使用者給的文字，數字由程式帶入；每一句一行
        text: (c, t, name) => [
          `我們把 ${c.n} 檔股票，各自從第一次被提到後買進、抱一年，和同一段時間買 S&amp;P 500 比。`,
          `結果 ${t.wins} 檔贏、${t.n - t.wins} 檔輸。`,
          `把 ${c.n} 檔照成績排隊，排在中間的那一檔，一年下來${t.median < 0 ? "輸" : "贏"}大盤 ${abs(t.median)}。`,
          { aside: "中位數：把所有股票照成績排隊，站在最中間的那一檔，比平均更能代表一般情況，因為不會被少數漲翻天的股票拉高。" },
          t.mean > t.median
            ? `但如果算平均，${t.mean > 0 ? (t.median < 0 ? "反而是贏" : "是贏") : "也是輸"} ${abs(t.mean)}，因為少數幾檔漲翻天：${name(c.best)} 一檔就贏了 ${abs(c.best.x, 0)}。`
            : `如果算平均，是${t.mean > 0 ? "贏" : "輸"} ${abs(t.mean)}。`,
          c.top_share == null ? "" : c.top_share > 1
            ? `前 ${c.top} 名加起來，就比 ${c.n} 檔的總和還多，也就是其他 ${c.n - c.top} 檔合起來是輸的。`
            : `前 ${c.top} 名加起來，佔了 ${c.n} 檔總和的 ${share(c.top_share)}。`,
          c.worst.x < 0 ? `輸最多的是 ${name(c.worst)}，輸了 ${abs(c.worst.x)}。` : "",
        ],
      },
      ch2: {
        q: "他提到之前，股價已經漲了嗎？",
        note: (n, pre, post) => `主結論那組裡，第 −${pre} 天就有股價的 ${n} 檔。第 0 天是首次提及後的進場日；每一天的超額報酬＝（當天收盤 ÷ 進場日開盤 − 1）減去 S&amp;P 500 同樣算法，看第 −${pre} 到第 +${post} 個交易日。`,
        median: "中位數", mean: "平均數", band: "中間 50% 的股票", mention: "首次提及", day: (d) => `第 ${d} 天`,
        before: "提到前", after: "提到後",
        yAxis: "和 S&amp;P 500 比，多漲或少漲（%），買進那天＝0%", xAxis: "距離提到的交易日（0＝買進那天）",
        months: (h) => (h === 0.5 ? "半個月" : Number.isInteger(h) ? `${ZH_NUM[h] ?? h} 個月`.replace(/^(\D+) /, "$1") : `${ZH_NUM[Math.floor(h)] ?? Math.floor(h)}個半月`),
        // 2026-11-19 使用者給的文字；方向改變時改寫，「也就是說…」只在「先漲、短暫續漲、之後落後」時顯示（匯出時會提醒）
        text: (c, m, T2) => {
          const pre = `${Math.round(c.pre / 21)} 個月`, post = c.post >= 240 ? "1 年" : `${Math.round(c.post / 21)} 個月`;
          const h = halfMonths(m.peakDay), when = h >= 0.5 ? `提到後約${T2.months(h)}` : `提到後第 ${m.peakDay} 個交易日`;
          return [
            `這張圖看每一檔股票，從他提到前 ${pre}，到提到後 ${post}，比大盤多漲或少漲多少。`,
            "買進那天是 0%。",
            `把 ${c.n} 檔排隊，看排在中間的那一檔：`,
            `提到前 ${pre}，它已經比大盤${m.pre <= 0 ? "多" : "少"}漲了約 ${abs(m.pre)}；`,
            m.peak > 0 ? `${when}，${m.pre <= 0 ? "再" : ""}多漲到 ${pct(m.peak, 0)}，是最高點；` : "提到後一直沒有比買進那天多漲；",
            m.end < 0 ? `一年後，${m.peak > 0 ? "反而" : ""}輸大盤 ${abs(m.end, 0)}。` : `一年後，贏大盤 ${abs(m.end, 0)}。`,
            c.story ? "也就是說，常常是股票先漲了一段，他才提到；提到後短暫續漲，之後慢慢落後。" : "",
            "這只能說明前後股價怎麼走，不代表是因為他提到才漲或才跌。",
          ];
        },
      },
      ch3: {
        q: "一年內，有多少股票翻倍？多少腰斬？",
        note: (n) => `主結論那組 ${n} 檔，首次提及後 12 個月內，到第 N 個交易日為止曾經碰到門檻的比例。上半部是漲、下半部是跌；虛線是同一段期間的 S&amp;P 500（只畫 ±10%、±20%）。`,
        up: { 10: "+10%", 20: "+20%", 100: "翻倍" }, down: { 10: "−10%", 20: "−20%", 50: "腰斬" }, spy: (k) => `S&amp;P 500 ${k}`,
        day: (d) => `第 ${d} 天`,
        text: (c) => `一年內，${c.n} 檔裡有 ${c.doubled} 檔（${share(c.doubled / c.n)}）曾經翻倍，${c.halved} 檔（${share(c.halved / c.n)}）曾經腰斬。` +
          `曾跌 20% 的有 ${share(c.down["20"][c.days])}，同一段期間的 S&amp;P 500 只有 ${share(c.spy_down["20"][c.days])}。` +
          "翻倍（變 2 倍）和腰斬（變一半）是對稱的。",
      },
      ch4: {
        q: "他聊過多少股票？",
        note: "網站上的美股個股（早期提及加 2022 年起），依首次提及的日期累計。ETF 和台股不在這裡。",
        early: "暖身期（2020–2021）", since: "2022 年起",
        text: (c) => `網站上一共有 ${c.n} 檔美股個股：暖身期（2020–2021）${c.early} 檔，2022 年起 ${c.since_2022} 檔，` +
          `2022 年起平均每季新增 ${c.per_quarter == null ? "—" : c.per_quarter.toFixed(1)} 檔。ETF 和台股不在這裡。`,
      },
      // 總結（2026-11-19 使用者給的文字）：第 1 點的「幾成」照勝率四捨五入，p ≥ 0.05 才寫「和擲銅板沒有明顯差別」；
      // 第 2 點只有提到前比大盤多漲時才顯示；第 3 點的「一半」和翻倍的比例照實際帶入
      sum: {
        title: "總結",
        points: (k) => [
          `被提到的股票，一年後贏大盤的大約${ZH_NUM[k.win_tenths]}成，${k.coin_flip ? "和擲銅板沒有明顯差別" : k.beat_more ? "明顯比擲銅板好" : "明顯比擲銅板差"}。`,
          k.pre_outran ? "孟恭常在股票已經漲了一段之後才聊到。" : "",
          `提到的標的波動比大盤大很多：一年內有${k.fell20_tenths === 5 ? "一半" : `${ZH_NUM[k.fell20_tenths]}成`}曾跌 20% 以上；但也有 ${share(k.doubled)} 曾經翻倍。`,
        ],
        end: "所以，這份名單適合當「找研究題目」的清單，不適合照著買。",
      },
    },
    en: {
      n: (n) => `n = ${n} stocks`,
      intro: (s, c) => `Prices as of ${F.date(s.price_date)}; episodes through EP${s.last_ep}. ` +
        `Chapters 1–3 count only the ${c.n} stocks first mentioned from 2022 on whose one year is complete: each one is bought on the first trading day after its first mention, held for 252 trading days (about a year), and compared with the S&amp;P 500 over the same days. ` +
        `Each stock’s year is a different stretch of time, not cut off on one common date, so this differs from the “to date” numbers in the bubbles on the main page. ` +
        `These ${c.n} stocks were first mentioned between ${F.date(c.first_date)} and ${F.date(c.last_date)}.`,
      // 英文句子裡用品牌名（例如 SanDisk），不用 “Sandisk Corporation” 這種正式名稱；中文名不是英文字母才用英文名
      name: (w) => (/^[\x20-\x7e]+$/.test(w.zh) ? w.zh : w.en),
      ch1: {
        q: "Why did only 42% beat the market?", qf: (w) => `Why did only ${w} beat the market?`,
        note: (n) => `The ${n} stocks in the main result (first mentioned from 2022, 12 months done). Each bar is one stock’s 12-month excess return over the S&amp;P 500, highest first. Bars past the right edge show their number.`,
        axis: "One-year return minus the S&amp;P 500’s (%)",
        text: (c, t, name) => [
          `We took the ${c.n} stocks, bought each one after its first mention, held it for a year, and compared that with buying the S&amp;P 500 over the same days.`,
          `${t.wins} beat the market and ${t.n - t.wins} lost.`,
          `Line up the ${c.n} by result, and the stock in the middle (the median) ${t.median < 0 ? "trailed" : "beat"} the market by ${abs(t.median)} over the year.`,
          { aside: "The median: line up all the stocks by result, and the one standing in the very middle shows the usual case better than the average does, because a few stocks that soared can’t pull it up." },
          t.mean > t.median
            ? `But the average ${t.mean > 0 ? "beat" : "still trailed"} the market by ${abs(t.mean)}, because a few stocks soared: ${name(c.best)} alone beat it by ${abs(c.best.x, 0)}.`
            : `The average ${t.mean > 0 ? "beat" : "trailed"} the market by ${abs(t.mean)}.`,
          c.top_share == null ? "" : c.top_share > 1
            ? `The top ${c.top} together add up to more than the total of all ${c.n}, which means the other ${c.n - c.top} together lost.`
            : `The top ${c.top} together make up ${share(c.top_share)} of the total of all ${c.n}.`,
          c.worst.x < 0 ? `The biggest loser was ${name(c.worst)}, which trailed by ${abs(c.worst.x)}.` : "",
        ],
      },
      ch2: {
        q: "Had the price already moved before he mentioned it?",
        note: (n, pre, post) => `The ${n} stocks in the main result with a price on day −${pre}. Day 0 is the entry day after the first mention; each day’s excess return = (that day’s close ÷ the entry-day open − 1) minus the same for the S&amp;P 500, from trading day −${pre} to +${post}.`,
        median: "Median", mean: "Mean", band: "Middle 50% of stocks", mention: "First mention", day: (d) => `Day ${d}`,
        before: "Before", after: "After",
        yAxis: "Rose more (+) or less (−) than the S&amp;P 500 (%), entry day = 0%", xAxis: "Trading days from the mention (0 = entry day)",
        months: (h) => (h === 0.5 ? "half a month" : Number.isInteger(h) ? `${EN_NUM[h] ?? h} month${h === 1 ? "" : "s"}`
          : `${EN_NUM[Math.floor(h)] ?? Math.floor(h)} and a half months`),
        text: (c, m, T2) => {
          const n = Math.round(c.pre / 21), pre = `${n} month${n === 1 ? "" : "s"}`, post = c.post >= 240 ? "1 year" : `${Math.round(c.post / 21)} months`;
          const h = halfMonths(m.peakDay), when = h >= 0.5 ? `about ${T2.months(h)} after the mention` : `on trading day ${m.peakDay} after the mention`;
          return [
            `This chart follows each stock from ${pre} before he mentioned it to ${post} after, and how much more or less it rose than the market.`,
            "The entry day is 0%.",
            `Line up the ${c.n} stocks and look at the one in the middle (the median):`,
            `in the ${pre} before the mention, it had already ${m.pre <= 0 ? "outrun" : "lagged"} the market by about ${abs(m.pre)};`,
            m.peak > 0 ? `${when}, it ${m.pre <= 0 ? "pulled further ahead" : "got ahead"} to ${pct(m.peak, 0)}, its high point;` : "after the mention it never got ahead of the entry day;",
            m.end < 0 ? `a year later, it ${m.peak > 0 ? "instead " : ""}trailed the market by ${abs(m.end, 0)}.` : `a year later, it beat the market by ${abs(m.end, 0)}.`,
            c.story ? "In other words, the stock often rose for a while before he mentioned it, kept rising briefly afterward, then slowly fell behind." : "",
            "This only shows how prices moved around the mention; it doesn’t mean they rose or fell because he mentioned them.",
          ];
        },
      },
      ch3: {
        q: "Within a year, how many doubled, and how many halved?",
        note: (n) => `The ${n} stocks in the main result: the share that had touched each level by trading day N in the 12 months after the first mention. Gains on top, losses below; dashed lines are the S&amp;P 500 over the same windows (±10% and ±20% only).`,
        up: { 10: "+10%", 20: "+20%", 100: "Doubled" }, down: { 10: "−10%", 20: "−20%", 50: "Halved" }, spy: (k) => `S&amp;P 500 ${k}`,
        day: (d) => `Day ${d}`,
        text: (c) => `Within a year, ${c.doubled} of ${c.n} stocks (${share(c.doubled / c.n)}) doubled at some point and ${c.halved} (${share(c.halved / c.n)}) halved. ` +
          `${share(c.down["20"][c.days])} fell 20% at some point, against ${share(c.spy_down["20"][c.days])} for the S&amp;P 500 over the same windows. ` +
          "Doubling (2×) and halving (½×) are mirror images.",
      },
      ch4: {
        q: "How many stocks has he talked about?",
        note: "US stocks on this site (early mentions plus 2022 on), counted by first-mention date. ETFs and Taiwan stocks aren’t included.",
        early: "Warm-up (2020–2021)", since: "From 2022",
        text: (c) => `This site has ${c.n} US stocks: ${c.early} from the warm-up years (2020–2021) and ${c.since_2022} from 2022 on, ` +
          `an average of ${c.per_quarter == null ? "—" : c.per_quarter.toFixed(1)} new stocks a quarter since 2022. ETFs and Taiwan stocks aren’t included.`,
      },
      sum: {
        title: "Takeaways",
        points: (k) => {
          const w = EN_NUM[k.win_tenths];
          return [
            `About ${w} in ten mentioned stocks beat the market a year later, ${k.coin_flip ? "not clearly different from a coin flip" : k.beat_more ? "clearly better than a coin flip" : "clearly worse than a coin flip"}.`,
            k.pre_outran ? "The host often brings a stock up after it has already risen for a while." : "",
            `These stocks swing far more than the market: within a year, ${k.fell20_tenths === 5 ? "about half" : `about ${EN_NUM[k.fell20_tenths]} in ten`} fell 20% or more at some point, yet ${share(k.doubled)} doubled at some point.`,
          ];
        },
        end: "So this list works as a source of research ideas, not as a list to buy.",
      },
    },
  }[LANG];

  // 欄位說明視窗（第二十版，原本是 txt 檔）：和首頁「方法與限制」一樣，網址 #columns、Esc 關閉、關掉後焦點回到「欄位說明」。
  // 欄位名稱必須和 CSV 的表頭（public/build/update.py 的 CSV_HEAD）一模一樣，測試會核對。
  const COLUMNS = {
    zh: {
      intro: ["這份 CSV 是數據觀察第 1～3 章和首頁主結論用的同一組股票：2022 年起第一次被提到、而且已經滿一年（252 個交易日）的美股個股，每一檔一列。",
        "只有數字，沒有節目原話，每天和網站一起更新。股價是 Yahoo Finance 調整過分割和配息的價格（少數幾檔用 Nasdaq），所以可能和當時看到的報價不同。"],
      cols: [
        ["代號", "美股代號。"],
        ["公司名稱", "公司名稱。"],
        ["第一次提到的集數", "2022 年起第一次被提到的那一集。"],
        ["第一次提到的日期", "那一集的發布日期。"],
        ["買進日（提到後第一個交易日）", "那一集發布之後，第一個開盤的美股交易日（發布時間早於美東時間 9:30 開盤，就是當天）。"],
        ["出場日（買進後第 252 個交易日）", "買進日之後第 252 個交易日，約一年。交易日照 S&amp;P 500 ETF（SPY）的交易日。"],
        ["買進價（買進日開盤，美元）", "買進日的開盤價。"],
        ["出場價（出場日收盤，美元）", "出場日的收盤價。"],
        ["個股一年報酬（%）", "出場價 ÷ 買進價 − 1。"],
        ["S&amp;P 500 同期報酬（%）", "SPY 用同一個買進日的開盤價、同一個出場日的收盤價，同樣算法。"],
        ["一年後比大盤多漲（%）", "個股一年報酬減 S&amp;P 500 同期報酬（也叫超額報酬），負的是少漲。可能小於 −100%。"],
        ["是否贏過大盤", "上一欄大於 0 是「是」，其他是「否」。網頁上的勝率＝「是」的檔數 ÷ 全部檔數。"],
        ["提到前 60 個交易日比大盤多漲（%）", "買進日前 60 個交易日到買進日，個股比 S&amp;P 500 多漲多少（負的是少漲）。算法和第 2 章一樣：以買進價為基準，（1 − 第 −60 天收盤 ÷ 買進價）減去 S&amp;P 500 同樣算法，也就是第 2 章圖上第 −60 天那個數字的相反數。那一天還沒有股價（例如剛上市）的留空。"],
        ["第幾個交易日首次漲到 +10%", "從買進日（第 0 天）起，收盤價第一次比買進價高 10% 是第幾個交易日；一年內沒碰到的留空。"],
        ["第幾個交易日首次漲到 +20%", "同上，門檻是高 20%。"],
        ["第幾個交易日首次漲到 +100%（翻倍）", "同上，門檻是高 100%（變 2 倍）。"],
        ["第幾個交易日首次跌到 -10%", "收盤價第一次比買進價低 10% 是第幾個交易日；一年內沒碰到的留空。"],
        ["第幾個交易日首次跌到 -20%", "同上，門檻是低 20%。"],
        ["第幾個交易日首次跌到 -50%（腰斬）", "同上，門檻是低 50%（變一半）。"],
      ],
      end: "和網頁數字的關係：「一年後比大盤多漲」的中位數和平均數、「是」的比例、翻倍和腰斬有填的比例，都和這一頁上的數字完全一樣（有自動測試核對）。",
      head: ["欄位", "意思"],
    },
    en: {
      intro: ["This CSV covers the same stocks as chapters 1–3 and the main result: US stocks first mentioned from 2022 on whose one year (252 trading days) is complete, one row per stock.",
        "Numbers only, no quotes from the show; updated daily with the site. Prices are Yahoo Finance prices adjusted for splits and dividends (Nasdaq for a few), so they can differ from the quotes you saw at the time."],
      cols: [
        ["Ticker", "US ticker."],
        ["Company", "Company name."],
        ["First-mention episode", "The episode in which the stock was first mentioned (from 2022 on)."],
        ["First-mention date", "That episode’s release date."],
        ["Entry day (first trading day after the mention)", "The first US trading session that opens after the episode is released (released before the 9:30 a.m. ET open = that day)."],
        ["Exit day (252nd trading day after entry)", "About a year later. Trading days follow the S&amp;P 500 ETF (SPY)."],
        ["Entry price (entry-day open, USD)", "Open on the entry day."],
        ["Exit price (exit-day close, USD)", "Close on the exit day."],
        ["Stock 1-year return (%)", "Exit price ÷ entry price − 1."],
        ["S&amp;P 500 return, same days (%)", "The same calculation for SPY, entry-day open to exit-day close."],
        ["1-year return above the market (%)", "Stock 1-year return minus the S&amp;P 500 return (the excess return); negative means it rose less. Can be below −100%."],
        ["Beat the market", "“yes” if the previous column is above 0, otherwise “no”. The page’s win rate = yes ÷ all rows."],
        ["Rise above the market in the 60 trading days before the mention (%)", "How much more the stock rose than the S&amp;P 500 from 60 trading days before the entry day to the entry day (negative = rose less). Same as chapter 2: based on the entry price, (1 − close on day −60 ÷ entry price) minus the same for the S&amp;P 500, i.e. minus the chapter 2 chart’s day −60 value. Blank if there was no price yet (for example, a recent IPO)."],
        ["Trading day it first rose +10%", "Counting the entry day as day 0, the trading day on which the close first reached 10% above the entry price; blank if it never did within the year."],
        ["Trading day it first rose +20%", "Same, 20% above."],
        ["Trading day it first rose +100% (doubled)", "Same, 100% above (2×)."],
        ["Trading day it first fell -10%", "The trading day on which the close first fell 10% below the entry price; blank if it never did within the year."],
        ["Trading day it first fell -20%", "Same, 20% below."],
        ["Trading day it first fell -50% (halved)", "Same, 50% below (½×)."],
      ],
      end: "How it matches this page: the median and mean of “1-year return above the market”, the share of “yes”, and the share of rows with doubled and halved filled in equal the numbers on this page exactly (checked by automated tests).",
      head: ["Column", "Meaning"],
    },
  }[LANG];
  const colDlg = document.getElementById("columns"), colOpen = document.getElementById("columns-open");
  document.getElementById("columns-body").innerHTML = COLUMNS.intro.map((p) => `<p>${p}</p>`).join("") +
    `<dl class="cols">${COLUMNS.cols.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl><p>${COLUMNS.end}</p>`;
  const openCols = (push) => { if (!colDlg.open) colDlg.showModal(); if (push && location.hash !== "#columns") history.pushState(null, "", "#columns"); };
  colOpen.addEventListener("click", () => openCols(true));
  colDlg.querySelector("[data-close]").addEventListener("click", () => colDlg.close());
  colDlg.addEventListener("close", () => {
    if (location.hash === "#columns") history.replaceState(null, "", location.pathname + location.search);
    colOpen.focus();
  });
  const syncCols = () => (location.hash === "#columns" ? openCols(false) : colDlg.open && colDlg.close());
  window.addEventListener("hashchange", syncCols);
  syncCols();

  const s = await fetch(ROOT + "data/summary.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const $ = (id) => document.getElementById(id);
  $("headline").innerHTML = T.headline(F.share(s.main.spy.win), s.main.done);
  $("price-date").textContent = T.priceDate(F.date(s.price_date));
  $("last-ep").textContent = T.lastEp(s.last_ep);
  const I = s.insights;
  $("ins-intro").innerHTML = TEXT.intro(s, I.ch1);

  // ---- SVG 小工具 ----
  const svg = (w, h, body, label) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${body}</svg>`;
  const txt = (x, y, s, a = {}) => `<text x="${x}" y="${y}"${Object.entries(a).map(([k, v]) => ` ${k}="${v}"`).join("")}>${s}</text>`;
  const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  const ticks = (lo, hi, n) => {
    const raw = (hi - lo) / n, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= raw);
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  };
  // 標籤文字的寬度（和 .fig .lab 同樣的字型、13px），用來判斷放不放得下
  const measure = document.createElement("canvas").getContext("2d");
  const textWidth = (str) => {
    measure.font = `13px ${getComputedStyle(document.body).getPropertyValue("--sans") || "sans-serif"}`;
    return measure.measureText(str.replace(/&amp;/g, "&")).width;
  };
  const line = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");

  // 第 1 章：每一檔一條橫條，由高到低；贏＝實心、輸＝空心（顏色照各語言）
  function ch1(w) {
    const c = I.ch1, bars = c.bars, row = 6, top = 22, h = top + bars.length * row + 26, left = 24, right = w - 128;
    const lo = Math.min(-1, ...bars.map((b) => b.x)), hi = 3;  // 右邊到 +300%，超過的寫數字
    const x = scale(lo, hi, left, right), x0 = x(0);
    let body = ticks(lo, hi, 5).map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="${top - 4}" y2="${h - 22}" class="grid"/>` +
      txt(x(v), h - 6, pct(v, 0), { class: "tick", "text-anchor": "middle" })).join("");
    let ly = top + 4;  // 前幾名的標籤排在右邊一欄，細線連到橫條的末端（橫條只有 6px 高，直接標會重疊）
    bars.forEach((b, i) => {
      const y = top + i * row, xe = x(Math.min(b.x, hi)), win = b.x > 0;
      body += `<rect x="${Math.min(x0, xe).toFixed(1)}" y="${y + 0.5}" width="${Math.max(0.8, Math.abs(xe - x0)).toFixed(1)}" height="${row - 1.5}" class="${win ? "bar-win" : "bar-lose"}"/>`;
      if (i < c.top) {
        ly = Math.max(ly, y + row / 2);
        body += `<path d="M${(xe + 2).toFixed(1)},${(y + row / 2).toFixed(1)}L${right + 4},${ly.toFixed(1)}" class="leader"/>` +
          txt(right + 8, ly + 4, `${b.t} ${pct(b.x, 0)}`, { class: "lab" });
        ly += 16;
      }
    });
    // 輸最多的 5 檔（2026-11-19）：標籤也排在右邊一欄、由下往上；那幾列右半邊是空的（橫條往左），細線從 0 的位置拉過去
    let by = h - 22 - 4;
    for (let i = bars.length - 1; i >= Math.max(c.top, bars.length - c.top); i--) {
      const b = bars[i], y = top + i * row;
      by = Math.min(by, y + row / 2 + 4);
      body += `<path d="M${(x0 + 2).toFixed(1)},${(y + row / 2).toFixed(1)}L${right + 4},${(by - 4).toFixed(1)}" class="leader"/>` +
        txt(right + 8, by, `${b.t} ${pct(b.x, 0)}`, { class: "lab" });
      by -= 16;
    }
    body += `<line x1="${x0}" x2="${x0}" y1="${top - 6}" y2="${h - 22}" class="axis0"/>`;
    return svg(w, h, body, TEXT.ch1.qf(share(c.tests.wins / c.tests.n)));
  }

  // 第 2 章：中位數（主線）、平均數（細線）、中間 50%（淺色帶）；第 0 天畫直線
  function ch2(w) {
    const c = I.ch2, n = c.median.length, h = Math.round(Math.min(420, Math.max(300, w * 0.55))), m = { l: 52, r: 16, t: 26, b: 34 };
    const days = Array.from({ length: n }, (_, i) => i - c.pre);
    const all = [...c.q25, ...c.q75, ...c.mean, ...c.median], lo = Math.min(...all), hi = Math.max(...all);
    const x = scale(-c.pre, c.post, m.l, w - m.r), y = scale(lo, hi, h - m.b, m.t);
    let body = ticks(lo, hi, 5).map((v) => `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` +
      txt(m.l - 6, y(v) + 4, pct(v, 0), { class: "tick", "text-anchor": "end" })).join("");
    const narrow = w < 560;  // 窄的時候日期只寫數字，不寫「第…天」，才不會擠在一起
    [-c.pre, 0, 60, 120, 180, c.post].forEach((d) => {
      const v = d > 0 ? `+${d}` : d === 0 ? "0" : `−${-d}`;
      body += txt(x(d), h - 10, narrow ? v : TEXT.ch2.day(v), { class: "tick", "text-anchor": d === -c.pre ? "start" : d === c.post ? "end" : "middle" });
    });
    body += `<path d="${line(days.map((d, i) => [x(d), y(c.q75[i])]))}${line(days.map((d, i) => [x(d), y(c.q25[i])]).reverse()).replace("M", "L")}Z" class="band"/>`;
    body += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(0)}" y2="${y(0)}" class="axis0"/>`;
    body += `<line x1="${x(0)}" x2="${x(0)}" y1="${m.t - 10}" y2="${h - m.b}" class="mark"/>` + txt(x(0) + 5, m.t - 12, TEXT.ch2.mention, { class: "lab" });
    // 第 0 天左右的淺色標註（2026-11-19）：放在圖的下緣，第 0 天附近那裡沒有線
    body += txt(x(0) - 6, h - m.b - 8, TEXT.ch2.before, { class: "side", "text-anchor": "end" }) +
      txt(x(0) + 6, h - m.b - 8, TEXT.ch2.after, { class: "side" });
    body += `<path d="${line(days.map((d, i) => [x(d), y(c.mean[i])]))}" class="mean"/>`;
    body += `<path d="${line(days.map((d, i) => [x(d), y(c.median[i])]))}" class="median"/>`;
    return svg(w, h, body, TEXT.ch2.q);
  }

  // 第 3 章：上半部漲（+10%、+20%、翻倍）、下半部跌（−10%、−20%、腰斬），像鏡子；S&P 500 只畫 ±10%、±20%（虛線）
  function ch3(w) {
    const c = I.ch3, h = Math.round(Math.min(460, Math.max(340, w * 0.6))), m = { l: 46, r: 122, t: 14, b: 30 };
    const x = scale(0, c.days, m.l, w - m.r), y = scale(-1, 1, h - m.b, m.t);
    let body = [-1, -0.5, 0, 0.5, 1].map((v) => `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}" class="${v ? "grid" : "axis0"}"/>` +
      txt(m.l - 6, y(v) + 4, share(Math.abs(v)), { class: "tick", "text-anchor": "end" })).join("");
    [0, 63, 126, 189, 252].forEach((d) => { body += txt(x(d), h - 8, w < 560 ? d : TEXT.ch3.day(d), { class: "tick", "text-anchor": d ? (d === 252 ? "end" : "middle") : "start" }); });
    const ends = [];
    const curve = (vals, sign, cls, label) => {
      body += `<path d="${line(vals.map((v, i) => [x(i), y(sign * v)]))}" class="${cls}"/>`;
      ends.push({ y: y(sign * vals[vals.length - 1]), label, cls });
    };
    Object.entries(c.spy_up).forEach(([k, v]) => curve(v, 1, "spy", TEXT.ch3.spy(TEXT.ch3.up[k])));
    Object.entries(c.spy_down).forEach(([k, v]) => curve(v, -1, "spy", TEXT.ch3.spy(TEXT.ch3.down[k])));
    Object.entries(c.up).forEach(([k, v]) => curve(v, 1, `up up${k}`, TEXT.ch3.up[k]));
    Object.entries(c.down).forEach(([k, v]) => curve(v, -1, `down down${k}`, TEXT.ch3.down[k]));
    ends.sort((a, b) => a.y - b.y).forEach((e, i, arr) => { if (i && e.y - arr[i - 1].y < 15) e.y = arr[i - 1].y + 15; });
    ends.forEach((e) => { body += txt(w - m.r + 6, e.y + 4, e.label, { class: `lab end-${e.cls.split(" ")[0]}` }); });
    return svg(w, h, body, TEXT.ch3.q);
  }

  // 第 4 章：累計提過的不同股票數（階梯線），標出 2022-01-01 的分界
  function ch4(w) {
    const c = I.ch4, h0 = Math.round(Math.min(380, Math.max(280, w * 0.5))), m = { l: 44, r: 16, t: 28, b: 30 };
    const t = (d) => Date.parse(d + "T00:00:00Z"), t0 = t("2020-02-01"), t1 = t(c.last_ep_date || c.steps[c.steps.length - 1].date);
    // 「暖身期（2020–2021）」放在 2022 分界線左邊；手機上放不下（會被切掉）就拆成兩行，圖的上緣多留一行（第二十版）
    const xs0 = m.l + ((t("2022-01-01") - t0) / (t1 - t0)) * (w - m.r - m.l);
    const split = textWidth(TEXT.ch4.early) > xs0 - 10 ? TEXT.ch4.early.split(/(?=（|\s\()/) : [TEXT.ch4.early];
    if (split.length > 1) m.t += 16;
    const h = h0 + (split.length > 1 ? 16 : 0);
    const x = scale(t0, t1, m.l, w - m.r), y = scale(0, c.n, h - m.b, m.t);
    let body = ticks(0, c.n, 4).map((v) => `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>` +
      txt(m.l - 6, y(v) + 4, v, { class: "tick", "text-anchor": "end" })).join("");
    for (let yr = 2021; yr <= new Date(t1).getUTCFullYear(); yr++) body += txt(x(t(`${yr}-01-01`)), h - 8, yr, { class: "tick", "text-anchor": "middle" });
    const xs = x(t("2022-01-01"));
    body += `<rect x="${m.l}" y="${m.t}" width="${xs - m.l}" height="${h - m.b - m.t}" class="warm"/>`;
    body += `<line x1="${xs}" x2="${xs}" y1="${m.t - 12}" y2="${h - m.b}" class="mark"/>` +
      split.map((p, i) => txt(xs - 6, m.t - 14 - (split.length - 1 - i) * 16, p.trim(), { class: "lab", "text-anchor": "end" })).join("") +
      txt(xs + 6, m.t - 14, TEXT.ch4.since, { class: "lab" });
    const pts = [[x(t0), y(0)]];
    c.steps.forEach((p) => { const xx = x(t(p.date)); pts.push([xx, pts[pts.length - 1][1]], [xx, y(p.n)]); });
    pts.push([x(t1), pts[pts.length - 1][1]]);
    body += `<path d="${line(pts)}" class="median"/>`;
    return svg(w, h, body, TEXT.ch4.q);
  }

  // 第 2 章的結論用的幾個數字（都從資料算，不寫死；最高點是哪一天由 update.py 算，和匯出時的提醒同一個判斷）
  const c2 = I.ch2, at = (d) => c2.median[d + c2.pre];
  const m2 = { pre: at(-c2.pre), peakDay: c2.peak_day, peak: at(c2.peak_day), end: at(c2.post) };
  // 一句一行；{ aside } 是較小的補充說明；空字串（條件不成立）不顯示
  const lines = (xs) => xs.filter(Boolean).map((x) => (typeof x === "string" ? `<span class="ln">${x}</span>` : `<span class="ln aside">${x.aside}</span>`)).join("");

  const chapters = [
    { id: "ch1", q: TEXT.ch1.qf(share(I.ch1.tests.wins / I.ch1.tests.n)), n: I.ch1.n, note: TEXT.ch1.note(I.ch1.n), draw: ch1,
      text: lines(TEXT.ch1.text(I.ch1, I.ch1.tests, TEXT.name)), xAxis: TEXT.ch1.axis },
    { id: "ch2", q: TEXT.ch2.q, n: c2.n, note: TEXT.ch2.note(c2.n, c2.pre, c2.post), draw: ch2, text: lines(TEXT.ch2.text(c2, m2, TEXT.ch2)),
      yAxis: TEXT.ch2.yAxis, xAxis: TEXT.ch2.xAxis,
      legend: [["median", TEXT.ch2.median], ["mean", TEXT.ch2.mean], ["band", TEXT.ch2.band]] },
    { id: "ch3", q: TEXT.ch3.q, n: I.ch3.n, note: TEXT.ch3.note(I.ch3.n), draw: ch3, text: TEXT.ch3.text(I.ch3) },
    { id: "ch4", q: TEXT.ch4.q, n: I.ch4.n, note: TEXT.ch4.note, draw: ch4, text: TEXT.ch4.text(I.ch4) },
  ];
  $("chapters").innerHTML = chapters.map((c, i) => `<section class="chapter" id="${c.id}" aria-labelledby="${c.id}-q">
      <h2 id="${c.id}-q"><span class="no">${i + 1}</span>${F.tail(c.q)}</h2>
      <figure>${c.yAxis ? `<p class="axis-title y">${c.yAxis}</p>` : ""}<div class="fig" data-ch="${i}"></div>${c.xAxis ? `<p class="axis-title x">${c.xAxis}</p>` : ""}
        <figcaption><span class="n">${TEXT.n(c.n)}</span>${c.legend ? c.legend.map(([k, v]) => `<span class="key key-${k}">${v}</span>`).join("") : ""}
          <span class="note">${F.tail(c.note)}</span></figcaption></figure>
      <p class="takeaway">${c.text}</p></section>`).join("") +
    // 總結（第 4 章之後、下載檔之前）
    `<section class="chapter summary" id="summary" aria-labelledby="summary-q"><h2 id="summary-q">${TEXT.sum.title}</h2>
      <p class="takeaway">${lines(TEXT.sum.points(I.takeaways))}</p><p class="takeaway end">${TEXT.sum.end}</p></section>`;
  const figs = [...document.querySelectorAll(".fig")];
  const draw = () => figs.forEach((f) => { const w = Math.round(f.clientWidth); if (w && Number(f.dataset.w) !== w) { f.dataset.w = w; f.innerHTML = chapters[f.dataset.ch].draw(w); } });
  draw();
  new ResizeObserver(draw).observe(document.getElementById("chapters"));
  if (location.hash && location.hash !== "#columns") document.querySelector(location.hash)?.scrollIntoView();
})().catch((err) => {
  document.getElementById("chapters").textContent = T.loadFail;
  console.error(err);
});
