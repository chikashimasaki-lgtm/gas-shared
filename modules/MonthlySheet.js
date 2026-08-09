// ====================================================================
//  共通モジュール: 月末アーカイブシートの作成
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの clasp rootDir にシンボリックリンク(MonthlySheet.js)して push する。
//  リンク元: ~/projects/MonthlySheet.js
//  利用元  : Asset_Status, Asset_Yoshikuni
//
//  「その月の1日」（YYYYMMDD）という名前の作業用シートを複製し、前月末日（YYYYMMDD）に
//  リネームして保存する。複製元は名前で特定する（アクティブシートに依存すると、たまたま
//  別のタブを開いた状態で実行した場合に誤ったシートを複製してしまうため）。
//  黄・緑背景の数式セルはその時点の値に固定し、以後の変動（為替・株価等）で過去の記録が
//  変わってしまわないようにする。確認ダイアログは ConfirmUi.js の confirmDestructive_、
//  トースト見出しは同じく ConfirmUi.js の confirmAppName_（各プロジェクトの APP_NAME_）を使う。
//
//  アーカイブ群の並び順への配置（既存の古いアーカイブの左に差し込む等）はプロジェクトごとに
//  アンカーシートの有無が異なるため、ここには持ち込まず o.placeSheet コールバックへ委譲する。
// ====================================================================

/**
 * @param {Object} o
 * @param {Spreadsheet} o.ss           対象スプレッドシート
 * @param {Sheet}       [o.sheet]      複製元シート（既定: 前月1日（YYYYMMDD）という名前のシートを名前で検索）
 * @param {function}    [o.placeSheet] (ss, copySheet, archiveName) => void  複製後の配置（既定: 何もしない＝copyToの直後）
 * @return {Sheet|null} 作成したシート。ガード・キャンセルで中断した場合は null
 */
function createMonthlySheet_(o) {
  const ss = o.ss;

  const today = new Date();
  const lastDayOfPrevMonth  = new Date(today.getFullYear(), today.getMonth(), 0);
  const firstDayOfPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const archiveName = Utilities.formatDate(lastDayOfPrevMonth, 'Asia/Tokyo', 'yyyyMMdd');
  const sourceName  = Utilities.formatDate(firstDayOfPrevMonth, 'Asia/Tokyo', 'yyyyMMdd');

  // 月末日の翌日（月初1日）以降でないと作成できないようにガードする（月が変わる前の誤実行を防止）。
  const earliestAllowed = new Date(lastDayOfPrevMonth);
  earliestAllowed.setDate(earliestAllowed.getDate() + 1);
  if (today < earliestAllowed) {
    SpreadsheetApp.getUi().alert(
      `月末シートの作成は ${Utilities.formatDate(earliestAllowed, 'Asia/Tokyo', 'yyyy/MM/dd')} 以降に実行してください。`);
    return null;
  }

  const active = o.sheet || ss.getSheetByName(sourceName);
  if (!active) {
    SpreadsheetApp.getUi().alert(`シート「${sourceName}」が見つかりません。`);
    return null;
  }

  if (ss.getSheetByName(archiveName)) {
    SpreadsheetApp.getUi().alert(`シート「${archiveName}」は既に存在します。`);
    return null;
  }
  if (!confirmDestructive_('月末シートを作成',
      `「${active.getName()}」を複製し、「${archiveName}」として保存します。よろしいですか？`)) return null;

  const copy = active.copyTo(ss);
  copy.setName(archiveName);
  freezeColoredFormulas_(copy);
  if (o.placeSheet) o.placeSheet(ss, copy, archiveName);

  ss.toast(`「${archiveName}」を作成しました`, confirmAppName_(), 5);
  return copy;
}

// 背景色が黄(#ffff00)または緑(#00ff00)で、かつ数式が入っているセルだけを、
// その時点の値に置き換える。依存関係の影響を避けるため、全セルの値を先に読み切ってから書き込む。
function freezeColoredFormulas_(sheet) {
  const range = sheet.getDataRange();
  const formulas = range.getFormulas();
  const values = range.getValues();
  const backgrounds = range.getBackgrounds();

  const targets = [];
  for (let r = 0; r < formulas.length; r++) {
    for (let c = 0; c < formulas[r].length; c++) {
      if (!formulas[r][c]) continue;
      const bg = backgrounds[r][c].toLowerCase();
      if (bg === '#ffff00' || bg === '#00ff00') {
        targets.push({ r, c, value: values[r][c] });
      }
    }
  }
  targets.forEach(({ r, c, value }) => {
    range.getCell(r + 1, c + 1).setValue(value);
  });
}
