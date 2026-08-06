// ====================================================================
//  共通モジュール: MailRelay経由のメール送信
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの clasp rootDir にシンボリックリンク(MailSend.js)して push する。
//  リンク元: ~/projects/MailSend.js
//  利用元  : Abitus-Automation, Sakata_Screener
//
//  スクリプトプロパティ MAILRELAY_URL / MAIL_SECRET が設定されていれば
//  MailRelay（~/projects/MailRelay）のWebアプリ経由で送信する。
//  未設定時、またはMailRelayへの送信に失敗した場合は MailApp.sendEmail に
//  フォールバックする。
// ====================================================================

/**
 * @param {string} subject
 * @param {string} body
 * @param {string} [to] 省略時は実行ユーザー自身
 */
function sendMail_(subject, body, to) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('MAILRELAY_URL'), secret = props.getProperty('MAIL_SECRET');
  const recipient = to || Session.getEffectiveUser().getEmail();
  if (url && secret) {
    try {
      const res = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ secret: secret, to: recipient, subject: subject, body: body }),
      });
      if (res.getResponseCode() === 200 && /"ok"\s*:\s*true/.test(res.getContentText())) return;
    } catch (e) { /* フォールバックへ */ }
  }
  MailApp.sendEmail(recipient, subject, body);
}
