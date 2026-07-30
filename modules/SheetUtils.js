// ====================================================================
//  共通モジュール: シート操作ユーティリティ
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトへは symlink して clasp push する。
//  実体   : ~/projects/gas-shared/modules/SheetUtils.js
//  利用元 : Asset_Yoshikuni, Asset_Status
// ====================================================================

// 重複判定用: 日付セルを yyyy/MM/dd 文字列に正規化する
//
// 表記ゆれを正準形 yyyy/MM/dd に揃える。揃えないと、finalize や手編集で Date 型に
// なった保存済み行と CSV 由来の文字列行が、同じ取引でも別キーになり、重複除外が
// 効かず毎回追記される（cleanup でも Date/文字列の混在で重複が残る）。
//   - Date 型                → 'Asia/Tokyo' で書式化
//   - "2026/7/1"             → 非ゼロ埋めをゼロ埋め
//   - "2026-07-01" "2026.07.01" → ハイフン・ドット区切りをスラッシュ
//   - "2026/07/01 0:00:00"   → 時刻部分を切り捨て（先頭一致のみ見る）
// 日付として解釈できない値（SBI CSV の "----/--/--" や空文字）は trim しただけの
// 文字列をそのまま返す。区切り文字の置換を無条件でかけると "----/--/--" が
// "//////////" に化けるため、置換は数字にマッチしたときだけ行う。
function normDateStr_(c) {
  if (c instanceof Date) return Utilities.formatDate(c, 'Asia/Tokyo', 'yyyy/MM/dd');
  const s = String(c != null ? c : '').trim();
  const m = s.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!m) return s;
  return String(+m[1]).padStart(4, '0') + '/' +
         String(+m[2]).padStart(2, '0') + '/' +
         String(+m[3]).padStart(2, '0');
}

// 空白行削除（2行目以降、先頭 colCount 列がすべて空の行を後ろから削除）
function removeBlankRows_(sheet, colCount) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const values = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i].every(c => c === '')) sheet.deleteRow(i + 2);
  }
}

// ヘッダー行の書き込みと装飾（1行目に header を書き、bold＋背景色を付けて1行目を固定）
// colWidths を渡したときだけ列幅を設定する（{ 見出し名: 幅 }。マップにない列は defaultWidth）。
// colWidths を省略（null/undefined）すると列幅は変更しない＝各シートの既存幅を保つ。
function writeHeaderRow_(sheet, header, colWidths, defaultWidth) {
  sheet.getRange(1, 1, 1, header.length)
    .setValues([header]).setFontWeight('bold').setBackground('#d0e4f7');
  if (colWidths) {
    const fallback = defaultWidth || 120;
    header.forEach((h, i) => sheet.setColumnWidth(i + 1, colWidths[h] || fallback));
  }
  sheet.setFrozenRows(1);
}
