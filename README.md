# gas-shared

複数のGASプロジェクトで共有するモジュールと、CSV自動取り込みウォッチャーの単一ソース。

**private リポジトリのまま運用すること。** `modules/CsvRules.js` に口座番号が入っている。

## 中身

| パス | 役割 | 利用元 |
| --- | --- | --- |
| `modules/UsageSheet.js` | 「使い方」シート生成（`build` / `buildDoc`） | GAS 10リポジトリ |
| `modules/CsvRules.js` | 取り込み対象CSVの判定ルール（単一ソース） | Asset_Status / Asset_Yoshikuni / `watcher/watch.py` |
| `modules/CsvImportLog.js` | 「CSVインポート履歴」シートへの記録 | Asset_Status / Asset_Yoshikuni |
| `modules/MarketCalendar.js` | 東証営業日・立会時間の判定 | Asset_Status / Sakata_Screener |
| `modules/AutoFit.js` | 列幅の自動調整 | Sakata_Screener / JQuants_AccountingRisk |
| `modules/SheetStyle.js` | 行バンディング・ヘッダ装飾 | Sakata_Screener / JQuants_AccountingRisk |
| `modules/SheetUtils.js` | シート操作ユーティリティ（`removeBlankRows_`） | Asset_Yoshikuni |
| `modules/BankCsvImport.js` | 銀行明細CSVの取込パイプライン（`importBankCsvFiles_`） | Asset_Yoshikuni |
| `modules/FetchRetry.js` | 1URL取得の再試行・指数バックオフ（`fetchWithRetry_`） | Sakata_Screener / JQuants_AccountingRisk / Asset_Yoshikuni_Securities |
| `modules/ConfirmUi.js` | 破壊的操作の確認ダイアログ（`confirmDestructive_`） | Sakata_Screener / Asset_Status / Abitus-Automation |
| `watcher/watch.py` | Downloads を監視し Drive の `CSV_inport` へCSVを送る | ChromeOS の Linux |

## 共有のしくみ

実体はこのリポジトリだけに置き、`~/projects/<name>.js` がここへのリンク、各GASリポジトリの
`src/<name>.js` が `~/projects/<name>.js` へのリンクになっている（2段リンク）。
このため**各GASリポジトリを触らずに**共有モジュールを差し替えられる。clasp は
リンクを追ってファイル本体を push する。

    Asset_Status/src/CsvRules.js -> ../../CsvRules.js -> gas-shared/modules/CsvRules.js

⚠ `modules/CsvRules.js` は口座番号を含むため、**公開リポジトリ**（Sakata_Screener /
JQuants_AccountingRisk は GitHub Pages で公開中）には symlink しないこと。

## モジュールを直したら

利用元のGASリポジトリを**それぞれ** `clasp push` すること（片方だけだと一方のライブGASに
反映されない）。CI は無い。デプロイは手元からの `clasp push` に一本化している。

## CSVウォッチャー

ChromeOS の Downloads に落ちたCSVのうち、`CsvRules.js` のルールに当たるものだけを
Drive の `CSV_inport`（`FOLDER_ID`）へアップロードする。あとは各GASの時間主導型トリガーが
取り込み、元CSVをゴミ箱へ送る。SBI証券のサイトへは一切アクセスしない。

- 認証は clasp の `~/.clasprc.json`（`drive.file` スコープ）を再利用する。端末ごとに `clasp login` が必要。
- 送信後の原本は `watcher/archive/` へ退避する（Downloads に残すと毎分再送してしまうため）。
- 更新から24時間を過ぎたCSVは送らずに削除する。古い「保有証券一覧」などを取り込むと、
  全置換シートを過去の残高で上書きしてしまうため。
- systemd のユーザータイマーで1分ごとに実行する。

## 新しい端末でのセットアップ

    git clone <this repo> ~/projects/gas-shared
    ~/projects/gas-shared/setup.sh

そのあと `npx @google/clasp login` と、ファイルアプリでの「ダウンロード」フォルダの
Linux 共有が必要（詳細は `setup.sh` の最後に出る）。
