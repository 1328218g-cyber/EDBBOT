const { app, ipcMain, session, shell } = require('electron');
const SpoonBotApp = require('./src/core/app');
const { AutoNoticeManager } = require('./src/core/autoNotice');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ─────────────────────────────────────────────────────────────
// 하드키 인증 시스템
// ─────────────────────────────────────────────────────────────
// 구글 스프레드시트 CSV export URL (공개 시트)
// A열: DJ닉네임@고유닉  C열: 하드키
const AUTH_SHEET_ID = '1fSwacPlwfIJhdXVrqEFRwkn_2hoxikjfm_W5v-G16gk';
const AUTH_SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${AUTH_SHEET_ID}/export?format=csv`;
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1494980255977443339/InXwyp6ntkBDVnT0qkw2E0wiT_-dg6fXLeSVygP6rhsWM-_iv1ofKODRL_Ze15mz08No';

function getLicensePath() {
  return path.join(app.getPath('userData'), 'license.json');
}

// 로컬에 저장된 하드키 읽기
function readLocalLicense() {
  try {
    const p = getLicensePath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return null;
  }
}

// HTTPS로 URL 내용 가져오기 (redirect 따라감)
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

// 간단한 CSV 파서 (큰따옴표 이스케이프 지원)
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

// 구글시트에서 등록된 유저 목록 가져오기
// 반환: [{ djNick, uniqueTag, combined, hardkey }]
async function fetchRegisteredUsers() {
  try {
    const csv = await httpsGet(AUTH_SHEET_CSV_URL);
    const rows = parseCSV(csv);
    const users = [];
    for (const row of rows) {
      const combined = String(row[0] || '').trim(); // A열
      const hardkey = String(row[2] || '').trim();  // C열
      if (!combined || !hardkey) continue;
      let djNick = combined;
      let uniqueTag = '';
      if (combined.includes('@')) {
        const parts = combined.split('@');
        djNick = parts[0].trim();
        uniqueTag = parts[1].trim();
      }
      users.push({ djNick, uniqueTag, combined, hardkey });
    }
    return users;
  } catch (e) {
    console.error('[인증] 구글시트 조회 실패:', e.message);
    throw e;
  }
}

// 로컬 하드키가 시트에 등록되어있는지 확인
async function verifyLicense() {
  const local = readLocalLicense();
  if (!local || !local.hardkey) {
    return { ok: false, reason: 'no_local_key' };
  }
  try {
    const users = await fetchRegisteredUsers();
    const match = users.find(u => u.hardkey === local.hardkey);
    if (match) {
      return { ok: true, user: { djNick: match.djNick, uniqueTag: match.uniqueTag, hardkey: match.hardkey } };
    }
    return { ok: false, reason: 'not_registered', hardkey: local.hardkey };
  } catch (e) {
    return { ok: false, reason: 'network_error', error: e.message, hardkey: local.hardkey };
  }
}

// 디스코드 웹훅으로 권한 신청 전송
function sendDiscordWebhook(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const u = new URL(DISCORD_WEBHOOK_URL);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'SpoonBot/1.0'
      }
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(true);
        else reject(new Error('Discord webhook HTTP ' + res.statusCode + ': ' + body));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// 자동 업데이트 시스템
// ─────────────────────────────────────────────────────────────
const GITHUB_REPO = '1328218g-cyber/EDBBOT'; // 수정됨
const CURRENT_VERSION = require('./package.json').version;

async function checkUpdate() {
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
    const resText = await httpsGet(url);
    const release = JSON.parse(resText);
    // v1.0.6 -> 1.0.6 처럼 v가 있어도 없어도 잘 작동하게 함
    const latestVersion = release.tag_name.replace(/[^0-9.]/g, '');
    
    // 버전 비교 (각 세그먼트를 숫자로 변환하여 비교)
    const vCurrent = CURRENT_VERSION.split('.').map(v => parseInt(v) || 0);
    const vLatest = latestVersion.split('.').map(v => parseInt(v) || 0);
    
    let hasUpdate = false;
    // 1.0.6 > 1.0.5 인지 확인
    for (let i = 0; i < Math.max(vCurrent.length, vLatest.length); i++) {
      const cur = vCurrent[i] || 0;
      const lat = vLatest[i] || 0;
      if (lat > cur) { hasUpdate = true; break; }
      if (lat < cur) { hasUpdate = false; break; }
    }

    console.log(`[업데이트 체크] 로컬: ${CURRENT_VERSION}, 서버: ${latestVersion}, 결과: ${hasUpdate}`);

    if (hasUpdate) {
      const asset = release.assets.find(a => a.name.endsWith('.exe'));
      return {
        hasUpdate: true,
        latestVersion,
        currentVersion: CURRENT_VERSION,
        downloadUrl: asset ? asset.browser_download_url : release.html_url,
        body: release.body || '새로운 기능이 추가되었습니다.'
      };
    }
    return { hasUpdate: false, currentVersion: CURRENT_VERSION, latestVersion };
  } catch (e) {
    console.error('[업데이트] 체크 실패:', e.message);
    return { hasUpdate: false, error: e.message };
  }
}

// ─── 인증 IPC 핸들러 ───
ipcMain.handle('auth:check', async () => {
  return await verifyLicense();
});

ipcMain.handle('update:check', async () => {
  return await checkUpdate();
});

ipcMain.handle('update:download', async (event, url) => {
  try {
    const { spawn } = require('child_process');
    const https = require('https');
    
    const downloadPath = path.join(app.getPath('temp'), 'edibot_setup.exe');
    console.log(`[업데이트] 다운로드 시작: ${url} -> ${downloadPath}`);
    
    const downloadFile = (fileUrl, targetPath) => {
      return new Promise((resolve, reject) => {
        const protocol = fileUrl.startsWith('https') ? require('https') : require('http');
        const request = protocol.get(fileUrl, { 
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } 
        }, (response) => {
          // 리다이렉트 처리 (GitHub는 보통 S3로 리다이렉트함)
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            const nextUrl = response.headers.location.startsWith('http') 
              ? response.headers.location 
              : new URL(response.headers.location, fileUrl).toString();
            console.log(`[업데이트] 리다이렉트 발생: ${nextUrl}`);
            return downloadFile(nextUrl, targetPath).then(resolve).catch(reject);
          }
          
          if (response.statusCode !== 200) {
            return reject(new Error(`HTTP Status ${response.statusCode} (${response.statusMessage})`));
          }

          const file = fs.createWriteStream(targetPath);
          response.pipe(file);
          
          file.on('finish', () => {
            file.close((err) => {
              if (err) reject(err);
              else resolve();
            });
          });

          file.on('error', (err) => {
            fs.unlink(targetPath, () => {});
            reject(err);
          });
        });

        request.on('error', (err) => {
          fs.unlink(targetPath, () => {});
          reject(err);
        });
        
        request.setTimeout(30000, () => {
          request.destroy();
          reject(new Error('Download timeout (30s)'));
        });
      });
    };

    // 임시 폴더에 기존 파일이 있으면 삭제 시도
    if (fs.existsSync(downloadPath)) {
      try { fs.unlinkSync(downloadPath); } catch(e) {}
    }

    await downloadFile(url, downloadPath);
    console.log('[업데이트] 다운로드 완료, 설치 실행 중...');

    // 설치 프로그램 실행 (Windows .exe 기준)
    // nsis 빌드이므로 /S 옵션으로 무인 설치 가능
    const installer = spawn(downloadPath, ['/S'], {
      detached: true,
      stdio: 'ignore'
    });
    installer.unref();
    
    // 설치 시작 후 잠시 뒤 앱 종료 (설치 프로그램이 실행 중인 파일을 덮어써야 함)
    setTimeout(() => {
      app.quit();
    }, 1500);
    
    return true;
  } catch (e) {
    console.error('[업데이트] 자동 설치 실패:', e.message);
    // 실패 시 브라우저로 열기 (Fallback)
    shell.openExternal(url);
    return e.message || '다운로드 중 오류가 발생했습니다.';
  }
});

ipcMain.handle('auth:get-local', () => {
  return readLocalLicense();
});

ipcMain.handle('auth:save-local', (_e, { djNick, uniqueTag, hardkey }) => {
  try {
    const data = {
      djNick: String(djNick || ''),
      uniqueTag: String(uniqueTag || ''),
      hardkey: String(hardkey || '')
    };
    fs.writeFileSync(getLicensePath(), JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('auth:request', async (_e, { djNick, uniqueTag, hardkey }) => {
  try {
    const payload = {
      embeds: [{
        title: '📢 봇 권한 신청 알림',
        color: 0x00ff00,
        fields: [
          { name: 'DJ닉네임', value: djNick || '미입력', inline: true },
          { name: '고유닉', value: uniqueTag || '미입력', inline: true },
          { name: '하드키', value: `\`${hardkey}\`` }
        ],
        timestamp: new Date().toISOString()
      }]
    };
    await sendDiscordWebhook(payload);
    return true;
  } catch (e) {
    console.error('[인증] 웹훅 전송 실패:', e.message);
    return false;
  }
});

