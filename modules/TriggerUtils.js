// ====================================================================
//  共通モジュール: プロジェクトトリガーの掃除
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの src/ にシンボリックリンク(TriggerUtils.js)して clasp push する。
//  リンク元: ~/projects/TriggerUtils.js
//  利用元  : Sakata_Screener, JQuants_AccountingRisk, Asset_Status
// ====================================================================

/**
 * 指定したハンドラ関数のプロジェクトトリガーをすべて削除する。
 * 「一時停止 → 90秒後に自動再開」方式のバッチ処理（時間分割・自動再開）で、
 * 再開用に仕込んだ time-based トリガーを掃除するのに使う。
 * トリガーの張り直し（削除 → newTrigger で再作成）でも使う。
 *
 * @param {string|string[]} handlerNames 削除対象トリガーが呼び出す関数名。
 *        単一名（例 'scanSignals'）でも配列（例 ['onOpen', 'main']）でも渡せる。
 * @return {number} 削除したトリガーの件数
 */
function clearTriggersFor_(handlerNames) {
  const targets = new Set(Array.isArray(handlerNames) ? handlerNames : [handlerNames]);
  const hits = ScriptApp.getProjectTriggers()
    .filter(t => targets.has(t.getHandlerFunction()));
  hits.forEach(t => ScriptApp.deleteTrigger(t));
  return hits.length;
}
