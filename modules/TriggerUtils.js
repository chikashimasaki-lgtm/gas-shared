// ====================================================================
//  共通モジュール: プロジェクトトリガーの掃除
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの src/ にシンボリックリンク(TriggerUtils.js)して clasp push する。
//  リンク元: ~/projects/TriggerUtils.js
//  利用元  : Sakata_Screener, JQuants_AccountingRisk
// ====================================================================

/**
 * 指定したハンドラ関数のプロジェクトトリガーをすべて削除する。
 * 「一時停止 → 90秒後に自動再開」方式のバッチ処理（時間分割・自動再開）で、
 * 再開用に仕込んだ time-based トリガーを掃除するのに使う。
 *
 * @param {string} handlerName 削除対象トリガーが呼び出す関数名（例 'scanSignals'）
 */
function clearTriggersFor_(handlerName) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handlerName)
    .forEach(t => ScriptApp.deleteTrigger(t));
}