// ─── 데이터 저장/조회 IPC 핸들러 ───
function getDataPath(filename) {
  return path.join(app.getPath('userData'), filename);
}

ipcMain.handle('store:get', (e, filename) => {
  try {
    const filePath = getDataPath(filename);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch { return null; }
});

ipcMain.handle('store:set', (e, filename, data) => {
  try {
    const filePath = getDataPath(filename);
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
    return true;
  } catch { return false; }
});

// 사운드 파일 경로 반환 IPC 핸들러
ipcMain.handle('sound:getPath', (e, filename) => {
  return path.join(__dirname, filename);
});

// 완전 초기화 IPC 핸들러 (모든 데이터 삭제 및 재시작)
ipcMain.handle('app:reset-all', async () => {
  try {
    // 1. 모든 세션 데이터(쿠키, 캐시, 스토리지 등) 삭제
    await session.defaultSession.clearStorageData();
    
    // 2. userData 폴더 내의 파일들 삭제 (설정 파일 등)
    const userDataPath = app.getPath('userData');
    const filesToDelete = ['act_data.json', 'roulette_history.json', 'config.json']; // 주요 데이터 파일들
    
    filesToDelete.forEach(file => {
      const filePath = path.join(userDataPath, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    // 3. 앱 재시작
    app.relaunch();
    app.exit();
    return true;
  } catch (err) {
    console.error('Reset failed:', err);
    return false;
  }
});

// 외부 URL 열기 IPC 핸들러 (유튜브 등 외부 링크를 기본 브라우저로 열기)
ipcMain.on('open-external-url', (_e, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

// Electron 보안 경고 메시지만 끄기 (샘플 프로젝트와 동일)
// 주의: no-sandbox / disable-web-security / ignore-certificate-errors 등은
// 구글 로그인을 "비정상 환경"으로 감지시켜 차단하는 원인이 되므로 추가하지 않음.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

let spoonBot = null;
let autoNotice = null;

// ─── 원격 자동공지 IPC 핸들러 ───
// 렌더러(bot.html)에서 상태 조회 / 수동 새로고침 요청
ipcMain.handle('autonotice:status', () => {
  if (!autoNotice) return [];
  return autoNotice.getStatus();
});

ipcMain.handle('autonotice:refresh', async () => {
  if (!autoNotice) return { ok: false, error: 'not_initialized' };
  return await autoNotice.refresh();
});

// 첫 실행 시 file://로 저장된 기존 localStorage를 userData 백업 파일로 마이그레이션
// (이미 백업 파일이 존재하면 스킵)
async function migrateLegacyLocalStorage() {
  const backupPath = path.join(app.getPath('userData'), 'localstorage_backup.json');
  if (fs.existsSync(backupPath)) {
    console.log('[마이그레이션] 기존 백업 존재, 스킵');
    return;
  }

  // file:// origin의 localStorage는 __dirname 위치의 어떤 file:// 페이지든 동일한 Storage 저장소를 공유.
  // 따라서 bot.html이 아닌 경량 HTML 파일을 임시로 생성/로드하면 다른 스크립트 실행 없이
  // 기존 localStorage에 안전하게 접근 가능.
  const tempHtmlPath = path.join(__dirname, '__migrate_temp.html');
  fs.writeFileSync(tempHtmlPath, '<!DOCTYPE html><html><head><meta charset="utf-8"><title>migrate</title></head><body></body></html>', 'utf-8');

  const { BrowserWindow } = require('electron');
  const hiddenWin = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  try {
    await hiddenWin.loadFile('__migrate_temp.html');
    const data = await hiddenWin.webContents.executeJavaScript(`
      (() => {
        const out = {};
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) out[k] = localStorage.getItem(k);
          }
        } catch(e) {}
        return out;
      })()
    `);
    if (data && Object.keys(data).length > 0) {
      fs.writeFileSync(backupPath, JSON.stringify(data), 'utf-8');
      console.log('[마이그레이션] file:// localStorage 백업 완료:', Object.keys(data).length + '개 키');
    } else {
      console.log('[마이그레이션] file:// localStorage 비어있음 (신규 사용자이거나 이미 http://로 전환됨)');
      // 빈 백업이라도 파일을 만들어서 다음 실행 시 마이그레이션 재시도되지 않게 함
      fs.writeFileSync(backupPath, '{}', 'utf-8');
    }
  } catch (e) {
    console.error('[마이그레이션] 실패:', e);
  } finally {
    if (!hiddenWin.isDestroyed()) hiddenWin.destroy();
    // 임시 HTML 삭제
    try { fs.unlinkSync(tempHtmlPath); } catch(e) {}
  }
}

// 로컬 HTTP 서버 시작 함수 (main.js에 포함되어 있어야 함)
async function startLocalServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(__dirname, req.url === '/' ? 'bot.html' : req.url);
      // 쿼리 스트링 제거
      filePath = filePath.split('?')[0];
      
      if (!fs.existsSync(filePath)) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.ico': 'image/x-icon'
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      console.log(`[서버] 로컬 서버 시작됨: http://127.0.0.1:${port}`);
      resolve(port);
    });

    server.on('error', reject);
  });
}

app.whenReady().then(async () => {
  try {
    // 1) 기존 file:// localStorage 마이그레이션 (최초 1회만)
    await migrateLegacyLocalStorage();

    // 2) 로컬 HTTP 서버 시작
    const port = await startLocalServer();

    // 3) 메인 앱 실행
    spoonBot = new SpoonBotApp({ localServerPort: port });
    spoonBot.createWindows();

    // 4) 원격 자동공지 시작
    autoNotice = new AutoNoticeManager({
      onSend: (text) => {
        if (spoonBot && spoonBot.bot) {
          spoonBot.bot.sendSplitChat(text, '📢원격공지');
        }
      },
      onLog: (entry) => {
        if (spoonBot) spoonBot.sendToBot('bot:log', entry);
      },
      onStatus: (list) => {
        if (spoonBot) spoonBot.sendToBot('autonotice:updated', list);
      },
      isBotReady: () => !!(spoonBot && spoonBot.isBotRunning),
      getLocalIdentity: () => readLocalLicense(),
    });
    autoNotice.start();
  } catch (e) {
    console.error('[시작 실패]', e);
    spoonBot = new SpoonBotApp({ localServerPort: 0 });
    spoonBot.createWindows();
  }
});

app.on('window-all-closed', () => {
  if (autoNotice) autoNotice.stop();
  if (spoonBot && spoonBot.spoon) spoonBot.spoon.disconnect();
  app.quit();
});
