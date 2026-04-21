
const ipc = window.ipc || {
  on: () => {},
  send: () => {},
  removeAllListeners: () => {}
}

// ── 탭 전환 ──────────────────────────────────────────────────
let rouletteHistory = {}; // init()에서 파일로부터 로드
let selectedHistoryUser = null;

function showTab(tabId) {
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.getAttribute('data-tab') === tabId) el.classList.add('active');
    else el.classList.remove('active');
  });

  // tab-activity는 content-scroll 밖에 있으므로 별도 처리
  const activityTab = document.getElementById('tab-activity');

  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  const targetTab = document.getElementById('tab-' + tabId);
  if (targetTab) targetTab.classList.add('active');

  // 애청지수 탭: absolute로 main 전체를 덮음
  if (activityTab) activityTab.style.display = (tabId === 'activity') ? 'flex' : 'none';

  // TTS 탭도 동일하게 처리
  const ttsTab = document.getElementById('tab-tts');
  if (ttsTab) ttsTab.style.display = (tabId === 'tts') ? 'flex' : 'none';

  const sfTab = document.getElementById('tab-sticker-frame');
  if (sfTab) sfTab.style.display = (tabId === 'sticker-frame') ? 'flex' : 'none';
  if (tabId === 'sticker-frame') sfInit();

  // 룰렛기록 탭일 때 content-scroll 패딩 제거
  const scrollEl = document.querySelector('.content-scroll');
  if (scrollEl) {
    if (tabId === 'roulette-history') {
      scrollEl.style.padding = '0';
      scrollEl.style.gap = '0';
      scrollEl.style.overflow = 'hidden';
    } else {
      scrollEl.style.padding = '';
      scrollEl.style.gap = '';
      scrollEl.style.overflow = '';
    }
  }
  
  const titles = { 
    dashboard:'대시보드', 
    'auto-settings':'입장 및 자동 메시지 설정',
    commands:'커맨드 관리', 
    hotkeys:'단축키 명령어', 
    joinmsg:'지정 인사', 
    log:'채팅 로그', 
    token:'토큰 상태',
    funding:'펀딩 관리',
    shield:'실드 관리',
    songs:'신청곡 관리',
    'sticker-sound':'스티커음향',
    roulette:'룰렛 설정',
    'roulette-history':'룰렛 기록',
    'misc':'기타 모듈',
    'activity':'애청지수',
    'tts':'TTS 설정',
    'sticker-frame':'박제스티커',
    'menu-manager':'메뉴 이미지 관리'
  }
  document.getElementById('tabTitle').textContent = titles[tabId]
  
  if (tabId === 'roulette-history') renderRouletteHistory();
  if (tabId === 'roulette') renderRouletteTabs();
  if (tabId === 'dashboard') renderDashboard();
  if (tabId === 'activity') { actRenderList(); if (actSelectedUser) actRenderDetail(actSelectedUser); }
  if (tabId === 'tts') { ttsRenderUserList(); }
  if (tabId === 'sticker-sound') { renderStickerSoundList(); }
  if (tabId === 'menu-manager') { renderMenuManager(); }
}

function renderRouletteHistory() {
  const userListEl = document.getElementById('historyUserList');
  if (!userListEl) return;
  
  const tags = Object.keys(rouletteHistory).sort();
  
  if (tags.length === 0) {
    userListEl.innerHTML = '<div style="text-align:center; padding: 20px; color: #94a3b8; font-size: 12px;">기록된 데이터가 없습니다.</div>';
    return;
  }

  userListEl.innerHTML = tags.map(tag => {
    const data = rouletteHistory[tag];
    const nickname = data._nickname || '알 수 없음';
    const imgUrl = data._imgUrl || '';
    const avatarHtml = imgUrl
      ? `<img src="${imgUrl}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"><span style="display:none; width:36px; height:36px; background:#e2e8f0; border-radius:50%; align-items:center; justify-content:center; font-size:18px;">👤</span>`
      : `<span style="width:36px; height:36px; background:#e2e8f0; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:18px;">👤</span>`;
    return `
      <div class="history-user-item ${selectedHistoryUser === tag ? 'active' : ''}" onclick="selectHistoryUser('${tag}')">
        <div class="history-user-avatar" style="position:relative;">${avatarHtml}</div>
        <div class="history-user-info">
          <div class="history-user-name">${nickname}</div>
          <div class="history-user-id">${tag}</div>
        </div>
        <button style="background:none; border:none; color:#94a3b8; cursor:pointer;" onclick="event.stopPropagation(); deleteUserHistory('${tag}')">🗑️</button>
      </div>
    `;
  }).join('');

  if (selectedHistoryUser) renderUserDetail(selectedHistoryUser);
}

function selectHistoryUser(tag) {
  selectedHistoryUser = tag;
  renderRouletteHistory();
}

function renderUserDetail(tag) {
  const mainEl = document.getElementById('historyMain');
  if (!mainEl) return;
  
  const data = rouletteHistory[tag];
  if (!data) {
    mainEl.innerHTML = '<div style="text-align: center; padding: 100px; color: #94a3b8;">기록이 없습니다.</div>';
    return;
  }

  const nickname = data._nickname || '알 수 없음';

  let html = `
    <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
      <h2 style="font-size: 18px; font-weight: 800; color: #1e293b;">👤 ${nickname} 님의 기록 <span style="font-size:12px; color:#94a3b8; font-weight:400;">(${tag})</span></h2>
      <button onclick="showCouponModal('${tag}')" style="padding: 8px 14px; border: none; border-radius: 8px; background: linear-gradient(135deg, #7c3aed, #ec4899); color: #fff; cursor: pointer; font-size: 12px; font-weight: 700; box-shadow: 0 2px 6px rgba(124, 58, 237, 0.25);">🎡 룰렛권 관리</button>
    </div>
  `;
  
  // 2. 킵목록 렌더링
  const keepData = data['킵목록'] || {};
  html += `
    <div class="history-section-title" style="color: #ec4899;">📝 2. 킵목록 <button class="history-btn" style="margin-left:auto; border-radius:50%; background:#7c3aed; color:#fff; border:none;" onclick="showAddKeepItemModal('${tag}')">+</button></div>
    <div style="background:#fff; border-radius:12px; padding: 10px; border: 1px solid #eef0f5;">
  `;
  
  if (Object.keys(keepData).length === 0) {
    html += `<div style="text-align:center; padding: 20px; color:#94a3b8; font-size:12px;">기록된 항목이 없습니다.</div>`;
  } else {
    Object.entries(keepData).forEach(([itemName, count]) => {
      html += `
        <div class="history-item-row" style="padding: 8px 15px; border-bottom: 1px solid #f8f9fd;">
          <div class="history-item-name">${itemName}</div>
          <div class="history-item-count">
            <div class="history-btn-group">
              <button class="history-btn" onclick="updateHistoryCount('${tag}', '킵목록', '${itemName}', -1)">-</button>
              <div class="history-count-badge">${count}</div>
              <button class="history-btn" onclick="updateHistoryCount('${tag}', '킵목록', '${itemName}', 1)">+</button>
            </div>
            <div class="history-btn-group">
              <button class="history-btn" style="color:#ef4444;" onclick="deleteHistoryItem('${tag}', '킵목록', '${itemName}')">🗑️</button>
            </div>
          </div>
        </div>
      `;
    });
  }
  html += `</div>`;

  const sections = [
    { title: '3. 기타목록', color: '#10b981' },
    { title: '4. 이벤트목록', color: '#06b6d4' }
  ];
  
  sections.forEach(sec => {
    html += `
      <div class="history-section-title" style="color: ${sec.color};">📝 ${sec.title} <button class="history-btn" style="margin-left:auto; border-radius:50%; background:#7c3aed; color:#fff; border:none;">+</button></div>
      <div style="background:#fff; border-radius:12px; padding: 20px; border: 1px solid #eef0f5; text-align:center; color:#94a3b8; font-size:12px;">
        기록된 항목이 없습니다.
      </div>
    `;
  });

  mainEl.innerHTML = html;
}

function updateHistoryCount(tag, roulette, item, delta) {
  if (rouletteHistory[tag] && rouletteHistory[tag][roulette]) {
    rouletteHistory[tag][roulette][item] = (rouletteHistory[tag][roulette][item] || 0) + delta;
    if (rouletteHistory[tag][roulette][item] < 0) rouletteHistory[tag][roulette][item] = 0;
    saveRouletteHistory();
    renderUserDetail(tag);
  }
}

function deleteHistoryItem(tag, roulette, item) {
  if (confirm('이 항목을 삭제하시겠습니까?')) {
    delete rouletteHistory[tag][roulette][item];
    if (Object.keys(rouletteHistory[tag][roulette]).length === 0) delete rouletteHistory[tag][roulette];
    if (Object.keys(rouletteHistory[tag]).length === 0) delete rouletteHistory[tag];
    saveRouletteHistory();
    renderRouletteHistory();
  }
}

function deleteUserHistory(tag) {
  if (confirm(`해당 시청자의 모든 기록을 삭제하시겠습니까?`)) {
    delete rouletteHistory[tag];
    if (selectedHistoryUser === tag) selectedHistoryUser = null;
    saveRouletteHistory();
    renderRouletteHistory();
  }
}

function clearAllHistory() {
  if (confirm('모든 시청자의 룰렛 기록을 삭제하시겠습니까?')) {
    rouletteHistory = {};
    selectedHistoryUser = null;
    saveRouletteHistory();
    renderRouletteHistory();
  }
}

function searchHistoryUser(query) {
  const items = document.querySelectorAll('.history-user-item');
  items.forEach(item => {
    const name = item.querySelector('.history-user-name').textContent;
    item.style.display = name.includes(query) ? 'flex' : 'none';
  });
}

function saveRouletteHistory() {
  if (window.store) {
    window.store.set('roulette_history.json', rouletteHistory);
  } else {
    localStorage.setItem('spoon_roulette_history', JSON.stringify(rouletteHistory));
  }
}

async function refreshRouletteHistory() {
  if (window.store) {
    rouletteHistory = (await window.store.get('roulette_history.json')) || {};
  } else {
    rouletteHistory = JSON.parse(localStorage.getItem('spoon_roulette_history') || '{}');
  }
  renderRouletteHistory();
}

function showSubTab(subTabId) {
  document.querySelectorAll('.sub-tab').forEach(el => el.classList.remove('active'))
  if (window.event) window.event.currentTarget.classList.add('active')
  
  document.querySelectorAll('.sub-tab-content').forEach(el => el.classList.remove('active'))
  const targetSubTab = document.getElementById('sub-tab-' + subTabId)
  if (targetSubTab) targetSubTab.classList.add('active')
}

// ── 상태 ──────────────────────────────────────────────────────
let commands = JSON.parse(localStorage.getItem('spoon_cmds') || 'null') || [
  { trigger:'!실드',   response:'🛡️ 현재 실드는 {횟수}번 입니다!',      cooldown:10 },
  { trigger:'!안녕',   response:'@{유저} 안녕하세요~ 반가워요 😊',        cooldown:5  },
]
let hotkeys = JSON.parse(localStorage.getItem('spoon_hotkeys') || 'null') || [
  { trigger:'!방가',   response:'반가워요! 어서오세요~' },
]
let joinMsgs = JSON.parse(localStorage.getItem('spoon_joinmsgs') || 'null') || [
  { tag:'sum', response:'@{유저}님, 어서오세요! 기다리고 있었습니다. ✨' },
]

// 자동 메시지 설정 (입장, 좋아요, 선물, 반복)
let autoSettings = JSON.parse(localStorage.getItem('spoon_auto_settings') || 'null') || {
  join:   [{ text: '{nickname}님 반가워요! ❤️', delay: 1, enabled: true }],
  like:   [{ text: '{nickname}님 좋아요 감사합니다! ❤️', delay: 0, enabled: true }],
  gift:   [{ text: '{nickname}님 {amount}스푼 선물 감사합니다! 🎁', delay: 0, enabled: true }],
  repeat: [{ text: '방송이 즐거우시다면 좋아요 한 번씩 부탁드려요! 😊', delay: 600, enabled: true }]
}
// 기존 데이터에 enabled 없으면 true로 보정
;['join','like','gift','repeat'].forEach(t => {
  if (autoSettings[t]) autoSettings[t].forEach(item => { if (item.enabled === undefined) item.enabled = true; });
});

let fundings = JSON.parse(localStorage.getItem('spoon_fundings') || '[]')
let fundingOptions = JSON.parse(localStorage.getItem('spoon_funding_options') || '{"showPercent":true,"showDday":true,"customCmd":"!펀딩","customHeader":"🪙 진행중인 {month}월 펀딩 🪙","customFormat":"{index}. {title}\\n💰{current}/{goal} [{percent} {dday}]"}')
let shieldCount = parseInt(localStorage.getItem('spoon_shield_count') || '0')
let shieldOptions = JSON.parse(localStorage.getItem('spoon_shield_options') || '{"customCmd":"!실드", "format":"🛡️ 현재 보유 중인 실드는 {실드}개 입니다!", "updateFormat":"{icon} 실드 {action} 완료!\\n현재 실드: {실드}개"}')
// ── 대시보드 데이터 ──
let dashData = {
  spoonLog: JSON.parse(localStorage.getItem('spoon_dash_log') || '{}'), // { 'YYYY-MM-DD': spoonAmount }
  heartLog: JSON.parse(localStorage.getItem('spoon_heart_log') || '{}'), // { tag: { nickname, count } }
  spoonRanking: JSON.parse(localStorage.getItem('spoon_spoon_ranking') || '{}'), // { tag: { nickname, total } }
};
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed

function saveDashData() {
  localStorage.setItem('spoon_dash_log', JSON.stringify(dashData.spoonLog));
  localStorage.setItem('spoon_heart_log', JSON.stringify(dashData.heartLog));
  localStorage.setItem('spoon_spoon_ranking', JSON.stringify(dashData.spoonRanking));
}

async function dashScanRank() {
  const status = document.getElementById('rankScanStatus');
  const originalText = status.textContent;
  status.textContent = '[스캔 중...]';
  status.style.color = '#f59e0b';
  
  try {
    const result = await window.ipc.invoke('rank:scan');
    if (result.success) {
      status.textContent = '[스캔 완료]';
      status.style.color = '#3b82f6';
      setTimeout(() => {
        status.textContent = '[데이터 갱신]';
        status.style.color = '#16a34a';
      }, 3000);
    } else {
      alert('스캔 실패: ' + result.error);
      status.textContent = originalText;
      status.style.color = '#ef4444';
    }
  } catch (e) {
    alert('오류 발생: ' + e.message);
    status.textContent = originalText;
  }
}

async function dashSetAutoJoin() {
  const tag = document.getElementById('dashRankInput').value.trim();
  if (!tag) {
    alert('고유닉을 입력해주세요.');
    return;
  }
  
  // 1. 자동 접속 대상으로 등록
  window.ipc.send('bot:set-auto-join', tag);
  document.getElementById('autoJoinStatus').style.display = 'block';
  document.getElementById('autoJoinTagText').textContent = '@' + tag;
  localStorage.setItem('spoon_auto_join_tag', tag);
  
  // 2. 랭킹 정보 자동 업데이트 (dashCheckRank 로직 통합)
  const res = document.getElementById('dashRankResult');
  const btn = document.getElementById('btnDashAutoJoin');
  const status = document.getElementById('rankScanStatus');
  
  res.textContent = '랭킹 확인 중...';
  btn.disabled = true;
  
  try {
    let result = await window.ipc.invoke('rank:search', tag);
    
    // 데이터가 없거나 오래되었으면 자동 스캔
    if (!result.success) {
      res.textContent = '데이터 스캔 중... (최대 1분 소요)';
      status.textContent = '[스캔 중...]';
      status.style.color = '#f59e0b';
      
      const scanResult = await window.ipc.invoke('rank:scan');
      if (scanResult.success) {
        result = await window.ipc.invoke('rank:search', tag);
        status.textContent = '[스캔 완료]';
        status.style.color = '#3b82f6';
        setTimeout(() => {
          status.textContent = '[데이터 갱신]';
          status.style.color = '#16a34a';
        }, 2000);
      }
    }
    
    if (result.success) {
      const d = result.data;
      let text = `👤 ${d.nickname}\n`;
      text += `✨ 초이스: ${d.ranks.next_choice || '-'}위 | ❤️ 좋아요: ${d.ranks.free_like || '-'}위 | ⏱️ 시간: ${d.ranks.live_time || '-'}위`;
      res.textContent = text;
    } else {
      res.textContent = '랭킹 정보를 찾을 수 없습니다.';
    }
  } catch (e) {
    res.textContent = '랭킹 업데이트 실패';
  } finally {
    btn.disabled = false;
  }
  
  // alert('@' + tag + ' 방송으로 자동 접속 및 랭킹 업데이트가 설정되었습니다.');
}

