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
//  アーカイブ群の並び順は、name（YYYYMMDD）より前の日付を持つ既存アーカイブシートのうち
//  最も新しいものを探し、その左（同じインデックス位置）に新シートを移動する。既存の
//  アーカイブが1つも無い場合だけ、o.anchorSheetName で渡された固定シートの位置へ移動する
//  （両方とも無ければ copyTo() のデフォルト位置＝複製元の直後のまま）。
// ====================================================================

/**
 * @param {Object} o
 * @param {Spreadsheet} o.ss                対象スプレッドシート
 * @param {Sheet}       [o.sheet]           複製元シート（既定: 前月1日（YYYYMMDD）という名前のシートを名前で検索）
 * @param {string}      [o.anchorSheetName] 既存アーカイブが1つも無い場合の配置基準シート名
 * @param {function}    [o.placeSheet]      (ss, copySheet, archiveName) => void  配置ロジックを独自のものに差し替えたい場合に使う（既定は上記の直近アーカイブの左への配置）
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
  (o.placeSheet || placeMonthlySheet_)(ss, copy, archiveName, o.anchorSheetName);

  ss.toast(`「${archiveName}」を作成しました`, confirmAppName_(), 5);
  return copy;
}

// name（YYYYMMDD）より前の日付を持つ既存アーカイブシートのうち最も新しいものを探し、
// その左（同じインデックス位置）に sheet を移動する。前月シートが無ければ
// anchorSheetName の位置へ移動。それも無ければ何もしない（copyTo() のデフォルト位置のまま）。
function placeMonthlySheet_(ss, sheet, name, anchorSheetName) {
  const dateVal = Number(name);
  const olderNames = ss.getSheets()
    .map(s => s.getName())
    .filter(n => /^\d{8}$/.test(n) && n !== name)
    .map(Number)
    .filter(n => n < dateVal)
    .sort((a, b) => b - a);

  let targetIndex;
  if (olderNames.length > 0) {
    targetIndex = ss.getSheetByName(String(olderNames[0])).getIndex();
  } else if (anchorSheetName) {
    const anchor = ss.getSheetByName(anchorSheetName);
    targetIndex = anchor ? anchor.getIndex() : ss.getSheets().length;
  } else {
    return;
  }
  sheet.activate();
  ss.moveActiveSheet(targetIndex);
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
