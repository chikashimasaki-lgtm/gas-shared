// ====================================================================
//  共通モジュール: 破壊的操作の確認ダイアログ
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの clasp rootDir にシンボリックリンク(ConfirmUi.js)して push する。
//  リンク元: ~/projects/ConfirmUi.js
//  利用元  : Sakata_Screener, Asset_Status, Abitus-Automation
//
//  3リポジトリで同じ実装が重複し、片方だけ直る状態になっていた（実際、キャンセル時の
//  トーストを try/catch で保護する修正が Sakata_Screener にだけ入っていなかった）。
//
//  トーストに出すプロジェクト名は、各プロジェクトが `APP_NAME_` を定義して渡す。
//  未定義でも動く（既定名を使う）ため、読み込み順に依存しない。
// ====================================================================

/**
 * 取り返しのつかない操作の前に確認を取る。
 *
 * トリガー起動では getUi() が使えないため、その場合は確認を求めず続行する
 * （定期実行を止めないため）。
 *
 * 【注意】操作パネルのチェックボックスなど、インストール型トリガー経由で走る
 * 「手動操作」でも getUi() は使えない。そこから破壊的操作を呼ぶ場合は、確認が
 * 効かないことを前提に、呼び出し側でメニューへ誘導するなどの手当てが要る
 * （Abitus-Automation の getPanelActions_ の menuOnly がその例）。
 *
 * @param {string} title   ダイアログの見出し
 * @param {string} message 本文。何が起きるかと件数を書く
 * @return {boolean} 続行してよければ true
 */
function confirmDestructive_(title, message) {
  let ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { return true; }   // トリガー実行時
  const res = ui.alert(title, message, ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) {
    // トーストはあくまで補助。ここで落ちて「キャンセルしたのにエラー」になるのを避ける
    try { SpreadsheetApp.getActive().toast('操作をキャンセルしました', confirmAppName_(), 4); } catch (_) {}
    return false;
  }
  return true;
}

// トーストの見出しに使うプロジェクト名。各プロジェクトの APP_NAME_ を参照し、
// 無ければ既定名を返す（typeof で見るので未定義でも例外にならない）。
function confirmAppName_() {
  try {
    return (typeof APP_NAME_ !== 'undefined' && APP_NAME_) ? String(APP_NAME_) : 'スクリプト';
  } catch (e) {
    return 'スクリプト';
  }
}