async function dashCheckRank() {
  const tag = document.getElementById('dashRankInput').value.trim();
  if (!tag) return;
  
  const res = document.getElementById('dashRankResult');
  const btn = document.getElementById('btnDashRankSearch');
  const status = document.getElementById('rankScanStatus');
  
  res.textContent = '조회 중...';
  btn.disabled = true;
  
  try {
    // 먼저 조회 시도
    let result = await window.ipc.invoke('rank:search', tag);
    
    // 데이터가 없으면 자동 스캔
    if (!result.success && result.error && result.error.includes('먼저')) {
      res.textContent = '데이터 스캔 중... (최대 1분 소요)';
      status.textContent = '[스캔 중...]';
      status.style.color = '#f59e0b';
      
      const scanResult = await window.ipc.invoke('rank:scan');
      if (!scanResult.success) {
        res.textContent = '스캔 실패: ' + scanResult.error;
        status.textContent = '[데이터 스캔]';
        status.style.color = '#16a34a';
        btn.disabled = false;
        return;
      }
      
      // 스캔 완료 후 다시 조회
      result = await window.ipc.invoke('rank:search', tag);
      status.textContent = '[스캔 완료]';
      status.style.color = '#3b82f6';
      setTimeout(() => {
        status.textContent = '[데이터 갱신]';
        status.style.color = '#16a34a';
      }, 2000);
    }
    
    // 결과 표시
    if (result.success) {
      const d = result.data;
      let text = `👤 ${d.nickname}\n`;
      text += `✨ 초이스: ${d.ranks.next_choice || '-'}위\n`;
      text += `❤️ 좋아요: ${d.ranks.free_like || '-'}위\n`;
      text += `⏱️ 시간: ${d.ranks.live_time || '-'}위`;
      res.textContent = text;
      
      // 자동 접속 설정
      window.ipc.send('bot:set-auto-join', tag);
      document.getElementById('autoJoinStatus').style.display = 'block';
      document.getElementById('autoJoinTagText').textContent = '@' + tag;
      localStorage.setItem('spoon_auto_join_tag', tag);
    } else {
      res.textContent = result.error;
    }
  } catch (e) {
    res.textContent = '오류 발생: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

function renderDashboard() {
  // 실드
  const shieldEl = document.getElementById('dashShield');
  if (shieldEl) shieldEl.textContent = shieldCount.toLocaleString('ko-KR');

  // 이달의 스푼수
  const ym = `${calYear}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  let monthTotal = 0;
  Object.entries(dashData.spoonLog).forEach(([date, amt]) => {
    if (date.startsWith(ym)) monthTotal += (amt || 0);
  });
  const msEl = document.getElementById('dashMonthSpoon');
  if (msEl) msEl.textContent = monthTotal;

  // 오늘의 MVP (오늘 날짜 기준 스푼 최다 기증자)
  const today = new Date().toISOString().slice(0,10);
  const todayMvp = dashData.spoonRanking._todayLog || {};
  const todaySorted = Object.entries(todayMvp).sort((a,b)=>b[1].total-a[1].total);
  const mvpNameEl = document.getElementById('dashMvpName');
  const mvpSpoonEl = document.getElementById('dashMvpSpoon');
  if (mvpNameEl && mvpSpoonEl) {
    if (todaySorted.length > 0) {
      mvpNameEl.textContent = todaySorted[0][1].nickname || todaySorted[0][0];
      mvpSpoonEl.textContent = todaySorted[0][1].total + ' 스푼';
    } else {
      mvpNameEl.textContent = '데이터 없음';
      mvpSpoonEl.textContent = '0 스푼';
    }
  }

  // 스푼 랭킹 상위 5
  const rankListEl = document.getElementById('dashRankList');
  const rankEmptyEl = document.getElementById('dashRankEmpty');
  if (rankListEl) {
    const sorted = Object.entries(dashData.spoonRanking)
      .filter(([k]) => k !== '_todayLog')
      .sort((a,b) => b[1].total - a[1].total).slice(0,5);
    if (sorted.length === 0) {
      rankListEl.innerHTML = '';
      if (rankEmptyEl) rankEmptyEl.style.display = '';
    } else {
      if (rankEmptyEl) rankEmptyEl.style.display = 'none';
      rankListEl.innerHTML = sorted.map(([tag, d], i) =>
        `<span style="color:#94a3b8;">${i+1}</span><span style="font-weight:600;">${d.nickname||tag}</span><span style="color:#f97316;font-weight:700;">${d.total}</span>`
      ).join('');
    }
  }

  // 하트 상위 5
  const heartListEl = document.getElementById('dashHeartList');
  const heartEmptyEl = document.getElementById('dashHeartEmpty');
  if (heartListEl) {
    const sorted = Object.entries(dashData.heartLog).sort((a,b)=>b[1].count-a[1].count).slice(0,5);
    if (sorted.length === 0) {
      heartListEl.innerHTML = '';
      if (heartEmptyEl) heartEmptyEl.style.display = '';
    } else {
      if (heartEmptyEl) heartEmptyEl.style.display = 'none';
      heartListEl.innerHTML = sorted.map(([tag, d], i) =>
        `<span style="color:#94a3b8;">${i+1}</span><span style="font-weight:600;">${d.nickname||tag}</span><span style="color:#ef4444;font-weight:700;">${d.count}</span>`
      ).join('');
    }
  }

  // 펀딩
  const fundingListEl = document.getElementById('dashFundingList');
  const fundingEmptyEl = document.getElementById('dashFundingEmpty');
  if (fundingListEl) {
    const active = fundings.filter(f => f.title);
    if (active.length === 0) {
      fundingListEl.innerHTML = '';
      if (fundingEmptyEl) fundingEmptyEl.style.display = '';
    } else {
      if (fundingEmptyEl) fundingEmptyEl.style.display = 'none';
      fundingListEl.innerHTML = active.map(f => {
        const pct = f.goal > 0 ? Math.round(f.current/f.goal*100) : 0;
        return `<div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span style="font-weight:600;">${f.title}</span>
            <span style="color:#6366f1;font-weight:700;">${pct}%</span>
          </div>
          <div style="background:#f1f5f9;border-radius:4px;height:6px;">
            <div style="background:#6366f1;width:${Math.min(pct,100)}%;height:100%;border-radius:4px;"></div>
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">💰 ${f.current}/${f.goal}</div>
        </div>`;
      }).join('');
    }
  }

  renderCalendar();
}

function calMove(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

function renderCalendar() {
  const titleEl = document.getElementById('calTitle');
  const gridEl = document.getElementById('calGrid');
  if (!titleEl || !gridEl) return;
  titleEl.textContent = `${calYear}년 ${calMonth+1}월`;

  const today = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();

  let cells = '';
  // 빈 칸
  for (let i = 0; i < firstDay; i++) {
    const prevDays = new Date(calYear, calMonth, 0).getDate();
    cells += `<div style="padding:4px 2px;background:#f8fafc;border-radius:6px;min-height:52px;"><span style="font-size:11px;color:#cbd5e1;">${prevDays - firstDay + i + 1}</span></div>`;
  }
  // 날짜 셀
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const amt = dashData.spoonLog[dateStr] || 0;
    const isToday = today.getFullYear()===calYear && today.getMonth()===calMonth && today.getDate()===d;
    const dow = new Date(calYear, calMonth, d).getDay();
    const dayColor = dow===0 ? '#ef4444' : dow===6 ? '#f97316' : '#374151';
    const bg = isToday ? '#fff8f0' : '#fff';
    const border = isToday ? '2px solid #f97316' : '1px solid #f1f5f9';
    cells += `<div style="padding:5px 4px;background:${bg};border:${border};border-radius:6px;min-height:52px;position:relative;">
      <div style="font-size:11px;color:${dayColor};font-weight:${isToday?'800':'500'};">${d}</div>
      ${amt > 0 ? `<div style="font-size:12px;font-weight:700;color:#f97316;margin-top:2px;">${amt}</div><div style="font-size:10px;color:#94a3b8;">스푼</div>` : ''}
    </div>`;
  }
  gridEl.innerHTML = cells;
}

let miscSettings = JSON.parse(localStorage.getItem('spoon_misc_settings') || '{}');
miscSettings = Object.assign({
  diceCmd: '!주사위',
  diceMsg: '🎲 {user}님의 주사위: {result}!',
  timerCmd: '!리액션',
  timerSetMsg: '⏱️ {min}분 후 알림: {content}',
  timerAlertMsg: '🔔 {content} 시간이 됐습니다!',
  ddayCmd: '!디데이',
  ddaySetMsg: '📅 디데이 등록: {content} ({date})',
  ddays: []
}, miscSettings);

let activeTimers = []; // 실행 중인 타이머 목록 [{id, min, content, endsAt, timeout}]

async function playTimerSound() {
  try {
    let src;
    if (window.sound) {
      const filePath = await window.sound.getPath('correct.mp3');
      src = 'file://' + filePath.replace(/\\/g, '/');
    } else {
      src = 'correct.mp3';
    }
    const audio1 = new Audio(src);
    await audio1.play();
    audio1.onended = () => {
      const audio2 = new Audio(src);
      audio2.play().catch(e => console.warn('사운드 2번째 재생 실패:', e));
    };
  } catch(e) { console.warn('사운드 재생 실패:', e); }
}

function saveMisc() {
  localStorage.setItem('spoon_misc_settings', JSON.stringify(miscSettings));
  ipc.send('config:update', { commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData });
}

function showMiscSection(name) {
  ['dice','timer','dday'].forEach(s => {
    const sec = document.getElementById('miscSection-' + s);
    const btn = document.getElementById('miscBtn-' + s);
    if (!sec || !btn) return;
    const active = s === name;
    sec.style.display = active ? '' : 'none';
    btn.style.background = active ? '#6366f1' : '#fff';
    btn.style.color = active ? '#fff' : '#64748b';
    btn.style.borderColor = active ? '#6366f1' : '#e2e8f0';
  });
  if (name === 'timer') renderTimerList();
  if (name === 'dday') renderDdayList();
}

function renderTimerList() {
  const el = document.getElementById('timerList');
  if (!el) return;
  if (activeTimers.length === 0) { el.textContent = '등록된 타이머 없음'; return; }
  el.innerHTML = activeTimers.map((t, i) => {
    const remain = Math.max(0, Math.ceil((t.endsAt - Date.now()) / 60000));
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #e2e8f0;">
      <span>⏱️ <b>${t.content}</b> — ${remain}분 후</span>
      <button onclick="cancelTimer(${i})" style="font-size:11px;padding:2px 7px;border:1px solid #e2e8f0;border-radius:4px;background:#fff;cursor:pointer;color:#ef4444;">취소</button>
    </div>`;
  }).join('');
}

function cancelTimer(idx) {
  if (activeTimers[idx]) {
    clearTimeout(activeTimers[idx].timeout);
    activeTimers.splice(idx, 1);
    renderTimerList();
  }
}

function renderDdayList() {
  const el = document.getElementById('ddayList');
  if (!el) return;
  if (!miscSettings.ddays || miscSettings.ddays.length === 0) { el.textContent = '등록된 디데이 없음'; return; }
  const today = new Date(); today.setHours(0,0,0,0);
  el.innerHTML = miscSettings.ddays.map((d, i) => {
    const target = new Date(d.date); target.setHours(0,0,0,0);
    const diff = Math.round((target - today) / 86400000);
    const label = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-Day!' : `D+${Math.abs(diff)}`;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #e2e8f0;">
      <span>📅 <b>${d.content}</b> (${d.date}) <span style="color:#6366f1;font-weight:700;">${label}</span></span>
      <button onclick="deleteDday(${i})" style="font-size:11px;padding:2px 7px;border:1px solid #e2e8f0;border-radius:4px;background:#fff;cursor:pointer;color:#ef4444;">삭제</button>
    </div>`;
  }).join('');
}

function deleteDday(idx) {
  miscSettings.ddays.splice(idx, 1);
  saveMisc();
  renderDdayList();
}

let songList = JSON.parse(localStorage.getItem('spoon_songs') || '[]')
let songSettings = JSON.parse(localStorage.getItem('spoon_song_settings') || '{"enabled":true,"priority":false,"customCmd":"!신청곡","delCmd":"!제거","resetCmd":"리셋","stopCmd":"!마감","startCmd":"!접수","regFormat":"✅ [{artist} - {title}] 신청 완료! (대기: {count}번)","listHeader":"🎵 현재 신청곡 목록 🎵","listFormat":"{index}. {artist} - {title}"}')
let rouletteSettings = JSON.parse(localStorage.getItem('spoon_roulette_settings') || '[]');
if (!Array.isArray(rouletteSettings)) rouletteSettings = []
let currentRouletteIdx = rouletteSettings.length > 0 ? 0 : -1
let stickerData = []
let stickerPickerSelectHandler = null
let stickerSoundSettings = JSON.parse(localStorage.getItem('spoon_sticker_sound_settings') || '[]')
if (!Array.isArray(stickerSoundSettings)) stickerSoundSettings = []
stickerSoundSettings = stickerSoundSettings.map(item => ({
  enabled: item && item.enabled !== false,
  stickerName: String((item && (item.stickerName || item.sticker || '')) || '').trim(),
  audioData: (item && item.audioData) || '',
  fileName: (item && item.fileName) || '',
  volume: (item && typeof item.volume === 'number') ? item.volume : 100
})).filter(item => item.stickerName && item.audioData)
let stickerSoundEditIdx = -1
let menuImages = JSON.parse(localStorage.getItem('spoon_menu_images') || '{}')

let selectedIdx = -1
let selectedHKIdx = -1
let selectedJoinIdx = -1
let selectedFundingIdx = -1
let editMode    = 'add'
let stats = { msgs:0, cmds:0, sent:0 }
let tokens = { access:'', room:'', stream:'' }

// ── 렌더링 ────────────────────────────────────────────────────
function renderCmds() {
  const tb = document.getElementById('cmdTbody')
  tb.innerHTML = commands.map((c,i) => `
    <tr class="${i===selectedIdx?'selected':''}" onclick="selectRow(${i})">
      <td class="trigger">${esc(c.trigger)}</td>
      <td class="resp">${esc(c.response)}</td>
      <td class="cool">${c.cooldown}s</td>
    </tr>
  `).join('')
}

function renderHKs() {
  const list = document.getElementById('hkList')
  list.innerHTML = hotkeys.map((c,i) => `
    <div class="item-card">
      <div class="item-badge">${esc(c.trigger)}</div>
      <div class="item-info">
        <div class="item-name">명령어: ${esc(c.trigger.replace('!', ''))}</div>
        <div class="item-preview">출력 내용: ${esc(c.response.replace(/\n/g, ' '))}</div>
      </div>
      <div class="item-actions">
        <button class="item-btn edit" onclick="openEditHK(${i})">수정</button>
        <button class="item-btn del" onclick="delHK(${i})">삭제</button>
      </div>
    </div>
  `).join('')
}

function renderJoins() {
  const list = document.getElementById('joinList')
  list.innerHTML = joinMsgs.map((c,i) => `
    <div class="item-card">
      <div class="item-badge" style="background:#10b981;">@${esc(c.tag)}</div>
      <div class="item-info">
        <div class="item-name">태그: @${esc(c.tag)}</div>
        <div class="item-preview">인사말: ${esc(c.response.replace(/\n/g, ' '))}</div>
      </div>
      <div class="item-actions">
        <button class="item-btn edit" onclick="openEditJoin(${i})">수정</button>
        <button class="item-btn del" onclick="delJoin(${i})">삭제</button>
      </div>
    </div>
  `).join('')
}

function renderAutoSettings() {
  const types = ['join', 'like', 'gift', 'repeat'];
  types.forEach(type => {
    const list = document.getElementById(`${type}-msg-list`);
    list.innerHTML = autoSettings[type].map((item, i) => {
      let delayHtml = '';
      if (type === 'repeat') {
        const mins = Math.floor(item.delay / 60);
        const secs = item.delay % 60;
        delayHtml = `
          <div class="msg-delay" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span>간격:</span>
            <input type="number" value="${mins}" min="0" style="width:60px; padding:4px 6px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px; text-align:center;"
              oninput="updateRepeatDelay(${i}, 'min', this.value)"
              onchange="updateRepeatDelay(${i}, 'min', this.value)">
            <span>분</span>
            <input type="number" value="${secs}" min="0" max="59" style="width:60px; padding:4px 6px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px; text-align:center;"
              oninput="updateRepeatDelay(${i}, 'sec', this.value)"
              onchange="updateRepeatDelay(${i}, 'sec', this.value)">
            <span>초</span>
          </div>`;
      } else {
        delayHtml = `
          <div class="msg-delay">
            지연(초):
            <input type="number" value="${item.delay}" onchange="updateAutoMsg('${type}', ${i}, 'delay', this.value)">
          </div>`;
      }

      const isOn = item.enabled !== false;
      return `
        <div class="msg-item" style="opacity:${isOn ? '1' : '0.45'};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <label class="roulette-toggle-switch" style="width:40px; height:22px;">
              <input type="checkbox" ${isOn ? 'checked' : ''} onchange="toggleAutoMsg('${type}', ${i}, this.checked)">
              <span class="roulette-toggle-slider"></span>
            </label>
            <span class="delete-btn" onclick="removeAutoMsg('${type}', ${i})">🗑️</span>
          </div>
          <textarea class="msg-input" oninput="updateAutoMsg('${type}', ${i}, 'text', this.value)" placeholder="메시지를 입력하세요" ${!isOn ? 'disabled' : ''}>${esc(item.text)}</textarea>
          <div class="msg-footer">
            <div class="msg-vars">
              <span class="var-tag" onclick="insertAutoVar('${type}', ${i}, '{nickname}')">{nickname}</span>
              ${type === 'join' ? `<span class="var-tag" onclick="insertAutoVar('${type}', ${i}, '{count}')">{count}</span>` : ''}
              ${type === 'gift' ? `<span class="var-tag" onclick="insertAutoVar('${type}', ${i}, '{amount}')">{amount}</span>` : ''}
            </div>
            ${delayHtml}
          </div>
        </div>
      `;
    }).join('');
  });
}

function toggleAutoMsg(type, i, val) {
  autoSettings[type][i].enabled = val;
  renderAutoSettings();
}

function updateRepeatDelay(i, unit, val) {
  const item = autoSettings.repeat[i];
  let mins = Math.floor(item.delay / 60);
  let secs = item.delay % 60;
  
  if (unit === 'min') mins = parseInt(val) || 0;
  else secs = parseInt(val) || 0;
  
  item.delay = (mins * 60) + secs;
}

function addAutoMsg(type) {
  const defaultDelay = type === 'repeat' ? 600 : 1;
  autoSettings[type].push({ text: '', delay: defaultDelay, enabled: true });
  renderAutoSettings();
}

function removeAutoMsg(type, i) {
  autoSettings[type].splice(i, 1);
  renderAutoSettings();
}

function updateAutoMsg(type, i, key, val) {
  if (key === 'delay') val = parseInt(val) || 0;
  autoSettings[type][i][key] = val;
}

function insertAutoVar(type, i, v) {
  const inputs = document.querySelectorAll(`#${type}-msg-list .msg-input`);
  const el = inputs[i];
  const s = el.selectionStart, e = el.selectionEnd;
  el.value = el.value.slice(0,s) + v + el.value.slice(e);
  autoSettings[type][i].text = el.value;
  el.focus();
  el.setSelectionRange(s+v.length, s+v.length);
}

function selectRow(i) { selectedIdx = i; renderCmds() }

function exportSettings() {
  const settings = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('spoon_')) {
      settings[key] = localStorage.getItem(key);
    }
  }
  
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spoon_bot_settings_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  addLog('system', '시스템', '설정 내보내기가 완료되었습니다.');
}

function importSettings() {
  document.getElementById('settingsFileInput').click();
}

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const settings = JSON.parse(e.target.result);
      if (!confirm('가져온 설정으로 덮어쓰시겠습니까? 현재 설정은 사라집니다.')) return;
      
      Object.keys(settings).forEach(key => {
        if (key.startsWith('spoon_')) {
          localStorage.setItem(key, settings[key]);
        }
      });
      
      alert('✅ 설정을 성공적으로 가져왔습니다. 앱을 재시작합니다.');
      window.location.reload();
    } catch (err) {
      alert('❌ 유효하지 않은 설정 파일입니다.');
      console.error(err);
    }
  };
  reader.readAsText(file);
}

async function resetAllSettings() {
  if (!confirm('모든 설정과 로그인 기록을 완전히 삭제하고 초기화할까요?\n이 작업은 되돌릴 수 없으며 앱이 재시작됩니다.')) return;
  
  // 1. localStorage 비우기
  localStorage.clear();
  
  // 2. 메인 프로세스에 완전 초기화 요청 (세션, 쿠키, 물리 파일 삭제)
  if (window.appControl && window.appControl.resetAll) {
    const success = await window.appControl.resetAll();
    if (!success) {
      alert('❌ 초기화 중 오류가 발생했습니다.');
    }
  } else {
    // 폴백: 일반 새로고침
    alert('✅ 설정이 초기화되었습니다.');
    window.location.reload();
  }
}

function saveLocal() {
  localStorage.setItem('spoon_cmds', JSON.stringify(commands))
  localStorage.setItem('spoon_hotkeys', JSON.stringify(hotkeys))
  localStorage.setItem('spoon_joinmsgs', JSON.stringify(joinMsgs))
  localStorage.setItem('spoon_auto_settings', JSON.stringify(autoSettings))
  localStorage.setItem('spoon_fundings', JSON.stringify(fundings))
  localStorage.setItem('spoon_funding_options', JSON.stringify(fundingOptions))
  localStorage.setItem('spoon_shield_count', shieldCount.toString())
  localStorage.setItem('spoon_shield_options', JSON.stringify(shieldOptions))
  localStorage.setItem('spoon_songs', JSON.stringify(songList))
    localStorage.setItem('spoon_song_settings', JSON.stringify(songSettings))
  localStorage.setItem('spoon_sticker_sound_settings', JSON.stringify(stickerSoundSettings))
  localStorage.setItem('spoon_menu_images', JSON.stringify(menuImages))
  localStorage.setItem('spoon_roulette_settings', JSON.stringify(rouletteSettings))
  localStorage.setItem('spoon_act_settings', JSON.stringify(actSettings))
  localStorage.setItem('spoon_tts_settings', JSON.stringify(ttsSettings))
  saveRouletteHistory();
  actSaveData();

  const saveBtn = document.querySelector('.btn-save-top');
  if (saveBtn) {
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '✅ 저장 완료!';
    setTimeout(() => { saveBtn.innerHTML = originalText; }, 2000);
  }
  
  addLog('system','시스템','설정이 저장되었습니다.')
  ipc.send('config:update', { 
    commands, 
    hotkeys, 
    joinMsgs, 
    autoSettings, 
    fundings: JSON.parse(JSON.stringify(fundings)),
    fundingOptions,
    shieldCount,
    shieldOptions,
    songList,
    songSettings,
    rouletteSettings,
    miscSettings,
    actSettings,
    actData,
    ttsSettings
  })
}

function openCmdCustom() {
  // 펀딩 탭으로 이동
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => {
    if (el.getAttribute('onclick') && el.getAttribute('onclick').includes('funding')) {
      el.classList.add('active');
    }
  });
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-funding').classList.add('active');
  document.getElementById('tabTitle').textContent = '펀딩 관리';
  // 커스텀 폼 열기
  setTimeout(() => toggleCustomForm(), 50);
}

function toggleCustomForm() {
  const form = document.getElementById('customForm');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display === 'block') {
    document.getElementById('fCustomCmd').value = fundingOptions.customCmd || '!펀딩';
    document.getElementById('fCustomHeader').value = fundingOptions.customHeader || '🪙 진행중인 {month}월 펀딩 🪙';
    document.getElementById('fCustomFormat').value = fundingOptions.customFormat || '{index}. {title}\\n💰{current}/{goal} [{percent} {dday}]';
  }
}

function saveCustomFormat() {
  fundingOptions.customCmd = document.getElementById('fCustomCmd').value.trim() || '!펀딩';
  fundingOptions.customHeader = document.getElementById('fCustomHeader').value.trim() || '🪙 진행중인 {month}월 펀딩 🪙';
  fundingOptions.customFormat = document.getElementById('fCustomFormat').value;
  saveLocal();
  alert('펀딩 커스텀 설정이 저장되었습니다.');
  document.getElementById('customForm').style.display = 'none';
}

