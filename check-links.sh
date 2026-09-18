#!/usr/bin/env bash
# 共通モジュールのリンク健全性を検査する（--fix で修復もする）
#
#   ~/projects/gas-shared/check-links.sh          検査のみ。問題があれば終了コード1
#   ~/projects/gas-shared/check-links.sh --fix    中間リンクを張り直してから検査
#   ~/projects/gas-shared/check-links.sh --quiet  問題があるときだけ出力（フック用）
#
# 共有の仕組み: <repo>/src/X.js -> ~/projects/X.js -> gas-shared/modules/X.js の2段リンク。
# 中間の ~/projects/X.js は git 管理外なので、モジュールを追加しても誰も作ってくれない。
# 2026-08-09 に MonthlySheet.js がこれで5週間壊れたままになった（CI未導入リポだったため誰も気付かなかった）。
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS="$(dirname "$REPO")"
FIX=0; QUIET=0
for a in "$@"; do
  case "$a" in
    --fix)   FIX=1 ;;
    --quiet) QUIET=1 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "不明な引数: $a" >&2; exit 2 ;;
  esac
done

problems=()
fixed=()
say() { [ "$QUIET" = 1 ] || echo "$@"; }

# --- 1. 中間リンク: modules/*.js ごとに ~/projects/<name> が要る -----------------
for f in "$REPO"/modules/*.js; do
  [ -e "$f" ] || continue
  name="$(basename "$f")"
  link="$PROJECTS/$name"
  want="gas-shared/modules/$name"
  if [ -L "$link" ] && [ "$(readlink "$link")" = "$want" ] && [ -e "$link" ]; then
    continue
  fi
  if [ "$FIX" = 1 ]; then
    ln -sfn "$want" "$link" && fixed+=("中間リンクを作成: ~/projects/$name -> $want")
  else
    if [ -e "$link" ] && [ ! -L "$link" ]; then
      problems+=("~/projects/$name が実ファイルになっている（symlink であるべき）")
    else
      problems+=("中間リンクが無い/壊れている: ~/projects/$name -> $want")
    fi
  fi
done

# --- 2. 各リポの symlink が解決するか -------------------------------------------
while IFS= read -r l; do
  [ -e "$l" ] || problems+=("切れたリンク: ${l#"$PROJECTS"/}  -> $(readlink "$l")")
done < <(find "$PROJECTS" -maxdepth 3 -type l -not -path '*/.git/*' -not -path '*/node_modules/*' 2>/dev/null)

# --- 3. 各リポが参照するモジュールが gas-shared に実在するか ---------------------
# （ライブGASで「共有モジュール前提」に書き換えたのに gas-shared へ入れ忘れる型。
#   2026-09-18 に GeminiRetry / AuditCommon / GeminiClient / ResourceLoader の4本で発生）
while IFS= read -r l; do
  tgt="$(readlink "$l")"
  case "$tgt" in
    *gas-shared/modules/*|../../*|../*) ;;
    *) continue ;;
  esac
  name="$(basename "$tgt")"
  [ -e "$REPO/modules/$name" ] || problems+=("gas-shared に無いモジュールを参照: ${l#"$PROJECTS"/} -> $name")
done < <(find "$PROJECTS" -mindepth 2 -maxdepth 3 -type l -name '*.js' -not -path '*/.git/*' 2>/dev/null)

# --- 出力 -----------------------------------------------------------------------
if [ ${#fixed[@]} -gt 0 ]; then
  echo "共通モジュールのリンクを修復しました:"
  printf '  %s\n' "${fixed[@]}"
fi

if [ ${#problems[@]} -eq 0 ]; then
  say "✅ 共通モジュールのリンクは健全（モジュール $(ls "$REPO"/modules/*.js 2>/dev/null | wc -l) 本）"
  exit 0
fi

echo "❌ 共通モジュールのリンクに問題があります:" >&2
printf '  - %s\n' "${problems[@]}" >&2
echo "  → 直すには: $REPO/check-links.sh --fix" >&2
exit 1
