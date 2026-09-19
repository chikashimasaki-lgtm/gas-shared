// ====================================================================
//  共通モジュール: Gemini APIキーの取得口
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの clasp rootDir にシンボリックリンク(GeminiKey.js)して push する。
//  リンク元: ~/projects/GeminiKey.js
//  利用元  : YouTubeDailyDigest
//            （他案件は従来の PropertiesService 直読みのまま。移行は案件ごとに任意）
//
//  鍵の探し方（上から順。最初に見つかったものを使う）:
//    1) スクリプトプロパティ GEMINI_API_KEY … 案件ごとの上書き。従来どおり。これがあれば何も変わらない
//    2) 共有ライブラリ GeminiSecrets（userSymbol）の getKey() … 全案件で1か所に鍵を置く
//    3) どちらも無ければ、標準の日本語エラーを投げる
//
//  ★ 鍵そのものは、このリポ（public）にも、各案件のリポにも置かない。
//    値の置き場は共有ライブラリ側（~/ObsidianVault/docs/specs/GeminiSecrets.md を参照）。
//  ★ ライブラリ側で PropertiesService を使っても、返るのは「呼び出し側」のプロパティ
//    （Script Properties は library と共有。公式 Libraries の shared resources 表）。
//    だからライブラリは値を自分のソースに持ち、getKey() で返す。
// ====================================================================

const GEMINI_KEY_ERROR_ = 'GEMINI_API_KEY が未設定です（スクリプトプロパティ、または共有ライブラリ GeminiSecrets に設定してください）';

/**
 * Gemini APIキーを返す。見つからなければ例外。
 * @return {string}
 */
function getGeminiApiKey_() {
  const own = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (own) return own;
  // typeof なら、ライブラリ未追加の案件でも ReferenceError にならない
  if (typeof GeminiSecrets !== 'undefined' && GeminiSecrets && typeof GeminiSecrets.getKey === 'function') {
    const shared = GeminiSecrets.getKey();
    if (shared) return shared;
  }
  throw new Error(GEMINI_KEY_ERROR_);
}

/**
 * 鍵が使える状態か（診断・使い方シート用）。値は返さない。
 * @return {{ok:boolean, source:string}} source: 'script-property' | 'shared-library' | 'none'
 */
function geminiKeySource_() {
  if (PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY')) return { ok: true, source: 'script-property' };
  try {
    if (typeof GeminiSecrets !== 'undefined' && GeminiSecrets && GeminiSecrets.getKey && GeminiSecrets.getKey()) return { ok: true, source: 'shared-library' };
  } catch (e) { /* ライブラリ呼び出しの失敗は none 扱い */ }
  return { ok: false, source: 'none' };
}