// ── 펀딩 관리 ──────────────────────────────────────────────────
function renderFundings() {
  const list = document.getElementById('fundingList');
  if (!list) return;
  if (fundings.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--muted);">등록된 펀딩이 없습니다.</div>';
    return;
  }

  list.innerHTML = fundings.map((f, i) => {
    const percent = Math.min(100, Math.floor((f.current / f.goal) * 100)) || 0;
    
    let ddayText = 'D-Day';
    if (f.endDate) {
      const diff = new Date(f.endDate) - new Date().setHours(0,0,0,0);
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      ddayText = days === 0 ? 'D-Day' : (days > 0 ? `D-${days}` : `종료`);
    }

    return `
      <div class="card" style="padding: 16px; border: 1px solid var(--border); box-shadow: none;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 18px; font-weight: 800; color: #334155;">${i + 1}</span>
              <span style="font-size: 15px; font-weight: 700;">${esc(f.title)}</span>
            </div>
            <div style="margin-top: 4px; display: flex; gap: 8px;">
              <span style="font-size: 11px; color: #16a34a; font-weight: 700; background: #dcfce7; padding: 1px 6px; border-radius: 4px;">진행중</span>
              <span style="font-size: 11px; color: #f59e0b; font-weight: 700; background: #fef3c7; padding: 1px 6px; border-radius: 4px;">${ddayText}</span>
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="topbar-btn" style="padding: 4px 10px;" onclick="openEditFunding(${i})">수정</button>
            <button class="topbar-btn" style="padding: 4px 10px; color: var(--red);" onclick="deleteFunding(${i})">삭제</button>
          </div>
        </div>
        
        <div style="height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
          <div style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #7c3aed, #3b82f6); border-radius: 4px;"></div>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-size: 13px; font-weight: 700; color: #6366f1;">
            ${f.current.toLocaleString()} <span style="color: #94a3b8; font-weight: 500;">/ ${f.goal.toLocaleString()}</span>
          </div>
          <div style="font-size: 14px; font-weight: 800; color: #6366f1;">${percent}%</div>
        </div>

        <div style="display: flex; gap: 8px;">
          <input type="number" id="addAmt-${i}" placeholder="숫자 입력 (음수=차감)" style="flex: 1; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 12px;">
          <button class="topbar-btn btn-start-top" style="padding: 6px 16px;" onclick="addFundingAmount(${i})">적립/차감</button>
          <button class="topbar-btn" style="padding: 6px 16px;" onclick="resetFunding(${i})">리셋</button>
        </div>
      </div>
    `;
  }).join('');
}

function openAddFunding() {
  selectedFundingIdx = -1;
  document.getElementById('fFundingTitle').value = '';
  document.getElementById('fFundingGoal').value = '';
  document.getElementById('fFundingEndDate').value = '';
  document.getElementById('fundingForm').style.display = 'block';
}

function openEditFunding(i) {
  selectedFundingIdx = i;
  const f = fundings[i];
  document.getElementById('fFundingTitle').value = f.title;
  document.getElementById('fFundingGoal').value = f.goal;
  document.getElementById('fFundingEndDate').value = f.endDate || '';
  document.getElementById('fundingForm').style.display = 'block';
}

function closeFundingForm() {
  document.getElementById('fundingForm').style.display = 'none';
}

function saveFundingForm() {
  const title = document.getElementById('fFundingTitle').value.trim();
  const goal = parseInt(document.getElementById('fFundingGoal').value) || 0;
  const endDate = document.getElementById('fFundingEndDate').value;
  
  if (!title || goal <= 0) return alert('제목과 목표 금액을 입력하세요.');

  if (selectedFundingIdx === -1) {
    fundings.push({ title, goal, current: 0, endDate });
  } else {
    fundings[selectedFundingIdx].title = title;
    fundings[selectedFundingIdx].goal = goal;
    fundings[selectedFundingIdx].endDate = endDate;
  }

  saveLocal();
  renderFundings();
  closeFundingForm();
}

function deleteFunding(i) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  fundings.splice(i, 1);
  saveLocal();
  renderFundings();
}

function addFundingAmount(i) {
  const raw = document.getElementById(`addAmt-${i}`).value;
  const amt = parseInt(raw);
  if (isNaN(amt) || amt === 0) return;
  fundings[i].current += amt;
  saveLocal();
  renderFundings();
}

function resetFunding(i) {
  if (!confirm('적립액을 리셋하시겠습니까?')) return;
  fundings[i].current = 0;
  saveLocal();
  renderFundings();
}

function updateFundingOpt(key, val) {
  fundingOptions[key] = val;
  // 옵션 변경 시 즉시 저장 및 엔진 동기화
  saveLocal();
  renderFundings();
}

// ── 커맨드 CRUD ───────────────────────────────────────────────
function openAdd() {
  editMode = 'add'; closeForm()
  document.getElementById('fTrigger').value = '!'; document.getElementById('fResponse').value = ''; document.getElementById('fCooldown').value = '10'
  document.getElementById('editForm').classList.add('open'); document.getElementById('fTrigger').focus()
}
function openEdit() {
  if (selectedIdx < 0) return
  editMode = 'edit'; closeForm()
  const c = commands[selectedIdx]
  document.getElementById('fTrigger').value = c.trigger; document.getElementById('fResponse').value = c.response; document.getElementById('fCooldown').value = c.cooldown
  document.getElementById('editForm').classList.add('open')
}
function closeForm() { document.getElementById('editForm').classList.remove('open') }
function saveForm() {
  const trigger = document.getElementById('fTrigger').value.trim(), response = document.getElementById('fResponse').value.trim(), cooldown = parseInt(document.getElementById('fCooldown').value) || 0
  if (!trigger || !response || !trigger.startsWith('!')) return
  if (editMode === 'add') commands.push({ trigger, response, cooldown })
  else commands[selectedIdx] = { trigger, response, cooldown }
  saveLocal(); renderCmds(); closeForm()
}
function delCmd() { if (selectedIdx < 0) return; commands.splice(selectedIdx, 1); selectedIdx = -1; saveLocal(); renderCmds() }
function insertVar(v) {
  const el = document.getElementById('fResponse'), s = el.selectionStart, e = el.selectionEnd
  el.value = el.value.slice(0,s) + v + el.value.slice(e); el.focus(); el.setSelectionRange(s+v.length, s+v.length)
}

// ── 단축키 CRUD ───────────────────────────────────────────────
function openAddHK() {
  editMode = 'add'; closeHKForm()
  document.getElementById('hkTrigger').value = '!'; document.getElementById('hkResponse').value = ''
  document.getElementById('hkForm').classList.add('open'); document.getElementById('hkTrigger').focus()
}
function openEditHK(i) {
  selectedHKIdx = i; editMode = 'edit'; closeHKForm()
  const c = hotkeys[i]; document.getElementById('hkTrigger').value = c.trigger; document.getElementById('hkResponse').value = c.response
  document.getElementById('hkForm').classList.add('open')
}
function closeHKForm() { document.getElementById('hkForm').classList.remove('open') }
function saveHKForm() {
  const trigger = document.getElementById('hkTrigger').value.trim(), response = document.getElementById('hkResponse').value.trim()
  if (!trigger || !response || !trigger.startsWith('!')) return
  if (editMode === 'add') hotkeys.push({ trigger, response })
  else hotkeys[selectedHKIdx] = { trigger, response }
  saveLocal(); renderHKs(); closeHKForm()
}
function delHK(i) { if (!confirm('정말 삭제하시겠습니까?')) return; hotkeys.splice(i, 1); saveLocal(); renderHKs() }

// ── 지정 인사 CRUD ─────────────────────────────────────────────
function openAddJoin() {
  editMode = 'add'; closeJoinForm()
  document.getElementById('joinTag').value = ''; document.getElementById('joinResponse').value = ''
  document.getElementById('joinForm').classList.add('open'); document.getElementById('joinTag').focus()
}
function openEditJoin(i) {
  selectedJoinIdx = i; editMode = 'edit'; closeJoinForm()
  const c = joinMsgs[i]; document.getElementById('joinTag').value = c.tag; document.getElementById('joinResponse').value = c.response
  document.getElementById('joinForm').classList.add('open')
}
function closeJoinForm() { document.getElementById('joinForm').classList.remove('open') }
function saveJoinForm() {
  const tag = document.getElementById('joinTag').value.trim().replace('@', ''), response = document.getElementById('joinResponse').value.trim()
  if (!tag || !response) return
  if (editMode === 'add') joinMsgs.push({ tag, response })
  else joinMsgs[selectedJoinIdx] = { tag, response }
  saveLocal(); renderJoins(); closeJoinForm()
}
function delJoin(i) { if (!confirm('정말 삭제하시겠습니까?')) return; joinMsgs.splice(i, 1); saveLocal(); renderJoins() }
function insertJoinVar(v) {
  const el = document.getElementById('joinResponse'), s = el.selectionStart, e = el.selectionEnd
  el.value = el.value.slice(0,s) + v + el.value.slice(e); el.focus(); el.setSelectionRange(s+v.length, s+v.length)
}

// ── IPC 수신 ──────────────────────────────────────────────────
ipc.on('token:access', (e, v) => {
  tokens.access = v
  document.getElementById('tAccess').textContent = '✅ ' + v.slice(0,24) + '...'
  document.getElementById('tAccessShort').textContent = '✅ ' + v.slice(0,8) + '...'
})
ipc.on('token:room', (e, v) => {
  tokens.room = v
  document.getElementById('tRoom').textContent = '✅ ' + v.slice(0,24) + '...'
  document.getElementById('tRoomShort').textContent = '✅ ' + v.slice(0,8) + '...'
})
ipc.on('token:stream', (e, v) => {
  tokens.stream = v
  document.getElementById('tStream').textContent = '✅ ' + v
  document.getElementById('tStreamShort').textContent = '✅ ' + v
  addLog('system','시스템',`방 감지: ${v}`)
})

ipc.on('bot:log', (e, { type, author, text }) => {
  if (type === 'song_update') {
    try {
      const data = JSON.parse(text);
      if (data.action === 'add') {
        songList.push(data.song);
      } else if (data.action === 'unshift') {
        songList.unshift(data.song);
      } else if (data.action === 'remove') {
        // 뒤에서부터 제거하여 인덱스 꼬임 방지
        data.indices.sort((a, b) => b - a).forEach(idx => {
          if (songList[idx]) songList.splice(idx, 1);
        });
      } else if (data.action === 'clear') {
        songList = [];
      } else if (data.action === 'status') {
        songSettings.enabled = data.enabled;
      } else if (data.action === 'priority') {
        songSettings.priority = data.value;
        const chk = document.getElementById('optSongPriority');
        if (chk) chk.checked = data.value;
      }
      localStorage.setItem('spoon_songs', JSON.stringify(songList));
      localStorage.setItem('spoon_song_settings', JSON.stringify(songSettings));
      renderSongs();
    } catch(err) {}
    return;
  }
  if (type === 'shield_update') {
    const newCount = parseInt(text);
    shieldCount = isNaN(newCount) ? 0 : newCount;
    localStorage.setItem('spoon_shield_count', shieldCount.toString())
    saveLocal();
    const display = document.getElementById('shieldDisplay');
    if (display) display.textContent = shieldCount.toLocaleString('ko-KR');
    return;
  }
  if (type === 'funding_update') {
    try {
      const data = JSON.parse(text);
      if (fundings[data.index]) {
        fundings[data.index].current = data.current;
        localStorage.setItem('spoon_fundings', JSON.stringify(fundings));
        renderFundings();
      }
    } catch(e) {}
    return;
  }
  // 룰렛권 차감 동기화 (engine에서 !룰렛N [수량] 실행 시 차감된 결과 반영)
  if (type === 'coupon_update') {
    try {
      const data = JSON.parse(text);
      const { keepKey, rouletteIdx, remaining } = data;
      if (!rouletteHistory[keepKey]) rouletteHistory[keepKey] = {};
      if (!rouletteHistory[keepKey]['룰렛권']) rouletteHistory[keepKey]['룰렛권'] = {};
      rouletteHistory[keepKey]['룰렛권'][String(rouletteIdx)] = remaining;
      // 파일은 이미 메인 프로세스가 저장했으므로 메모리만 갱신
      // 룰렛권 모달이 열려 있고 현재 대상이면 즉시 재렌더
      const modal = document.getElementById('couponModal');
      const tagEl = document.getElementById('couponModalTag');
      if (modal && modal.style.display === 'flex' && tagEl && tagEl.value === keepKey) {
        renderCouponList();
      }
    } catch(e) {}
    return;
  }
  // 유저 프로필 이미지 수신 및 저장
  if (type === 'user_img') {
    const tag = author; // author = tag
    const imgUrl = text;
    if (tag && imgUrl) {
      if (!rouletteHistory[tag]) rouletteHistory[tag] = {};
      if (rouletteHistory[tag]._imgUrl !== imgUrl) {
        rouletteHistory[tag]._imgUrl = imgUrl;
        saveRouletteHistory();
      }
    }
    return;
  }

  // !킵 조회 요청 - addLog 전에 처리 (채팅로그 표시 불필요)
  if (type === 'keep_query') {
    (async () => {
      try {
        const { keepKey, author } = JSON.parse(text);
        console.log('[킵조회 시작] keepKey:', keepKey);
        if (window.store) {
          const fileData = await window.store.get('roulette_history.json');
          console.log('[킵조회 파일]', fileData ? Object.keys(fileData) : '없음');
          if (fileData) rouletteHistory = fileData;
        }
        const keepData = (rouletteHistory[keepKey] || {})['킵목록'] || null;
        console.log('[킵조회 keepData]', keepData);
        let msg;
        if (!keepData || Object.keys(keepData).length === 0) {
          msg = `📋 ${author}님의 룰렛 기록이 없습니다.`;
        } else {
          msg = `📋 ${author}님의 룰렛 기록\n`;
          Object.entries(keepData).forEach(([itemName, count], i) => {
            const cnt = count > 1 ? `(${count})` : '';
            msg += `${i + 1}. ${itemName}${cnt}\n`;
          });
          msg = msg.trim();
        }
        console.log('[킵조회 응답]', msg);
        ipc.send('bot:keep-reply', { author, msg });
      } catch(e) {
        console.error('[킵조회 에러]', e);
      }
    })();
    return;
  }

  // 디버그 로그는 채팅 로그 탭에 표시되도록 함
  addLog(type, author, text)
  if (type === 'chat') {
    stats.msgs++; document.getElementById('sMsgs').textContent = stats.msgs
    const first = text.trim().split(/\s+/)[0].toLowerCase()
    if (commands.some(c => c.trigger.toLowerCase() === first)) {
      stats.cmds++; document.getElementById('sCmds').textContent = stats.cmds
    }
    // 애청지수 채팅 기록 (등록된 유저만)
    try { actRecordChat(author, author); } catch(e) {}
    // TTS 채팅 읽기
    try {
      const mAuthor = author.match(/^(.+?)\((.+?)\)$/);
      const chatNick = mAuthor ? mAuthor[1].trim() : author;
      const chatTag  = mAuthor ? mAuthor[2].trim() : null;
      ttsHandleChat(chatTag, chatNick, text);
    } catch(e) {}
  }
  if (type === 'bot') {
    stats.sent++; document.getElementById('sSent').textContent = stats.sent
  }
  
  // 룰렛 결과 기록
  // 선물 수신 → 랭킹/캘린더 기록
  if (type === 'system' && author === '선물') {
    try {
      const mGift = text.match(/^(.+?)(?:\((.+?)\))?님이.*스푼\s+(\d+)개/);
      if (mGift) {
        const nickname = mGift[1].trim();
        const tag = mGift[2] ? mGift[2].trim() : nickname;
        const amt = parseInt(mGift[3]);
        const today = new Date().toISOString().slice(0,10);
        dashData.spoonLog[today] = (dashData.spoonLog[today] || 0) + amt;
        if (!dashData.spoonRanking[tag]) dashData.spoonRanking[tag] = { nickname, total: 0 };
        dashData.spoonRanking[tag].total += amt;
        dashData.spoonRanking[tag].nickname = nickname;
        if (!dashData.spoonRanking._todayLog) dashData.spoonRanking._todayLog = {};
        if (!dashData.spoonRanking._todayLog[tag]) dashData.spoonRanking._todayLog[tag] = { nickname, total: 0 };
        dashData.spoonRanking._todayLog[tag].total += amt;
        dashData.spoonRanking._todayLog[tag].nickname = nickname;
        saveDashData();
        const dashTab = document.getElementById('tab-dashboard');
        if (dashTab && dashTab.classList.contains('active')) renderDashboard();
        try {
          playStickerSoundByGiftLog(text);
        } catch(e) {}
        // TTS 권한 부여 (지정 스푼 금액 일치 시)
        try {
          if (ttsSettings.enabled && amt === (ttsSettings.spoonAmount || 10)) {
            ttsGrantAccess(nickname, tag);
          }
        } catch(e) {}
      }
    } catch(e) {}
  }

  // 좋아요 수신 → 하트 기록
  if (type === 'system' && author === '좋아요') {
    try {
      const mLike = text.match(/^(.+?)님이 좋아요/);
      if (mLike) {
        const nickname = mLike[1].trim();
        const tag = nickname;
        if (!dashData.heartLog[tag]) dashData.heartLog[tag] = { nickname, count: 0 };
        dashData.heartLog[tag].count++;
        dashData.heartLog[tag].nickname = nickname;
        saveDashData();
        const dashTab = document.getElementById('tab-dashboard');
        if (dashTab && dashTab.classList.contains('active')) renderDashboard();
        // 애청지수 하트 기록
        actRecordHeart(tag, nickname);
      }
    } catch(e) {}
  }

  if (type === 'system' && author === '룰렛결과') {
    const match = text.match(/^(.+?)(?:\((.+?)\))? - (.+?): (.+)$/);
    if (match) {
      const nickname = match[1].trim();
      const tag = match[2] ? match[2].trim() : '';
      const rouletteName = match[3].trim();
      const itemName = match[4].trim();
      
      if (tag) {
        if (!rouletteHistory[tag]) rouletteHistory[tag] = { _nickname: nickname };
        rouletteHistory[tag]._nickname = nickname; // 닉네임 실시간 업데이트
        if (!rouletteHistory[tag][rouletteName]) rouletteHistory[tag][rouletteName] = {};
        
        rouletteHistory[tag][rouletteName][itemName] = (rouletteHistory[tag][rouletteName][itemName] || 0) + 1;
        saveRouletteHistory();
        
        const historyTab = document.getElementById('tab-roulette-history');
        if (historyTab && historyTab.classList.contains('active')) {
          renderRouletteHistory();
        }
      }
    }
  }
  
  // !킵 결과 기록

  if (type === 'dday_update') {
    try {
      miscSettings.ddays = JSON.parse(text);
      saveMisc();
      renderDdayList();
    } catch(e) {}
    return;
  }

  if (type === 'timer_update') {
    try {
      const list = JSON.parse(text);
      // 새로 추가된 항목만 activeTimers에 반영 (timeout은 engine이 관리)
      list.forEach(item => {
        const exists = activeTimers.find(t => t.endsAt === item.endsAt && t.content === item.content);
        if (!exists) activeTimers.push({ content: item.content, endsAt: item.endsAt, timeout: null });
      });
      // engine에서 없어진 항목 제거
      activeTimers = activeTimers.filter(t =>
        list.find(item => item.endsAt === t.endsAt && item.content === t.content)
      );
      renderTimerList();
    } catch(e) {}
    return;
  }

  if (type === 'timer_alert') {
    playTimerSound();
    // 타이머 알림 → 채팅 전송은 engine이 처리, 여기선 목록만 갱신
    try {
      const idx = parseInt(text);
      if (!isNaN(idx) && activeTimers[idx]) {
        activeTimers.splice(idx, 1);
        renderTimerList();
      }
    } catch(e) {}
    return;
  }

  if (type === 'roulette_keep') {
    try {
      const nickname = author;
      const data = JSON.parse(text);
      const itemName = data.item;
      const keepKey = data.tag || nickname; // tag 없으면 nickname으로 폴백

      if (!rouletteHistory[keepKey]) rouletteHistory[keepKey] = { _nickname: nickname };
      rouletteHistory[keepKey]._nickname = nickname;
      if (!rouletteHistory[keepKey]['킵목록']) rouletteHistory[keepKey]['킵목록'] = {};

      rouletteHistory[keepKey]['킵목록'][itemName] = (rouletteHistory[keepKey]['킵목록'][itemName] || 0) + 1;
      saveRouletteHistory();
      console.log('[킵저장] keepKey:', keepKey, '| item:', itemName, '| history keys:', Object.keys(rouletteHistory));

      const historyTab = document.getElementById('tab-roulette-history');
      if (historyTab && historyTab.classList.contains('active')) {
        renderRouletteHistory();
      }
    } catch(e) {}
  }
  
  // 유저 정보 업데이트 (닉네임 동기화)
  if (type === 'user_update') {
    try {
      const nickname = author;
      const data = JSON.parse(text);
      const tag = data.tag;
      
      if (tag && rouletteHistory[tag]) {
        if (rouletteHistory[tag]._nickname !== nickname) {
          rouletteHistory[tag]._nickname = nickname;
          saveRouletteHistory();
          
          const historyTab = document.getElementById('tab-roulette-history');
          if (historyTab && historyTab.classList.contains('active')) {
            renderRouletteHistory();
          }
        }
      }
    } catch(e) {}
  }
})

ipc.on('bot:connected', (e, stream) => {
  document.getElementById('badgeStatus').textContent = '● 온라인'; document.getElementById('badgeStatus').className = 'stat-badge online'
  document.getElementById('badgeStream').textContent = stream || '연결됨'
  document.getElementById('btnStart').disabled = true; document.getElementById('btnStop').disabled = false
})
ipc.on('bot:disconnected', () => {
  document.getElementById('badgeStatus').textContent = '● 오프라인'; document.getElementById('badgeStatus').className = 'stat-badge offline'
  document.getElementById('badgeStream').textContent = '연결 대기 중'
  document.getElementById('btnStart').disabled = false; document.getElementById('btnStop').disabled = true
})

