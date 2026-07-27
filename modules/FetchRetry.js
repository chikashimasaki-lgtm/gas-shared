// ====================================================================
//  共通モジュール: 1URL取得の再試行（指数バックオフ）
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの clasp rootDir にシンボリックリンク(FetchRetry.js)して push する。
//  リンク元: ~/projects/FetchRetry.js
//  利用元  : Sakata_Screener, JQuants_AccountingRisk
//
//  数百銘柄をページングで回す処理では、429（レート制限）や5xx（一時障害）は必ず起きる。
//  1回の失敗で throw すると、それまでに取得したページごと捨てて処理全体が落ちる。
//
//  ※ Sakata_Screener の fetchAllWithRetry_（UrlFetchApp.fetchAll で多数のURLを
//    まとめて叩き、失敗した分だけ再投入する）は用途が別なのでそちらに残している。
// ====================================================================

/**
 * 1URLを取得し、429・5xx・通信例外だけ指数バックオフで再試行する。
 * 400/401/404 のような恒久的なエラーは再試行しても同じなので、そのまま返して
 * 呼び元にステータスを判断させる。
 *
 * @param {string} url
 * @param {Object} options UrlFetchApp.fetch のオプション（muteHttpExceptions:true 推奨）
 * @param {{retry?:number, backoffMs?:number, label?:string}} [cfg]
 *        retry     … 再試行の回数（初回を含めない。既定2）
 *        backoffMs … 初回の待ち時間ms。以降は倍々（既定1500）
 *        label     … ログに出す呼び出し元の名前
 * @return {HTTPResponse} 最後に得た応答
 * @throws 最後まで通信自体に失敗した場合はその例外
 */
function fetchWithRetry_(url, options, cfg) {
  const c        = cfg || {};
  const retry    = (c.retry == null) ? 2 : c.retry;
  const backoff  = (c.backoffMs == null) ? 1500 : c.backoffMs;
  const label    = c.label ? c.label + ' ' : '';
  let res = null, lastErr = null;

  for (let attempt = 0; attempt <= retry; attempt++) {
    if (attempt > 0) Utilities.sleep(backoff * Math.pow(2, attempt - 1));
    try {
      res = UrlFetchApp.fetch(url, options);
      lastErr = null;
      const code = res.getResponseCode();
      if (!(code === 429 || code >= 500)) return res;   // 成功・恒久エラーはそのまま返す
      Logger.log(label + '応答 ' + code + '（再試行 ' + (attempt + 1) + '/' + (retry + 1) + '）: ' + url);
    } catch (e) {
      lastErr = e;
      res = null;
      Logger.log(label + '通信エラー（再試行 ' + (attempt + 1) + '/' + (retry + 1) + '）: ' + e.message);
    }
  }
  if (lastErr) throw lastErr;   // 最後まで通信自体に失敗した
  return res;                   // 429/5xx のまま返す（呼び元がステータスを見て判断する）
}
