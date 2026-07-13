// ====================================================================
//  共通モジュール: シート操作ユーティリティ
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトへは symlink して clasp push する。
//  実体   : ~/projects/gas-shared/modules/SheetUtils.js
//  利用元 : Asset_Kyoko, Asset_Yoshikuni
// ====================================================================

// 空白行削除（2行目以降、先頭 colCount 列がすべて空の行を後ろから削除）
function removeBlankRows_(sheet, colCount) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const values = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i].every(c => c === '')) sheet.deleteRow(i + 2);
  }
}