ipc.on('bot:request-config', () => {
  ipc.send('bot:response-config', { commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData, ttsSettings })
})

// 엔진에서 actData 변경 시 UI 동기화
ipc.on('act:data-updated', (e, newData) => {
  actData = newData;
  localStorage.setItem('spoon_act_data', JSON.stringify(actData));
  // 애청지수 탭이 열려 있으면 실시간 갱신
  const actTab = document.getElementById('tab-activity');
  if (actTab && actTab.style.display === 'flex') {
    actRenderList();
    if (actSelectedUser) actRenderDetail(actSelectedUser);
  }
})

// 룰렛 히스토리 갱신 동기화 (app.js에서 룰렛권 지급 후 전송)
ipc.on('roulette:history-updated', (e, newHistory) => {
  if (newHistory && typeof newHistory === 'object') {
    rouletteHistory = newHistory;
    localStorage.setItem('spoon_roulette_history', JSON.stringify(rouletteHistory));
    // 룰렛권 모달이 열려 있으면 즉시 재렌더
    const modal = document.getElementById('couponModal');
    if (modal && modal.style.display === 'flex') renderCouponList();
  }
})
function startBot() { ipc.send('bot:start', { commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData, ttsSettings }) }
function stopBot()  { ipc.send('bot:stop') }

function addLog(type, author, text) {
  const wrap = document.getElementById('logWrap'), now = new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
  const div = document.createElement('div'); div.className = `log-item ${type}`
  div.innerHTML = `<span class="log-time">${now}</span><span class="log-author">${esc(author)}</span><span class="log-text">${esc(text)}</span>`
  wrap.appendChild(div); wrap.scrollTop = wrap.scrollHeight
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function updateShieldManual() {
  const input = document.getElementById('shieldInput');
  const val = parseInt(input.value);
  if (isNaN(val)) return;
  
  shieldCount = val;
  document.getElementById('shieldDisplay').textContent = shieldCount.toLocaleString('ko-KR');
  saveLocal();
  input.value = '';
}

function resetShield() {
  if (!confirm('현재 보유 실드를 0으로 초기화하시겠습니까?')) return;
  shieldCount = 0;
  document.getElementById('shieldDisplay').textContent = '0';
  saveLocal();
}

function saveShieldFormat() {
  const cmdVal = document.getElementById('fShieldCmd').value.trim();
  shieldOptions.customCmd = (cmdVal && cmdVal.startsWith('!')) ? cmdVal : '!실드';
  shieldOptions.format = document.getElementById('fShieldFormat').value || "🛡️ 현재 보유 중인 실드는 {실드}개 입니다!";
  shieldOptions.updateFormat = document.getElementById('fShieldUpdateFormat').value || "{icon} 실드 {action} 완료!\n현재 실드: {실드}개";
  // 안내 가이드 텍스트 업데이트
  const cmd = shieldOptions.customCmd;
  const guideCmd = document.getElementById('guideCmd');
  const guideCmdPlus = document.getElementById('guideCmdPlus');
  const guideCmdMinus = document.getElementById('guideCmdMinus');
  if (guideCmd) guideCmd.textContent = cmd;
  if (guideCmdPlus) guideCmdPlus.textContent = cmd + ' +5';
  if (guideCmdMinus) guideCmdMinus.textContent = cmd + ' -3';
  const shieldCardDesc = document.getElementById('shieldCardDesc');
  if (shieldCardDesc) shieldCardDesc.textContent = `실드 개수를 관리합니다. DJ/매니저는 ${cmd} [+숫자/-숫자]로 조절 가능하며, 일반 유저는 ${cmd}로 조회만 가능합니다.`;
  saveLocal();
  alert('실드 명령어 커스텀 설정이 저장되었습니다.');
}

// ── 룰렛 관리 ──────────────────────────────────────────────────
function renderRouletteTabs() {
  const tabs = document.getElementById('roulette-tabs')
  if (!tabs) return
  
  let html = rouletteSettings.map((r, i) => `
    <div class="sub-tab ${i === currentRouletteIdx ? 'active' : ''}" onclick="selectRoulette(${i})">${esc(r.name || '새 룰렛')}</div>
  `).join('')
  
  if (rouletteSettings.length < 10) {
    html += `<div class="sub-tab roulette-add-btn" onclick="addRoulette()">＋ 새 룰렛</div>`
  }
  
  tabs.innerHTML = html
}

function selectRoulette(idx) {
  currentRouletteIdx = idx
  renderRouletteTabs()
  renderRouletteDetail()
}

function addRoulette() {
  if (rouletteSettings.length >= 10) {
    alert('룰렛은 최대 10개까지 추가할 수 있습니다.')
    return
  }
  
  const newRoulette = {
    name: '새 룰렛 ' + (rouletteSettings.length + 1),
    enabled: true,
    type: 'spoon',
    amount: 10,
    payout: 'combo',
    optKeep: true,
    optCard: false,
    optEvent: false,
    items: [
      { name: '새 항목', prob: 100, noLog: false }
    ]
  }
  
  rouletteSettings.push(newRoulette)
  currentRouletteIdx = rouletteSettings.length - 1
  saveLocal()
  renderRouletteTabs()
  renderRouletteDetail()
}

function deleteRoulette() {
  if (currentRouletteIdx === -1) return
  if (!confirm('정말 이 룰렛을 삭제하시겠습니까?')) return
  
  rouletteSettings.splice(currentRouletteIdx, 1)
  currentRouletteIdx = rouletteSettings.length > 0 ? 0 : -1
  saveLocal()
  renderRouletteTabs()
  renderRouletteDetail()
}

function renderRouletteDetail() {
  const container = document.getElementById('roulette-detail-container')
  const emptyMsg = document.getElementById('roulette-empty-msg')
  
  if (currentRouletteIdx === -1) {
    container.style.display = 'none'
    emptyMsg.style.display = 'block'
    return
  }
  
  container.style.display = 'block'
  emptyMsg.style.display = 'none'
  
  const r = rouletteSettings[currentRouletteIdx]
  
  document.getElementById('roulette-name-input').value = r.name
  document.getElementById('roulette-enabled-check').checked = r.enabled
  document.getElementById('roulette-type-select').value = r.type
  document.getElementById('roulette-amount-input').value = r.amount
  document.getElementById('roulette-payout-select').value = r.payout
  document.getElementById('roulette-opt-keep').checked = r.optKeep
  document.getElementById('roulette-opt-card').checked = r.optCard
  document.getElementById('roulette-opt-event').checked = r.optEvent
  
  updateRouletteTypeUI()
  renderRouletteItems()
}

function updateRouletteTypeUI() {
  const type = document.getElementById('roulette-type-select').value
  const desc = document.getElementById('roulette-type-desc')
  const unit = document.getElementById('roulette-amount-unit')
  const input = document.getElementById('roulette-amount-input')
  const pickBtn = document.getElementById('roulette-sticker-pick-btn')
  const preview = document.getElementById('roulette-sticker-preview')

  if (type === 'spoon') {
    desc.innerHTML = `일반: 정확히 X스푼일 때 1회<br>콤보: X스푼 X N개 선물 시 N회<br>배분: 총 금액 내에서 X스푼당 1회`;
    unit.textContent = '스푼'
    input.placeholder = '스푼 개수'
    input.type = 'number'
    if (pickBtn) pickBtn.style.display = 'none'
    if (preview) preview.style.display = 'none'
  } else {
    desc.textContent = '지정 스티커 — 해당 스티커가 선물되면 룰렛이 실행됩니다. [🖼️ 스티커 선택] 버튼을 눌러 고르세요.'
    unit.textContent = '스티커명'
    input.placeholder = '스티커 이름 검색'
    input.type = 'text'
    if (pickBtn) pickBtn.style.display = 'inline-block'
    loadStickerData()
    updateStickerPreview()
  }
}

async function loadStickerData() {
  if (stickerData.length > 0) return
  try {
    const res = await fetch('https://static.spooncast.net/kr/stickers/index.json')
    const data = await res.json()
    stickerData = []
    data.categories.forEach(cat => {
      // 카테고리가 비활성 상태(is_used=false)이면 해당 카테고리 전체 스티커 제외
      if (cat.is_used === false) return

      cat.stickers.forEach(s => {
        // 개별 스티커가 비활성 상태(is_used=false)이거나 판매 종료일이 지났으면 제외
        if (s.is_used === false) return
        
        // 현재 시간 기준으로 판매 종료 여부 확인 (Spoon API의 end_date 형식 고려)
        if (s.end_date) {
          try {
            const end = new Date(s.end_date)
            if (end < new Date()) return
          } catch(e) {}
        }

        stickerData.push({
          name: s.name,
          title: s.title,
          image: s.image_thumbnail_web || s.image_thumbnail || s.image_url_web || '',
          price: s.price,
          category: cat.title || cat.name || '',
          categoryId: cat.id,
          endDate: s.end_date || '',
          tagBadge: s.tag && s.tag !== 'NONE' ? s.tag : ''
        })
      })
    })
    console.log('[스티커 로드] 활성 스티커 개수:', stickerData.length)
  } catch (e) {
    console.error('Sticker API load failed:', e)
  }
}

function handleStickerInput(val) {
  const type = document.getElementById('roulette-type-select').value
  if (type !== 'sticker' || !val) {
    document.getElementById('sticker-search-results').style.display = 'none'
    return
  }

  const results = stickerData.filter(s => 
    s.name.toLowerCase().includes(val.toLowerCase()) || 
    s.title.toLowerCase().includes(val.toLowerCase())
  ).slice(0, 20)

  const resDiv = document.getElementById('sticker-search-results')
  if (results.length > 0) {
    resDiv.innerHTML = results.map(s => `
      <div onclick="selectSticker('${s.name}')" style="display: flex; align-items: center; gap: 10px; padding: 8px; cursor: pointer; border-bottom: 1px solid #eee; hover: background: #f8f9fa;">
        <img src="${s.image}" style="width: 30px; height: 30px; object-fit: contain;">
        <div style="flex: 1;">
          <div style="font-size: 12px; font-weight: 700;">${esc(s.title)}</div>
          <div style="font-size: 10px; color: var(--muted);">${s.price}스푼</div>
        </div>
      </div>
    `).join('')
    resDiv.style.display = 'block'
  } else {
    resDiv.style.display = 'none'
  }
}

function selectSticker(name) {
  const customHandler = stickerPickerSelectHandler
  if (typeof customHandler === 'function') {
    stickerPickerSelectHandler = null
    customHandler(name)
    closeStickerPicker()
    return
  }
  document.getElementById('roulette-amount-input').value = name
  document.getElementById('sticker-search-results').style.display = 'none'
  updateRouletteConfig('amount', name)
  updateStickerPreview()
}

// 현재 선택된 스티커의 썸네일/이름 미리보기 갱신
function updateStickerPreview() {
  const input = document.getElementById('roulette-amount-input')
  const preview = document.getElementById('roulette-sticker-preview')
  const img = document.getElementById('roulette-sticker-preview-img')
  const title = document.getElementById('roulette-sticker-preview-title')
  if (!input || !preview) return

  const curName = (input.value || '').trim()
  if (!curName) {
    preview.style.display = 'none'
    return
  }
  const match = stickerData.find(s => s.name === curName || s.title === curName)
  if (match) {
    img.src = match.image || ''
    title.textContent = match.title || match.name
    preview.style.display = 'inline-flex'
  } else {
    // 스티커 목록에 없는 수동 입력값이면 이름만 표시
    img.src = ''
    title.textContent = curName + ' (수동 입력)'
    preview.style.display = 'inline-flex'
  }
}

// 스티커 선택 모달 열기
async function openStickerPicker() {
  document.getElementById('stickerPickerModal').style.display = 'flex'
  document.getElementById('stickerPickerSearch').value = ''
  await loadStickerData()
  // 카테고리 드롭다운 채우기
  const catSelect = document.getElementById('stickerPickerCategory')
  const cats = [...new Set(stickerData.map(s => s.category).filter(c => c))].sort()
  catSelect.innerHTML = '<option value="">전체 카테고리</option>' +
    cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')
  renderStickerPicker()
}

function closeStickerPicker() {
  stickerPickerSelectHandler = null
  document.getElementById('stickerPickerModal').style.display = 'none'
}

function renderStickerPicker() {
  const grid = document.getElementById('stickerPickerGrid')
  const countEl = document.getElementById('stickerPickerCount')
  if (!grid) return
  const keyword = (document.getElementById('stickerPickerSearch').value || '').toLowerCase().trim()
  const catFilter = document.getElementById('stickerPickerCategory').value

  let list = stickerData.slice()
  if (catFilter) list = list.filter(s => s.category === catFilter)
  if (keyword) {
    list = list.filter(s =>
      (s.name || '').toLowerCase().includes(keyword) ||
      (s.title || '').toLowerCase().includes(keyword) ||
      (s.category || '').toLowerCase().includes(keyword)
    )
  }
  list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))

  if (countEl) countEl.textContent = `${list.length}개`

  if (list.length === 0) {
    grid.innerHTML = '<div style="grid-column:1 / -1; text-align:center; padding:40px; color:#94a3b8; font-size:13px;">조건에 맞는 스티커가 없습니다.</div>'
    return
  }

  const curName = (document.getElementById('roulette-amount-input').value || '').trim()

  // innerHTML + onclick 문자열 보간 방식 대신, DOM 생성 방식으로 안전하게 처리
  grid.innerHTML = ''
  list.forEach(s => {
    const isSelected = s.name === curName || s.title === curName
    const card = document.createElement('div')
    card.style.cssText = `position:relative; background:#fff; border:2px solid ${isSelected ? '#7c3aed' : '#eef0f5'}; border-radius:10px; padding:8px; cursor:pointer; text-align:center; transition:all 0.15s;`
    card.addEventListener('mouseover', () => { card.style.borderColor = '#7c3aed'; card.style.transform = 'translateY(-2px)' })
    card.addEventListener('mouseout', () => { card.style.borderColor = isSelected ? '#7c3aed' : '#eef0f5'; card.style.transform = '' })
    card.addEventListener('click', () => pickStickerFromModal(s.name))

    let inner = ''
    if (s.tagBadge) {
      inner += `<span style="position:absolute; top:4px; right:4px; background:#ef4444; color:#fff; font-size:9px; font-weight:700; padding:2px 5px; border-radius:4px;">${esc(s.tagBadge)}</span>`
    }
    inner += `<img src="${esc(s.image || '')}" style="width:72px; height:72px; object-fit:contain; margin:0 auto 6px; display:block;" onerror="this.style.visibility='hidden';">`
    inner += `<div style="font-size:11px; font-weight:700; color:#1e293b; word-break:break-all; line-height:1.3; min-height:28px;">${esc(s.title || s.name)}</div>`
    inner += `<div style="font-size:10px; color:#7c3aed; font-weight:700; margin-top:4px;">💰 ${Number(s.price) || 0}</div>`
    inner += `<div style="font-size:9px; color:#94a3b8; margin-top:2px;">${esc(s.category || '')}</div>`
    card.innerHTML = inner
    grid.appendChild(card)
  })
}

function pickStickerFromModal(name) {
  selectSticker(name)
  closeStickerPicker()
}

function updateRouletteConfig(key, val) {
  if (currentRouletteIdx === -1) return
  rouletteSettings[currentRouletteIdx][key] = val
  if (key === 'name') renderRouletteTabs()
  if (key === 'type') updateRouletteTypeUI()
  saveLocal()
}

function renderRouletteItems() {
  const list = document.getElementById('roulette-item-list')
  const r = rouletteSettings[currentRouletteIdx]
  const items = r.items || []
  
  document.getElementById('roulette-item-count').textContent = `(등록된 항목 ${items.length}개)`
  
  let totalProb = 0
  list.innerHTML = items.map((item, i) => {
    totalProb += parseFloat(item.prob || 0)
    return `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
        <span style="background: var(--green); color: #fff; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px;">${i + 1}</span>
        <label style="display: flex; align-items: center; gap: 4px; font-size: 12px; min-width: 60px;">
          <input type="checkbox" ${item.noLog ? 'checked' : ''} onchange="updateRouletteItem(${i}, 'noLog', this.checked)"> 기록안함
        </label>
        <input type="text" value="${esc(item.name)}" onchange="updateRouletteItem(${i}, 'name', this.value)" style="flex: 1; padding: 8px; border: 1px solid var(--border); border-radius: 6px;" placeholder="항목 이름">
        <input type="number" value="${item.prob}" onchange="updateRouletteItem(${i}, 'prob', this.value)" style="width: 80px; padding: 8px; border: 1px solid var(--border); border-radius: 6px; text-align: right;" step="0.01">
        <span>%</span>
        <button onclick="deleteRouletteItem(${i})" style="background: none; border: 1px solid var(--border); border-radius: 4px; padding: 5px; cursor: pointer; color: var(--red);">🗑️</button>
      </div>
    `
  }).join('')
  
  const probEl = document.getElementById('roulette-total-prob')
  probEl.textContent = `현재 확률: ${totalProb.toFixed(2)}%`
  probEl.style.color = Math.abs(totalProb - 100) < 0.01 ? 'var(--green)' : 'var(--red)'
}

function addRouletteItem() {
  if (currentRouletteIdx === -1) return
  rouletteSettings[currentRouletteIdx].items.push({ name: '', prob: 0, noLog: false })
  saveLocal()
  renderRouletteItems()
}

function updateRouletteItem(idx, key, val) {
  if (currentRouletteIdx === -1) return
  if (key === 'prob') val = parseFloat(val) || 0
  rouletteSettings[currentRouletteIdx].items[idx][key] = val
  saveLocal()
  if (key === 'prob') renderRouletteItems() // 확률 합계 업데이트를 위해 재렌더링
}

function deleteRouletteItem(idx) {
  if (currentRouletteIdx === -1) return
  rouletteSettings[currentRouletteIdx].items.splice(idx, 1)
  saveLocal()
  renderRouletteItems()
}

function resetRouletteProb() {
  if (currentRouletteIdx === -1) return
  if (!confirm('모든 항목의 확률을 0%로 초기화하시겠습니까?')) return
  rouletteSettings[currentRouletteIdx].items.forEach(item => item.prob = 0)
  saveLocal()
  renderRouletteItems()
}

function autoDistributeProb() {
  if (currentRouletteIdx === -1) return
  const items = rouletteSettings[currentRouletteIdx].items
  if (items.length === 0) return
  
  const avg = (100 / items.length).toFixed(2)
  const lastAvg = (100 - (avg * (items.length - 1))).toFixed(2)
  
  items.forEach((item, i) => {
    item.prob = (i === items.length - 1) ? parseFloat(lastAvg) : parseFloat(avg)
  })
  
  saveLocal()
  renderRouletteItems()
}

