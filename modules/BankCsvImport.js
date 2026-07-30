// ====================================================================
//  共通モジュール: 銀行明細CSVの取込パイプライン
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの clasp rootDir にシンボリックリンク(BankCsvImport.js)して push する。
//  リンク元: ~/projects/BankCsvImport.js
//  利用元  : Asset_Yoshikuni（ゆうちょ銀行）
//            旧利用元 Asset_Kyoko（みずほ銀行）は2026-07-31廃止。keepFileOnEmptyMapping は
//            Kyoko専用ではない汎用オプションとして残している。
//
//  Asset_Status は対象外。あちらは「ルールごとに最新1件のCSVを取得してシートを
//  全面的に書き換える」方式で、こちらの「フォルダ内の全CSVを追記して重複を除外する」
//  方式とは骨格が違う（findLatestCsv_ / finalizeImportSheet_ 側で完結している）。
//
//  取込の骨格（銀行が違っても同じ部分）:
//    フォルダ内のCSVを列挙 → 文字コード変換 → CsvRules で対象判定 → 明細開始行を特定
//    → 出力先ヘッダーに合わせて列を対応付け → 行を変換 → 既存＋取込済みと重複除外
//    → 追記 → 金額列に桁区切り → 取込履歴へ記録 → 元ファイルをゴミ箱へ
//
//  銀行ごとに違う部分（日付の書式・金額の表記・データ行の条件・並び順）は
//  すべて呼び出し側のコールバックで渡す。ここには銀行固有の知識を持ち込まない。
// ====================================================================

/**
 * @param {Object} o 取込の設定
 * @param {Sheet}    o.sheet           出力先シート
 * @param {Array}    o.destHeader      出力先のヘッダー行（この並びで列を作る）
 * @param {number}   o.headerRow       出力先ヘッダーの行番号（1始まり。既定1）
 * @param {string}   o.folderId        取込元フォルダのID
 * @param {string}   o.ruleKey         CsvRules のルールキー（対象CSVの判定）
 * @param {string}   o.encoding        CSVの文字コード（既定 'MS932'）
 * @param {string}   o.startKeyword    明細開始行を見つけるキーワード（その行をCSVヘッダーとみなす）
 * @param {function} o.rowKey          (row) => string  重複判定のキー
 * @param {function} o.cellValue       (destName, rawValue) => any  1セルの変換
 * @param {string[]} o.amountCols      桁区切りにする列名（出力先ヘッダー名）
 * @param {function} [o.csvColNameOf]  (destName) => CSVの列名（既定は同名）
 * @param {function} [o.isDataRow]     (rawRow) => boolean  明細行として扱うか（既定: 空行でない）
 * @param {function} [o.sortRows]      (rows) => void  追記前の並べ替え（既定: 並べ替えない）
 * @param {boolean}  [o.keepFileOnEmptyMapping] 列の対応付けに失敗したと見て、ファイルを
 *                                     ゴミ箱に入れず残すか（既定 false）
 * @param {function} [o.onFileImported] (fileName, added, skipped) => void  1ファイル取込後
 * @return {{added:number, skipped:number, files:number}} 取込結果の集計
 */
function importBankCsvFiles_(o) {
  const headerRow   = o.headerRow || 1;
  const destHeader  = o.destHeader;
  const encoding    = o.encoding || 'MS932';
  const csvColNameOf = o.csvColNameOf || (name => name);
  const isDataRow   = o.isDataRow || (row => row.join('').trim() !== '');

  // 既存行のキー。ファイルをまたいだ重複も弾けるよう、取込中も同じ集合へ足していく。
  const existingKeys = new Set();
  const lastRow = o.sheet.getLastRow();
  if (lastRow > headerRow) {
    o.sheet.getRange(headerRow + 1, 1, lastRow - headerRow, destHeader.length).getValues()
      .forEach(row => existingKeys.add(o.rowKey(row)));
  }

  const files = DriveApp.getFolderById(o.folderId).getFilesByType(MimeType.CSV);
  let added = 0, skipped = 0, fileCount = 0;

  while (files.hasNext()) {
    const file = files.next();
    fileCount++;
    try {
      const content = file.getBlob().getDataAsString(encoding).replace(/^﻿/, '').trimEnd();
      const csvData = Utilities.parseCsv(content);

      // 対象CSVかの判定（ファイル名・口座番号・見出し）は共通モジュール CsvRules.js が持つ
      if (!CsvRules.match(o.ruleKey, csvData, file)) {
        Logger.log('スキップ（対象CSVではない）: ' + file.getName());
        continue;
      }

      const headerIdx = csvData.findIndex(row => row.some(cell => String(cell).includes(o.startKeyword)));
      if (headerIdx === -1) {
        Logger.log('スキップ（「' + o.startKeyword + '」の行が見つからない）: ' + file.getName());
        continue;
      }

      const csvHeader = csvData[headerIdx];
      const colMap = destHeader.map(h => {
        const want = String(csvColNameOf(String(h).trim())).trim();
        return csvHeader.findIndex(c => String(c).trim() === want);
      });
      Logger.log('列の対応 (' + file.getName() + '): '
        + destHeader.map((h, i) => String(h).trim() + '→' + colMap[i]).join(', '));

      const rawRows = csvData.slice(headerIdx + 1).filter(r => r.join('').trim() !== '');
      const newRows = rawRows
        .map(row => {
          if (!isDataRow(row)) return null;
          return colMap.map((csvIdx, destIdx) => {
            if (csvIdx === -1 || csvIdx >= row.length) return '';
            return o.cellValue(String(destHeader[destIdx]).trim(), String(row[csvIdx]).trim());
          });
        })
        .filter(row => row !== null && row.some(c => c !== ''));

      // 明細行はあるのに1行も作れない＝列の対応付けが崩れている可能性が高い。
      // ここでファイルを捨てると原本を失うため、残して次回に回す。
      if (newRows.length === 0 && rawRows.length > 0 && o.keepFileOnEmptyMapping) {
        Logger.log('警告: 列の対応付けに失敗した可能性 (' + file.getName() + ')。ファイルは残します。');
        continue;
      }

      if (o.sortRows) o.sortRows(newRows);

      const uniqueRows = newRows.filter(row => {
        const key = o.rowKey(row);
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });

      if (uniqueRows.length > 0) {
        const startRow = o.sheet.getLastRow() + 1;
        o.sheet.getRange(startRow, 1, uniqueRows.length, uniqueRows[0].length).setValues(uniqueRows);
        // 金額列だけ桁区切りにする。日付列には設定しない（列に型があると
        // 「型付きの列でセルの数値形式を設定することはできません」で落ちるため）。
        destHeader.forEach((hName, idx) => {
          if ((o.amountCols || []).indexOf(String(hName).trim()) !== -1) {
            o.sheet.getRange(startRow, idx + 1, uniqueRows.length, 1).setNumberFormat('#,##0');
          }
        });
        added += uniqueRows.length;
      }

      const skippedHere = newRows.length - uniqueRows.length;
      skipped += skippedHere;
      if (o.onFileImported) o.onFileImported(file.getName(), uniqueRows.length, skippedHere);
      file.setTrashed(true);
    } catch (e) {
      Logger.log('ファイル処理エラー (' + file.getName() + '): ' + e.message);
    }
  }

  return { added: added, skipped: skipped, files: fileCount };
}
