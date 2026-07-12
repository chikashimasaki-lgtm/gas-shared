#!/usr/bin/env bash
# gas-shared のセットアップ（新しいChromebookで1回だけ実行する）
#
#   git clone git@github.com:<user>/gas-shared.git ~/projects/gas-shared
#   ~/projects/gas-shared/setup.sh
#
# やること:
#   1. ~/projects/<module>.js を modules/ へのリンクにする（各GASリポの symlink はこれを指す）
#   2. CSVウォッチャーの systemd タイマーを登録・起動する
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS="$(dirname "$REPO")"

echo "== 1. 共通モジュールのリンクを張る =="
for f in "$REPO"/modules/*.js; do
  name="$(basename "$f")"
  ln -sfn "gas-shared/modules/$name" "$PROJECTS/$name"
  echo "  $PROJECTS/$name -> gas-shared/modules/$name"
done

echo "== 2. CSVウォッチャーを登録する =="
mkdir -p "$HOME/.config/systemd/user"
cp "$REPO"/watcher/sbi-csv-watcher.service "$HOME/.config/systemd/user/"
cp "$REPO"/watcher/sbi-csv-watcher.timer   "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now sbi-csv-watcher.timer
loginctl enable-linger "$USER" >/dev/null 2>&1 || true
systemctl --user list-timers sbi-csv-watcher.timer --no-pager | head -2

cat <<'MSG'

== 残りの手作業 ==
1. clasp にログインする（Driveへのアップロードに使う認証。端末ごとに必要）
     npx @google/clasp login
2. ChromeOSのファイルアプリで「マイファイル > ダウンロード」を右クリックし
   「Linux とファイルを共有」を実行する。反映されない場合は Linux を再起動する。
3. 動作確認
     python3 ~/projects/gas-shared/watcher/watch.py
     tail ~/projects/gas-shared/watcher/watch.log
MSG
