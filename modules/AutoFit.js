// ====================================================================
//  共通モジュール: シート列幅の自動調整
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの src/ にシンボリックリンク(AutoFit.js)して clasp push する。
//  リンク元: ~/projects/AutoFit.js
//  利用元  : Sakata_Screener, JQuants_AccountingRisk
// ====================================================================

// 列幅を「データまたはヘッダの内容の最大幅」に調整する。
// autoResizeColumns は計測が反映されず不安定なことがあるため、
// ヘッダ+データの表示文字数（全角=2, 半角=1）から幅を直接算出して設定する。
function autoFit_(sheet, numCols) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1 || numCols < 1) return;
  const values = sheet.getRange(1, 1, lastRow, numCols).getDisplayValues();  // ヘッダ含む全行
  for (let c = 0; c < numCols; c++) {
    let maxUnits = 1;
    for (let r = 0; r < values.length; r++) {
      const s = String(values[r][c] == null ? '' : values[r][c]);
      let units = 0;
      for (const ch of s) units += (ch.charCodeAt(0) > 0xFF ? 2 : 1);  // 全角2・半角1
      if (units > maxUnits) maxUnits = units;
    }
    const px = Math.min(Math.max(maxUnits * 8 + 16, 60), 520);  // 1単位≈8px + 余白16、最小60/最大520
    sheet.setColumnWidth(c + 1, px);
  }
}
