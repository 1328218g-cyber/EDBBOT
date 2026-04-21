// preload.js - bot.html 에서 ipcRenderer 사용 가능하게
const { ipcRenderer } = require('electron')
window.ipc = ipcRenderer

// 파일 기반 영구 저장소 API
window.store = {
  get: (filename) => ipcRenderer.invoke('store:get', filename),
  set: (filename, data) => ipcRenderer.invoke('store:set', filename, data),
}
window.sound = { getPath: (filename) => ipcRenderer.invoke('sound:getPath', filename) };
window.appControl = { resetAll: () => ipcRenderer.invoke('app:reset-all') };

// 하드키 인증 API
window.auth = {
  check: () => ipcRenderer.invoke('auth:check'),
  getLocal: () => ipcRenderer.invoke('auth:get-local'),
  saveLocal: (data) => ipcRenderer.invoke('auth:save-local', data),
  request: (data) => ipcRenderer.invoke('auth:request', data),
};

// 원격 자동공지 API
// - status: 현재 활성 공지 목록 조회
// - refresh: 시트에서 즉시 다시 가져오기
window.autoNotice = {
  status: () => ipcRenderer.invoke('autonotice:status'),
  refresh: () => ipcRenderer.invoke('autonotice:refresh'),
};

// 자동 업데이트 API
window.update = {
  check: () => ipcRenderer.invoke('update:check'),
  download: (url) => ipcRenderer.invoke('update:download', url),
};

// ─────────────────────────────────────────────────────────────
// localStorage 자동 백업/복원
// 이유: bot.html을 file:// 대신 http://127.0.0.1 로 서빙하게 되면서
// origin이 달라져 기존 localStorage 데이터에 접근 불가해지는 문제 해결.
// → preload가 renderer 스크립트 실행 전 sendSync로 localStorage를 미리 채움
// → localStorage.setItem 오버라이드로 변경 발생 시마다 백업 파일에 자동 저장
// ─────────────────────────────────────────────────────────────

// 1) 동기 복원: preload가 실행되는 시점은 renderer 스크립트 실행 전이므로
//    sendSync로 localStorage를 즉시 채울 수 있음 (기존 bot.html 코드 변경 없이 동작)
try {
  const backup = ipcRenderer.sendSync('ls:restore-sync');
  if (backup && typeof backup === 'object') {
    let restored = 0;
    for (const key of Object.keys(backup)) {
      // 동일 키가 이미 있으면 현재 값 우선 (http://127.0.0.1 에서 저장된 최신 값 유지)
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, backup[key]);
        restored++;
      }
    }
    console.log('[localStorage] 백업에서 복원:', restored + '/' + Object.keys(backup).length + '개 키');
  }
} catch (e) {
  console.error('[localStorage] 동기 복원 실패:', e);
}

// 2) 자동 백업: localStorage 변경 시마다 userData에 JSON 저장 (500ms 디바운스)
(() => {
  const origSet = Storage.prototype.setItem;
  const origRemove = Storage.prototype.removeItem;
  const origClear = Storage.prototype.clear;

  let backupTimer = null;
  const scheduleBackup = () => {
    if (backupTimer) clearTimeout(backupTimer);
    backupTimer = setTimeout(() => {
      try {
        const snapshot = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) snapshot[k] = localStorage.getItem(k);
        }
        ipcRenderer.invoke('ls:backup', snapshot).catch(() => {});
      } catch (e) {}
    }, 500);
  };

  Storage.prototype.setItem = function() {
    const r = origSet.apply(this, arguments);
    if (this === localStorage) scheduleBackup();
    return r;
  };
  Storage.prototype.removeItem = function() {
    const r = origRemove.apply(this, arguments);
    if (this === localStorage) scheduleBackup();
    return r;
  };
  Storage.prototype.clear = function() {
    const r = origClear.apply(this, arguments);
    if (this === localStorage) scheduleBackup();
    return r;
  };

  // 초기 진입 시 한 번 백업 (복원 직후 상태 반영 + 기존 http://127.0.0.1 데이터 보존)
  scheduleBackup();
})();
