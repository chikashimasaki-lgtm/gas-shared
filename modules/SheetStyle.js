// ====================================================================
//  共通モジュール: シートの行バンディング・ヘッダ装飾
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの src/ にシンボリックリンク(SheetStyle.js)して clasp push する。
//  リンク元: ~/projects/SheetStyle.js
//  利用元  : Sakata_Screener, JQuants_AccountingRisk
// ====================================================================

// 1行目をヘッダとして装飾し、2行目以降に交互の行バンディングを適用する。
// headerColor はヘッダ行の背景色、altColor は偶数行の背景色。
function styleSheet_(sheet, numCols, headerColor, altColor) {
  if (!sheet || sheet.getLastRow() < 1 || numCols < 1) return;
  const lastRow = sheet.getLastRow();
  // 既存バンディングを除去（再実行で重複エラーにしない）
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).getBandings().forEach(b => b.remove());
  const band = sheet.getRange(1, 1, lastRow, numCols)
    .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  band.setHeaderRowColor(headerColor).setFirstRowColor('#ffffff').setSecondRowColor(altColor);
  sheet.getRange(1, 1, 1, numCols)
    .setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 30);
}
