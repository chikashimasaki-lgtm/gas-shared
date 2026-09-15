// ====================================================================
//  共通モジュール: 東証株価取得（Yahoo Finance チャートAPI）
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトへは symlink して clasp push する。
//  実体   : ~/projects/gas-shared/modules/YahooPriceFetch.js
//  利用元 : Asset_Status, JQuants_AccountingRisk
// ====================================================================

/**
 * 東証銘柄の現在株価を Yahoo Finance のチャートAPI（コード+.T）から一括取得する。
 * UrlFetchApp.fetchAll で並列取得し、全体で最大3分の時間保険つき。
 * みんかぶ/stooq は GAS(Google) の IP から遮断され、GOOGLEFINANCE は東証データ提供を
 * 終了しているため、GAS から東証株価を取れるのは実質この方式のみ。
 *
 * @param {Array<string|number>} tickers 銘柄コード配列（4桁想定。空・重複は無視）
 * @param {Object} [opts]
 * @param {number} [opts.chunkSize=40]     1回の fetchAll でまとめるリクエスト数
 * @param {number} [opts.maxMillis=180000] 全体の実行時間上限（時間保険）
 * @param {number} [opts.sleepMillis=200]  チャンク間の待機（ミリ秒）
 * @param {number} [opts.maxRetry=2]      429/5xx時の再試行回数（失敗分のみ指数バックオフ）
 * @param {number} [opts.backoffMillis=500] 再試行の初回待機（ミリ秒。指数的に倍増）
 * @return {Object<string, number>} 取得できたコードのみ { code: price } のマップ
 */
function fetchYahooPricesJP_(tickers, opts) {
  opts = opts || {};
  const chunkSize     = opts.chunkSize     || 40;
  const maxMillis     = opts.maxMillis     || 3 * 60 * 1000;
  const sleepMillis   = opts.sleepMillis   != null ? opts.sleepMillis   : 200;
  const maxRetry      = opts.maxRetry      != null ? opts.maxRetry      : 2;
  const backoffMillis = opts.backoffMillis || 500;

  const out   = {};
  const uniq  = Array.from(new Set((tickers || []).filter(Boolean).map(String)));
  const start = Date.now();
  for (let i = 0; i < uniq.length; i += chunkSize) {
    if (Date.now() - start > maxMillis) break;   // 時間保険（全体で最大3分）
    const slice = uniq.slice(i, i + chunkSize);
    const reqs  = slice.map(c => ({
      url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(c) + '.T',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      muteHttpExceptions: true,
    }));
    let resps;
    try { resps = UrlFetchApp.fetchAll(reqs); } catch (e) { continue; }

    // 429(レート制限)/5xx(一時障害)だけ、失敗分に絞って指数バックオフで再試行する。
    // 以前は非200を黙ってスキップしていたため、一時的なレート制限でも該当銘柄が丸ごと欠落していた。
    for (let attempt = 1; attempt <= maxRetry && Date.now() - start <= maxMillis; attempt++) {
      const retryIdx = [];
      resps.forEach((r, j) => {
        const code = r ? r.getResponseCode() : 0;
        if (code === 429 || code >= 500) retryIdx.push(j);
      });
      if (!retryIdx.length) break;
      Utilities.sleep(backoffMillis * Math.pow(2, attempt - 1));
      let again;
      try { again = UrlFetchApp.fetchAll(retryIdx.map(j => reqs[j])); }
      catch (e) { break; }
      retryIdx.forEach((j, k) => { resps[j] = again[k]; });
    }

    resps.forEach((res, j) => {
      try {
        if (res.getResponseCode() !== 200) return;
        const p = JSON.parse(res.getContentText()).chart.result[0].meta.regularMarketPrice;
        if (p && p > 0) out[slice[j]] = p;
      } catch (_) { /* この銘柄はスキップ */ }
    });
    Utilities.sleep(sleepMillis);
  }
  return out;
}
