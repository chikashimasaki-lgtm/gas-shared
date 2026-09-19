// ====================================================================
//  共通モジュール: 監査系プロジェクトの設定読み込み
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの clasp rootDir にシンボリックリンク(AuditCommon.js)して push する。
//  リンク元: ~/projects/AuditCommon.js
//  利用元  : AuditPOC（FraudAuditPOC / RiskBasedPlanPOC は 2026-09-19 に廃止）
//            （AuditPOCから分離した際にCommon.jsごとコピペされ、3ファイルで
//            バイト単位の重複になっていたものを切り出した）
//
//  呼び出し側が用意する前提:
//    - 定数/オブジェクト SHEETS（SHEETS.SETTINGS に設定シート名を持つ）
//    - 関数 getOrCreateSpreadsheet_()（3プロジェクトでフォールバック戦略が
//      異なるため、これ自体は共通化せず各プロジェクトに残している）
// ====================================================================

function getSettings_() {
  const ss    = getOrCreateSpreadsheet_();
  const sheet = ss.getSheetByName(SHEETS.SETTINGS);
  if (!sheet) throw new Error('設定シートが見つかりません。setup() を実行してください。');
  if (sheet.getLastRow() < 2) return {};
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const settings = {};
  data.forEach(r => { if (r[0]) settings[String(r[0])] = r[1]; });
  return settings;
}
