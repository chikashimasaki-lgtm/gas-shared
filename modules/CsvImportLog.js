// ====================================================================
//  共通モジュール: CSV取込ログシート
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの clasp rootDir にシンボリックリンク(CsvImportLog.js)して push する。
//  リンク元: ~/projects/CsvImportLog.js
//  利用元  : Asset_Status, Asset_Kyoko, Asset_Yoshikuni
// ====================================================================

// 取込結果を「CSVインポート履歴」シートへ記録する。
// 対象シートごとに1行で、同じ対象シートの行があれば上書きし、無ければ追記する。
// ログシートが無ければ「使い方」シートの直後（無ければ末尾）に作成する。
function logCsvImportTo_(ss, logSheetName, howtoSheetName, fileName, sheetName, count, skipCount) {
  let logSheet = ss.getSheetByName(logSheetName);
  if (!logSheet) {
    const howto = ss.getSheetByName(howtoSheetName);
    // insertSheet のインデックスは0始まり。末尾に入れるなら getSheets().length。
    const idx   = howto ? howto.getIndex() + 1 : ss.getSheets().length;
    logSheet = ss.insertSheet(logSheetName, idx);
    logSheet.getRange(1, 1, 1, 5).setValues([['対象シート', '日時', 'ファイル名', '件数', 'スキップ']]).setFontWeight('bold');
    logSheet.setFrozenRows(1);
    logSheet.setColumnWidth(1, 200);
    logSheet.setColumnWidth(2, 155);
    logSheet.setColumnWidth(3, 260);
    logSheet.setColumnWidth(4,  60);
    logSheet.setColumnWidth(5,  60);
  }

  const now     = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  const skip    = skipCount || 0;
  const lastRow = logSheet.getLastRow();
  if (lastRow > 1) {
    const col = logSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < col.length; i++) {
      if (String(col[i][0]).trim() === sheetName) {
        logSheet.getRange(i + 2, 1, 1, 5).setValues([[sheetName, now, fileName, count, skip]]);
        return;
      }
    }
  }
  logSheet.appendRow([sheetName, now, fileName, count, skip]);
}
