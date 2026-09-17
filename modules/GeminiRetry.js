// ====================================================================
//  共通モジュール: Gemini API のエラー応答の読み取り
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの clasp rootDir にシンボリックリンク(GeminiRetry.js)して push する。
//  リンク元: ~/projects/GeminiRetry.js
//  利用元  : ReceiptstoSheet, BusinessCardToSheet
// ====================================================================
//  Gemini の 429 応答は「1日の上限に達した（待っても回復しない）」場合と
//  「短期のレート超過（待てば回復する）」場合の両方で返る。両者を取り違えると、
//  回復しない待機で実行時間を溶かすか、待てば通るものを諦めることになる。

/**
 * 1日あたりの割り当てを使い切ったことによる失敗か。
 * true なら待っても回復しないので、その日の処理は打ち切る。
 * @param {Object} json Gemini API のエラー応答（JSON.parse 済み）
 * @return {boolean}
 */
function isDailyQuotaExceeded_(json) {
  try {
    const violations = json.error?.details?.find(d => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure')?.violations ?? [];
    return violations.some(v => v.quotaId?.includes("PerDay"));
  } catch (_) {
    return false;
  }
}

/**
 * 応答が指定してきた再試行までの待ち秒数。
 * RetryInfo が無い・壊れている場合は既定の30秒を返す。
 * @param {Object} json Gemini API のエラー応答（JSON.parse 済み）
 * @return {number} 待つ秒数
 */
function extractRetryDelay_(json) {
  try {
    const retryInfo = json.error.details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
    if (retryInfo?.retryDelay) return parseInt(retryInfo.retryDelay.replace('s', ''), 10) + 1;
  } catch (_) {}
  return 30;
}
