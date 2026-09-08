// ====================================================================
//  共通モジュール: 例外メッセージ・ログ中のAPIキーの伏字化
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの clasp rootDir にシンボリックリンク(RedactUtil.js)して push する。
//  リンク元: ~/projects/RedactUtil.js
//  利用元  : Abitus-Automation, PdfAutoRename, Sakata_Screener
//
//  Gemini呼び出しのURLには ?key=<GEMINI_API_KEY> がそのまま入っている。GASの
//  UrlFetchApp.fetchはDNS解決失敗・接続断などの通信例外時に、失敗したURLを
//  例外メッセージへそのまま含めることがある。ログシート（複数人と共有され得る）や
//  Stackdriverログに平文で残らないよう、ログへ渡す前に必ずこれで伏字化する。
// ====================================================================

/**
 * 文字列中に生のAPIキーが含まれていれば "***" に置き換える。
 * @param {*} text 伏字化対象（例外メッセージ等）
 * @param {string} apiKey 伏字化するAPIキー本体
 * @return {string}
 */
function redactApiKey_(text, apiKey) {
  const s = String(text == null ? '' : text);
  return apiKey ? s.split(apiKey).join('***') : s;
}
