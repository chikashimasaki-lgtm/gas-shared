// ====================================================================
//  共通モジュール: Gemini API呼び出し（監査系プロジェクト向け）
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの clasp rootDir にシンボリックリンク(GeminiClient.js)して push する。
//  リンク元: ~/projects/GeminiClient.js
//  利用元  : AuditPOC（FraudAuditPOC / RiskBasedPlanPOC は 2026-09-19 に廃止）
//            （AuditPOCから分離した際にCommon.jsごとコピペされ、3ファイルで
//            バイト単位の重複になっていたものを切り出した）
//
//  呼び出し側が用意する前提:
//    - 定数 GEMINI_URL（例 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent'）
//    - スクリプトプロパティ GEMINI_API_KEY
// ====================================================================

function callGemini_(systemText, contextParts, userPrompt, useJson) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY がスクリプトプロパティに未設定です。');

  const parts = [];
  contextParts.forEach(p => {
    if (p.text)             parts.push({ text: p.text });
    else if (p.inline_data) parts.push({ inline_data: p.inline_data });
  });
  parts.push({ text: userPrompt });

  const generationConfig = { temperature: 0.1, maxOutputTokens: 65536, topP: 0.8 };
  if (useJson) generationConfig.response_mime_type = 'application/json';

  const payload = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents:          [{ parts }],
    generationConfig,
  };

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res  = UrlFetchApp.fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload), muteHttpExceptions: true,
      });
      const json = JSON.parse(res.getContentText());

      if (json.candidates?.[0]?.content?.parts?.[0]?.text) {
        return json.candidates[0].content.parts[0].text;
      }

      const code = json.error?.code;
      const msg  = json.error?.message || JSON.stringify(json);

      if ((code === 503 || code === 429) && attempt < maxRetries) {
        const wait = code === 429 ? 60 : 30;
        Logger.log(`APIエラー ${code}。${wait}秒後にリトライ (${attempt}/${maxRetries}): ${msg}`);
        Utilities.sleep(wait * 1000);
        continue;
      }

      Logger.log('Gemini APIエラー: ' + msg);
      return null;
    } catch (e) {
      if (attempt < maxRetries) {
        Logger.log(`リクエストエラー。30秒後にリトライ (${attempt}/${maxRetries}): ${e.message}`);
        Utilities.sleep(30000);
        continue;
      }
      Logger.log('APIリクエストエラー: ' + e.message);
      return null;
    }
  }
  return null;
}

function setGeminiApiKey() {
  const ui = SpreadsheetApp.getUi();
  const current = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const masked  = current ? '設定済み（' + current.slice(0, 8) + '...）' : '未設定';

  const result = ui.prompt(
    'Gemini APIキーを設定',
    `現在の状態: ${masked}\n\nGemini APIキーを入力してください。\n（Google AI Studio: https://aistudio.google.com/apikey で取得）`,
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) return;

  const key = result.getResponseText().trim();
  if (!key) {
    ui.alert('エラー', 'APIキーが入力されていません。', ui.ButtonSet.OK);
    return;
  }

  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
  ui.alert('設定完了', 'Gemini APIキーを保存しました。', ui.ButtonSet.OK);
  Logger.log('GEMINI_API_KEY を設定しました。');
}
