/**
 * 共有モジュールの検証（GAS不要 / 依存なし）
 *
 *   node tests/verify.js
 *
 * modules/*.js を GAS API のモック上へ読み込み、実際に動かす。
 * 共有モジュールは複数プロジェクトから同時に使うため、壊すと影響範囲が広い。
 */
const fs   = require('fs');
const path = require('path');

/* ── GAS モック ───────────────────────────────────────────────────────────── */

const logs = [];

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const line = this.sheet.rows[this.row - 1 + r] || [];
      out.push(Array.from({ length: this.numCols }, (_, c) => {
        const v = line[this.col - 1 + c];
        return v === undefined ? '' : v;
      }));
    }
    return out;
  }
  setValues(vals) {
    vals.forEach((line, r) => {
      const idx = this.row - 1 + r;
      while (this.sheet.rows.length <= idx) this.sheet.rows.push([]);
      line.forEach((v, c) => { this.sheet.rows[idx][this.col - 1 + c] = v; });
    });
    return this;
  }
  setNumberFormat(fmt) {
    for (let r = 0; r < this.numRows; r++) this.sheet.formats.push({ row: this.row + r, col: this.col, fmt });
    return this;
  }
}

class FakeSheet {
  constructor(rows) { this.rows = rows || []; this.formats = []; }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if ((this.rows[i] || []).some(v => v !== '' && v != null)) return i + 1;
    }
    return 0;
  }
  getRange(row, col, numRows, numCols) {
    return new FakeRange(this, row, col, numRows === undefined ? 1 : numRows, numCols === undefined ? 1 : numCols);
  }
}

function fakeFile(name, text) {
  return {
    trashed: false,
    getName: () => name,
    getBlob: () => ({ getDataAsString: () => text }),
    setTrashed(v) { this.trashed = v; },
  };
}

let folderFiles = [];
let ruleMatcher = () => true;

const sandbox = {
  Logger: { log: m => logs.push(String(m)) },
  Utilities: {
    // 引用符を扱わない簡易CSVパーサ（テストデータは引用符を使わない）
    parseCsv: text => text.split(/\r?\n/).map(line => line.split(',')),
    formatDate: d => d.toISOString().slice(0, 10),
  },
  DriveApp: {
    getFolderById: () => ({
      getFilesByType: () => {
        let i = 0;
        return { hasNext: () => i < folderFiles.length, next: () => folderFiles[i++] };
      },
    }),
  },
  MimeType: { CSV: 'text/csv' },
  CsvRules: { match: (key, data, file) => ruleMatcher(key, data, file) },
  SpreadsheetApp: {}, PropertiesService: {}, ScriptApp: {}, Session: {},
};

// UrlFetchApp / SpreadsheetApp は FetchRetry・ConfirmUi のテストで差し替える
let fetchPlan = [], fetchCalls = 0, slept = [];
sandbox.UrlFetchApp = {
  fetch: () => {
    const p = fetchPlan[fetchCalls++];
    if (p instanceof Error) throw p;
    return { getResponseCode: () => p, getContentText: () => '{}' };
  },
};
sandbox.Utilities.sleep = ms => slept.push(ms);

let uiPlan = null, toasts = [];
sandbox.SpreadsheetApp = {
  getUi: () => {
    if (uiPlan === 'no-ui') throw new Error('UIコンテキストがありません');
    return { alert: () => uiPlan, ButtonSet: { YES_NO: 'YES_NO' }, Button: { YES: 'YES', NO: 'NO' } };
  },
  getActive: () => ({
    toast: (msg, title) => {
      if (uiPlan === 'toast-throws') throw new Error('toast失敗');
      toasts.push({ msg, title });
    },
  }),
};

const modSrc = f => fs.readFileSync(path.join(__dirname, '..', 'modules', f), 'utf8');
const build = (files, exports, extra) => new Function(...Object.keys(sandbox), `
${(extra || '')}
${files.map(modSrc).join('\n')}
return { ${exports.join(', ')} };
`)(...Object.values(sandbox));

const M = build(['BankCsvImport.js'], ['importBankCsvFiles_']);
const R = build(['FetchRetry.js'], ['fetchWithRetry_']);
// APP_NAME_ を定義した場合／しない場合の両方を作る（読み込み順に依存しないことの確認）
const C = build(['ConfirmUi.js'], ['confirmDestructive_', 'confirmAppName_'], "const APP_NAME_ = '酒田五法';");
const C0 = build(['ConfirmUi.js'], ['confirmDestructive_', 'confirmAppName_']);

/* ── アサーション ─────────────────────────────────────────────────────────── */

