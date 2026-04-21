// ─────────────────────────────────────────────────────────────
// 원격 자동공지 (Auto-Notice) 모듈
// ─────────────────────────────────────────────────────────────
// 구글스프레드시트를 주기적으로 CSV로 가져와서,
// A열에 적힌 간격(예: "5S", "5M", "1H")마다 B열의 내용을
// 자동으로 채팅에 전송한다.
//
// - 시트가 업데이트되면 일정 주기(기본 5분)마다 다시 읽어서
//   추가/변경/삭제된 공지를 자동으로 반영한다.
// - 봇이 실제로 실행 중(채팅 연결됨)일 때만 전송한다.
// - 최소 간격 5초(스팸 방지).
// ─────────────────────────────────────────────────────────────

const https = require('https');

// 공지용 구글시트 ID (사용자가 알려준 시트)
// https://docs.google.com/spreadsheets/d/1jk14DASPjlNZMIpixQUtZ2S6T1wnuyScjrrA27oDinU/edit
const NOTICE_SHEET_ID = '1jk14DASPjlNZMIpixQUtZ2S6T1wnuyScjrrA27oDinU';
const NOTICE_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${NOTICE_SHEET_ID}/export?format=csv`;

// 시트 재조회 주기 (5분)
const SHEET_REFRESH_MS = 5 * 60 * 1000;

// 최소 공지 전송 간격 (5초)
const MIN_NOTICE_INTERVAL_MS = 5 * 1000;

// ─── HTTPS GET (redirect 따라감) ───
function httpsGet(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const go = (u, depth) => {
      if (depth > maxRedirects) return reject(new Error('Too many redirects'));
      https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 SpoonBot' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, u).toString();
          return go(next, depth + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
      }).on('error', reject);
    };
    go(url, 0);
  });
}

// ─── 간단 CSV 파서 (큰따옴표 이스케이프 지원) ───
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
      else if (ch === '\r') { /* skip */ }
      else { field += ch; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// ─── 간격 표기 파싱 ───
// "5S" / "5s"     → 5000 (ms)
// "5M" / "5m"     → 300000
// "1H" / "1h"     → 3600000
// "30"            → 30000 (단위 생략 시 초)
// 잘못된 값 / 비어있음 → 0
function parseIntervalSpec(spec) {
  if (!spec) return 0;
  const s = String(spec).trim();
  if (!s) return 0;
  const m = s.match(/^(\d+)\s*([smh]?)$/i);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  if (!n || n <= 0) return 0;
  const unit = (m[2] || 's').toLowerCase();
  const mult = unit === 'h' ? 3600000 : unit === 'm' ? 60000 : 1000;
  return n * mult;
}

// ─── 시트에서 공지 목록 가져오기 ───
// A열: 간격 스펙 (5S / 5M / 1H / 숫자)
// B열: 공지 내용 (셀 안에서 Alt+Enter로 줄바꿈 가능, 또는 `\n` 리터럴도 줄바꿈으로 변환)
// C열: 이 공지를 받지 않을 대상 (쉼표 구분 · 하드키 / DJ닉@고유닉 / 고유닉 중 아무거나)
// 반환: [{ rowIndex, intervalSpec, intervalMs, text, excludes }]
async function fetchNotices() {
  const csv = await httpsGet(NOTICE_SHEET_CSV_URL);
  const rows = parseCSV(csv);
  const notices = [];
  rows.forEach((row, idx) => {
    const intervalSpec = String(row[0] || '').trim();
    let text = String(row[1] || '').trim();
    const excludeRaw = String(row[2] || '').trim();
    if (!intervalSpec || !text) return;

    let intervalMs = parseIntervalSpec(intervalSpec);
    if (!intervalMs) return;
    // 최소 5초 제한
    if (intervalMs < MIN_NOTICE_INTERVAL_MS) intervalMs = MIN_NOTICE_INTERVAL_MS;

    // "\n" 리터럴 → 실제 줄바꿈 (셀에서 Alt+Enter 못 쓸 때 편의 기능)
    text = text.replace(/\\n/g, '\n');

    // C열: 쉼표 구분 제외 대상 목록
    const excludes = excludeRaw
      ? excludeRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    notices.push({ rowIndex: idx + 1, intervalSpec, intervalMs, text, excludes });
  });
  return notices;
}

// ─── AutoNoticeManager 클래스 ───
class AutoNoticeManager {
  // options.onSend(text)        - 공지 전송 콜백 (실제 채팅 전송을 수행)
  // options.onLog(entry)        - 로그 콜백 (bot.html에 표시할 로그)
  // options.onStatus(list)      - 상태 갱신 콜백 (UI 표시용, 활성 공지 목록 전달)
  // options.isBotReady()        - 봇 전송 가능 여부 (채팅 연결 상태)
  // options.getLocalIdentity()  - 현재 사용자 정보 { djNick, uniqueTag, hardkey } - 제외 대상 판단용
  constructor(options = {}) {
    this.onSend = options.onSend || (() => {});
    this.onLog = options.onLog || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.isBotReady = options.isBotReady || (() => false);
    this.getLocalIdentity = options.getLocalIdentity || (() => null);

    this.timers = [];           // [{ rowIndex, intervalSpec, intervalMs, text, excludes, timerId, nextFireAt, lastSentAt }]
    this.refreshTimer = null;   // 시트 재조회 타이머
    this.started = false;
  }

  // 로컬 사용자가 특정 공지의 제외 대상인지 판단
  // excludes 목록과 다음 중 하나라도 일치하면 제외:
  //   - 하드키 전체
  //   - "DJ닉@고유닉" 결합 형태 (인증시트 A열 형식)
  //   - DJ닉 단독
  //   - 고유닉 단독 (@접두 유무 상관없음)
  isExcludedForMe(excludes) {
    if (!excludes || excludes.length === 0) return false;
    const local = this.getLocalIdentity() || {};
    const djNick = String(local.djNick || '').trim();
    const uniqueTag = String(local.uniqueTag || '').replace(/^@/, '').trim();
    const hardkey = String(local.hardkey || '').trim();

    const myIds = [
      hardkey,
      djNick && uniqueTag ? `${djNick}@${uniqueTag}` : null,
      uniqueTag || null,
      uniqueTag ? `@${uniqueTag}` : null,
      djNick || null,
    ].filter(Boolean).map(s => s.toLowerCase());

    const excludeSet = excludes
      .map(e => String(e).toLowerCase().replace(/^@/, '').trim())
      .filter(Boolean);

    // 비교 시 excludeSet 쪽도 @ 제거한 상태이므로, myIds 중 uniqueTag도 @없이 한 번 더 체크
    const myIdsClean = myIds.map(s => s.replace(/^@/, ''));
    return myIdsClean.some(id => excludeSet.includes(id));
  }

  start() {
    if (this.started) return;
    this.started = true;
    // 첫 로드 (실패해도 5분 뒤 재시도)
    this.refresh().catch(() => {});
    // 주기적 재조회
    this.refreshTimer = setInterval(() => {
      this.refresh().catch(() => {});
    }, SHEET_REFRESH_MS);
  }

  stop() {
    this.started = false;
    this.clearAllTimers();
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  clearAllTimers() {
    this.timers.forEach(t => {
      if (t.timerId) clearInterval(t.timerId);
    });
    this.timers = [];
  }

  // 수동 새로고침 (UI 버튼 등에서 호출)
  async refresh() {
    try {
      const notices = await fetchNotices();
      this.applyNotices(notices);
      this.onLog({
        type: 'system',
        author: '원격공지',
        text: `☁️ 시트에서 ${notices.length}개 공지를 불러왔습니다.`,
      });
      this.emitStatus();
      return { ok: true, count: notices.length };
    } catch (e) {
      this.onLog({
        type: 'system',
        author: '원격공지',
        text: `⚠️ 시트 조회 실패: ${e.message}`,
      });
      return { ok: false, error: e.message };
    }
  }

  // 새로 가져온 공지 목록을 현재 타이머 상태와 비교하여 갱신
  applyNotices(notices) {
    // 공지 식별 키: rowIndex 기준 (간격/내용/제외목록 중 하나라도 바뀌면 재등록)
    const nextByRow = new Map();
    notices.forEach(n => nextByRow.set(n.rowIndex, n));

    const currByRow = new Map();
    this.timers.forEach(t => currByRow.set(t.rowIndex, t));

    // 1) 제거된 행
    for (const [rowIndex, curr] of currByRow) {
      if (!nextByRow.has(rowIndex)) {
        if (curr.timerId) clearInterval(curr.timerId);
      }
    }

    // 2) 유지 또는 변경/추가
    const newTimers = [];
    for (const n of notices) {
      const curr = currByRow.get(n.rowIndex);
      const sameExcludes = curr && Array.isArray(curr.excludes)
        && curr.excludes.length === (n.excludes || []).length
        && curr.excludes.every((v, i) => v === n.excludes[i]);
      // 간격 + 내용 + 제외목록 모두 같으면 기존 타이머 유지
      if (curr && curr.intervalMs === n.intervalMs && curr.text === n.text && sameExcludes) {
        newTimers.push(curr);
        continue;
      }
      // 변경된 경우 기존 타이머 제거 후 재등록
      if (curr && curr.timerId) clearInterval(curr.timerId);
      const entry = {
        rowIndex: n.rowIndex,
        intervalSpec: n.intervalSpec,
        intervalMs: n.intervalMs,
        text: n.text,
        excludes: n.excludes || [],
        timerId: null,
        nextFireAt: Date.now() + n.intervalMs,
        lastSentAt: 0,
      };
      entry.timerId = setInterval(() => this.fireNotice(entry), n.intervalMs);
      newTimers.push(entry);
    }
    this.timers = newTimers;
  }

  // 한 공지를 실제로 전송
  fireNotice(entry) {
    entry.nextFireAt = Date.now() + entry.intervalMs;
    // 봇이 실행 중이 아니면 스킵 (타이머는 계속 돌림 - 실행되는 즉시 보내기 위함)
    if (!this.isBotReady()) {
      return;
    }
    // 내가 이 공지의 제외 대상이면 스킵
    if (this.isExcludedForMe(entry.excludes)) {
      return;
    }
    try {
      this.onSend(entry.text);
      entry.lastSentAt = Date.now();
      this.emitStatus();
    } catch (e) {
      this.onLog({
        type: 'system',
        author: '원격공지',
        text: `⚠️ 공지 전송 실패: ${e.message}`,
      });
    }
  }

  // UI가 필요한 최소 정보만 직렬화
  getStatus() {
    return this.timers.map(t => ({
      rowIndex: t.rowIndex,
      intervalSpec: t.intervalSpec,
      intervalMs: t.intervalMs,
      text: t.text,
      excludes: t.excludes || [],
      excludedForMe: this.isExcludedForMe(t.excludes || []),
      nextFireAt: t.nextFireAt,
      lastSentAt: t.lastSentAt,
    }));
  }

  emitStatus() {
    try { this.onStatus(this.getStatus()); } catch (e) {}
  }
}

module.exports = { AutoNoticeManager, NOTICE_SHEET_ID };
