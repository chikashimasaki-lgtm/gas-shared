// ====================================================================
//  共通モジュール: 取り込み対象CSVの判定ルール（単一ソース）
// ====================================================================
//  Drive の取り込みフォルダ(CSV_inport)には Asset_Status /
//  Asset_Yoshikuni の2案件のCSVが混在する（Asset_Kyokoは2026-07-31廃止）。
//  どのCSVがどの案件のものかを判定するルールを、このファイル1本に集約する。
//
//  リンク元: ~/projects/CsvRules.js
//  利用元  : Asset_Status, Asset_Yoshikuni（いずれも src/ へ symlink）
//            + ~/projects/sbi-csv-watcher/watch.py（Python）
//
//  ⚠ watch.py は CSV_RULES の中身を「JSONとして」読む。値を足すときは
//     コメント・末尾カンマ・単一引用符を使わず、厳密なJSONの書き方を守ること。
//     （ルールの説明はこのヘッダに書く）
//
//  ⚠ 口座番号を含むため、公開リポジトリ(Sakata_Screener / JQuants_AccountingRisk)へは
//     symlink しないこと。
//
//  ルールの条件（複数書いた場合は AND。配列の中身は namePrefixes だけ OR）:
//    namePrefixes : ファイル名がこのいずれかで始まる
//    nameRegex    : ファイル名がこの正規表現に一致する
//    cells        : [行, 列, 値] のセルがすべて一致（0始まり）
//    rowIncludes  : [行, 値] その行に値がセルとして含まれる
//    textIncludes : CSV全体のテキストに文字列がすべて含まれる
// ====================================================================

const CSV_RULES = {
  "as_holdings":     { "cells": [[1, 0, "保有証券一覧"]] },
  "as_margin":       { "cells": [[1, 0, "信用建玉一覧"]] },
  "as_bank_jpy":     { "cells": [[0, 4, "残高(円)"]] },
  "as_bank_usd":     { "cells": [[0, 4, "残高(USD)"]] },
  "as_cash_jpy_sec": { "namePrefixes": ["DetailInquiry_"] },
  "as_cash_usd_sec": { "namePrefixes": ["nyushukkin"] },
  "as_bond":         { "namePrefixes": ["保有銘柄_"], "rowIncludes": [[0, "保有額面(金額)"]] },
  "as_dollar_trade": { "namePrefixes": ["yakujo"] },
  "as_yakujo_hist":  { "cells": [[1, 0, "約定履歴照会 "]] },
  "as_tokutei_pnl":  { "cells": [[1, 0, "特定口座損益明細"]] },
  "as_pnl_domestic": { "cells": [[0, 0, "国内株式"], [4, 1, "現物"]] },
  "as_pnl_margin":   { "cells": [[0, 0, "国内株式"], [4, 1, "信用"]] },
  "as_pnl_dividend": { "namePrefixes": ["DISTRIBUTION_"] },
  "as_pnl_us":       { "namePrefixes": ["FOREIGN_STOCK_"] },
  "as_pnl_bond":     { "namePrefixes": ["BOND_"] },
  "as_pnl_fund":     { "namePrefixes": ["FUND_"] },

  "kyoko_mizuho":    { "nameRegex": "^[0-9]+\\.csv$", "textIncludes": ["810577", "明細通番"] },

  "yoshikuni":       { "textIncludes": ["10140-49561761", "取引日"] }
};

const CsvRules = {
  /** ルール1件に対して rows/file が一致するか。rows は Utilities.parseCsv の結果。 */
  match(key, rows, file) {
    const rule = CSV_RULES[key];
    if (!rule) throw new Error('未定義のCSVルール: ' + key);

    const name = file ? file.getName() : '';
    if (rule.namePrefixes && !rule.namePrefixes.some(p => name.indexOf(p) === 0)) return false;
    if (rule.nameRegex && !new RegExp(rule.nameRegex).test(name)) return false;
    if (rule.cells && !rule.cells.every(c => (rows[c[0]] || [])[c[1]] === c[2])) return false;
    if (rule.rowIncludes && !rule.rowIncludes.every(r => (rows[r[0]] || []).indexOf(r[1]) >= 0)) return false;
    if (rule.textIncludes) {
      const text = rows.map(r => r.join('')).join('\n');
      if (!rule.textIncludes.every(s => text.indexOf(s) >= 0)) return false;
    }
    return true;
  },

  /** findLatestCsv_(matchFn) にそのまま渡せる matchFn を作る。 */
  matcher(key) {
    return (rows, file) => this.match(key, rows, file);
  },
};