let pass = 0, fail = 0;
const eq = (a, b, label) => {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x === y) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + '\n     期待: ' + y + '\n     実際: ' + x); }
};

/* ── 呼び出し側の設定（実際の2案件と同じ形） ─────────────────────────────── */

// みずほ（Asset_Kyoko）相当: 日付は . 区切り、金額はカンマ入り、日付昇順に並べ替える
const MIZUHO_HEADER = ['日付', 'お引出し', 'お預入れ', '残高', 'お取引内容'];
const mizuhoOpts = sheet => ({
  sheet, destHeader: MIZUHO_HEADER, headerRow: 1,
  folderId: 'F', ruleKey: 'kyoko_mizuho', startKeyword: '日付',
  amountCols: ['お引出し', 'お預入れ', '残高'],
  keepFileOnEmptyMapping: true,
  rowKey: row => row.slice(0, 5).map(v => String(v).trim()).join('|'),
  cellValue: (name, val) => {
    if (name === '日付') return val ? val.replace(/\./g, '/') : '';
    if (['お引出し', 'お預入れ', '残高'].includes(name)) {
      if (!val) return '';
      const n = parseFloat(val.replace(/,/g, ''));
      return isNaN(n) ? '' : n;
    }
    return val;
  },
  sortRows: rows => rows.sort((a, b) =>
    new Date(String(a[0]).replace(/\//g, '-')) - new Date(String(b[0]).replace(/\//g, '-'))),
});

const mizuhoCsv = lines => ['口座番号,1234567', '', '日付,お引出し,お預入れ,残高,お取引内容'].concat(lines).join('\n');

/* ── テスト ───────────────────────────────────────────────────────────────── */

const reset = () => { folderFiles = []; ruleMatcher = () => true; logs.length = 0; };

console.log('\n【BankCsvImport】取込・重複除外・後片付け');
{
  reset();
  const sheet = new FakeSheet([MIZUHO_HEADER.slice()]);
  folderFiles = [fakeFile('mizuho1.csv', mizuhoCsv([
    '2026.07.03,,10000,150000,給与',
    '2026.07.01,3000,,140000,コンビニ',
  ]))];
  const r = M.importBankCsvFiles_(mizuhoOpts(sheet));
  eq([r.added, r.skipped, r.files], [2, 0, 1], '2行を追加・スキップ0・ファイル1件');
  eq(sheet.rows[1], ['2026/07/01', 3000, '', 140000, 'コンビニ'], '日付を / 区切りに直し、金額を数値化して追記する');
  eq(sheet.rows[2][0], '2026/07/03', '日付の昇順に並べ替えて追記する');
  eq(folderFiles[0].trashed, true, '取り込んだファイルはゴミ箱へ移す');
  eq(sheet.formats.filter(f => f.fmt === '#,##0').length, 6, '金額3列 × 2行に桁区切りを設定する');
  eq(sheet.formats.some(f => f.col === 1), false, '日付列には書式を設定しない（型付き列で落ちるため）');
}
{
  reset();
  const sheet = new FakeSheet([MIZUHO_HEADER.slice(), ['2026/07/01', 3000, '', 140000, 'コンビニ']]);
  folderFiles = [fakeFile('mizuho2.csv', mizuhoCsv([
    '2026.07.01,3000,,140000,コンビニ',
    '2026.07.05,,20000,160000,振込',
  ]))];
  const r = M.importBankCsvFiles_(mizuhoOpts(sheet));
  eq([r.added, r.skipped], [1, 1], 'シートに既にある行は追加せずスキップに数える');
  eq(sheet.getLastRow(), 3, '増えるのは新しい1行だけ');
}
{
  reset();
  const sheet = new FakeSheet([MIZUHO_HEADER.slice()]);
  const same = '2026.07.09,1000,,100000,同じ取引';
  folderFiles = [fakeFile('a.csv', mizuhoCsv([same])), fakeFile('b.csv', mizuhoCsv([same]))];
  const r = M.importBankCsvFiles_(mizuhoOpts(sheet));
  eq([r.added, r.skipped], [1, 1], '同じ取引が別ファイルに入っていても1回しか追加しない');
  eq(folderFiles.map(f => f.trashed), [true, true], '重複していた側のファイルもゴミ箱へ移す');
}
{
  reset();
  const sheet = new FakeSheet([MIZUHO_HEADER.slice()]);
  ruleMatcher = () => false;
  folderFiles = [fakeFile('other.csv', mizuhoCsv(['2026.07.09,1000,,100000,別案件']))];
  const r = M.importBankCsvFiles_(mizuhoOpts(sheet));
  eq([r.added, r.files], [0, 1], '対象外のCSVは取り込まない');
  eq(folderFiles[0].trashed, false, '対象外のファイルはゴミ箱へ移さない（他案件のCSVを消さない）');
}
{
  reset();
  const sheet = new FakeSheet([MIZUHO_HEADER.slice()]);
  folderFiles = [fakeFile('noheader.csv', '口座番号,1234567\n2026.07.09,1000,,100000,見出しなし')];
  const r = M.importBankCsvFiles_(mizuhoOpts(sheet));
  eq(r.added, 0, '明細開始行が見つからなければ取り込まない');
  eq(folderFiles[0].trashed, false, 'そのファイルも残す');
}
{
  // 列名が変わって対応付けに失敗した場合、原本を失わないよう残す
  reset();
  const sheet = new FakeSheet([MIZUHO_HEADER.slice()]);
  folderFiles = [fakeFile('renamed.csv',
    ['口座番号,1234567', '日付,引出,預入,残額,内容', '2026.07.09,1000,,100000,取引'].join('\n'))];
  const r = M.importBankCsvFiles_(mizuhoOpts(sheet));
  eq(r.added, 1, '日付列だけでも対応が取れれば取り込む');
  eq(sheet.rows[1], ['2026/07/09', '', '', '', ''], '対応の取れない列は空欄になる');

  const opts = mizuhoOpts(new FakeSheet([MIZUHO_HEADER.slice()]));
  opts.isDataRow = () => false;   // 全行がデータ行でない＝対応付けの失敗に相当
  reset();
  folderFiles = [fakeFile('broken.csv', mizuhoCsv(['2026.07.09,1000,,100000,取引']))];
  const r2 = M.importBankCsvFiles_(Object.assign(opts, { sheet: new FakeSheet([MIZUHO_HEADER.slice()]) }));
  eq(r2.added, 0, '1行も作れなければ追加しない');
  eq(folderFiles[0].trashed, false, 'keepFileOnEmptyMapping=true ならファイルを残す');
}
{
  // ゆうちょ（Asset_Yoshikuni）相当: 取引日は yyyymmdd の8桁、明細IDで重複判定、並べ替えなし
  reset();
  const HEADER = ['取引日', '入出金明細ＩＤ', '受入金額（円）', '払出金額（円）', '詳細１'];
  const sheet = new FakeSheet([HEADER.slice()]);
  folderFiles = [fakeFile('yucho.csv', [
    '口座番号,9876543', '取引日,入出金明細ＩＤ,受入金額（円）,払出金額（円）,詳細１',
    '20260703,ID002,10000,0,給与',
    '20260701,ID001,0,3000,引出',
    '2026,ID999,1,0,短い行',
  ].join('\n'))];
  const r = M.importBankCsvFiles_({
    sheet, destHeader: HEADER, headerRow: 1,
    folderId: 'F', ruleKey: 'yoshikuni', startKeyword: '取引日',
    amountCols: ['受入金額（円）', '払出金額（円）'],
    isDataRow: row => !!row[0] && row[0].length >= 8,
    rowKey: row => String(row[1] || '').trim() || row.join('|'),
    cellValue: (name, val) => {
      if (name === '取引日') return val.length === 8 ? val.slice(0, 4) + '-' + val.slice(4, 6) + '-' + val.slice(6, 8) : val;
      if (name.indexOf('金額') !== -1) {
        if (!val || val === '0') return '';
        const n = Number(val.replace(/[^0-9.-]/g, ''));
        return isNaN(n) ? '' : n;
      }
      return val;
    },
  });
  eq([r.added, r.skipped], [2, 0], '8桁の取引日を持つ行だけ取り込む（短い行は明細ではない）');
  eq(sheet.rows[1], ['2026-07-03', 'ID002', 10000, '', '給与'], '並べ替えを指定しなければCSVの順序を保つ');
  eq(sheet.rows[2][3], 3000, '払出金額が数値になる');
  eq(sheet.rows[2][2], '', '0円は空欄にする（呼び出し側の変換がそのまま効く）');
}
{
  reset();
  const sheet = new FakeSheet([MIZUHO_HEADER.slice()]);
  folderFiles = [
    fakeFile('bad.csv', mizuhoCsv(['2026.07.09,1000,,100000,取引'])),
    fakeFile('good.csv', mizuhoCsv(['2026.07.10,2000,,98000,取引2'])),
  ];
  folderFiles[0].getBlob = () => { throw new Error('読み取り失敗'); };
  const r = M.importBankCsvFiles_(mizuhoOpts(sheet));
  eq(r.added, 1, '1ファイルが壊れていても残りのファイルは取り込む');
  eq(folderFiles[0].trashed, false, '失敗したファイルはゴミ箱へ移さない');
  eq(logs.some(l => l.indexOf('ファイル処理エラー') === 0), true, 'エラーはログに残す');
}
{
  reset();
  const sheet = new FakeSheet([MIZUHO_HEADER.slice()]);
  const seen = [];
  const opts = Object.assign(mizuhoOpts(sheet), {
    onFileImported: (name, added, skipped) => seen.push([name, added, skipped]),
  });
  folderFiles = [fakeFile('log.csv', mizuhoCsv(['2026.07.11,500,,97500,取引']))];
  M.importBankCsvFiles_(opts);
  eq(seen, [['log.csv', 1, 0]], '取込履歴用のコールバックにファイル名・件数・スキップ数を渡す');
}
{
  reset();
  const sheet = new FakeSheet([MIZUHO_HEADER.slice()]);
  const r = M.importBankCsvFiles_(mizuhoOpts(sheet));
  eq([r.added, r.skipped, r.files], [0, 0, 0], 'フォルダが空でも例外にならない');
}

console.log('\n【FetchRetry】429・5xx・通信例外だけ再試行する');
{
  const run = (plan, cfg) => {
    fetchPlan = plan; fetchCalls = 0; slept = [];
    let out = null, err = null;
    try { out = R.fetchWithRetry_('u', {}, cfg); } catch (e) { err = e; }
    return { code: out && out.getResponseCode(), calls: fetchCalls, slept, err: err && err.message };
  };
  eq(run([200]), { code: 200, calls: 1, slept: [], err: null }, '200は即返し・待たない');
  eq(run([401]), { code: 401, calls: 1, slept: [], err: null }, '401は再試行しない（恒久エラー）');
  eq(run([404]), { code: 404, calls: 1, slept: [], err: null }, '404も再試行しない');
  eq(run([429, 200]), { code: 200, calls: 2, slept: [1500], err: null }, '429は再試行して回復する');
  eq(run([500, 503, 200]), { code: 200, calls: 3, slept: [1500, 3000], err: null }, '5xxは倍々で待って再試行する');
  eq(run([503, 503, 503]), { code: 503, calls: 3, slept: [1500, 3000], err: null },
    '再試行しきったら最後の応答を返す（呼び元がステータスを見る）');
  eq(run([new Error('timeout'), 200]), { code: 200, calls: 2, slept: [1500], err: null }, '通信例外からも回復する');
  eq(run([new Error('t1'), new Error('t2'), new Error('t3')]),
    { code: null, calls: 3, slept: [1500, 3000], err: 't3' }, '例外が続けば最後の例外を投げる');
  eq(run([429, 429, 429, 429, 200], { retry: 4, backoffMs: 100 }),
    { code: 200, calls: 5, slept: [100, 200, 400, 800], err: null }, '再試行回数と待ち時間は呼び出し側で変えられる');
  eq(run([429, 200], { retry: 0 }), { code: 429, calls: 1, slept: [], err: null }, 'retry:0 なら再試行しない');
}

console.log('\n【ConfirmUi】破壊的操作の確認');
{
  const run = (mod, plan) => { uiPlan = plan; toasts = []; return mod.confirmDestructive_('題', '本文'); };
  eq(run(C, 'YES'), true, 'はいを選べば続行する');
  eq(run(C, 'NO'), false, 'いいえを選べば中止する');
  eq(toasts, [{ msg: '操作をキャンセルしました', title: '酒田五法' }], 'キャンセル時はプロジェクト名でトーストを出す');
  eq(run(C, 'no-ui'), true, 'UIが無い（トリガー実行）ときは確認を求めず続行する');
  eq(toasts, [], 'そのときトーストも出さない');
  eq(run(C0, 'NO'), false, 'APP_NAME_ が未定義でも動く');
  eq(toasts, [{ msg: '操作をキャンセルしました', title: 'スクリプト' }], '未定義なら既定名を使う');
  eq(C.confirmAppName_(), '酒田五法', 'APP_NAME_ を定義していればその名前');
  eq(C0.confirmAppName_(), 'スクリプト', '未定義なら既定名');

  // トーストが落ちても「キャンセルしたのにエラー」にはしない（Sakata_Screener に無かった保護）
  uiPlan = 'toast-throws';
  let threw = false;
  try { eq(C.confirmDestructive_('題', '本文'), false, 'トーストが失敗しても false を返して中止する'); }
  catch (e) { threw = true; }
  eq(threw, false, 'トーストの失敗が呼び出し元へ例外として漏れない');
}

console.log('\n' + '─'.repeat(62));
console.log(fail === 0 ? `全 ${pass} 項目 合格` : `${pass} 合格 / ${fail} 失敗`);
process.exit(fail === 0 ? 0 : 1);