// ── 스티커음향 관리 ─────────────────────────────────────────────
function normalizeStickerKey(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function findStickerMeta(value) {
  const key = normalizeStickerKey(value)
  if (!key || !Array.isArray(stickerData)) return null
  return stickerData.find(s => normalizeStickerKey(s.name) === key || normalizeStickerKey(s.title) === key) || null
}

function updateStickerSoundPreview() {
  const input = document.getElementById('ssStickerName')
  const preview = document.getElementById('ssStickerPreview')
  const img = document.getElementById('ssStickerPreviewImg')
  const title = document.getElementById('ssStickerPreviewTitle')
  const name = document.getElementById('ssStickerPreviewName')
  if (!input || !preview || !img || !title || !name) return

  if (stickerData.length === 0) {
    loadStickerData().then(() => updateStickerSoundPreview()).catch(() => {})
  }

  const match = findStickerMeta(input.value)
  if (!match) {
    preview.style.display = 'none'
    img.src = ''
    title.textContent = ''
    name.textContent = ''
    return
  }

  img.src = match.image || ''
  title.textContent = match.title || match.name || ''
  name.textContent = match.name || ''
  preview.style.display = 'flex'
}

async function openStickerSoundForm(idx = -1) {
  stickerSoundEditIdx = idx
  await loadStickerData()
  const form = document.getElementById('stickerSoundForm')
  const enabled = document.getElementById('ssEnabled')
  const stickerInput = document.getElementById('ssStickerName')
  const audioDataInput = document.getElementById('ssAudioData')
  const fileNameDisplay = document.getElementById('ssAudioFileName')
  const volumeInput = document.getElementById('ssVolume')
  const volumeVal = document.getElementById('ssVolumeVal')
  const playBtn = document.getElementById('ssAudioPlayBtn')
  if (!form || !enabled || !stickerInput || !audioDataInput) return

  const item = idx >= 0 ? stickerSoundSettings[idx] : null
  enabled.checked = item ? item.enabled !== false : true
  stickerInput.value = item ? (item.stickerName || '') : ''
  audioDataInput.value = item ? (item.audioData || '') : ''
  fileNameDisplay.textContent = item ? (item.fileName || '파일 있음') : '선택된 파일 없음'
  volumeInput.value = item ? (item.volume ?? 100) : 100
  volumeVal.textContent = volumeInput.value
  if (playBtn) playBtn.style.display = item ? 'block' : 'none'

  form.style.display = 'block'
  updateStickerSoundPreview()
}

function closeStickerSoundForm() {
  stickerSoundEditIdx = -1
  const form = document.getElementById('stickerSoundForm')
  if (form) form.style.display = 'none'
  const enabled = document.getElementById('ssEnabled')
  const stickerInput = document.getElementById('ssStickerName')
  const audioDataInput = document.getElementById('ssAudioData')
  const fileNameDisplay = document.getElementById('ssAudioFileName')
  const volumeInput = document.getElementById('ssVolume')
  const volumeVal = document.getElementById('ssVolumeVal')
  const playBtn = document.getElementById('ssAudioPlayBtn')
  if (enabled) enabled.checked = true
  if (stickerInput) stickerInput.value = ''
  if (audioDataInput) audioDataInput.value = ''
  if (fileNameDisplay) fileNameDisplay.textContent = '선택된 파일 없음'
  if (volumeInput) volumeInput.value = 100
  if (volumeVal) volumeVal.textContent = '100'
  if (playBtn) playBtn.style.display = 'none'
  updateStickerSoundPreview()
}

function handleStickerAudioUpload(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (event) => {
    document.getElementById('ssAudioData').value = event.target.result
    document.getElementById('ssAudioFileName').textContent = file.name
    document.getElementById('ssAudioPlayBtn').style.display = 'block'
  }
  reader.readAsDataURL(file)
}

let ssPreviewAudio = null
function previewStickerAudio() {
  const data = document.getElementById('ssAudioData').value
  const volume = parseInt(document.getElementById('ssVolume').value || '100')
  if (!data) return
  if (ssPreviewAudio) {
    ssPreviewAudio.pause()
    ssPreviewAudio = null
  }
  ssPreviewAudio = new Audio(data)
  ssPreviewAudio.volume = volume / 100
  ssPreviewAudio.play()
}

function pickStickerForStickerSound() {
  stickerPickerSelectHandler = (name) => {
    const input = document.getElementById('ssStickerName')
    if (input) input.value = name
    updateStickerSoundPreview()
  }
  openStickerPicker()
}

function saveStickerSoundForm() {
  const enabled = document.getElementById('ssEnabled')
  const stickerInput = document.getElementById('ssStickerName')
  const audioDataInput = document.getElementById('ssAudioData')
  const fileNameDisplay = document.getElementById('ssAudioFileName')
  const volumeInput = document.getElementById('ssVolume')
  if (!enabled || !stickerInput || !audioDataInput) return

  const stickerName = stickerInput.value.trim()
  const audioData = audioDataInput.value
  const fileName = fileNameDisplay.textContent
  const volume = parseInt(volumeInput.value || '100')
  if (!stickerName) return alert('스티커를 선택하거나 이름을 입력해주세요.')
  if (!audioData) return alert('음향 파일을 선택해주세요.')

  const item = {
    enabled: enabled.checked,
    stickerName,
    audioData,
    fileName,
    volume
  }

  if (stickerSoundEditIdx >= 0) stickerSoundSettings[stickerSoundEditIdx] = item
  else stickerSoundSettings.push(item)

  saveLocal()
  renderStickerSoundList()
  closeStickerSoundForm()
}

function toggleStickerSoundItem(idx, checked) {
  if (!stickerSoundSettings[idx]) return
  stickerSoundSettings[idx].enabled = checked
  saveLocal()
  renderStickerSoundList()
}

function deleteStickerSoundItem(idx) {
  if (!stickerSoundSettings[idx]) return
  if (!confirm('이 스티커음향 설정을 삭제하시겠습니까?')) return
  stickerSoundSettings.splice(idx, 1)
  saveLocal()
  renderStickerSoundList()
}

function renderStickerSoundList() {
  const wrap = document.getElementById('stickerSoundList')
  if (!wrap) return

  if (stickerData.length === 0) {
    loadStickerData().then(() => renderStickerSoundList()).catch(() => {})
  }

  if (!Array.isArray(stickerSoundSettings) || stickerSoundSettings.length === 0) {
    wrap.innerHTML = '<div style="text-align:center; padding:48px 20px; color:#94a3b8; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px;">등록된 스티커음향이 없습니다.<br>위의 <b>스티커음향 추가</b> 버튼으로 먼저 등록해주세요.</div>'
    return
  }

  wrap.innerHTML = stickerSoundSettings.map((item, idx) => {
    const meta = findStickerMeta(item.stickerName)
    const titleText = meta ? (meta.title || meta.name || item.stickerName) : item.stickerName
    const subtitle = meta ? (meta.name || item.stickerName) : item.stickerName
    const image = meta && meta.image
      ? `<img src="${esc(meta.image)}" style="width:48px; height:48px; object-fit:contain; border-radius:10px; background:#fff; border:1px solid #e2e8f0;">`
      : `<div style="width:48px; height:48px; border-radius:10px; background:#ede9fe; color:#7c3aed; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:800;">🎵</div>`
    return `
      <div style="display:flex; align-items:center; gap:12px; padding:14px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; margin-bottom:10px;">
        ${image}
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
            <b style="font-size:14px; color:#1e293b;">${esc(titleText)}</b>
            <span style="font-size:11px; color:#64748b; padding:2px 8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:999px;">${esc(subtitle)}</span>
          </div>
          <div style="font-size:12px; color:#10b981; font-weight:700;">🔊 ${esc(item.fileName || '음향 파일')} (볼륨: ${item.volume ?? 100}%)</div>
          <div style="font-size:11px; color:#94a3b8; margin-top:3px;">해당 스티커 수신 시 이 음향이 즉시 재생됩니다.</div>
        </div>
        <label class="roulette-toggle-switch" style="width:42px; height:24px; flex-shrink:0;">
          <input type="checkbox" ${item.enabled !== false ? 'checked' : ''} onchange="toggleStickerSoundItem(${idx}, this.checked)">
          <span class="roulette-toggle-slider"></span>
        </label>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button class="item-btn edit" onclick="openStickerSoundForm(${idx})">수정</button>
          <button class="item-btn del" onclick="deleteStickerSoundItem(${idx})">삭제</button>
        </div>
      </div>
    `
  }).join('')
}

function extractStickerNameFromGiftLog(text) {
  const match = String(text || '').match(/님이\s+\[(.+?)\]\s*스푼\s+\d+개/)
  return match ? String(match[1] || '').trim() : ''
}

function findStickerSoundMatch(stickerName) {
  const key = normalizeStickerKey(stickerName)
  if (!key) return null
  return stickerSoundSettings.find(item => {
    if (!item || item.enabled === false) return false
    const target = normalizeStickerKey(item.stickerName)
    return !!target && (key === target || key.includes(target) || target.includes(key))
  }) || null
}

async function playStickerSoundByGiftLog(text) {
  const stickerName = extractStickerNameFromGiftLog(text)
  if (!stickerName) return
  const match = findStickerSoundMatch(stickerName)
  if (!match || !match.audioData) return

  try {
    addLog('system', '스티커음향', `[${stickerName}] → 음향 재생: ${match.fileName || '파일'} (볼륨: ${match.volume ?? 100}%)`)
  } catch(e) {}
  
  const audio = new Audio(match.audioData)
  audio.volume = (match.volume ?? 100) / 100
  audio.play().catch(err => {
    console.error('Sticker audio play failed:', err)
  })
}

// ── 신청곡 관리 ──────────────────────────────────────────────────
function renderSongs() {
  const tbody = document.getElementById('songTbody');
  if (!tbody) return;
  
  if (songList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px; color: var(--muted);">신청곡이 없습니다.</td></tr>';
  } else {
    tbody.innerHTML = songList.map((s, i) => `
      <tr data-id="${i}" style="border-bottom: 1px solid #f1f5f9;">
        <td style="text-align:center; font-weight:700; cursor:grab; padding: 10px;" class="drag-handle">☰</td>
        <td style="text-align:center; font-weight:700; padding: 10px;">${i + 1}</td>
        <td style="font-weight:600; color:var(--accent); padding: 10px;">${esc(s.artist)} - ${esc(s.title)}</td>
        <td style="color:var(--muted); padding: 10px;">${esc(s.user)}</td>
        <td style="text-align:center; padding: 10px;">
          <button class="item-btn" style="padding:4px 8px; background:#ff0000; color:#fff; display:inline-flex; align-items:center; gap:4px;" onclick="playSongOnYoutube('${esc(s.artist)}', '${esc(s.title)}')">▶ 재생</button>
        </td>
        <td style="text-align:center; padding: 10px;">
          <button class="item-btn del" style="padding:4px 8px;" onclick="removeSong(${i})">제거</button>
        </td>
      </tr>
    `).join('');

    // SortableJS 재설정 (목록 갱신 시마다 data-id를 새로 고침하기 위해 기존 인스턴스 파괴 후 재생성)
    if (window.songSortable) {
      window.songSortable.destroy();
    }
    window.songSortable = new Sortable(tbody, {
      handle: '.drag-handle',
      animation: 150,
      onEnd: function() {
        const newOrder = [];
        tbody.querySelectorAll('tr').forEach(tr => {
          const idx = parseInt(tr.getAttribute('data-id'));
          newOrder.push(songList[idx]);
        });
        songList = newOrder;
        saveLocal();
        renderSongs();
        // 봇 엔진에 변경된 목록 전송
        ipc.send('config:update', { commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData });
      }
    });
  }

  const btnStatus = document.getElementById('btnSongStatus');
  if (btnStatus) {
    if (songSettings.enabled) {
      btnStatus.textContent = '🟢 접수 중';
      btnStatus.style.background = '#dcfce7';
      btnStatus.style.color = '#16a34a';
      btnStatus.style.borderColor = '#16a34a';
    } else {
      btnStatus.textContent = '🔴 마감됨';
      btnStatus.style.background = '#fee2e2';
      btnStatus.style.color = '#dc2626';
      btnStatus.style.borderColor = '#dc2626';
    }
  }
}

function toggleSongStatus() {
  songSettings.enabled = !songSettings.enabled;
  saveLocal();
  renderSongs();
}

function addSongManual() {
  const input = document.getElementById('songInput');
  const val = input.value.trim();
  if (!val) return;
  
  // 가수와 제목 분리 시도 (공백 기준)
  const parts = val.split(/\s+/);
  let artist = '알수없음', title = val;
  if (parts.length >= 2) {
    artist = parts[0];
    title = parts.slice(1).join(' ');
  }
  
  const newSong = { artist, title, user: 'DJ' };
  if (songSettings.priority) {
    songList.unshift(newSong);
  } else {
    songList.push(newSong);
  }
  input.value = '';
  saveLocal();
  renderSongs();
}

function updateSongOpt(key, val) {
  songSettings[key] = val;
  saveLocal();
}

function saveSongCustom() {
  const cmd = document.getElementById('fSongCmd').value.trim() || '!신청곡';
  const delCmd = document.getElementById('fSongDelCmd').value.trim() || '!제거';
  const resetCmd = document.getElementById('fSongResetCmd').value.trim() || '리셋';
  const stopCmd = document.getElementById('fSongStopCmd').value.trim() || '!마감';
  const startCmd = document.getElementById('fSongStartCmd').value.trim() || '!접수';
  const priorityOnCmd = document.getElementById('fSongPriorityOnCmd').value.trim() || '!우선온';
  const priorityOffCmd = document.getElementById('fSongPriorityOffCmd').value.trim() || '!우선오프';
  const regFormat = document.getElementById('fSongRegFormat').value.trim() || '✅ [{artist} - {title}] 신청 완료! (대기: {count}번)';
  const listHeader = document.getElementById('fSongListHeader').value.trim() || '🎵 현재 신청곡 목록 🎵';
  const listFormat = document.getElementById('fSongListFormat').value.trim() || '{index}. {artist} - {title}';

  songSettings.customCmd = cmd.startsWith('!') ? cmd : '!' + cmd;
  songSettings.delCmd = delCmd.startsWith('!') ? delCmd : '!' + delCmd;
  songSettings.resetCmd = resetCmd;
  songSettings.stopCmd = stopCmd.startsWith('!') ? stopCmd : '!' + stopCmd;
  songSettings.startCmd = startCmd.startsWith('!') ? startCmd : '!' + startCmd;
  songSettings.priorityOnCmd = priorityOnCmd.startsWith('!') ? priorityOnCmd : '!' + priorityOnCmd;
  songSettings.priorityOffCmd = priorityOffCmd.startsWith('!') ? priorityOffCmd : '!' + priorityOffCmd;
  songSettings.regFormat = regFormat;
  songSettings.listHeader = listHeader;
  songSettings.listFormat = listFormat;

  saveLocal();
  updateSongGuide();
  alert('신청곡 커스텀 설정이 저장되었습니다.');
}

function updateSongGuide() {
  const cmd = songSettings.customCmd || '!신청곡';
  const delCmd = songSettings.delCmd || '!제거';
  const resetCmd = songSettings.resetCmd || '리셋';
  const stopCmd = songSettings.stopCmd || '!마감';
  const startCmd = songSettings.startCmd || '!접수';
  
  const gCmd = document.getElementById('guideSongCmd');
  const gCmd2 = document.getElementById('guideSongCmd2');
  const gDel = document.getElementById('guideSongDelCmd');
  const gResetFull = document.getElementById('guideSongResetCmdFull');
  const gResetOnly = document.getElementById('guideSongResetCmdOnly');
  const gStop = document.getElementById('guideSongStopCmd');
  const gStart = document.getElementById('guideSongStartCmd');

  if (gCmd) gCmd.textContent = cmd;
  if (gCmd2) gCmd2.textContent = cmd;
  if (gDel) gDel.textContent = delCmd;
  if (gResetFull) gResetFull.textContent = cmd + ' ' + resetCmd;
  if (gResetOnly) gResetOnly.textContent = resetCmd.startsWith('!') ? resetCmd : '!' + resetCmd;
  if (gStop) gStop.textContent = stopCmd;
  if (gStart) gStart.textContent = startCmd;
}

let ytPlayer = null;
let isPlayerReady = false;
let pendingVideoId = null;  // Player가 준비되기 전에 재생 요청된 비디오 ID

function onYouTubeIframeAPIReady() {
  console.log('[YT] IFrame API 로드 완료, Player 생성 시작');
  try {
    ytPlayer = new YT.Player('youtubeIframe', {
      height: '180',
      width: '320',
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        'autoplay': 0,
        'controls': 1,
        'modestbranding': 1,
        'loop': 0,
        'fs': 0,
        'iv_load_policy': 3,
        'playsinline': 1,
        'rel': 0
      },
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange,
        'onError': onPlayerError
      }
    });
    console.log('[YT] Player 객체 생성 완료, onReady 대기 중');
  } catch(e) {
    console.error('[YT] Player 생성 실패:', e);
  }
}

function onPlayerReady(event) {
  console.log('YouTube Player Ready');
  isPlayerReady = true;
  try {
    event.target.unMute();
    event.target.setVolume(100);
  } catch(e) {
    console.log('Volume control:', e);
  }
  // Player 준비 전에 요청된 곡이 있으면 지금 재생
  if (pendingVideoId) {
    const vid = pendingVideoId;
    pendingVideoId = null;
    try {
      ytPlayer.loadVideoById(vid);
      ytPlayer.unMute();
      ytPlayer.setVolume(100);
    } catch(e) { console.warn('pending 재생 실패:', e); }
  }
}

function onPlayerError(event) {
  console.error('YouTube Player Error:', event.data);
  const statusText = document.getElementById('playingStatusText');
  const errMsgMap = {
    2: '잘못된 비디오 ID',
    5: 'HTML5 플레이어 오류',
    100: '비디오를 찾을 수 없음 (삭제되었거나 비공개)',
    101: '이 곡은 외부 재생이 금지됨',
    150: '이 곡은 외부 재생이 금지됨',
    152: '재생 불가 (YouTube 정책 또는 지역 제한)',
    153: 'Referer 헤더 누락 (Electron 재시작 필요)'
  };
  const msg = errMsgMap[event.data] || `알 수 없는 오류 (code: ${event.data})`;

  // 재생 불가 계열 에러는 다음 검색 후보로 자동 재시도
  const retryableCodes = [100, 101, 150, 152];
  if (retryableCodes.includes(event.data) && currentPlayQueue && currentPlayQueue.length > 0) {
    console.log(`[YT] ${msg} → 다음 후보로 재시도 (${currentPlayQueue.length}개 남음)`);
    if (statusText && currentPlayInfo) {
      statusText.textContent = `${currentPlayInfo.artist} - ${currentPlayInfo.title} (${msg} → 다음 후보 시도)`;
    }
    // 짧은 딜레이 후 다음 곡 시도
    setTimeout(() => tryPlayNext(), 500);
    return;
  }

  if (statusText) statusText.textContent = `재생 오류: ${msg}`;
}

function onPlayerStateChange(event) {
  const playPauseBtn = document.getElementById('playPauseBtn');

  if (event.data == YT.PlayerState.PLAYING) {
    try {
      // 볼륨은 슬라이더 값 존중 (매번 100으로 초기화하지 않음)
      const vol = parseInt(document.getElementById('playVolumeSlider')?.value || '100', 10);
      event.target.unMute();
      event.target.setVolume(vol);
    } catch(e) {
      console.log('Unmute on play:', e);
    }
    if (playPauseBtn) playPauseBtn.innerHTML = '⏸ 일시정지';
    startProgressTimer();
  } else if (event.data == YT.PlayerState.PAUSED) {
    if (playPauseBtn) playPauseBtn.innerHTML = '▶ 재생';
    stopProgressTimer();
  } else if (event.data == YT.PlayerState.ENDED) {
    stopYoutubePlayer();
  } else if (event.data == YT.PlayerState.BUFFERING) {
    // 버퍼링 중에도 타이머 유지 (짧은 버퍼링은 UI 깜빡임 방지)
  }
}

// ─────────── 재생바/컨트롤 관련 함수들 ───────────
let progressTimer = null;

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' + s : s);
}

function updateProgressBar() {
  if (!ytPlayer || !isPlayerReady) return;
  try {
    const cur = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0;
    const dur = ytPlayer.getDuration ? ytPlayer.getDuration() : 0;
    const curEl = document.getElementById('playCurrentTime');
    const totEl = document.getElementById('playTotalTime');
    const barEl = document.getElementById('playProgressBar');
    if (curEl) curEl.textContent = formatTime(cur);
    if (totEl) totEl.textContent = formatTime(dur);
    if (barEl) {
      const pct = (dur > 0) ? (cur / dur * 100) : 0;
      barEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
    }
  } catch(e) {}
}

function startProgressTimer() {
  stopProgressTimer();
  progressTimer = setInterval(updateProgressBar, 500);
  updateProgressBar();
}

function stopProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function togglePlayPause() {
  if (!ytPlayer || !isPlayerReady) return;
  try {
    const state = ytPlayer.getPlayerState ? ytPlayer.getPlayerState() : -1;
    if (state === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  } catch(e) { console.warn('togglePlayPause 실패:', e); }
}

function setPlayerVolume(v) {
  if (!ytPlayer || !isPlayerReady) return;
  try {
    const vol = parseInt(v, 10) || 0;
    if (vol === 0) ytPlayer.mute(); else ytPlayer.unMute();
    ytPlayer.setVolume(vol);
  } catch(e) { console.warn('볼륨 설정 실패:', e); }
}

function seekByClick(event) {
  if (!ytPlayer || !isPlayerReady) return;
  try {
    const container = document.getElementById('playProgressContainer');
    const dur = ytPlayer.getDuration ? ytPlayer.getDuration() : 0;
    if (!container || !dur) return;
    const rect = container.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const seekTo = dur * Math.max(0, Math.min(1, ratio));
    ytPlayer.seekTo(seekTo, true);
    updateProgressBar();
  } catch(e) { console.warn('seek 실패:', e); }
}

// 현재 재생 대기열 (검색 결과가 여러 개인 경우 실패 시 다음 걸로 재시도)
let currentPlayQueue = [];
let currentPlayInfo = null;

// 검색 결과를 원곡(공식 오디오) 우선으로 정렬하는 점수 함수
function scoreYoutubeItem(item, artist, title) {
  const snippet = item.snippet || {};
  const videoTitle = (snippet.title || '').toLowerCase();
  const channelTitle = (snippet.channelTitle || '').toLowerCase();
  const description = (snippet.description || '').toLowerCase();
  const artistL = (artist || '').toLowerCase();
  const titleL = (title || '').toLowerCase();

  let score = 0;

  // 1) "- Topic" 채널은 YouTube Music이 자동 생성하는 공식 오디오 채널. 최우선.
  if (channelTitle.endsWith(' - topic') || channelTitle.includes('- topic')) score += 100;

  // 2) 채널명에 아티스트 이름이 들어가면 공식 채널일 가능성 ↑
  if (artistL && channelTitle.includes(artistL)) score += 30;

  // 3) VEVO 같은 공식 배급 채널
  if (channelTitle.includes('vevo') || channelTitle.includes('official')) score += 25;

  // 4) 제목/설명에 "audio", "official audio" 같은 키워드 (오디오 전용 업로드)
  if (/\b(official\s*audio|audio\s*only|official\s*sound|lyrics?|가사)\b/i.test(videoTitle)) score += 40;

  // 5) 감점: 커버/리믹스/라이브/레슨 등은 원곡이 아님
  const negativeKeywords = ['cover', '커버', 'remix', '리믹스', 'live', '라이브', 'lesson', '강의',
                             'reaction', '리액션', 'tutorial', 'karaoke', '노래방', 'mr', '반주',
                             'instrumental', 'piano', '피아노', 'acoustic', 'slowed', 'sped up',
                             'nightcore', 'mashup', '매쉬업', 'parody', '패러디'];
  for (const kw of negativeKeywords) {
    if (videoTitle.includes(kw)) score -= 40;
  }

  // 6) 가점: 공식 뮤직비디오 (M/V, MV)도 원곡 소스라 괜찮음 (오디오 채널 다음 순위)
  if (/\b(m\/v|mv|official\s*(music\s*)?video)\b/i.test(videoTitle)) score += 20;

  // 7) 정확히 "아티스트명 - 제목" 형식이면 가점
  if (artistL && titleL && videoTitle.includes(artistL) && videoTitle.includes(titleL)) score += 15;

  return score;
}

async function playSongOnYoutube(artist, title) {
  const statusText = document.getElementById('playingStatusText');
  const statusBar = document.getElementById('playingStatusBar');
  const apiKey = 'AIzaSyAIm_oM2903zJF1vkPbjd42VxlUn5KVDmY';
  
  if (statusText && statusBar) {
    statusText.textContent = `${artist} - ${title} (검색 중...)`;
    statusBar.style.display = 'block';
  }

  currentPlayInfo = { artist, title };
  currentPlayQueue = [];

  try {
    // 원곡/공식 오디오를 우선 찾기 위해 두 개의 검색을 병렬로 실행:
    // 1) "아티스트 제목 audio" → Topic 채널/공식 오디오 위주
    // 2) "아티스트 제목" → 일반 검색 (MV 포함)
    const q1 = `${artist} ${title} audio`;
    const q2 = `${artist} ${title}`;
    const mkUrl = (q) => `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoEmbeddable=true&videoCategoryId=10&maxResults=10&key=${apiKey}`;

    const [r1, r2] = await Promise.all([
      fetch(mkUrl(q1)).then(r => r.json()).catch(() => ({ items: [] })),
      fetch(mkUrl(q2)).then(r => r.json()).catch(() => ({ items: [] })),
    ]);

    // API 에러 체크
    if (r1.error && r2.error) {
      console.error('YouTube API Error:', r1.error, r2.error);
      if (statusText) statusText.textContent = `API 오류: ${(r1.error || r2.error).message || '알 수 없는 오류'}`;
      return;
    }

    // 결과 병합 (중복 제거)
    const seen = new Set();
    const merged = [];
    [...(r1.items || []), ...(r2.items || [])].forEach(item => {
      const vid = item.id && item.id.videoId;
      if (vid && !seen.has(vid)) {
        seen.add(vid);
        merged.push(item);
      }
    });

    if (merged.length === 0) {
      if (statusText) statusText.textContent = `${artist} - ${title} (곡을 찾을 수 없음)`;
      console.log('No video found');
      return;
    }

    // 점수순 정렬 (높은 점수가 원곡에 가까움)
    const scored = merged.map(item => ({
      item,
      score: scoreYoutubeItem(item, artist, title),
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle
    })).sort((a, b) => b.score - a.score);

    console.log('[YT] 원곡 우선 정렬된 후보 (점수순):');
    scored.slice(0, 8).forEach(s => {
      console.log(`  [점수 ${s.score}] ${s.channel} - ${s.title} (id: ${s.videoId})`);
    });

    currentPlayQueue = scored.map(s => s.videoId);
    tryPlayNext();

  } catch (e) {
    console.error('재생 오류:', e);
    if (statusText) statusText.textContent = `재생 오류: ${e.message}`;
  }
}

function tryPlayNext() {
  const statusText = document.getElementById('playingStatusText');
  if (!currentPlayQueue || currentPlayQueue.length === 0) {
    if (statusText && currentPlayInfo) {
      statusText.textContent = `${currentPlayInfo.artist} - ${currentPlayInfo.title} (재생 가능한 영상을 찾지 못했습니다)`;
    }
    return;
  }

  const videoId = currentPlayQueue.shift();
  console.log('[YT] 재생 시도 비디오 ID:', videoId, '(남은 후보:', currentPlayQueue.length + ')');

  const tryPlay = (attempt = 0) => {
    const maxAttempts = 50;

    if (ytPlayer && isPlayerReady && typeof ytPlayer.loadVideoById === 'function') {
      try {
        ytPlayer.loadVideoById(videoId);
        setTimeout(() => {
          try {
            const vol = parseInt(document.getElementById('playVolumeSlider')?.value || '100', 10);
            ytPlayer.unMute();
            ytPlayer.setVolume(vol);
            ytPlayer.playVideo();
            console.log('[YT] 재생 시작 + 볼륨 ' + vol);

            // 현재 곡 정보를 main 프로세스(engine)로 송신 → !현재곡 명령어 응답용
            // getVideoData()가 로딩 직후라 조금 지연 줌
            setTimeout(() => {
              try {
                const vd = (ytPlayer.getVideoData && ytPlayer.getVideoData()) || {};
                ipc.send('song:now-playing', {
                  artist: currentPlayInfo ? currentPlayInfo.artist : '',
                  title: currentPlayInfo ? currentPlayInfo.title : '',
                  videoId: videoId,
                  videoTitle: vd.title || '',
                  channelTitle: vd.author || '',
                  startedAt: Date.now()
                });
              } catch(e) { console.warn('[YT] now-playing IPC 송신 실패:', e); }
            }, 800);
          } catch(e) { console.warn('볼륨/재생 제어 실패:', e); }
        }, 300);
        if (statusText && currentPlayInfo) {
          statusText.textContent = `${currentPlayInfo.artist} - ${currentPlayInfo.title} (재생 중)`;
        }
      } catch(e) {
        console.error('loadVideoById 실패:', e);
        if (statusText) statusText.textContent = `재생 시작 실패: ${e.message}`;
      }
    } else if (attempt < maxAttempts) {
      if (statusText && currentPlayInfo) {
        statusText.textContent = `${currentPlayInfo.artist} - ${currentPlayInfo.title} (플레이어 준비 중... ${Math.floor(attempt/5)}초)`;
      }
      setTimeout(() => tryPlay(attempt + 1), 200);
    } else {
      console.warn('[YT] Player 준비 타임아웃, iframe src 방식으로 fallback');
      const container = document.getElementById('youtubePlayerContainer');
      if (container) {
        container.innerHTML = `<iframe id="youtubeIframe" width="320" height="180" src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        if (statusText && currentPlayInfo) {
          statusText.textContent = `${currentPlayInfo.artist} - ${currentPlayInfo.title} (재생 중 - fallback)`;
        }
      }
    }
  };

  tryPlay(0);
}

function stopYoutubePlayer() {
  const statusBar = document.getElementById('playingStatusBar');
  if (statusBar) statusBar.style.display = 'none';
  pendingVideoId = null;
  currentPlayQueue = [];
  currentPlayInfo = null;
  stopProgressTimer();
  // 진행바/시간 초기화
  const barEl = document.getElementById('playProgressBar');
  const curEl = document.getElementById('playCurrentTime');
  const totEl = document.getElementById('playTotalTime');
  if (barEl) barEl.style.width = '0%';
  if (curEl) curEl.textContent = '0:00';
  if (totEl) totEl.textContent = '0:00';
  // 현재곡 정보 초기화 알림
  try { ipc.send('song:now-playing', null); } catch(e) {}
  try {
    if (ytPlayer && isPlayerReady && typeof ytPlayer.stopVideo === 'function') {
      ytPlayer.stopVideo();
    }
  } catch(e) { console.warn('정지 실패:', e); }
}

function removeSong(i) {
  if (!confirm('해당 신청곡을 제거하시겠습니까?')) return;
  songList.splice(i, 1);
  saveLocal();
  renderSongs();
}

function clearSongs() {
  if (!confirm('모든 신청곡 목록을 초기화하시겠습니까?')) return;
  songList = [];
  saveLocal();
  renderSongs();
}

async function init() {
  // 자동 접속 설정 로드
  const savedAutoJoin = localStorage.getItem('spoon_auto_join_tag');
  if (savedAutoJoin) {
    window.ipc.send('bot:set-auto-join', savedAutoJoin);
    document.getElementById('autoJoinStatus').style.display = 'block';
    document.getElementById('autoJoinTagText').textContent = '@' + savedAutoJoin;
    document.getElementById('dashRankInput').value = savedAutoJoin;
    // 시작 시 랭킹 자동 업데이트 (UI 업데이트 포함)
    setTimeout(() => dashSetAutoJoin(), 1000);
  }

  try {
    // 룰렛 기록 파일에서 로드 (localStorage보다 우선)
    if (window.store) {
      rouletteHistory = (await window.store.get('roulette_history.json')) || {};
    } else {
      rouletteHistory = JSON.parse(localStorage.getItem('spoon_roulette_history') || '{}');
    }
    // 옵션 체크박스 초기화
    if (document.getElementById('optShowPercent')) document.getElementById('optShowPercent').checked = fundingOptions.showPercent;
    if (document.getElementById('optShowDday')) document.getElementById('optShowDday').checked = fundingOptions.showDday;
    if (document.getElementById('optSongPriority')) document.getElementById('optSongPriority').checked = songSettings.priority;
    
    // 신청곡 커스텀 초기화
    if (document.getElementById('fSongCmd')) document.getElementById('fSongCmd').value = songSettings.customCmd || '!신청곡';
    if (document.getElementById('fSongDelCmd')) document.getElementById('fSongDelCmd').value = songSettings.delCmd || '!제거';
    if (document.getElementById('fSongResetCmd')) document.getElementById('fSongResetCmd').value = songSettings.resetCmd || '리셋';
    if (document.getElementById('fSongStopCmd')) document.getElementById('fSongStopCmd').value = songSettings.stopCmd || '!마감';
    if (document.getElementById('fSongStartCmd')) document.getElementById('fSongStartCmd').value = songSettings.startCmd || '!접수';
    if (document.getElementById('fSongRegFormat')) document.getElementById('fSongRegFormat').value = songSettings.regFormat || '✅ [{artist} - {title}] 신청 완료! (대기: {count}번)';
    if (document.getElementById('fSongListHeader')) document.getElementById('fSongListHeader').value = songSettings.listHeader || '🎵 현재 신청곡 목록 🎵';
    if (document.getElementById('fSongListFormat')) document.getElementById('fSongListFormat').value = songSettings.listFormat || '{index}. {artist} - {title}';
    updateSongGuide();

    if (document.getElementById('shieldDisplay')) document.getElementById('shieldDisplay').textContent = shieldCount.toLocaleString('ko-KR');
    // 실드 커스텀 명령어 초기화
    const shieldCmd = shieldOptions.customCmd || '!실드';
    if (document.getElementById('fShieldCmd')) document.getElementById('fShieldCmd').value = shieldCmd;
    if (document.getElementById('fShieldFormat')) document.getElementById('fShieldFormat').value = shieldOptions.format;
    if (document.getElementById('fShieldUpdateFormat')) document.getElementById('fShieldUpdateFormat').value = shieldOptions.updateFormat;
    // 안내 가이드 텍스트 초기화
    const guideCmd = document.getElementById('guideCmd');
    const guideCmdPlus = document.getElementById('guideCmdPlus');
    const guideCmdMinus = document.getElementById('guideCmdMinus');
    if (guideCmd) guideCmd.textContent = shieldCmd;
    if (guideCmdPlus) guideCmdPlus.textContent = shieldCmd + ' +5';
    if (guideCmdMinus) guideCmdMinus.textContent = shieldCmd + ' -3';
    const shieldCardDesc = document.getElementById('shieldCardDesc');
    if (shieldCardDesc) shieldCardDesc.textContent = `실드 개수를 관리합니다. DJ/매니저는 ${shieldCmd} [+숫자/-숫자]로 조절 가능하며, 일반 유저는 ${shieldCmd}로 조회만 가능합니다.`;
    
    renderCmds(); 
    renderHKs(); 
    renderJoins(); 
    renderAutoSettings(); 
    renderFundings();
    renderSongs();
    renderRouletteTabs();
    renderRouletteDetail();
    renderDashboard();
    // 자정 todayLog 초기화
    const nowD = new Date();
    const msToMidnight = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate()+1) - nowD;
    setTimeout(function resetTodayLog() {
      dashData.spoonRanking._todayLog = {};
      saveDashData();
      renderDashboard();
      setTimeout(resetTodayLog, 86400000);
    }, msToMidnight);
    // 기타모듈 초기화
    if (document.getElementById('diceCmdInput')) document.getElementById('diceCmdInput').value = miscSettings.diceCmd;
    if (document.getElementById('diceMsgInput')) document.getElementById('diceMsgInput').value = miscSettings.diceMsg;
    if (document.getElementById('timerCmdInput')) document.getElementById('timerCmdInput').value = miscSettings.timerCmd;
    if (document.getElementById('timerSetMsgInput')) document.getElementById('timerSetMsgInput').value = miscSettings.timerSetMsg;
    if (document.getElementById('timerAlertMsgInput')) document.getElementById('timerAlertMsgInput').value = miscSettings.timerAlertMsg;
    if (document.getElementById('ddayCmdInput')) document.getElementById('ddayCmdInput').value = miscSettings.ddayCmd;
    if (document.getElementById('ddaySetMsgInput')) document.getElementById('ddaySetMsgInput').value = miscSettings.ddaySetMsg;
    renderTimerList();
    renderDdayList();
    // ── 애청지수 초기화 ──
    actSettings = Object.assign({}, ACT_DEFAULTS, JSON.parse(localStorage.getItem('spoon_act_settings') || '{}'));    // actData: 파일 우선, 없으면 localStorage
    if (window.store) {
      const fileActData = await window.store.get('act_data.json');
      actData = (fileActData && Object.keys(fileActData).length > 0) ? fileActData : JSON.parse(localStorage.getItem('spoon_act_data') || '{}');
    } else {
      actData = JSON.parse(localStorage.getItem('spoon_act_data') || '{}');
    }
    actInitInputs();
    actRenderList();
    // ── TTS 초기화 ──
    ttsSettings = Object.assign({}, TTS_DEFAULTS, JSON.parse(localStorage.getItem('spoon_tts_settings') || '{}'));
    ttsInitInputs();
  } catch (e) {
    console.error('Init error:', e);
  }
}


function showAddUserModal() {
  document.getElementById('addUserNickname').value = '';
  document.getElementById('addUserTag').value = '';
  const m = document.getElementById('addUserModal');
  m.style.display = 'flex';
}
function closeAddUserModal() {
  document.getElementById('addUserModal').style.display = 'none';
}
function confirmAddUser() {
  const nickname = document.getElementById('addUserNickname').value.trim();
  const tag = document.getElementById('addUserTag').value.trim();
  if (!nickname || !tag) { alert('닉네임과 고유닉을 모두 입력해주세요.'); return; }
  if (!rouletteHistory[tag]) rouletteHistory[tag] = {};
  rouletteHistory[tag]._nickname = nickname;
  saveRouletteHistory();
  closeAddUserModal();
  selectedHistoryUser = tag;
  renderRouletteHistory();
}

function showAddKeepItemModal(tag) {
  document.getElementById('addKeepItemTag').value = tag;
  document.getElementById('addKeepItemName').value = '';
  document.getElementById('addKeepItemCount').value = '1';
  const m = document.getElementById('addKeepItemModal');
  m.style.display = 'flex';
}
function closeAddKeepItemModal() {
  document.getElementById('addKeepItemModal').style.display = 'none';
}
function confirmAddKeepItem() {
  const tag = document.getElementById('addKeepItemTag').value;
  const itemName = document.getElementById('addKeepItemName').value.trim();
  const count = parseInt(document.getElementById('addKeepItemCount').value) || 1;
  if (!itemName) { alert('항목 이름을 입력해주세요.'); return; }
  if (!rouletteHistory[tag]) rouletteHistory[tag] = {};
  if (!rouletteHistory[tag]['킵목록']) rouletteHistory[tag]['킵목록'] = {};
  rouletteHistory[tag]['킵목록'][itemName] = (rouletteHistory[tag]['킵목록'][itemName] || 0) + count;
  saveRouletteHistory();
  closeAddKeepItemModal();
  renderUserDetail(tag);
}

// ── 룰렛권 관리 ──────────────────────────────────────────────
function showCouponModal(tag) {
  document.getElementById('couponModalTag').value = tag;
  const data = rouletteHistory[tag] || {};
  const nickname = data._nickname || tag;
  document.getElementById('couponModalSubtitle').innerHTML = `👤 <b>${esc(nickname)}</b> <span style="color:#94a3b8;">(${esc(tag)})</span>`;
  renderCouponList();
  document.getElementById('couponModal').style.display = 'flex';
}

function closeCouponModal() {
  document.getElementById('couponModal').style.display = 'none';
}

function renderCouponList() {
  const tag = document.getElementById('couponModalTag').value;
  const listEl = document.getElementById('couponList');
  if (!listEl) return;

  if (!rouletteSettings || rouletteSettings.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#94a3b8; font-size:13px;">등록된 룰렛이 없습니다.<br>먼저 [룰렛 설정] 탭에서 룰렛을 만들어주세요.</div>';
    return;
  }

  const coupons = (rouletteHistory[tag] && rouletteHistory[tag]['룰렛권']) || {};

  let html = '';
  rouletteSettings.forEach((r, i) => {
    const idx = i + 1;
    const count = Number(coupons[String(idx)] || 0);
    const cmd = `!룰렛${idx}`;
    html += `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; background:#f8fafc; border:1px solid #eef0f5; border-radius:10px;">
        <div style="display:flex; flex-direction:column; gap:2px;">
          <div style="font-weight:700; font-size:13px; color:#1e293b;">🎡 룰렛${idx} <span style="font-size:11px; color:#7c3aed; font-weight:600;">${esc(r.name || '')}</span></div>
          <div style="font-size:10px; color:#94a3b8;">사용 명령어: <b>${cmd} [수량]</b></div>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <button onclick="changeCoupon('${tag}', ${idx}, -1)" style="width:28px; height:28px; border-radius:6px; border:1px solid #e2e8f0; background:#fff; cursor:pointer; font-weight:700; color:#ef4444;">-</button>
          <div style="min-width:42px; text-align:center; padding:4px 8px; background:#fff; border:1px solid #e2e8f0; border-radius:6px; font-weight:700; color:#7c3aed; font-size:13px;">${count}</div>
          <button onclick="changeCoupon('${tag}', ${idx}, 1)" style="width:28px; height:28px; border-radius:6px; border:1px solid #e2e8f0; background:#fff; cursor:pointer; font-weight:700; color:#10b981;">+</button>
          <button onclick="setCouponAmount('${tag}', ${idx})" style="margin-left:4px; padding:4px 10px; border-radius:6px; border:1px solid #7c3aed; background:#fff; color:#7c3aed; font-size:11px; font-weight:700; cursor:pointer;">지급</button>
        </div>
      </div>
    `;
  });
  listEl.innerHTML = html;
}

function changeCoupon(tag, idx, delta) {
  if (!rouletteHistory[tag]) rouletteHistory[tag] = {};
  if (!rouletteHistory[tag]['룰렛권']) rouletteHistory[tag]['룰렛권'] = {};
  const key = String(idx);
  const cur = Number(rouletteHistory[tag]['룰렛권'][key] || 0);
  let next = cur + delta;
  if (next < 0) next = 0;
  rouletteHistory[tag]['룰렛권'][key] = next;
  saveRouletteHistory();
  renderCouponList();
}

function setCouponAmount(tag, idx) {
  const input = prompt(`룰렛${idx} 지급 수량을 입력하세요. (+숫자 적립 / -숫자 차감 / 숫자 지정)`, '1');
  if (input === null) return;
  const val = input.trim();
  if (!val) return;

  if (!rouletteHistory[tag]) rouletteHistory[tag] = {};
  if (!rouletteHistory[tag]['룰렛권']) rouletteHistory[tag]['룰렛권'] = {};
  const key = String(idx);
  const cur = Number(rouletteHistory[tag]['룰렛권'][key] || 0);
  let next;

  if (val.startsWith('+')) {
    const amt = parseInt(val.substring(1));
    if (isNaN(amt)) { alert('숫자를 입력해주세요.'); return; }
    next = cur + amt;
  } else if (val.startsWith('-')) {
    const amt = parseInt(val.substring(1));
    if (isNaN(amt)) { alert('숫자를 입력해주세요.'); return; }
    next = cur - amt;
  } else {
    const amt = parseInt(val);
    if (isNaN(amt)) { alert('숫자를 입력해주세요.'); return; }
    next = amt;
  }

  if (next < 0) next = 0;
  rouletteHistory[tag]['룰렛권'][key] = next;
  saveRouletteHistory();
  renderCouponList();
}

// ══════════════════════════════════════════════════════
//  ⭐ 애청지수 모듈
// ══════════════════════════════════════════════════════

// ── 기본 설정값 ──
const ACT_DEFAULTS = {
  scoreHeart: 1,
  scoreChat: 2,
  scoreAttend: 10,
  scoreLottoPoint: 5,
  lotto1st: 3000,
  lotto2nd: 500,
  lotto3rd: 100,
  lottoFail: 1,
  lottoExchange: 22,
  lvBase: 100,
  lvExp: 1.3,
  lvMax: 100,
  cmdMyInfo: '!내정보',
  cmdCreate: '!내정보 생성',
  cmdDelete: '!내정보 삭제',
  cmdRank: '!랭킹',
  cmdLotto: '!복권',
  cmdAttend: '!출석',
  cmdAt: '@',
  cmdLottoGive: '!복권지급',
  cmdShop: '!상점',
  msgMyInfo: "[ '{nickname}'님 활동정보 ]\n순위 : {rank}위\n레벨 : {level} ({exp}/{nextExp})\n하트 : {heart}\n채팅 : {chat}\n출석 : {attend}\n복권포인트 : {lp}/{lpMax}\n복권 : {lotto}",
  msgCreate: '✅ {nickname}님의 애청지수 정보가 생성되었습니다!',
  msgDeleteOk: '🗑️ {nickname}님의 애청지수 정보가 삭제되었습니다.',
  msgRankHeader: '🏆 애청지수 TOP 5 🏆',
  msgRankLine: '{rank}위: {nickname} (Lv.{level})',
  msgLottoHeader: '🎰 {nickname}님의 복권 {count}개 지정 결과',
  msgLottoAutoHeader: '🎰 {nickname}님의 복권 {count}개 자동 결과',
  msgLottoWin: '🎊당첨번호:{winNums}',
  msgLottoMy: '✨나의번호:{myNums}',
  msgLottoTotal: '🎁 총 획득 경험치: +{totalExp} EXP',
};

let actSettings = Object.assign({}, ACT_DEFAULTS, JSON.parse(localStorage.getItem('spoon_act_settings') || '{}'));
let actData = JSON.parse(localStorage.getItem('spoon_act_data') || '{}');
// actData 구조: { [tag]: { nickname, heart, chat, attend, lp, lotto, exp } }

let actSelectedUser = null;
let actCurrentSection = 'users';

function actSaveSettings() {
  // 각 input에서 값 읽기
  const fields = ['scoreHeart','scoreChat','scoreAttend','scoreLottoPoint','lotto1st','lotto2nd','lotto3rd','lottoFail','lottoExchange','lvBase','lvExp','lvMax'];
  fields.forEach(f => {
    const el = document.getElementById('actScore' + f.charAt(0).toUpperCase() + f.slice(1)) ||
               document.getElementById('act' + f.charAt(0).toUpperCase() + f.slice(1));
    if (el) actSettings[f] = f === 'lvExp' ? parseFloat(el.value) || ACT_DEFAULTS[f] : parseInt(el.value) || ACT_DEFAULTS[f];
  });
  // 레벨 프리뷰 업데이트
  actUpdateLvPreview();
  localStorage.setItem('spoon_act_settings', JSON.stringify(actSettings));
}

function actSaveData() {
  localStorage.setItem('spoon_act_data', JSON.stringify(actData));
  // 파일로도 저장 (engine.js와 공유)
  if (window.store) {
    window.store.set('act_data.json', actData);
  } else {
    ipc.send('act:write', actData);
  }
}

function actSaveCmds() {
  const cmdFields = ['cmdMyInfo','cmdCreate','cmdDelete','cmdRank','cmdLotto','cmdAttend','cmdAt','cmdLottoGive','cmdShop'];
  const msgFields = ['msgMyInfo','msgCreate','msgDeleteOk','msgRankHeader','msgRankLine','msgLottoHeader','msgLottoAutoHeader','msgLottoWin','msgLottoMy','msgLottoTotal'];
  [...cmdFields, ...msgFields].forEach(f => {
    const el = document.getElementById('actCmd' + f.slice(3).charAt(0).toUpperCase() + f.slice(4)) ||
               document.getElementById('actMsg' + f.slice(3).charAt(0).toUpperCase() + f.slice(4));
    if (el) actSettings[f] = el.value;
  });
  localStorage.setItem('spoon_act_settings', JSON.stringify(actSettings));
  alert('✅ 명령어/메시지 설정이 저장되었습니다.');
}

function actResetCmds() {
  if (!confirm('명령어/메시지를 기본값으로 초기화할까요?')) return;
  const cmdFields = ['cmdMyInfo','cmdCreate','cmdDelete','cmdRank','cmdLotto','cmdAttend','cmdAt','msgMyInfo','msgCreate','msgDeleteOk','msgRankHeader','msgRankLine','msgLottoHeader','msgLottoAutoHeader','msgLottoWin','msgLottoMy','msgLottoTotal'];
  cmdFields.forEach(f => { actSettings[f] = ACT_DEFAULTS[f]; });
  localStorage.setItem('spoon_act_settings', JSON.stringify(actSettings));
  actInitInputs();
  alert('↩️ 기본값으로 복원되었습니다.');
}

function actGetLevel(exp) {
  const base = actSettings.lvBase || 100;
  const exponent = actSettings.lvExp || 1.3;
  const max = actSettings.lvMax || 100;
  let lv = 1;
  let cumExp = 0;
  while (lv < max) {
    const needed = Math.floor(base * Math.pow(lv, exponent));
    if (exp < cumExp + needed) return { level: lv, curExp: exp - cumExp, nextExp: needed };
    cumExp += needed;
    lv++;
  }
  return { level: max, curExp: 0, nextExp: 0 };
}

function actGetNeededExp(lv) {
  const base = actSettings.lvBase || 100;
  const exponent = actSettings.lvExp || 1.3;
  return Math.floor(base * Math.pow(lv, exponent));
}

function actUpdateLvPreview() {
  const el1 = document.getElementById('actLvPreview1');
  const el10 = document.getElementById('actLvPreview10');
  const el30 = document.getElementById('actLvPreview30');
  if (el1) el1.textContent = actGetNeededExp(1).toLocaleString();
  if (el10) el10.textContent = actGetNeededExp(10).toLocaleString();
  if (el30) el30.textContent = actGetNeededExp(30).toLocaleString();
}

function actShowSection(sec) {
  actCurrentSection = sec;
  document.querySelectorAll('.act-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.act-tab-btn').forEach(el => el.classList.remove('active'));
  const secEl = document.getElementById('actSection-' + sec);
  const btnEl = document.getElementById('actTabBtn-' + sec);
  if (secEl) secEl.classList.add('active');
  if (btnEl) btnEl.classList.add('active');
}

function actRefresh() {
  actRenderList();
  if (actSelectedUser) actRenderDetail(actSelectedUser);
}

function actRenderList() {
  const listEl = document.getElementById('actUserList');
  if (!listEl) return;
  const q = (document.getElementById('actSearch')?.value || '').toLowerCase();
  const entries = Object.entries(actData)
    .filter(([tag, d]) => {
      if (!q) return true;
      return (d.nickname || tag).toLowerCase().includes(q) || tag.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const expA = a[1].exp || 0, expB = b[1].exp || 0;
      return expB - expA;
    });

  if (entries.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;font-size:12px;">등록된 시청자가 없습니다.</div>';
    return;
  }

  listEl.innerHTML = entries.map(([tag, d], idx) => {
    const nick = d.nickname || tag;
    const initials = (nick[0] || '?').toUpperCase();
    const { level } = actGetLevel(d.exp || 0);
    const isActive = actSelectedUser === tag;
    return `
      <div class="act-user-item ${isActive ? 'active' : ''}" onclick="actSelectUser('${esc(tag)}')">
        <div class="act-user-avatar">${esc(initials)}</div>
        <div class="act-user-info">
          <div class="act-user-name">${esc(nick)}</div>
          <div class="act-user-meta">Lv.${level} · ${idx+1}위</div>
        </div>
        <button style="background:none;border:none;color:#cbd5e1;cursor:pointer;font-size:14px;" onclick="event.stopPropagation();actDeleteUser('${esc(tag)}')" title="삭제">🗑️</button>
      </div>`;
  }).join('');
}

function actSelectUser(tag) {
  actSelectedUser = tag;
  actRenderList();
  actRenderDetail(tag);
  // 유저관리 섹션으로 자동 이동
  actShowSection('users');
}

function actRenderDetail(tag) {
  const el = document.getElementById('actUserDetail');
  if (!el) return;
  const d = actData[tag];
  if (!d) { el.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8;">유저 데이터가 없습니다.</div>'; return; }

  const nick = d.nickname || tag;
  const exp = d.exp || 0;
  const { level, curExp, nextExp } = actGetLevel(exp);
  const pct = nextExp > 0 ? Math.min(100, Math.round(curExp / nextExp * 100)) : 100;
  const heart = d.heart || 0;
  const chat = d.chat || 0;
  const attend = d.attend || 0;
  const lp = d.lp || 0;
  const lpMax = actSettings.lottoExchange || 22;
  const lotto = d.lotto || 0;

  // 랭킹 계산
  const sorted = Object.entries(actData).sort((a,b) => (b[1].exp||0) - (a[1].exp||0));
  const rankIdx = sorted.findIndex(([t]) => t === tag);
  const rank = rankIdx + 1;

  el.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:4px;">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
        <div style="width:52px;height:52px;background:linear-gradient(135deg,#7c3aed,#4f46e5);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:800;">${esc((nick[0]||'?').toUpperCase())}</div>
        <div style="flex:1;">
          <div style="font-size:17px;font-weight:800;color:#1e293b;">${esc(nick)}</div>
          <div style="font-size:12px;color:#94a3b8;">@${esc(tag)} · <span style="color:#7c3aed;font-weight:700;">${rank}위</span></div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:22px;font-weight:900;color:#7c3aed;">Lv.${level}</div>
          <div style="font-size:11px;color:#94a3b8;">${curExp.toLocaleString()} / ${nextExp.toLocaleString()} EXP</div>
        </div>
      </div>
      <div class="act-lv-bar-wrap"><div class="act-lv-bar" style="width:${pct}%"></div></div>
    </div>

    <div class="act-detail-grid">
      <div class="act-detail-card">
        <div class="act-detail-icon">❤️</div>
        <div class="act-detail-label">하트</div>
        <div class="act-detail-val">${heart.toLocaleString()}</div>
      </div>
      <div class="act-detail-card">
        <div class="act-detail-icon">💬</div>
        <div class="act-detail-label">채팅</div>
        <div class="act-detail-val">${chat.toLocaleString()}</div>
      </div>
      <div class="act-detail-card">
        <div class="act-detail-icon">📅</div>
        <div class="act-detail-label">출석</div>
        <div class="act-detail-val">${attend.toLocaleString()}</div>
      </div>
      <div class="act-detail-card">
        <div class="act-detail-icon">🎟️</div>
        <div class="act-detail-label">복권포인트</div>
        <div class="act-detail-val">${lp}</div>
        <div class="act-detail-sub">/ ${lpMax} (복권 1장)</div>
      </div>
      <div class="act-detail-card">
        <div class="act-detail-icon">🎰</div>
        <div class="act-detail-label">복권</div>
        <div class="act-detail-val">${lotto.toLocaleString()}</div>
      </div>
      <div class="act-detail-card">
        <div class="act-detail-icon">✨</div>
        <div class="act-detail-label">총 EXP</div>
        <div class="act-detail-val" style="font-size:14px;">${exp.toLocaleString()}</div>
      </div>
    </div>

    <div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
      <div style="font-size:13px;font-weight:800;margin-bottom:12px;color:#1e293b;">🔧 수동 점수 편집</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${actEditField(tag,'heart','❤️ 하트',heart)}
        ${actEditField(tag,'chat','💬 채팅',chat)}
        ${actEditField(tag,'attend','📅 출석',attend)}
        ${actEditField(tag,'lp','🎟️ 복권포인트',lp)}
        ${actEditField(tag,'lotto','🎰 복권',lotto)}
        ${actEditField(tag,'exp','✨ EXP',exp)}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">
        <button onclick="actApplyEdit('${esc(tag)}')" style="padding:8px 18px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">💾 저장</button>
        <button onclick="actDeleteUser('${esc(tag)}')" style="padding:8px 14px;background:#fee2e2;color:#ef4444;border:1px solid #fecaca;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'Noto Sans KR',sans-serif;">🗑️ 삭제</button>
      </div>
    </div>`;
}

function actEditField(tag, key, label, val) {
  return `
    <div style="display:flex;flex-direction:column;gap:3px;">
      <div style="font-size:11px;color:#64748b;font-weight:600;">${label}</div>
      <input id="actEdit_${key}" type="number" value="${val}" min="0"
        style="padding:6px 8px;border:1px solid #e2e8f0;border-radius:7px;font-size:13px;font-weight:700;text-align:center;width:100%;">
    </div>`;
}

function actApplyEdit(tag) {
  if (!actData[tag]) return;
  const fields = ['heart','chat','attend','lp','lotto','exp'];
  fields.forEach(f => {
    const el = document.getElementById('actEdit_' + f);
    if (el) actData[tag][f] = parseInt(el.value) || 0;
  });
  actSaveData();
  actRenderList();
  actRenderDetail(tag);
  addLog('system','애청지수', `${actData[tag].nickname || tag}님 데이터 수동 수정 완료`);
}

function actDeleteUser(tag) {
  const nick = (actData[tag] && actData[tag].nickname) || tag;
  if (!confirm(`'${nick}'님의 애청지수 데이터를 삭제할까요?`)) return;
  delete actData[tag];
  actSaveData();
  // engine.js 메모리도 즉시 동기화
  ipc.send('config:update', { commands, hotkeys, joinMsgs, autoSettings, fundings: JSON.parse(JSON.stringify(fundings)), fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData });
  if (actSelectedUser === tag) {
    actSelectedUser = null;
    const el = document.getElementById('actUserDetail');
    if (el) el.innerHTML = '<div style="text-align:center;padding:80px 20px;color:#94a3b8;"><div style="font-size:40px;margin-bottom:10px;">⭐</div>왼쪽에서 시청자를 선택하세요.</div>';
  }
  actRenderList();
}

function actClearAll() {
  if (!confirm('모든 시청자의 애청지수 데이터를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
  actData = {};
  actSaveData();
  // engine.js 메모리도 즉시 동기화
  ipc.send('config:update', { commands, hotkeys, joinMsgs, autoSettings, fundings: JSON.parse(JSON.stringify(fundings)), fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData });
  actSelectedUser = null;
  actRenderList();
  const el = document.getElementById('actUserDetail');
  if (el) el.innerHTML = '<div style="text-align:center;padding:80px 20px;color:#94a3b8;"><div style="font-size:40px;margin-bottom:10px;">⭐</div>왼쪽에서 시청자를 선택하세요.</div>';
}

function actShowAddModal() {
  const nick = prompt('닉네임을 입력하세요:');
  if (!nick) return;
  const tag = prompt('고유닉(tag)을 입력하세요:');
  if (!tag) return;
  if (!actData[tag]) {
    actData[tag] = { nickname: nick, heart: 0, chat: 0, attend: 0, lp: 0, lotto: 0, exp: 0 };
  } else {
    actData[tag].nickname = nick;
  }
  actSaveData();
  actSelectedUser = tag;
  actRenderList();
  actRenderDetail(tag);
}

function actInitInputs() {
  // 점수 설정 input 초기화
  const scoreMap = {
    'actScoreHeart': 'scoreHeart', 'actScoreChat': 'scoreChat', 'actScoreAttend': 'scoreAttend',
    'actScoreLottoPoint': 'scoreLottoPoint', 'actLotto1st': 'lotto1st', 'actLotto2nd': 'lotto2nd',
    'actLotto3rd': 'lotto3rd', 'actLottoFail': 'lottoFail', 'actLottoExchange': 'lottoExchange',
    'actLvBase': 'lvBase', 'actLvExp': 'lvExp', 'actLvMax': 'lvMax'
  };
  Object.entries(scoreMap).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.value = actSettings[key] !== undefined ? actSettings[key] : ACT_DEFAULTS[key];
  });
  // 명령어/메시지 input 초기화
  const cmdMap = {
    'actCmdMyInfo': 'cmdMyInfo', 'actCmdCreate': 'cmdCreate', 'actCmdDelete': 'cmdDelete',
    'actCmdRank': 'cmdRank', 'actCmdLotto': 'cmdLotto', 'actCmdAttend': 'cmdAttend', 'actCmdAt': 'cmdAt',
    'actMsgMyInfo': 'msgMyInfo', 'actMsgCreate': 'msgCreate', 'actMsgDeleteOk': 'msgDeleteOk',
    'actMsgRankHeader': 'msgRankHeader', 'actMsgRankLine': 'msgRankLine',
    'actMsgLottoHeader': 'msgLottoHeader', 'actMsgLottoAutoHeader': 'msgLottoAutoHeader',
    'actMsgLottoWin': 'msgLottoWin', 'actMsgLottoMy': 'msgLottoMy', 'actMsgLottoTotal': 'msgLottoTotal'
  };
  Object.entries(cmdMap).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.value = actSettings[key] !== undefined ? actSettings[key] : ACT_DEFAULTS[key];
  });
  actUpdateLvPreview();
}

// ── 하트/채팅 자동 기록 연동 ──
// 하트 수신 → actData에도 기록
function actRecordHeart(tag, nickname) {
  if (!tag || !actData[tag]) return; // 생성된 유저만 하트 기록
  actData[tag].nickname = nickname;
  actData[tag].heart = (actData[tag].heart || 0) + 1;
  actData[tag].exp = (actData[tag].exp || 0) + (actSettings.scoreHeart || 1);
  actSaveData();
}

function actRecordChat(tag, nickname) {
  if (!tag || !actData[tag]) return; // 생성된 유저만 채팅 기록
  actData[tag].nickname = nickname;
  actData[tag].chat = (actData[tag].chat || 0) + 1;
  actData[tag].exp = (actData[tag].exp || 0) + (actSettings.scoreChat || 2);
  actSaveData();
}

// ══════════════════════════════════════════════════════
//  🔊 TTS 모듈
// ══════════════════════════════════════════════════════

const TTS_DEFAULTS = {
  enabled: false,
  voice: '',         // SpeechSynthesisVoice.name
  spoonAmount: 10,
  duration: 30,
  maxLen: 50,
  volume: 1.0,
  rate: 1.0,
};

let ttsSettings = Object.assign({}, TTS_DEFAULTS, JSON.parse(localStorage.getItem('spoon_tts_settings') || '{}'));
let ttsUsers = {};   // { [key]: { nickname, expiresAt } }
let ttsQueue = [];
let ttsPlaying = false;
let ttsLog = [];

// 브라우저 음성 목록 로드 후 select 채우기
function ttsLoadVoices() {
  const sel = document.getElementById('ttsVoice');
  if (!sel) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;
  // 한국어 우선, 나머지 뒤에
  const ko = voices.filter(v => v.lang.startsWith('ko'));
  const others = voices.filter(v => !v.lang.startsWith('ko'));
  const all = [...ko, ...others];
  sel.innerHTML = all.map(v =>
    `<option value="${v.name}" ${v.name === ttsSettings.voice ? 'selected' : ''}>${v.name} (${v.lang})</option>`
  ).join('');
  // 저장된 음성 없으면 첫 한국어 음성 자동 선택
  if (!ttsSettings.voice && ko.length > 0) {
    sel.value = ko[0].name;
    ttsSettings.voice = ko[0].name;
  }
}
// voices는 비동기 로드되므로 이벤트 + 폴링 둘 다 대응
window.speechSynthesis.onvoiceschanged = ttsLoadVoices;
setTimeout(ttsLoadVoices, 500);

function ttsSaveSettings() {
  ttsSettings.voice       = document.getElementById('ttsVoice')?.value || ttsSettings.voice;
  ttsSettings.rate        = parseFloat(document.getElementById('ttsRate')?.value) || 1.0;
  ttsSettings.spoonAmount = parseInt(document.getElementById('ttsSpoonAmount')?.value) || ttsSettings.spoonAmount;
  ttsSettings.duration    = parseInt(document.getElementById('ttsDuration')?.value) || ttsSettings.duration;
  ttsSettings.maxLen      = parseInt(document.getElementById('ttsMaxLen')?.value) || ttsSettings.maxLen;
  ttsSettings.volume      = parseFloat(document.getElementById('ttsVolume')?.value) ?? 1.0;
  ttsSettings.enabled     = document.getElementById('ttsEnabled')?.checked ?? ttsSettings.enabled;
  localStorage.setItem('spoon_tts_settings', JSON.stringify(ttsSettings));
  ipc.send('config:update', { commands, hotkeys, joinMsgs, autoSettings, fundings: JSON.parse(JSON.stringify(fundings)), fundingOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData, ttsSettings });
}

function ttsInitInputs() {
  const s = ttsSettings;
  if (document.getElementById('ttsRate'))        document.getElementById('ttsRate').value        = s.rate || 1.0;
  if (document.getElementById('ttsSpoonAmount')) document.getElementById('ttsSpoonAmount').value = s.spoonAmount || 10;
  if (document.getElementById('ttsDuration'))    document.getElementById('ttsDuration').value    = s.duration || 30;
  if (document.getElementById('ttsMaxLen'))      document.getElementById('ttsMaxLen').value      = s.maxLen || 50;
  if (document.getElementById('ttsVolume'))      document.getElementById('ttsVolume').value      = s.volume ?? 1.0;
  if (document.getElementById('ttsEnabled'))     document.getElementById('ttsEnabled').checked   = !!s.enabled;
  ttsLoadVoices();
}

// TTS 권한 부여
function ttsGrantAccess(nickname, tag) {
  if (!ttsSettings.enabled) return;
  const key = tag || nickname;
  const expiresAt = Date.now() + (ttsSettings.duration * 60 * 1000);
  ttsUsers[key] = { nickname, expiresAt };
  addLog('system', '🔊TTS', `${nickname}님 TTS 권한 부여 (${ttsSettings.duration}분)`);
  ttsRenderUserList();
}

// 만료 유저 정리
function ttsCleanExpired() {
  const now = Date.now();
  Object.keys(ttsUsers).forEach(k => {
    if (ttsUsers[k].expiresAt <= now) delete ttsUsers[k];
  });
}

// 채팅 수신 시 TTS 재생 판단
function ttsHandleChat(tag, nickname, text) {
  if (!ttsSettings.enabled) return;
  ttsCleanExpired();
  const key = tag || nickname;
  // tag 없으면 nickname으로도 검색
  const found = ttsUsers[key] || (tag ? null : Object.values(ttsUsers).find(u => u.nickname === nickname));
  if (!found) return;
  if (text.trim().startsWith('!')) return; // 명령어 제외
  const msg = text.slice(0, ttsSettings.maxLen || 50);
  ttsQueue.push({ nickname, text: msg });
  ttsLog.unshift({ nick: nickname, text: msg, time: new Date().toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit', second:'2-digit'}) });
  if (ttsLog.length > 100) ttsLog.pop();
  ttsRenderLog();
  ttsPlayNext();
}

function ttsPlayNext() {
  if (ttsPlaying || ttsQueue.length === 0) return;
  if (!window.speechSynthesis) { addLog('system','🔊TTS오류','브라우저가 TTS를 지원하지 않습니다.'); return; }
  ttsPlaying = true;
  const { text } = ttsQueue.shift();
  const utt = new SpeechSynthesisUtterance(text);
  // 저장된 음성 적용
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(v => v.name === ttsSettings.voice);
  if (voice) utt.voice = voice;
  utt.lang   = voice ? voice.lang : 'ko-KR';
  utt.volume = Math.min(1, Math.max(0, parseFloat(ttsSettings.volume) || 1.0));
  utt.rate   = Math.min(2, Math.max(0.5, parseFloat(ttsSettings.rate) || 1.0));
  utt.onend  = () => { ttsPlaying = false; ttsPlayNext(); };
  utt.onerror = () => { ttsPlaying = false; ttsPlayNext(); };
  window.speechSynthesis.speak(utt);
}

function ttsTest() {
  ttsQueue.unshift({ nickname: '테스트', text: '안녕하세요, TTS 테스트입니다.' });
  ttsPlaying = false;
  ttsPlayNext();
}

function ttsRenderUserList() {
  ttsCleanExpired();
  const el = document.getElementById('ttsUserList');
  if (!el) return;
  const entries = Object.entries(ttsUsers);
  if (entries.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;font-size:12px;">TTS 권한 보유자 없음</div>';
    return;
  }
  const now = Date.now();
  el.innerHTML = entries.map(([key, d]) => {
    const remain = Math.max(0, Math.ceil((d.expiresAt - now) / 60000));
    const initials = (d.nickname[0] || '?').toUpperCase();
    return `
      <div class="tts-user-item tts-user-active">
        <div class="tts-user-avatar">${esc(initials)}</div>
        <div style="flex:1;min-width:0;">
          <div class="tts-user-name">${esc(d.nickname)}</div>
          <div class="tts-user-remain">⏱ ${remain}분 남음</div>
        </div>
        <button onclick="ttsRevokeUser('${esc(key)}')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px;">✕</button>
      </div>`;
  }).join('');
}

function ttsRevokeUser(key) {
  delete ttsUsers[key];
  ttsRenderUserList();
}

function ttsClearAll() {
  if (!confirm('TTS 권한을 전체 초기화할까요?')) return;
  ttsUsers = {};
  window.speechSynthesis.cancel();
  ttsQueue = [];
  ttsPlaying = false;
  ttsRenderUserList();
}

function ttsRenderLog() {
  const el = document.getElementById('ttsLogBody');
  if (!el) return;
  if (ttsLog.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:#94a3b8;font-size:12px;">TTS 읽기 내역이 없습니다.</div>';
    return;
  }
  el.innerHTML = ttsLog.map(item => `
    <div class="tts-log-item">
      <span class="tts-log-nick">${esc(item.nick)}</span>
      <span class="tts-log-text">${esc(item.text)}</span>
      <span class="tts-log-time">${esc(item.time)}</span>
    </div>`).join('');
}

function ttsClearLog() {
  ttsLog = [];
  ttsRenderLog();
}

// 1분마다 만료 유저 정리
setInterval(() => {
  ttsCleanExpired();
  const ttsTab = document.getElementById('tab-tts');
  if (ttsTab && ttsTab.style.display === 'flex') ttsRenderUserList();
}, 60000);

// ══════════════════════════════════════════════════════
//  🖼️ 박제스티커 모듈 (DOM 기반 - 움직이는 스티커 지원)
// ══════════════════════════════════════════════════════

let sfInited  = false;
let sfItems   = [];    // [{el, name, url, size}]
let sfSelIdx  = -1;
let sfDragEl  = null;
let sfDragOX  = 0, sfDragOY = 0;
let sfResEl   = null;
let sfResOX   = 0, sfResOY = 0, sfResOS = 0;

async function sfInit() {
  if (sfInited) { sfAutoFitStage(); return; }
  sfInited = true;
  await loadStickerData();
  sfBuildCategories();
  sfFilterStickers();  // 탭 진입 시 즉시 스티커 목록 표시
  sfAutoFitStage();
  document.getElementById('sfStage').addEventListener('mousedown', e => {
    if (e.target === document.getElementById('sfStage') ||
        e.target === document.getElementById('sfBgImg')) {
      sfDeselect();
    }
  });
}

function sfGetStage() { return document.getElementById('sfStage'); }

// 스테이지를 스크롤 영역에 맞게 자동 크기 조절
function sfAutoFitStage() {
  const scroll = document.getElementById('sfStageScroll');
  if (!scroll) return;
  const aw = scroll.clientWidth  - 24;  // padding 12px*2
  const ah = scroll.clientHeight - 24;
  const w = Math.max(200, aw);
  const h = Math.max(200, ah);
  const wInput = document.getElementById('sfStageW');
  const hInput = document.getElementById('sfStageH');
  if (wInput) wInput.value = w;
  if (hInput) hInput.value = h;
  sfResizeStage();
}

// 스테이지 크기 input → DOM 반영
function sfResizeStage() {
  const w = parseInt(document.getElementById('sfStageW')?.value) || 480;
  const h = parseInt(document.getElementById('sfStageH')?.value) || 480;
  const stage = sfGetStage();
  if (!stage) return;
  stage.style.width  = w + 'px';
  stage.style.height = h + 'px';
}

// 카테고리 빌드
function sfBuildCategories() {
  const sel = document.getElementById('sfCatSelect');
  if (!sel) return;
  const cats = [...new Set(stickerData.map(s => s.category).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">카테고리 선택...</option>' +
    cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

// 스티커 목록 필터링
function sfFilterStickers() {
  const cat  = document.getElementById('sfCatSelect')?.value || '';
  const q    = (document.getElementById('sfSearch')?.value || '').toLowerCase();
  const grid = document.getElementById('sfStickerGrid');
  if (!grid) return;
  let list = stickerData;
  if (cat) list = list.filter(s => s.category === cat);
  if (q)   list = list.filter(s => (s.title||'').toLowerCase().includes(q) || (s.name||'').toLowerCase().includes(q));
  list = list.slice(0, 150);
  if (!list.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#4a4a6e;font-size:11px;">결과 없음</div>';
    return;
  }
  grid.innerHTML = list.map(s => `
    <div class="sf-si" onclick="sfAddSticker('${esc(s.name)}','${esc(s.image)}','${esc(s.title||s.name)}')" title="${esc(s.title||s.name)}">
      <img src="${esc(s.image)}" loading="lazy" onerror="this.style.opacity='.2'">
      <div class="sf-sn">${esc(s.title||s.name)}</div>
    </div>`).join('');
}

// 스티커 추가 (DOM 방식 — 움직이는 GIF/WebP 그대로 표시)
function sfAddSticker(name, url, title) {
  if (!url) return;
  const stage = sfGetStage();
  const size  = 120;
  const x = Math.max(0, (stage.offsetWidth  / 2 - size / 2) | 0);
  const y = Math.max(0, (stage.offsetHeight / 2 - size / 2) | 0);

  const wrap = document.createElement('div');
  wrap.className = 'sf-dom-sticker';
  wrap.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;`;
  wrap.dataset.idx = sfItems.length;

  // 이미지
  const img = document.createElement('img');
  img.src = url;
  img.draggable = false;
  wrap.appendChild(img);

  // 삭제 핸들
  const delBtn = document.createElement('div');
  delBtn.className = 'sf-handle-del';
  delBtn.textContent = '✕';
  delBtn.addEventListener('mousedown', e => {
    e.stopPropagation();
    sfRemoveByEl(wrap);
  });
  wrap.appendChild(delBtn);

  // 크기 조절 핸들
  const resHandle = document.createElement('div');
  resHandle.className = 'sf-handle-res';
  resHandle.addEventListener('mousedown', e => {
    e.stopPropagation();
    sfResEl  = wrap;
    sfResOX  = e.clientX;
    sfResOY  = e.clientY;
    sfResOS  = parseInt(wrap.style.width) || 120;
    document.addEventListener('mousemove', sfOnResizeMove);
    document.addEventListener('mouseup',   sfOnResizeEnd);
  });
  wrap.appendChild(resHandle);

  // 드래그 시작
  wrap.addEventListener('mousedown', e => {
    if (e.target === delBtn || e.target === resHandle) return;
    e.preventDefault();
    sfSelectEl(wrap);
    sfDragEl = wrap;
    sfDragOX = e.clientX - parseInt(wrap.style.left || 0);
    sfDragOY = e.clientY - parseInt(wrap.style.top  || 0);
    document.addEventListener('mousemove', sfOnDragMove);
    document.addEventListener('mouseup',   sfOnDragEnd);
  });

  stage.appendChild(wrap);
  sfItems.push({ el: wrap, name: title || name, url, size });
  sfSelectEl(wrap);
  sfRenderPlacedList();
}

function sfOnDragMove(e) {
  if (!sfDragEl) return;
  const stage = sfGetStage();
  const maxX = stage.offsetWidth  - (parseInt(sfDragEl.style.width)  || 120);
  const maxY = stage.offsetHeight - (parseInt(sfDragEl.style.height) || 120);
  const nx = Math.max(0, Math.min(maxX, e.clientX - sfDragOX));
  const ny = Math.max(0, Math.min(maxY, e.clientY - sfDragOY));
  sfDragEl.style.left = nx + 'px';
  sfDragEl.style.top  = ny + 'px';
}
function sfOnDragEnd() {
  sfDragEl = null;
  document.removeEventListener('mousemove', sfOnDragMove);
  document.removeEventListener('mouseup',   sfOnDragEnd);
}
function sfOnResizeMove(e) {
  if (!sfResEl) return;
  const delta = Math.max(e.clientX - sfResOX, e.clientY - sfResOY);
  const ns = Math.max(20, sfResOS + delta);
  sfResEl.style.width  = ns + 'px';
  sfResEl.style.height = ns + 'px';
  // 슬라이더 동기화
  const slider = document.getElementById('sfSizeSlider');
  const valEl  = document.getElementById('sfSizeVal');
  if (slider) slider.value = ns;
  if (valEl)  valEl.textContent = Math.round(ns) + 'px';
  // items 배열 업데이트
  const item = sfItems.find(it => it.el === sfResEl);
  if (item) item.size = ns;
}
function sfOnResizeEnd() {
  sfResEl = null;
  document.removeEventListener('mousemove', sfOnResizeMove);
  document.removeEventListener('mouseup',   sfOnResizeEnd);
}

// 선택
function sfSelectEl(el) {
  sfDeselect();
  el.classList.add('sf-sel');
  sfSelIdx = sfItems.findIndex(it => it.el === el);
  const size = parseInt(el.style.width) || 120;
  const slider = document.getElementById('sfSizeSlider');
  const valEl  = document.getElementById('sfSizeVal');
  if (slider) { slider.value = size; }
  if (valEl)  valEl.textContent = size + 'px';
  sfRenderPlacedList();
}
function sfDeselect() {
  sfItems.forEach(it => it.el.classList.remove('sf-sel'));
  sfSelIdx = -1;
}

// 슬라이더로 크기 조절
function sfResizeSelected(val) {
  const size = parseInt(val) || 120;
  document.getElementById('sfSizeVal').textContent = size + 'px';
  if (sfSelIdx < 0 || sfSelIdx >= sfItems.length) return;
  const item = sfItems[sfSelIdx];
  item.el.style.width  = size + 'px';
  item.el.style.height = size + 'px';
  item.size = size;
}

// 배경 로드
function sfLoadBg(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('sfBgName').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('sfBgImg');
    img.src = e.target.result;
    img.style.display = 'block';
  };
  reader.readAsDataURL(file);
}
function sfClearBg() {
  const img = document.getElementById('sfBgImg');
  img.src = ''; img.style.display = 'none';
  document.getElementById('sfBgName').textContent = '선택된 파일 없음';
  document.getElementById('sfBgFile').value = '';
}

// 배치된 스티커 목록 렌더
function sfRenderPlacedList() {
  const el = document.getElementById('sfPlacedList');
  if (!el) return;
  if (!sfItems.length) {
    el.innerHTML = '<div class="sf-pi-empty">스티커를 추가하세요</div>';
    return;
  }
  el.innerHTML = sfItems.map((s, i) => `
    <div class="sf-pi ${i===sfSelIdx?'sf-pi-sel':''}" onclick="sfSelectEl(sfItems[${i}].el)">
      <img src="${esc(s.url)}" onerror="this.style.display='none'">
      <span class="sf-pi-name">${esc(s.name)}</span>
      <span style="font-size:10px;color:#6a6a8e;flex-shrink:0;">${Math.round(s.size)}px</span>
      <button class="sf-pi-del" onclick="event.stopPropagation();sfRemoveByEl(sfItems[${i}].el)">✕</button>
    </div>`).join('');
}

function sfRemoveByEl(el) {
  el.remove();
  sfItems = sfItems.filter(it => it.el !== el);
  sfSelIdx = -1;
  sfRenderPlacedList();
}
function sfClearAll() {
  if (!confirm('배치된 스티커를 모두 제거할까요?')) return;
  sfItems.forEach(it => it.el.remove());
  sfItems = []; sfSelIdx = -1;
  sfRenderPlacedList();
}
function sfReset() {
  if (!confirm('캔버스를 초기화할까요?')) return;
  sfClearBg();
  sfItems.forEach(it => it.el.remove());
  sfItems = []; sfSelIdx = -1;
  sfRenderPlacedList();
}

// 📸 스크린샷: html2canvas 사용 (없으면 CDN 동적 로드)
async function sfCapture() {
  // 선택 테두리 숨기기
  sfDeselect();
  // 핸들 임시 숨기기
  document.querySelectorAll('.sf-handle-del,.sf-handle-res').forEach(h => h.style.visibility='hidden');

  try {
    if (typeof html2canvas === 'undefined') {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const stage = sfGetStage();
    const canvas = await html2canvas(stage, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      scale: 2,  // 2배 고해상도
      width: stage.offsetWidth,
      height: stage.offsetHeight,
    });
    const link = document.createElement('a');
    link.download = '박제스티커_' + Date.now() + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    addLog('system', '📸박제', '스크린샷 저장 완료!');
  } catch(e) {
    console.error('[스크린샷 오류]', e);
    addLog('system', '📸오류', e.message);
    alert('스크린샷 오류: ' + e.message);
  } finally {
    document.querySelectorAll('.sf-handle-del,.sf-handle-res').forEach(h => h.style.visibility='');
  }
}
function renderMenuManager() {
  const el = document.getElementById('menuImgList');
  if (!el) return;
  
  const menuItems = [
    { id: 'dashboard', name: '🏠 대시보드' },
    { id: 'auto-settings', name: '🚪 입장 설정' },
    { id: 'commands', name: '⚡ 커맨드 관리' },
    { id: 'hotkeys', name: '⌨️ 단축키 명령어' },
    { id: 'joinmsg', name: '👋 지정 인사' },
    { id: 'log', name: '📋 채팅 로그' },
    { id: 'token', name: '🔑 토큰 상태' },
    { id: 'funding', name: '💰 펀딩 관리' },
    { id: 'shield', name: '🛡️ 실드 관리' },
    { id: 'songs', name: '🎵 신청곡 관리' },
    { id: 'sticker-sound', name: '🔖 스티커음향' },
    { id: 'roulette', name: '🎡 룰렛 설정' },
    { id: 'roulette-history', name: '📊 룰렛 기록' },
    { id: 'misc', name: '🎲 기타 모듈' },
    { id: 'activity', name: '⭐ 애청지수' },
    { id: 'tts', name: '🔊 TTS 설정' },
    { id: 'sticker-frame', name: '🖼️ 박제스티커' }
  ];
  
  el.innerHTML = menuItems.map(m => {
    const imgData = menuImages[m.id] || '';
    return `
      <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;">
        <div style="width: 120px; font-weight: 700; font-size: 13px; color: #334155;">${m.name}</div>
        <div style="flex: 1; height: 40px; border: 1px dashed #cbd5e1; border-radius: 6px; display: flex; align-items: center; justify-content: center; background: #f8fafc; overflow: hidden;">
          ${imgData ? `<img src="${imgData}" style="max-width: 100%; max-height: 100%; object-fit: contain;">` : `<span style="font-size: 11px; color: #94a3b8;">이미지 없음</span>`}
        </div>
        <div style="display: flex; gap: 6px;">
          <input type="file" id="menuImgFile-${m.id}" accept="image/*" style="display: none;" onchange="handleMenuImgUpload('${m.id}', event)">
          <button onclick="document.getElementById('menuImgFile-${m.id}').click()" style="padding: 6px 12px; border: 1px solid #7c3aed; background: #fff; color: #7c3aed; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">업로드</button>
          <button onclick="deleteMenuImg('${m.id}')" style="padding: 6px 12px; border: 1px solid #ef4444; background: #fff; color: #ef4444; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">삭제</button>
        </div>
      </div>
    `;
  }).join('');
}

function handleMenuImgUpload(menuId, e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    menuImages[menuId] = event.target.result;
    saveLocal();
    applyAllMenuImages();
    renderMenuManager();
  };
  reader.readAsDataURL(file);
}

function deleteMenuImg(menuId) {
  if (!confirm('해당 메뉴 이미지를 삭제하시겠습니까?')) return;
  delete menuImages[menuId];
  saveLocal();
  applyAllMenuImages();
  renderMenuManager();
}

function applyAllMenuImages() {
  document.querySelectorAll('.nav-item').forEach(el => {
    const tabId = el.getAttribute('data-tab');
    if (!tabId || tabId === 'menu-manager') return;
    
    const imgData = menuImages[tabId];
    // 기존에 이미 이미지가 삽입되어 있는지 확인
    let customImg = el.querySelector('.nav-custom-img');
    let originalContent = el.querySelector('.nav-original-content');
    
    if (imgData) {
      // 이미지 적용
      if (!originalContent) {
        // 원본 텍스트를 숨기기 위해 감싸기
        const content = el.innerHTML;
        el.innerHTML = `<div class="nav-original-content" style="display: none;">${content}</div><img class="nav-custom-img" src="${imgData}" style="width: 100%; height: auto; object-fit: contain; cursor: pointer;">`;
        el.style.padding = '0';
        el.style.overflow = 'hidden';
        el.style.justifyContent = 'center';
      } else {
        originalContent.style.display = 'none';
        if (!customImg) {
          customImg = document.createElement('img');
          customImg.className = 'nav-custom-img';
          customImg.style.cssText = 'width: 100%; height: auto; object-fit: contain; cursor: pointer;';
          el.appendChild(customImg);
        }
        customImg.src = imgData;
        customImg.style.display = 'block';
        el.style.padding = '0';
      }
    } else {
      // 원본 복구
      if (originalContent) {
        originalContent.style.display = 'flex';
        originalContent.style.alignItems = 'center';
        originalContent.style.gap = '10px';
        if (customImg) customImg.style.display = 'none';
        el.style.padding = '';
        el.style.overflow = '';
        el.style.justifyContent = '';
      }
    }
  });
}

// 초기화 시 이미지 적용
const originalInit = init;
init = async function() {
  await originalInit();
  applyAllMenuImages();
};

window.onload = init;
