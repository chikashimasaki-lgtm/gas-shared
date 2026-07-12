#!/usr/bin/env python3
"""ChromeOS の Downloads に落ちた取り込み対象CSVを、Drive の CSV_inport へ送る。

CSV_inport には Asset_Status / Asset_Kyoko / Asset_Yoshikuni の3案件のCSVが混在する。
どのCSVが取り込み対象かの判定ルールは、GAS側と共有する単一ソース
~/projects/CsvRules.js の CSV_RULES を読んで使う（Pythonにルールを複製しない）。
ルールを足すときは CsvRules.js だけを直し、各GASリポジトリを clasp push すること。

Drive へ置けば各案件のトリガーが取り込み、元CSVをゴミ箱へ送る。こちらは「置く」だけ。
Google ドライブは Linux に共有できない環境なので、Drive API v3 で直接アップロードする。
認証は clasp の ~/.clasprc.json（drive.file スコープを含む）を再利用する。

送信後のCSVは Downloads から archive/ へ移す（同じファイルを二重に上げないため）。
古いCSVは送らずに削除する（全置換シートを過去のデータで壊さないため）。

systemd タイマーから1分ごとに呼ばれる想定。1回走って終わる。
"""
import csv
import io
import json
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path

# ChromeOSの「Linuxと共有」したDownloadsのマウント先は端末によって違う（両方見て先に在る方を使う）
SRC_CANDIDATES = [
    Path('/mnt/chromeos/MyFiles/Downloads'),
    Path('/mnt/shared/MyFiles/Downloads'),
]
SRC       = next((p for p in SRC_CANDIDATES if p.is_dir()), SRC_CANDIDATES[0])
BASE      = Path(__file__).parent
ARCHIVE   = BASE / 'archive'          # アップロード済みの原本
LOG       = BASE / 'watch.log'
CLASPRC   = Path.home() / '.clasprc.json'
RULES_JS  = BASE.parent / 'modules' / 'CsvRules.js'    # GASと共有する単一ソース
FOLDER_ID = '146HCIoiqTdD2vr-uFJNhvgk4t51a4kis'        # 3案件共通の取り込みフォルダ

# 更新から MAX_AGE_H 時間を過ぎたCSVは送らずに削除する。Downloadsに古いCSVが残っていると、
# 「保有証券一覧」などの全置換シートを古い残高で上書きしてしまうため。
MAX_AGE_H = 24


def log(msg):
    line = f'{datetime.now():%Y-%m-%d %H:%M:%S} {msg}'
    print(line)
    with LOG.open('a', encoding='utf-8') as f:
        f.write(line + '\n')


def load_rules():
    """CsvRules.js から CSV_RULES を取り出す。中身は厳密なJSONで書く約束になっている。"""
    src = RULES_JS.read_text(encoding='utf-8')
    m = re.search(r'const CSV_RULES\s*=\s*(\{.*?\n\});', src, re.S)
    if not m:
        raise ValueError(f'CSV_RULES を取り出せない: {RULES_JS}')
    return json.loads(m.group(1))


def read_rows(path):
    """CSVを全行読む。GAS側は Shift_JIS/MS932 で読むので合わせる。"""
    try:
        text = path.read_bytes().decode('cp932', errors='replace')
    except OSError:
        return []
    return list(csv.reader(io.StringIO(text)))


def match(rule, rows, name):
    """CsvRules.js の CsvRules.match と同じ判定をする。"""
    if 'namePrefixes' in rule and not any(name.startswith(p) for p in rule['namePrefixes']):
        return False
    if 'nameRegex' in rule and not re.search(rule['nameRegex'], name):
        return False
    if 'cells' in rule:
        for i, j, v in rule['cells']:
            row = rows[i] if i < len(rows) else []
            if (row[j] if j < len(row) else None) != v:
                return False
    if 'rowIncludes' in rule:
        for i, v in rule['rowIncludes']:
            if v not in (rows[i] if i < len(rows) else []):
                return False
    if 'textIncludes' in rule:
        text = '\n'.join(''.join(r) for r in rows)
        if not all(s in text for s in rule['textIncludes']):
            return False
    return True


def matched_rule(path, rules):
    """どの案件のCSVかを返す。どれにも当てはまらなければ None。"""
    if path.suffix.lower() != '.csv':
        return None
    rows = read_rows(path)
    for key, rule in rules.items():
        if match(rule, rows, path.name):
            return key
    return None


def is_fresh(path):
    age_h = (datetime.now().timestamp() - path.stat().st_mtime) / 3600
    return age_h <= MAX_AGE_H


def access_token():
    """clasp の refresh token からアクセストークンを取り直す。"""
    tok = json.loads(CLASPRC.read_text())['tokens']['default']
    body = urllib.parse.urlencode({
        'client_id':     tok['client_id'],
        'client_secret': tok['client_secret'],
        'refresh_token': tok['refresh_token'],
        'grant_type':    'refresh_token',
    }).encode()
    res = json.load(urllib.request.urlopen('https://oauth2.googleapis.com/token', body, timeout=30))
    return res['access_token']


def upload(path, token):
    boundary = uuid.uuid4().hex
    meta = json.dumps({'name': path.name, 'parents': [FOLDER_ID]})
    payload = b''.join([
        f'--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n'.encode(),
        f'--{boundary}\r\nContent-Type: text/csv\r\n\r\n'.encode(),
        path.read_bytes(),                      # 文字コードは変換せずバイトのまま送る
        f'\r\n--{boundary}--\r\n'.encode(),
    ])
    req = urllib.request.Request(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        data=payload, method='POST',
        headers={'Authorization': f'Bearer {token}',
                 'Content-Type': f'multipart/related; boundary={boundary}'})
    return json.load(urllib.request.urlopen(req, timeout=120))['id']


def main():
    if not SRC.is_dir():
        log('ERROR: Downloads が見えない（' + ' / '.join(str(p) for p in SRC_CANDIDATES) + '）。'
            'ChromeOSのファイルアプリで「Linuxとの共有」を有効にしてください')
        return 1

    rules = load_rules()
    hits = [(p, k) for p in sorted(SRC.glob('*.csv'))
            if (k := matched_rule(p, rules)) is not None]

    targets, stale = [], []
    for p, k in hits:
        (targets if is_fresh(p) else stale).append((p, k))

    for path, _ in stale:
        path.unlink()
        log(f'stale: {path.name} ({MAX_AGE_H}時間超) を削除しました')

    if not targets:
        return 0

    try:
        token = access_token()
    except (urllib.error.URLError, KeyError, OSError) as e:
        log(f'ERROR: 認証に失敗（clasp login が必要かもしれません）: {e}')
        return 1

    ARCHIVE.mkdir(exist_ok=True)
    sent = 0
    for path, key in targets:
        try:
            fid = upload(path, token)
        except urllib.error.HTTPError as e:
            log(f'ERROR: アップロード失敗 {path.name}: {e.code} {e.read().decode()[:200]}')
            continue    # Downloadsに残すので次回また試行される
        # アップロード済みの原本は退避する（Downloadsに残すと毎分再送してしまう）
        stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        shutil.move(str(path), str(ARCHIVE / f'{path.stem}_{stamp}{path.suffix}'))
        log(f'uploaded: {path.name} [{key}] -> CSV_inport ({fid})')
        sent += 1

    if sent:
        log(f'{sent} 件を CSV_inport へアップロードしました')
    return 0


if __name__ == '__main__':
    sys.exit(main())
