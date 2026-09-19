// ====================================================================
//  共通モジュール: 資料読み込み（URL/スプレッドシート/Doc/PDF → Geminiパーツ化）
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの clasp rootDir にシンボリックリンク(ResourceLoader.js)して push する。
//  リンク元: ~/projects/ResourceLoader.js
//  利用元  : AuditPOC（FraudAuditPOC は 2026-09-19 に廃止）
//            （AuditPOCから分離した際にCommon.jsごとコピペされ、2ファイルで
//            バイト単位の重複になっていたものを切り出した）
//
//  URL・Google Drive ID・Google Spreadsheet URL のいずれかを、Gemini の
//  contents.parts に渡せる形（{text}/{inline_data}の配列）に変換する。
// ====================================================================

function loadUrl_(url, label) {
  if (!url) return [];
  const lbl = label || url;
  try {
    const res  = UrlFetchApp.fetch(String(url).trim(), { muteHttpExceptions: true });
    const code = res.getResponseCode();
    if (code !== 200) {
      Logger.log(`URL取得失敗 (HTTP ${code}): ${url}`);
      return [];
    }
    const contentType = (res.getHeaders()['Content-Type'] || '').toLowerCase();
    if (contentType.includes('pdf') || String(url).toLowerCase().endsWith('.pdf')) {
      Logger.log(`${lbl}: PDF として取得`);
      return [{ inline_data: { mime_type: 'application/pdf', data: Utilities.base64Encode(res.getContent()) } }];
    }
    const text = res.getContentText()
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    Logger.log(`${lbl}: HTML として取得`);
    return [{ text: `【${lbl}】\n${text}` }];
  } catch (e) {
    Logger.log(`URL読み込みエラー (${url}): ${e.message}`);
    return [];
  }
}

function loadSpreadsheetObj_(ss, label) {
  const parts = [];
  ss.getSheets().forEach(sheet => {
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow === 0 || lastCol === 0) return;
    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const text = data.map(row => row.join('\t')).join('\n');
    if (text.trim()) parts.push({ text: `【${label} - ${sheet.getName()}】\n${text}` });
  });
  Logger.log(`Spreadsheet 読み込み: ${parts.length}シート (${label})`);
  return parts;
}

function loadDoc_(docId) {
  if (!docId) return [];
  let file, mime;
  try {
    file = DriveApp.getFileById(docId);
    mime = file.getMimeType();
  } catch (e) {
    Logger.log(`loadDoc_: ファイル取得失敗 (${docId}): ${e.message}`);
    return [];
  }
  try {
    if (mime === 'application/vnd.google-apps.spreadsheet') {
      return loadSpreadsheetObj_(SpreadsheetApp.openById(docId), docId);
    }
    if (mime === 'application/vnd.google-apps.document') {
      const text = DocumentApp.openById(docId).getBody().getText();
      return text.trim() ? [{ text }] : [];
    }
    if (mime === 'application/pdf') {
      return [{ inline_data: { mime_type: 'application/pdf', data: Utilities.base64Encode(file.getBlob().getBytes()) } }];
    }
    Logger.log(`loadDoc_: 非対応MIMEタイプ (${mime}) ID: ${docId}`);
  } catch (e) {
    Logger.log(`loadDoc_: 読み込みエラー (${docId}, ${mime}): ${e.message}`);
  }
  return [];
}

function loadResource_(value, label) {
  const v = value ? String(value).trim() : '';
  if (!v) return [];
  if (v.startsWith('http://') || v.startsWith('https://')) {
    const ssMatch = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (ssMatch) {
      Logger.log(`${label}: Google Spreadsheet URL から取得`);
      try { return loadSpreadsheetObj_(SpreadsheetApp.openById(ssMatch[1]), label); } catch (e) {
        Logger.log(`Spreadsheet URL 読み込みエラー: ${e.message}`);
        return [];
      }
    }
    return loadUrl_(v, label);
  }
  Logger.log(`${label}: Drive から取得`);
  return loadDoc_(v);
}
