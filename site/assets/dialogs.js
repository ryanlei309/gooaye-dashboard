// 說明視窗：方法與限制（#method）、資料來源（#sources）、製作過程（#build）。網址可直接分享；鍵盤開關、焦點進出
// 中英文各一份；數字都從資料檔來，製作過程的數字照專案紀錄（DEV.md、M4／新考卷報告）
"use strict";
const Dialogs = (() => {
  const all = [];
  const en = LANG === "en";
  const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;

  function pathTable(ps, p) {
    if (!ps || !ps.stock || !ps.spy) return "";
    const s = ps.stock, t = ps.spy, d = (n) => (en ? `${n} days` : `${n} 天`);
    const rows = [
      [en ? `Hit +${p}% first` : `先碰到 +${p}%`, F.share(s.up_first), F.share(t.up_first)],
      [en ? `Hit −${p}% first` : `先碰到 −${p}%`, F.share(s.down_first), F.share(t.down_first)],
      [en ? "Hit neither" : "都沒碰到", F.share(s.neither), F.share(t.neither)],
      [en ? `Never hit +${p}%` : `沒碰到 +${p}%`, F.share(s.no_up), F.share(t.no_up)],
      [en ? `Days to +${p}% (median)` : `碰到 +${p}% 的天數（中位數）`, d(s.days_to_up_median), d(t.days_to_up_median)],
    ];
    if (p === 20) rows.push([en ? "Largest gain (median)" : "最大漲幅（中位數）", F.pct(s.max_gain_median), F.pct(t.max_gain_median)],
                            [en ? "Largest loss (median)" : "最大跌幅（中位數）", F.pct(s.max_loss_median), F.pct(t.max_loss_median)]);
    const head = en ? [`±${p}%, first 12 months`, `Stocks (${ps.n})`, "S&amp;P 500, same period"]
                    : [`±${p}%，12 個月內`, `個股（${ps.n} 檔）`, "S&amp;P 500 同期"];
    return `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>` +
      rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("") + "</tbody></table>";
  }

  // S&P 500（SPY）從 2022 年第一個交易日收盤到股價更新日收盤（含息）
  function riseSpy(bench) {
    const i = bench.dates.findIndex((d) => d >= "2022-01-01"), n = bench.spy.length - 1;
    return bench.spy[n] / bench.spy[i] - 1;
  }

  // 主結論和早期提及並列
  function sideBySide(m, e) {
    const h = en ? ["", "Stocks", "Full 12 months", "Beat S&amp;P 500", "Median vs S&amp;P 500"]
                 : ["", "檔數", "滿 12 個月", "贏過 S&amp;P 500", "超額報酬中位數"];
    const row = (name, x, n) => `<tr><td>${name}</td><td>${n}</td><td>${x.done}</td><td>${F.share(x.spy && x.spy.win)}</td>` +
      `<td>${F.pct(x.spy && x.spy.median)}</td></tr>`;
    return `<table><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>` +
      row(en ? "Main result (2022 on)" : "主結論（2022 起）", m, m.n_stocks) +
      row(en ? "Early mentions (2020–2021, reference)" : "早期提及（2020–2021，參考）", e, e.computed) + "</tbody></table>";
  }

  // 這個勝率算高嗎？（統計檢驗只當參考；方法在算之前寫進 SPEC）
  function verdict(t) {
    if (!t) return "";
    const ci = (a) => `${F.pct(a[0])} ${en ? "to" : "到"} ${F.pct(a[1])}`;
    const share = (a) => `${Math.round(a[0] * 100)}% ${en ? "to" : "到"} ${Math.round(a[1] * 100)}%`;
    const p = t.p_value < 0.001 ? "< 0.001" : t.p_value.toFixed(2), sig = t.p_value < 0.05;
    if (en) return `
      <h3>Is this win rate high?</h3>
      <ul>
        <li><strong>Compared with 50%:</strong> ${t.wins} of ${t.n} stocks beat the S&amp;P 500 (${F.share(t.wins / t.n)}). The 95% confidence interval is ${share(t.win_ci)}. An exact binomial test against 50% gives p = ${p}, so ${sig ? "the win rate is statistically different from 50%" : "this is not statistically different from a coin flip (50%)"}.</li>
        <li><strong>50% is not a fair bar.</strong> Most individual stocks trail the index over time, because a few big winners drive most of the index's gain. A better comparison would be "stocks picked at random on the same days"; that comparison was not done here.</li>
        <li><strong>The stocks are not independent.</strong> Their holding periods overlap and many move together (for example, AI stocks after 2023), so the real uncertainty is larger than these intervals show.</li>
        <li><strong>Mean vs median.</strong> The average excess return is ${F.pct(t.mean)} (95% bootstrap interval ${ci(t.mean_ci)}), but the median is ${F.pct(t.median)} (${ci(t.median_ci)}). The gap comes from a few huge winners; the stock in the middle (the median) trailed the index.</li>
      </ul>
      <p>Method: exact two-sided binomial test, Clopper–Pearson interval, and bootstrap intervals from ${t.boot_n.toLocaleString("en-US")} resamples (fixed seed ${t.boot_seed}), all defined before computing. Reference only; they do not change the main result.</p>`;
    return `
      <h3>這個勝率算高嗎？</h3>
      <ul>
        <li><strong>和 50% 比：</strong>${t.n} 檔裡 ${t.wins} 檔贏過 S&amp;P 500（${F.share(t.wins / t.n)}），95% 信賴區間 ${share(t.win_ci)}。和 50% 做二項檢定，p ＝ ${p}，${sig ? "勝率和 50% 在統計上有差別" : "和擲銅板（50%）在統計上沒有差別"}。</li>
        <li><strong>50% 不是公平的標準。</strong>大部分個股長期本來就會跑輸大盤，因為大盤的漲幅主要來自少數大贏家。更好的比較是「和同一天隨機挑股票比」，這次沒有做。</li>
        <li><strong>各檔不是獨立事件。</strong>持有期間互相重疊，很多股票會一起漲跌（例如 2023 年後的 AI 股），所以實際的不確定性比這些區間顯示的更大。</li>
        <li><strong>平均數和中位數差很多。</strong>超額報酬的平均數是 ${F.pct(t.mean)}（bootstrap 95% 區間 ${ci(t.mean_ci)}），中位數是 ${F.pct(t.median)}（${ci(t.median_ci)}）。差這麼多是因為少數大贏家把平均拉高；排在中間的那一檔是輸給大盤的。</li>
      </ul>
      <p>方法：雙尾精確二項檢定、Clopper–Pearson 信賴區間、bootstrap 重複抽樣 ${t.boot_n.toLocaleString("en-US")} 次（固定亂數種子 ${t.boot_seed}），都在算之前定下。只當參考，不改主結論。</p>`;
  }

  // 補分類排除的（2026-11-15）：基金不算個股；首次提及時還是 SPAC 空殼的視同還沒上市
  function reclassified(list) {
    if (!list || !list.length) return "";
    const fund = list.filter((x) => x.why === "fund").map((x) => x.ticker), spac = list.filter((x) => x.why === "spac");
    const parts = [];
    if (en) {
      if (fund.length) parts.push(`${fund.join(", ")} (a closed-end fund; funds and ETFs are not counted as individual stocks)`);
      if (spac.length) parts.push(`${spac.map((x) => `${x.ticker} (still a SPAC shell when first mentioned; the merger closed on ${F.date(x.merged)})`).join(", ")}, treated as not yet listed`);
      return `<li>Reclassified and excluded: ${parts.join("; ")}.</li>`;
    }
    if (fund.length) parts.push(`${fund.join("、")}（封閉式基金，照「ETF、基金不算個股」處理）`);
    if (spac.length) parts.push(`${spac.map((x) => `${x.ticker}（首次提及時還是 SPAC 空殼公司，${x.merged} 才完成合併）`).join("、")}，視同還沒上市`);
    return `<li>補分類排除：${parts.join("；")}。</li>`;
  }

  // 最壞情況（2026-11-16 第十版從首頁移到這裡）：數字每天自動更新；和主結論差超過 5 個百分點就不說「結論不變」
  function worstSentence(m, w) {
    const a = F.share(m.spy.win), b = F.share(w.spy.win), big = m.spy.win - w.spy.win > 0.05;
    const miss = w.missing ?? 0, del = w.delisted ?? 0;
    if (en) return `${miss} stock${miss === 1 ? "" : "s"} had no usable price data and ${miss === 1 ? "is" : "are"} not in the main result` +
      (del ? `; ${del} more ${del === 1 ? "was" : "were"} later delisted` : "") + `. Even if all of them are counted as a total loss (−100%), ` +
      (big ? `the win rate falls from ${a} to ${b}, more than 5 percentage points, so read the main result with care.`
           : `the win rate only falls from ${a} to ${b}; the conclusion does not change.`);
    return `有 ${miss} 檔抓不到股價、沒有算進主結論` + (del ? `，另外 ${del} 檔後來下市` : "") + `。就算把它們全部當成賠光（−100%），` +
      (big ? `勝率會從 ${a} 降到 ${b}，差距超過 5 個百分點，主結論要小心看待。` : `勝率也只從 ${a} 降到 ${b}，結論不變。`);
  }

  // 本益比怎麼看（只供參考；第十一版：三個說明和表格、明細表的 ⓘ 同一份文字）
  function peSection() {
    const items = ["mention", "now", "fwd"].map((k) => `<li class="pe-info">${Info.peInfoHtml(k)}</li>`).join("");
    if (en) return `
      <h3>How to read the P/E ratios (reference only)</h3>
      <ul>
        ${items}
        <li>"Loss": earnings over the past four quarters were zero or negative, so there is no meaningful P/E.</li>
        <li>"—": fewer than four quarters of reports (newly listed), or no data. Most foreign companies (for example TSMC, ASML, Alibaba) file annual reports on forms 20-F or 40-F instead of US quarterly reports, often under IFRS and in their home currency, so the SEC data has no quarterly US-dollar earnings per share for them.</li>
        <li>Earnings per share come from companies' official SEC filings (EDGAR); share splits are adjusted for. "P/E now" is recalculated every day from the latest close; earnings are updated whenever the site's data is refreshed. P/E is not part of the main result.</li>
      </ul>`;
    return `
      <h3>本益比怎麼看（只供參考）</h3>
      <ul>
        ${items}
        <li>「虧損」：過去四季的盈餘加起來是零或負的，算不出有意義的本益比。</li>
        <li>「—」：財報不到四季（剛上市），或沒有資料。外國公司（例如台積電、ASML、阿里巴巴）大多用 20-F 或 40-F 申報年報、不報美國的季報，而且常用國際會計準則和本國貨幣，SEC 資料裡沒有美元的季度每股盈餘，所以是「—」。</li>
        <li>每股盈餘來自公司向 SEC 申報的正式財報（EDGAR），有處理股票分割。「現在本益比」每天用最新收盤價重算；每股盈餘在網站資料更新時一起更新。本益比不算進主結論。</li>
      </ul>`;
  }

  function method(summary, events, bench) {
    const m = summary.main, w = summary.worst, e = summary.early, t50 = m["0050"];  // 0050 是固定日期的計算（公開 repo 沒有台股資料）
    const excluded = events.filter((x) => x.kind === "個股" && x.excluded);
    const unbuyable = excluded.filter((x) => x.unbuyable).map((x) => x.ticker);
    const main = summary.bubbles.filter((b) => !b.early), wins = main.filter((b) => b.to_date.USD.vs_spy > 0).length;
    const exList = excluded.map((x) => `${F.esc(x.ticker)}（${F.esc(x.excluded)}）`).join("；");
    if (en) return `
      <h3>Accuracy</h3>
      <p>An AI model read the transcripts and picked out the companies he talked about. On a locked test set (holdout: 20 episodes nobody looked at while the system was being tuned), <strong>81.7% of the mentions it accepted were correct</strong> (49 of 60, margin of error about ±10 percentage points). That missed the 85% bar set in advance; it is published anyway. All 11 wrong ones had no ticker; all 48 with a ticker were right, and returns are only computed for mentions with a ticker. Recall (92.3%) and segment boundaries (100%) were measured on data used for tuning, so they may be optimistic.</p>
      <p><strong>81.7% is the accuracy of the AI tool itself</strong> (finding which companies were mentioned in the transcripts). The list of stocks on this site was then checked by a person: every ticker was confirmed by hand (an approved dictionary, an approval sheet, or a row-by-row review sheet), and first mentions found to be wrong during that review were removed (for example, Disney's "Marvel" taken as Marvell, or "rethink" in Chinese taken as Synopsys).</p>

      <h3>What counts as "mentioned"</h3>
      <p>The title says "mentioned", not "recommended". A mention is any time he talks about the company: naming it while discussing an industry, using it as an example or a comparison, or responding when a listener brings it up. It does not mean he recommended the stock, or even that he was talking about investing in it. This definition was set on Nov 9, 2026, before any returns were computed.</p>

      <h3>The main result</h3>
      <ul>
        <li>Every individual stock first mentioned from 2022 on (${m.n_stocks} stocks). Buy at the open of the first trading day after the episode is released, hold 12 months (252 trading days), and compare with buying the S&amp;P 500 (SPY) on the same day. ${m.done} stocks have a full 12 months.</li>
        <li>${F.share(m.spy.win)} beat the S&amp;P 500. The median excess return is ${F.pct(m.spy.median)}.</li>
        <li><strong>Excess return</strong> = the stock's return minus the index's return over the same period, in %. That is why it can be below −100% (for example, the stock at −80% while the index is at +110% gives −190%). The bubble numbers use the same definition.</li>
        <li>All figures are in US dollars, using adjusted prices (splits and dividends included).</li>
        <li>ETFs and funds are not in the main result (${summary.etfs.length}): ${summary.etfs.join(", ")}.</li>
        ${reclassified(summary.reclassified)}
      </ul>

      ${verdict(m.tests)}

      <h3>Early mentions (2020–2021)</h3>
      <p>The podcast started in February 2020, but the host was investing long before that. The closer a mention is to episode 1, the more likely the "first mention" is not really the first time he noticed the stock (left censoring). So stocks first mentioned in 2020–2021 are shown and labeled "Early", but they are not part of the main result. For reference, the same calculation for that group:</p>
      ${sideBySide(m, e)}
      <p>Only early stocks whose ticker was confirmed by a person are shown.</p>

      <h3>Why the S&amp;P 500, not Taiwan's 0050</h3>
      <p>The original benchmark was Taiwan's 0050 ETF, compared in Taiwan dollars. On Nov 15, 2026, after seeing the results, the site switched to the S&amp;P 500: the site only covers US stocks, and comparing US stocks with the S&amp;P 500 is more direct and easier to explain. The two results are close, so the switch was not made to pick the better-looking number. Against 0050${t50.as_of ? ` (as of ${F.date(t50.as_of)})` : ""}: ${F.share(t50.win)} of ${t50.done || m.done} stocks won, median excess ${F.pct(t50.median)}. Taiwan stocks and 0050 will be added later.</p>

      <h3>Why "to date" differs from the main result</h3>
      <p>Bubbles and the table show holding from the first mention until today: of the stocks mentioned from 2022 on, ${wins} beat the S&amp;P 500 and ${main.length - wins} trailed it. The main result looks only at the first 12 months. The S&amp;P 500 rose about ${F.pct(riseSpy(bench), 0)} (with dividends) from the start of 2022 to ${F.date(summary.price_date)}; the earlier a stock was mentioned, the longer the index run it is compared against.</p>

      <h3>The chart's "Since mention" range</h3>
      <p>After you pick a stock, the chart switches to "Since mention": every line, including the indexes, starts at 0% on the entry day of the earliest-mentioned stock you picked (the vertical dashed line), and the chart starts a little earlier so you can see the run-up. For that stock, the last number on its line equals "Return" to date in the detail table. If you pick several stocks, a stock mentioned later is measured from that earlier day too, so its line does not show its own return; <strong>the detail table always shows each stock's own return</strong>.</p>

      <h3>What may make this look better than reality</h3>
      <ul>
        <li>Excluded stocks (${excluded.length}): ${excluded.map((x) => F.esc(x.ticker)).join(", ")} (no daily prices from two free sources, or not buyable when mentioned).</li>
        <li>${worstSentence(m, w)}</li>
        <li>The AI may miss companies, so some first mentions may be later than they really were.</li>
        <li>Many stocks mentioned since 2023 are AI-related and move together; more stocks does not mean more diversification.</li>
        <li>Only the mention date is known, not when he sold, so a fixed 12 months is used instead.</li>
      </ul>

      ${peSection()}

      <h3>Reference: ±20% and ±10% paths</h3>
      <p>Daily closes over the first 12 months, relative to the entry price. <strong>Touching +20% is not the same as earning 20%</strong>: you would have had to sell at that moment. The S&amp;P 500 uses the same entry and exit days. These measures were defined before looking at the numbers and do not change the main result.</p>
      ${pathTable(summary.path_summary["20"].USD, 20)}
      ${pathTable(summary.path_summary["10"].USD, 10)}`;
    return `
      <h3>準確率</h3>
      <blockquote><p>收下的提及準確率 81.7%（新考卷 60 筆，誤差約 ±10 個百分點），沒達到事先定的 85%。<br>
      事後描述（不改判定）：收錯的 11 筆 AI 都沒給代號；有代號的 48 筆全對。報酬只對有代號的提及計算。<br>
      召回率 92.3%、段落邊界 100% 來自調整用的資料，可能偏樂觀；真實的召回率沒有量。<br>
      品質合格的 690 集裡，段落分類失敗 3 集（EP107、657、668，這 3 集的公司全部沒抓到）、第一段只用字典候選 22 集。</p></blockquote>
      <p>準確率由人工標註量：另外抽 20 集當新考卷，人工核對 AI 收下的 60 筆提及。<strong>81.7% 是 AI 工具本身（從逐字稿找出提到哪些公司）的準確率</strong>；網站上的名單另外經過人工確認：每一檔的代號都經人工確認（核准的字典、核准表，或逐列看過的代號確認表），確認時發現的錯誤首次提及已經排除（例如把迪士尼的「漫威」當成 Marvell、把「重新思考」當成新思科技）。</p>

      <h3>「提到」是什麼意思</h3>
      <p>網站標題寫的是「提到」，不是「推薦」。只要他談到這家公司就算：談產業時點名它、拿它舉例或類比、聽眾提到而他有接著回應。不代表他推薦這檔股票，也不一定是在談投資這家公司。這個定義在 2026-11-09 定下，當時還沒有算任何報酬。</p>

      <h3>主結論怎麼算</h3>
      <ul>
        <li>2022 年起 ${m.n_stocks} 檔個股的首次提及：節目發佈後第一個開盤的交易日用開盤價買，持有 12 個月（252 個交易日），和同一天買 S&amp;P 500（SPY）比；滿 12 個月的有 ${m.done} 檔。</li>
        <li>贏過 S&amp;P 500 的比例 ${F.share(m.spy.win)}；超額報酬中位數 ${F.pct(m.spy.median)}。</li>
        <li><strong>超額報酬</strong>＝個股報酬減大盤同期報酬，用 % 表示，所以可能小於 −100%（例如個股 −80%、大盤 +110%，就是 −190%）。泡泡上的數字是同一個定義。</li>
        <li>全部用美元計算；股價是調整後股價（含分割、配息調整），所以和券商看到的當年股價不一樣。</li>
        <li>ETF 與基金不在主結論（${summary.etfs.length} 檔）：${summary.etfs.join("、")}。</li>
        ${reclassified(summary.reclassified)}
      </ul>

      ${verdict(m.tests)}

      <h3>早期提及（2020–2021）為什麼不算進主結論</h3>
      <p>節目 2020 年 2 月才開始，但他在那之前就在投資。越接近 EP1，「首次提及」越可能不是他真的第一次注意這檔股票（左側截斷），所以 2020–2021 年首次提及的股票放在網站上、標「早期」，但不算進主結論。這一組用同樣的算法另外算一次，只當參考：</p>
      ${sideBySide(m, e)}
      <p>早期提及只放代號經過人工確認的股票。</p>

      <h3>為什麼和 S&amp;P 500 比，不和 0050 比</h3>
      <p>原本的主要比較對象是 0050（換成台幣比）。2026-11-15 看過結果之後，網站改成和 S&amp;P 500 比：網站目前只有美股，美股和 S&amp;P 500 比較直接、好解釋；兩者結果相近，不是為了挑好看的數字。和 0050 比（台幣）的結果${t50.as_of ? `（${t50.as_of} 的計算）` : ""}：${t50.done || m.done} 檔裡贏過 0050 的比例 ${F.share(t50.win)}，超額報酬中位數 ${F.pct(t50.median)}。台股做完之後，再加上台股和 0050 的比較。</p>

      <h3>泡泡的「至今」和主結論為什麼不一樣</h3>
      <p>泡泡和表格是「第一次提到之後一直持有到現在」：2022 年起的股票，贏過 S&amp;P 500 的 ${wins} 檔、輸的 ${main.length - wins} 檔。主結論只看提到後的 12 個月。S&amp;P 500 從 2022 年初到 ${summary.price_date} 漲了約 ${F.pct(riseSpy(bench), 0)}（含息）；越早提到的股票，「至今」要和越長一段大盤漲幅比。</p>

      <h3>走勢圖的「首次提及」</h3>
      <p>選了股票之後，走勢圖會切到「首次提及」：所有線（包括大盤）都以你選的股票裡最早被提到那一檔的進場日（垂直虛線）為 0%，起點再往前多顯示一小段，看得到提及前的走勢。最早那一檔線上最後的數字，等於明細表的「至今報酬」。選了多檔時，較晚提到的股票也從這一天算起，線上的數字不是它自己的報酬；<strong>明細表的數字才是那一檔自己的報酬</strong>。</p>

      <h3>哪裡可能偏樂觀</h3>
      <ul>
        <li>排除的 ${excluded.length} 檔個股：${exList}。</li>
        <li>${worstSentence(m, w)}</li>
        <li>AI 可能漏抓公司（召回率沒在新考卷上量），首次提及可能比實際晚。</li>
        <li>2023 年後提到的多是 AI 相關股，彼此高度連動，檔數多不代表分散。</li>
        <li>只看「提到」，不知道他何時賣出，所以用固定的 12 個月代替。</li>
      </ul>

      ${peSection()}

      <h3>參考：±20%、±10% 路徑指標</h3>
      <p>從進場日起 12 個月內，每天收盤相對進場價的變化。<strong>曾經漲到 +20% 不等於能賺到 20%</strong>：要剛好在那時候賣掉才拿得到。S&amp;P 500 用同一個進場日和出場日。這些指標在看到數字之前定下，只是參考，不改主結論。</p>
      ${pathTable(summary.path_summary["20"].USD, 20)}
      ${pathTable(summary.path_summary["10"].USD, 10)}`;
  }

  function sources() {
    if (en) return `
      <h3>Data sources</h3>
      <ul>
        <li>Transcripts: ${link("https://whatmkreallysaid.com", "whatmkreallysaid.com")} (third-party transcripts of the show, in Chinese). Quotes follow the transcript; the audio is the final word.</li>
        <li>Episode list and links: the show's SoundOn RSS feed.</li>
        <li>US stock and S&amp;P 500 (SPY) prices: ${link("https://finance.yahoo.com", "Yahoo Finance")}, adjusted for splits and dividends. WOLF's history on Yahoo Finance is incomplete, so it uses ${link("https://www.nasdaq.com", "Nasdaq")} instead (split-adjusted, not dividend-adjusted; it paid no dividends in the period). Unusually large one-day moves are checked against Nasdaq before being accepted.</li>
        <li>Semiconductors: the PHLX Semiconductor Index itself (^SOX), from Yahoo Finance.</li>
        <li>Listings used to check tickers and company names: ${link("https://www.nasdaqtrader.com", "Nasdaq Trader")} (US) and ${link("https://finmindtrade.com", "FinMind")} (Taiwan).</li>
        <li>The 0050 comparison under "Method": 0050 prices from FinMind, adjusted for dividends and splits by this project and checked against Yahoo Finance; USD/TWD from Yahoo Finance.</li>
        <li>Share prices and forward P/E ratios come from Yahoo Finance (via yfinance, for personal, non-commercial use); earnings per share come from public SEC EDGAR filings.</li>
        <li>All amounts are in US dollars. Quote translations are AI translations of the Chinese, labeled as such.</li>
      </ul>

      <h3>Why the SOX index, not SOXX or SOXQ</h3>
      <p>The semiconductor line is the PHLX Semiconductor Index (^SOX) itself. It is a price index without dividends, while stock returns include dividends, so the comparison slightly favors the stocks (roughly 1% a year). SOXX was not used because in 2021 it switched to tracking a different index (ICE); SOXQ was not used because it only listed in 2021.</p>

      <h3>Tools</h3>
      <ul>
        <li>Python: fetching data, computing returns, exporting the site data.</li>
        <li>Claude API (Claude Haiku): reading transcripts to find companies and tickers.</li>
        <li>Claude Code: help writing code and tests.</li>
        <li>${link("https://github.com/leeoniya/uPlot", "uPlot")} for the chart (bundled with the site, not loaded from elsewhere).</li>
        <li>GitHub Pages hosts the site; GitHub Actions updates prices on a schedule.</li>
      </ul>`;
    return `
      <h3>資料來源</h3>
      <ul>
        <li>逐字稿：${link("https://whatmkreallysaid.com", "whatmkreallysaid.com")}（第三方網站整理的節目逐字稿），引述以原音為準。</li>
        <li>集數與單集連結：SoundOn 的節目 RSS。</li>
        <li>美股、S&amp;P 500（SPY）的股價：${link("https://finance.yahoo.com", "Yahoo Finance")}，調整後股價（含分割、配息）。WOLF 在 Yahoo Finance 的歷史不完整，改用 ${link("https://www.nasdaq.com", "Nasdaq")}（有調整分割與換股比例，沒有調整配息；觀察期內沒有配息）。單日漲跌特別大的，先用 Nasdaq 核對過才採用。</li>
        <li>費半：費城半導體指數本身（^SOX），來自 Yahoo Finance。</li>
        <li>上市清單（核對代號和公司名稱）：${link("https://www.nasdaqtrader.com", "Nasdaq Trader")}（美股）、${link("https://finmindtrade.com", "FinMind")}（台股）。</li>
        <li>說明裡和 0050 比的結果：0050 的股價用 FinMind 的原始價格，再依除權息與分割自己換算成含息價格，並和 Yahoo Finance 對照過；美元兌台幣匯率用 Yahoo Finance。</li>
        <li>股價和預估本益比來自 Yahoo Finance（透過 yfinance，僅供個人非商業用途）；每股盈餘來自 SEC EDGAR 公開財報。</li>
        <li>全部金額用美元。</li>
      </ul>

      <h3>為什麼用費半指數，不用 SOXX 或 SOXQ</h3>
      <p>費半的線用費城半導體指數本身（^SOX）。費半是價格指數，不含股息；個股報酬含股息，所以比較時對個股稍微有利（約每年 1%）。不用 SOXX，因為它 2021 年起改追蹤別的指數（ICE 半導體指數）；不用 SOXQ，因為它 2021 年才上市。</p>

      <h3>用了哪些工具</h3>
      <ul>
        <li>Python：抓資料、算報酬、匯出網站資料。</li>
        <li>Claude API（Claude Haiku）：讀逐字稿，找出提到的公司和代號。</li>
        <li>Claude Code：協助寫程式與測試。</li>
        <li>${link("https://github.com/leeoniya/uPlot", "uPlot")}：畫走勢圖（檔案放在這個網站裡，不從其他網站載入）。</li>
        <li>GitHub Pages 放網站，GitHub Actions 定期更新股價。</li>
      </ul>`;
  }

  // 製作過程：數字照專案紀錄，不誇大
  function build(summary) {
    const m = summary.main;
    if (en) return `
      <ol class="steps">
        <li><strong>Transcripts.</strong> About 705 episodes (EP1 to EP${summary.last_ep}) from a third-party transcript site. 690 passed a quality check; 15 (about 2%) were excluded because the transcript was damaged or misplaced.</li>
        <li><strong>AI segmentation and recognition.</strong> Python splits each transcript into numbered blocks of about 80–120 characters. An AI model (Claude Haiku, batch mode) first labels the segments (main topic, listener Q&amp;A, small talk), then finds the companies mentioned, answering only with block numbers and never rewriting the text. Tickers come from a hand-approved dictionary, an automatic match against the official listing, or manual approval. Running every episode once cost US$4.47.</li>
        <li><strong>Human labeling.</strong> I labeled sample episodes by hand (about 3 hours for the main test pool) and compared them with the AI's answers.</li>
        <li><strong>Rules and pass marks set in advance.</strong> Before looking at any returns, I wrote down how the main result would be computed (first mentions from 2022, 12 months, win rate and median) and the bar the AI had to clear (at least 85% of accepted mentions correct).</li>
        <li><strong>The exam (holdout), published even though it failed.</strong> The first test failed (recall 82.6%, below 90%), so I allowed exactly one round of fixes, then froze the system and ran it on 20 locked episodes nobody had read. The result was 49/60 = 81.7%, below the 85% bar. I stopped tuning and put that number at the top of the site instead of moving the goalposts.</li>
        <li><strong>Returns.</strong> Buy at the first open after each episode, hold 252 trading days, and compare with the S&amp;P 500 over the same days. ${m.n_stocks} stocks were first mentioned from 2022 on; ${m.done} have a full 12 months. Stocks that could not be priced are listed, and a worst case counts them as −100%.</li>
      </ol>`;
    return `
      <ol class="steps">
        <li><strong>逐字稿。</strong>約 705 集（EP1 到 EP${summary.last_ep}），來自第三方逐字稿網站。品質合格 690 集；15 集（約 2%）因為逐字稿殘缺或錯置而排除。</li>
        <li><strong>AI 分段與辨識。</strong>Python 先把逐字稿切成約 80–120 字的編號區塊。AI（Claude Haiku，批次處理）先分段落（正題、聽眾 Q&amp;A、閒聊），再找出提到的公司，只回傳區塊編號、不改寫原文。代號來自人工核准的字典、程式用上市清單自動核對，或人工核准。全部集數跑一次花了 US$4.47。</li>
        <li><strong>人工標註。</strong>我自己標註抽樣的集數（主要的考卷約 3 小時），和 AI 的答案比對。</li>
        <li><strong>事先定好規則和門檻。</strong>在看任何報酬之前，先寫下主結論怎麼算（2022 年起的首次提及、持有 12 個月、勝率和中位數），以及 AI 要過的門檻（收下的提及至少 85% 正確）。</li>
        <li><strong>考試（holdout），沒達標也照實公布。</strong>第一次考試沒過（召回率 82.6%，不到 90%），只允許修改一次，之後凍結系統，用 20 集沒有人看過的新考卷重考：49/60＝81.7%，沒達到 85%。不再修改，把這個數字放在網站最上面，不事後改門檻。</li>
        <li><strong>算報酬。</strong>節目發佈後第一個開盤日買進，持有 252 個交易日，和同一段期間的 S&amp;P 500 比。2022 年起首次提及的個股 ${m.n_stocks} 檔，滿 12 個月的 ${m.done} 檔。算不了的股票列出來，另外用「最壞情況」把它們算成 −100%。</li>
      </ol>`;
  }

  function setup(id, openerId, fill) {
    const dlg = document.getElementById(id), opener = document.getElementById(openerId), hash = "#" + id;
    const body = document.getElementById(id + "-body");
    const d = { dlg, hash, fill: (...a) => (body.innerHTML = fill(...a)),
                open(push) {
                  if (!dlg.open) dlg.showModal();
                  if (push && location.hash !== hash) history.pushState(null, "", hash);
                } };
    opener.addEventListener("click", () => d.open(true));
    dlg.querySelector("[data-close]").addEventListener("click", () => dlg.close());
    dlg.addEventListener("close", () => {
      if (location.hash === hash) history.replaceState(null, "", location.pathname + location.search);
      opener.focus();
    });
    all.push(d);
    return d;
  }

  function init(summary, events, bench) {
    setup("method", "method-open", method).fill(summary, events, bench);
    setup("sources", "sources-open", sources).fill();
    setup("build", "build-open", build).fill(summary);
    const sync = () => all.forEach((d) => (location.hash === d.hash ? d.open(false) : d.dlg.open && d.dlg.close()));
    window.addEventListener("hashchange", sync);
    sync();
  }

  return { init };
})();
