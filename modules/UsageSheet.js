/**
 * 「使い方」シート共通ビルダー
 *
 * ~/projects/UsageSheet.js を単一ソースとし、各GASリポジトリへ symlink して共有する。
 * 修正したら symlink している全リポジトリで clasp push すること。
 *
 * 使い方:
 *   function createUsageSheet(ss) {
 *     if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
 *     UsageSheet.build(ss, 'アプリ名　使い方', ({ add, addEmpty, addSection, addHeader }) => {
 *       addSection('■ 概要');
 *       add('説明文');
 *       addEmpty();
 *       addHeader('列名', '説明');
 *       add('取引日', '取引日（yyyy/mm/dd 形式）');
 *     });
 *   }
 *
 * 呼び出し側はテキスト内容だけを渡す。シートの再作成・書式・列幅は本モジュールが持つ。
 */
const UsageSheet = {
  SHEET_NAME: '使い方',

  TITLE_BG:    '#1a1a2e',
  TITLE_FG:    '#ffffff',
  SECTION_FG:  '#2c5f8a',
  HEADER_BG:   '#d9e8f5',
  TIMESTAMP_FG: '#888888',

  DEFAULT_WIDTHS: [300, 420],

  /**
   * 同名シートが既にあれば削除する（再作成の前処理として build/buildDoc から共通利用）。
   *
   * @param {Spreadsheet} ss
   * @param {string} sheetName
   */
  _deleteIfExists(ss, sheetName) {
    const existing = ss.getSheetByName(sheetName);
    if (existing) ss.deleteSheet(existing);
  },

  /**
   * 「使い方」シートを削除して作り直す。
   *
   * @param {Spreadsheet} ss    対象スプレッドシート
   * @param {string} title      1行目に置くタイトル
   * @param {function} fn       { add, addEmpty, addSection, addHeader } を受け取り本文を組み立てる
   *                            add / addHeader は列数ぶんの可変長引数を取る
   * @param {Object} [options]
   * @param {number|string} [options.index=0] シートの挿入位置。'last' で末尾
   * @param {boolean} [options.timestamp=true] 2行目に「最終更新: ...」を入れるか
   * @param {string} [options.sheetName]      シート名を既定から変える場合
   * @param {number[]} [options.columnWidths] 列幅。要素数がそのまま列数になる
   * @return {Sheet} 作成したシート
   */
  build(ss, title, fn, options) {
    const opts      = options || {};
    const sheetName = opts.sheetName || this.SHEET_NAME;
    const withStamp = (opts.timestamp !== false);
    const widths    = opts.columnWidths || this.DEFAULT_WIDTHS;
    const nCols     = widths.length;

    this._deleteIfExists(ss, sheetName);

    // 挿入位置は既存シート削除後に決める（'last' を削除前に数えると範囲外になる）
    const index = (opts.index === 'last')     ? ss.getSheets().length
                : (opts.index === undefined)  ? 0
                : opts.index;
    const sheet = ss.insertSheet(sheetName, index);

    const rows        = [];
    const sectionRows = [];
    const headerRows  = [];

    // 列数に合わせて右を空文字で埋める（余った引数は捨てる）
    const pad = cells => {
      const r = [];
      for (let i = 0; i < nCols; i++) r.push(cells[i] === undefined || cells[i] === null ? '' : cells[i]);
      return r;
    };

    rows.push(pad([title]));
    if (withStamp) {
      rows.push(pad(['最終更新: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm')]));
    }

    fn({
      add:        (...cells) => rows.push(pad(cells)),
      addEmpty:   ()         => rows.push(pad([])),
      addSection: text       => { sectionRows.push(rows.length + 1); rows.push(pad([text])); },
      addHeader:  (...cells) => { headerRows.push(rows.length + 1);  rows.push(pad(cells)); },
    });

    sheet.getRange(1, 1, rows.length, nCols).setValues(rows);

    sheet.getRange(1, 1, 1, nCols)
      .setFontSize(14).setFontWeight('bold')
      .setBackground(this.TITLE_BG).setFontColor(this.TITLE_FG);
    sheet.setRowHeight(1, 36);
    if (withStamp) sheet.getRange(2, 1).setFontColor(this.TIMESTAMP_FG);

    sectionRows.forEach(r =>
      sheet.getRange(r, 1).setFontWeight('bold').setFontColor(this.SECTION_FG));
    headerRows.forEach(r =>
      sheet.getRange(r, 1, 1, nCols).setBackground(this.HEADER_BG).setFontWeight('bold'));

    widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
    sheet.setFrozenRows(1);
    // 列幅からはみ出す長文は折り返す（行高はSheetsが自動で伸ばす）
    sheet.getDataRange().setWrap(true);

    Logger.log('使い方シート作成完了');
    return sheet;
  },

  // ---- 1列ドキュメントレイアウト（buildDoc） ----
  DOC_COL_WIDTH: 760,
  DOC_TAB_COLOR: '#f4b400',
  DOC_TITLE_BG:  '#1a1e3a',
  DOC_H_FG:      '#1a3c6e',
  DOC_H_BG:      '#e7effb',
  DOC_NOTE_FG:   '#666666',
  DOC_CODE_BG:   '#f2f2f2',
  DOC_CODE_FG:   '#b3261e',

  /**
   * 1列の文書レイアウトで「使い方」シートを作り直す。
   * A列だけを使い、グリッド線を消して折り返し表示する読み物系のシート。
   * 2列のキー・バリュー表が欲しい場合は build() を使う。
   *
   * @param {Spreadsheet} ss           対象スプレッドシート
   * @param {string} sheetName         シート名
   * @param {Array<Array>} rows        [テキスト, 種別] の配列
   *                                   種別: title / h(見出し) / p(本文) / code / note
   * @param {Object} [options]
   * @param {string} [options.tabColor]     タブ色
   * @param {number} [options.columnWidth]  A列の幅
   * @param {boolean} [options.activate=true] 作成後にそのシートを表示するか
   * @return {Sheet} 作成したシート
   */
  buildDoc(ss, sheetName, rows, options) {
    const opts = options || {};

    this._deleteIfExists(ss, sheetName);
    const sh = ss.insertSheet(sheetName, 0);
    sh.setHiddenGridlines(true);
    sh.setColumnWidth(1, opts.columnWidth || this.DOC_COL_WIDTH);

    sh.getRange(1, 1, rows.length, 1).setValues(rows.map(r => [r[0]]));

    // 種別ごとに RangeList でまとめて書式を当てる（1行ずつ getRange すると API 呼び出しが行数分になる）
    const apply = (pred, fn) => {
      const a1 = rows.reduce((acc, r, i) => (pred(r[1]) ? acc.concat('A' + (i + 1)) : acc), []);
      if (a1.length) fn(sh.getRangeList(a1));
    };
    const is = kind => k => k === kind;

    apply(is('title'), rl => rl.setFontSize(16).setFontWeight('bold').setFontColor('#ffffff').setBackground(this.DOC_TITLE_BG));
    apply(is('h'),     rl => rl.setFontSize(12).setFontWeight('bold').setFontColor(this.DOC_H_FG).setBackground(this.DOC_H_BG));
    apply(is('code'),  rl => rl.setFontFamily('Consolas').setBackground(this.DOC_CODE_BG).setFontColor(this.DOC_CODE_FG));
    apply(is('note'),  rl => rl.setFontColor(this.DOC_NOTE_FG).setWrap(true));
    // title / h / code / note 以外（p や未知の種別）は折り返す。元実装の else 分岐と同じ挙動。
    apply(k => ['title', 'h', 'code', 'note'].indexOf(k) < 0, rl => rl.setWrap(true));

    rows.forEach((r, i) => {
      if (r[1] === 'title')  sh.setRowHeight(i + 1, 40);
      else if (r[1] === 'h') sh.setRowHeight(i + 1, 26);
    });

    sh.getRange(1, 1, rows.length, 1).setVerticalAlignment('middle');
    sh.setTabColor(opts.tabColor || this.DOC_TAB_COLOR);
    if (opts.activate !== false) ss.setActiveSheet(sh);

    Logger.log('使い方シート作成完了');
    return sh;
  },
};
