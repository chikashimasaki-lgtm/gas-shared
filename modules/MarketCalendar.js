// ====================================================================
//  共通モジュール: 東証 営業日カレンダー
// ====================================================================
//  複数のGASプロジェクトで共有する単一ソース。編集はこのファイルだけで行い、
//  各プロジェクトの src/ にシンボリックリンク(MarketCalendar.js)して clasp push する。
//  リンク元: ~/projects/MarketCalendar.js
//  利用元  : Asset_Status, Sakata_Screener
// ====================================================================

// 東証の営業日か判定（JST基準）。
// 土日・年末年始(12/31, 1/1-1/3の東証休場)・日本の祝日を除外する。
// 祝日判定(カレンダー参照)に失敗した場合は営業日扱い(フェイルオープン)。
function isBusinessDay_(date) {
  const d   = date || new Date();
  const dow = Number(Utilities.formatDate(d, 'Asia/Tokyo', 'u')); // 1=月 … 6=土, 7=日
  if (dow >= 6) return false;

  const md = Utilities.formatDate(d, 'Asia/Tokyo', 'MMdd');
  if (md === '1231' || md === '0101' || md === '0102' || md === '0103') return false; // 年末年始 東証休場

  try {
    const cal = CalendarApp.getCalendarById('ja.japanese#holiday@group.v.calendar.google.com');
    if (cal && cal.getEventsForDay(d).length > 0) return false; // 日本の祝日
  } catch (e) { /* カレンダー参照不可時は営業日として続行 */ }

  return true;
}

// 東証の立会対象時間帯か判定（営業日かつ 9:00-17:00 JST の連続時間帯）。
function isMarketOpen_(date) {
  const d = date || new Date();
  if (!isBusinessDay_(d)) return false;
  const hm = Number(Utilities.formatDate(d, 'Asia/Tokyo', 'HHmm')); // 例 9:30 -> 930
  return hm >= 900 && hm <= 1700;
}
