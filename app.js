const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('fs');
const path = require('path');
const SpoonClient = require('../spoon/client');
const BotEngine = require('../bot/engine');

class SpoonBotApp {
  constructor(options = {}) {
    this.localServerPort = options.localServerPort || 0;
    this.mainWin = null;
    this.botWin = null;
    this.isBotRunning = false;
    this.tokens = { accessToken: '', roomToken: '', streamName: '', liveId: '', apiStreamName: '' };
    this.liveInfo = { djId: 0, managerIds: [], myId: 0 };
    this.rankData = { next_choice: [], free_like: [], live_time: [], lastScanned: 0 };
    this.autoJoinTag = '';
    this.lastAutoJoinUrl = '';
    this.ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    
    this.spoon = new SpoonClient({
      ua: this.ua,
      onLog: (log) => this.sendToBot('bot:log', log),
      onConnected: (stream) => {
        this.sendToBot('bot:connected', stream);
        this.sendToBot('bot:log', { type: 'system', author: '시스템', text: '✅ 채팅 연결 완료!' });
      },
      onDisconnected: () => {
        this.isBotRunning = false;
        this.sendToBot('bot:disconnected');
      },
      onMessage: (body) => this.handleSpoonMessage(body)
    });

    this.bot = new BotEngine({
      onLog: (log) => this.sendToBot('bot:log', log),
      onSendChat: (text) => this.sendChat(text),
      onKeepQuery: ({ keepKey, author }) => {
        try {
          const filePath = path.join(app.getPath('userData'), 'roulette_history.json');
          const history = fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            : {};
          const keepData = (history[keepKey] || {})['킵목록'] || {};
          let msg;
          if (Object.keys(keepData).length === 0) {
            msg = `📋 ${author}님의 룰렛 기록이 없습니다.`;
          } else {
            msg = `📋 ${author}님의 룰렛 기록\n`;
            Object.entries(keepData).forEach(([itemName, count], i) => {
              const cnt = count > 1 ? `(${count})` : '';
              msg += `${i + 1}. ${itemName}${cnt}\n`;
            });
            msg = msg.trim();
          }
          this.bot.handleKeepReply(author, msg);
        } catch(e) {
          this.bot.handleKeepReply(author, `📋 ${author}님의 룰렛 기록이 없습니다.`);
        }
      },
      onKeepUse: ({ keepKey, author, index, count }) => {
        try {
          const filePath = path.join(app.getPath('userData'), 'roulette_history.json');
          if (!fs.existsSync(filePath)) {
            this.bot.handleKeepReply(author, `📋 ${author}님의 룰렛 기록이 없습니다.`);
            return;
          }
          const history = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (!history[keepKey] || !history[keepKey]['킵목록']) {
            this.bot.handleKeepReply(author, `📋 ${author}님의 룰렛 기록이 없습니다.`);
            return;
          }

          const keepData = history[keepKey]['킵목록'];
          const items = Object.keys(keepData);
          const arrayIdx = index - 1;

          if (arrayIdx < 0 || arrayIdx >= items.length) {
            this.bot.handleKeepReply(author, `📋 ${author}님, 해당 번호(${index})의 항목이 없습니다.`);
            return;
          }

          const itemName = items[arrayIdx];
          const currentCount = keepData[itemName];

          if (currentCount < count) {
            this.bot.handleKeepReply(author, `📋 ${author}님, ${itemName}의 수량이 부족합니다. (현재: ${currentCount}개)`);
            return;
          }

          // 수량 차감
          keepData[itemName] -= count;
          if (keepData[itemName] <= 0) {
            delete keepData[itemName];
          }

          // 파일 저장
          fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');
          
          // UI 갱신 알림
          this.sendToBot('roulette:history-updated', history);
          
          this.bot.handleKeepReply(author, `✅ ${author}님의 [${itemName}] ${count}개 사용 완료! (남은 수량: ${keepData[itemName] || 0}개)`);
        } catch(e) {
          this.bot.handleKeepReply(author, `📋 ${author}님의 킵 사용 중 오류가 발생했습니다.`);
        }
      },
      onCouponCheck: ({ keepKey, author, rouletteIdx, useCount, rouletteName }) => {
        try {
          const filePath = path.join(app.getPath('userData'), 'roulette_history.json');
          if (!fs.existsSync(filePath)) {
            this.bot.handleCouponReply(author, keepKey, rouletteIdx, useCount, false, 0, rouletteName);
            return;
          }
          const history = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (!history[keepKey] || !history[keepKey]['룰렛권']) {
            this.bot.handleCouponReply(author, keepKey, rouletteIdx, useCount, false, 0, rouletteName);
            return;
          }

          const couponKey = String(rouletteIdx);
          const currentCount = Number(history[keepKey]['룰렛권'][couponKey] || 0);

          if (currentCount < useCount) {
            this.bot.handleCouponReply(author, keepKey, rouletteIdx, useCount, false, currentCount, rouletteName);
            return;
          }

          // 룰렛권 차감
          history[keepKey]['룰렛권'][couponKey] = currentCount - useCount;
          const remaining = history[keepKey]['룰렛권'][couponKey];

          fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');

          // UI 갱신 알림
          this.sendToBot('roulette:history-updated', history);

          // 성공 결과 전달
          this.bot.handleCouponReply(author, keepKey, rouletteIdx, useCount, true, remaining, rouletteName);
        } catch(e) {
          this.bot.handleCouponReply(author, keepKey, rouletteIdx, useCount, false, 0, rouletteName);
        }
      },
      onRouletteGive: ({ rouletteIdx, rouletteName, targetTag, count }) => {
        try {
          const filePath = path.join(app.getPath('userData'), 'roulette_history.json');
          const history = fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            : {};

          // 해당 고유닉 유저 키 초기화
          if (!history[targetTag]) history[targetTag] = {};
          if (!history[targetTag]['룰렛권']) history[targetTag]['룰렛권'] = {};

          const couponKey = String(rouletteIdx);  // bot.html과 동일한 숫자 인덱스 문자열 키 사용
          const prev = Number(history[targetTag]['룰렛권'][couponKey] || 0);
          history[targetTag]['룰렛권'][couponKey] = prev + count;
          const newTotal = history[targetTag]['룰렛권'][couponKey];

          fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');

          // UI 갱신 알림
          this.sendToBot('roulette:history-updated', history);

          this.bot.handleRouletteGiveReply(rouletteIdx, rouletteName, targetTag, count, true, newTotal, null);
        } catch(e) {
          this.bot.handleRouletteGiveReply(rouletteIdx, rouletteName, targetTag, count, false, 0, e.message);
        }
      },
      onActivityWrite: (actData) => {
        try {
          const filePath = path.join(app.getPath('userData'), 'act_data.json');
          fs.writeFileSync(filePath, JSON.stringify(actData, null, 2), 'utf-8');
          this.sendToBot('act:data-updated', actData);
        } catch(e) {}
      }
    });

    this.loadAutoJoinTag();
    this.setupIpc();
  }

  getAutoJoinFilePath() {
    return path.join(app.getPath('userData'), 'auto_join.json');
  }

  loadAutoJoinTag() {
    try {
      const filePath = this.getAutoJoinFilePath();
      if (!fs.existsSync(filePath)) return '';
      const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8')) || {};
      this.autoJoinTag = String(saved.tag || '').replace('@', '').trim();
      return this.autoJoinTag;
    } catch (e) {
      return '';
    }
  }

  saveAutoJoinTag(tag) {
    try {
      const cleanTag = String(tag || '').replace('@', '').trim();
      fs.writeFileSync(this.getAutoJoinFilePath(), JSON.stringify({ tag: cleanTag }, null, 2), 'utf-8');
    } catch (e) {}
  }

  getAutoJoinUrl(tag = this.autoJoinTag) {
    const cleanTag = String(tag || '').replace('@', '').trim();
    return cleanTag ? `https://www.spooncast.net/kr/live/@${cleanTag}` : '';
  }

  async navigateToAutoJoin(force = false) {
    const url = this.getAutoJoinUrl();
    if (!url || !this.mainWin || this.mainWin.isDestroyed()) return;

    const currentUrl = this.mainWin.webContents.getURL() || '';
    if (!force && (currentUrl === url || currentUrl.includes(`/live/@${this.autoJoinTag}`))) return;

    // 방송 중인지 확인 (토큰이 있는 경우에만 가능하므로, 토큰이 없으면 일단 이동 시도)
    if (this.tokens.accessToken) {
      try {
        const live = await this.spoon.fetchLiveByTag(this.autoJoinTag, this.tokens.accessToken);
        if (!live || !live.live_id) {
          this.sendToBot('bot:log', { type: 'system', author: '시스템', text: `@${this.autoJoinTag} 님이 현재 방송 중이 아닙니다. 자동 입장을 대기합니다.` });
          return;
        }
      } catch (e) {}
    }

    this.lastAutoJoinUrl = url;
    this.sendToBot('bot:log', { type: 'system', author: '시스템', text: `방송 중 확인: @${this.autoJoinTag} 방송으로 입장합니다.` });
    this.mainWin.loadURL(url).catch(() => {});
  }

  setupIpc() {
    // 봇 시작 전 하드키 인증 체크 (이중 방어)
    const __verifyAuthBeforeStart = async () => {
      try {
        const { ipcMain: _im } = require('electron');
        // main.js에 등록된 auth:check 핸들러를 직접 호출할 수 없으므로
        // license.json + 시트 비교 로직을 간단히 재사용
        const fs2 = require('fs');
        const path2 = require('path');
        const https2 = require('https');
        const licensePath = path2.join(app.getPath('userData'), 'license.json');
        if (!fs2.existsSync(licensePath)) return false;
        const local = JSON.parse(fs2.readFileSync(licensePath, 'utf-8') || '{}');
        if (!local.hardkey) return false;
        // 네트워크 조회
        const csv = await new Promise((resolve, reject) => {
          const u = 'https://docs.google.com/spreadsheets/d/1fSwacPlwfIJhdXVrqEFRwkn_2hoxikjfm_W5v-G16gk/export?format=csv';
          const go = (url, depth) => {
            if (depth > 5) return reject(new Error('redirect'));
            https2.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 SpoonBot' } }, (res) => {
              if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).toString();
                return go(next, depth + 1);
              }
              if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
              const chunks = [];
              res.on('data', c => chunks.push(c));
              res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
              res.on('error', reject);
            }).on('error', reject);
          };
          go(u, 0);
        });
        // 간단 CSV 파싱 (C열만 필요)
        const lines = csv.split(/\r?\n/);
        for (const line of lines) {
          // 따옴표가 포함될 수 있으므로 간단 파서
          const cols = [];
          let f = '', q = false;
          for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (q) {
              if (c === '"') { if (line[i+1] === '"') { f += '"'; i++; } else q = false; }
              else f += c;
            } else {
              if (c === '"') q = true;
              else if (c === ',') { cols.push(f); f = ''; }
              else f += c;
            }
          }
          cols.push(f);
          if ((cols[2] || '').trim() === local.hardkey) return true;
        }
        return false;
      } catch (e) {
        console.error('[인증-메인] 체크 실패:', e.message);
        return false; // 네트워크 실패 시 차단
      }
    };

    ipcMain.on('bot:start', async (_e, { commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, flags, flagOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData, fishingSettings, fishingData, ttsSettings }) => {
      const ok = await __verifyAuthBeforeStart();
      if (!ok) {
        this.sendToBot('bot:log', { type: 'system', author: '⛔ 인증', text: '하드키 인증이 완료되지 않아 봇 실행이 차단되었습니다.' });
        this.sendToBot('bot:disconnected');
        return;
      }
      // act_data.json 파일에서 최신 데이터 로드 (bot.html localStorage보다 우선)
      try {
        const filePath = path.join(app.getPath('userData'), 'act_data.json');
        if (fs.existsSync(filePath)) actData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch(e) {}
      this.bot.updateConfig(commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, flags, flagOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData, fishingSettings, fishingData, ttsSettings);
      this.startBot();
    });

    ipcMain.on('bot:stop', () => this.stopBot());

    ipcMain.on('config:update', (_e, { commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, flags, flagOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData, fishingSettings, fishingData, ttsSettings }) => {
      this.bot.updateConfig(commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, flags, flagOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData, fishingSettings, fishingData, ttsSettings);
      if (this.isBotRunning) {
        this.sendToBot('bot:log', { type: 'system', author: '시스템', text: '설정이 즉시 적용되었습니다.' });
      }
    });

    ipcMain.on('bot:response-config', async (_e, { commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, flags, flagOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData, fishingSettings, fishingData, ttsSettings }) => {
      const ok = await __verifyAuthBeforeStart();
      if (!ok) {
        this.sendToBot('bot:log', { type: 'system', author: '⛔ 인증', text: '하드키 인증이 완료되지 않아 자동 시작이 차단되었습니다.' });
        this.sendToBot('bot:disconnected');
        return;
      }
      try {
        const filePath = path.join(app.getPath('userData'), 'act_data.json');
        if (fs.existsSync(filePath)) actData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch(e) {}
      this.bot.updateConfig(commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, flags, flagOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData, fishingSettings, fishingData, ttsSettings);
      if (!this.isBotRunning) {
        this.sendToBot('bot:log', { type: 'system', author: '시스템', text: '방 입장 감지 - 봇을 자동으로 시작합니다...' });
        this.startBot();
      }
    });

    // act_data.json 직접 쓰기 IPC (window.store 없는 환경 대비)
    ipcMain.on('act:write', (_e, data) => {
      try {
        const filePath = path.join(app.getPath('userData'), 'act_data.json');
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        this.bot.actData = data;
      } catch(e) {}
    });

    // 랭킹 데이터 스캔 및 조회
    ipcMain.handle('rank:scan', async () => {
      if (!this.tokens.accessToken) return { success: false, error: '토큰이 없습니다. 방송 페이지에 먼저 접속해주세요.' };
      
      try {
        const types = ['next_choice', 'free_like', 'live_time'];
        for (const type of types) {
          this.rankData[type] = await this.spoon.fetchMonthlyRank(type, this.tokens.accessToken);
        }
        this.rankData.lastScanned = Date.now();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });

    ipcMain.handle('rank:search', async (_e, tag) => {
      if (!tag) return { success: false, error: '태그를 입력해주세요.' };
      if (this.rankData.lastScanned === 0) return { success: false, error: '먼저 랭킹 데이터를 스캔해주세요.' };

      const results = { nickname: '', tag: tag, ranks: {} };
      let found = false;

      for (const type of ['next_choice', 'free_like', 'live_time']) {
        const idx = this.rankData[type].findIndex(x => x.author && x.author.tag === tag);
        if (idx !== -1) {
          found = true;
          results.nickname = this.rankData[type][idx].author.nickname;
          results.ranks[type] = idx + 1;
        }
      }

      if (!found) return { success: false, error: '랭킹 데이터에서 해당 유저를 찾을 수 없습니다.' };
      return { success: true, data: results };
    });

    ipcMain.on('bot:set-auto-join', (_e, tag) => {
      const cleanTag = String(tag || '').replace('@', '').trim();
      this.autoJoinTag = cleanTag;
      this.saveAutoJoinTag(cleanTag);
      this.navigateToAutoJoin();
      this.checkAutoStart();
    });

    // 현재 재생 중인 곳 정보 동기화 (bot.html → engine)
    // bot.html이 재생 시작/정지할 때마다 이 IPC로 알림
    ipcMain.on('song:now-playing', (_e, info) => {
      this.bot.updateCurrentPlaying(info);
    });

    // 퀴즈 채팅 전송 IPC (bot.html에서 퀴즈 정답/문제 메시지 전송 요청)
    ipcMain.on('bot:send-chat', async (_e, text) => {
      if (!text) return;
      try {
        await this.sendChat(text);
        this.sendToBot('bot:log', { type: 'bot', author: '퀴즈', text });
      } catch(e) {
        this.sendToBot('bot:log', { type: 'debug', author: '퀴즈오류', text: e.message });
      }
    });
  }

  setupWebRequest() {
    // 하나의 리스너로 모든 도메인 처리 (onBeforeSendHeaders는 세션당 1개만 활성됨)
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      const h = details.requestHeaders;
      const url = details.url || '';

      // 1) YouTube 관련 도메인: Referer/Origin 강제 주입 (Error 153 방지)
      if (/^https?:\/\/([^/]+\.)?(youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com)\//i.test(url)) {
        const ref = h['Referer'] || h['referer'] || '';
        if (!ref || ref.startsWith('file://')) {
          h['Referer'] = 'https://www.youtube.com/';
        }
        const org = h['Origin'] || h['origin'] || '';
        if (!org || org.startsWith('file://') || org === 'null') {
          h['Origin'] = 'https://www.youtube.com';
        }
      }

      // 2) 스푼 도메인: 토큰 감지 (구글 도메인은 건드리지 않음)
      if (url.includes('spooncast.net')) {
        const auth = h['Authorization'] || h['authorization'] || '';
        if (auth.startsWith('Bearer ') && auth.length > 30) {
          const t = auth.slice(7);
          if (t !== this.tokens.accessToken) {
            this.tokens.accessToken = t;
            this.sendToBot('token:access', t);
            this.navigateToAutoJoin();
            this.checkAutoStart();
          }
        }
        const live = h['x-live-authorization'] || h['X-Live-Authorization'] || '';
        if (live.startsWith('Bearer ') && live.length > 30) {
          const t = live.slice(7);
          if (t !== this.tokens.roomToken) {
            this.tokens.roomToken = t;
            this.sendToBot('token:room', t);
            this.checkAutoStart();
          }
        }

        const mName = url.match(/\/lives\/@([^/?#&]+)/);
        if (mName && mName[1] && mName[1] !== this.tokens.streamName) {
          this.tokens.streamName = mName[1];
          this.sendToBot('token:stream', this.tokens.liveId ? `${mName[1]} ✅` : mName[1]);
          this.checkAutoStart();
        }

        const mId = url.match(/\/lives\/(\d+)/);
        if (mId && mId[1] && mId[1] !== this.tokens.liveId) {
          this.tokens.liveId = mId[1];
          this.sendToBot('token:stream', this.tokens.streamName ? `${this.tokens.streamName} ✅` : `ID:${mId[1]} ✅`);
          this.fetchStreamName(mId[1]);
        }
      }

      callback({ requestHeaders: h });
    });
  }

  async fetchStreamName(liveId) {
    const info = await this.spoon.fetchStreamName(liveId, this.tokens.accessToken);
    if (info) {
      const sn = info.stream_name;
      this.liveInfo.djId = info.dj_user_id || (info.author && info.author.id) || (info.user && info.user.id) || 0;
      this.liveInfo.managerIds = info.manager_ids || [];
      
      if (sn && sn !== this.tokens.apiStreamName) {
        this.tokens.apiStreamName = sn;
        this.sendToBot('bot:log', { type: 'system', author: '시스템', text: `채널 확인됨: ${sn}` });
        this.checkAutoStart();
      }
    }
  }

  async checkAutoStart() {
    // 1. 이미 봇이 실행 중이면 패스
    if (this.isBotRunning) return;

    // 2. 고유닉 기반 자동 접속 시도 (토큰은 있고 방송 정보가 없을 때)
    if (this.tokens.accessToken && this.autoJoinTag && !this.tokens.liveId && !this.tokens.streamName) {
      const live = await this.spoon.fetchLiveByTag(this.autoJoinTag, this.tokens.accessToken);
      if (live && live.live_id) {
        this.tokens.liveId = live.live_id;
        this.tokens.streamName = live.stream_name;
        this.liveInfo.djId = live.dj_user_id;
        this.sendToBot('bot:log', { type: 'system', author: '시스템', text: `자동 접속 대상 발견: @${this.autoJoinTag} (${live.title})` });
        this.sendToBot('token:stream', `${live.stream_name} ✅`);
        this.navigateToAutoJoin();
      }
    }

    // 3. 모든 정보가 갖춰지면 설정 요청 (이후 startBot 호출됨)
    if (this.tokens.accessToken && this.tokens.roomToken && (this.tokens.streamName || this.tokens.liveId)) {
      this.sendToBot('bot:request-config');
    }
  }

  async startBot() {
    if (!this.tokens.accessToken || !this.tokens.roomToken) return;
    const channelId = this.tokens.apiStreamName || this.tokens.streamName || this.tokens.liveId;
    this.isBotRunning = true;
    
    // 봇 시작 시 본인 정보 가져오기 (권한 체크용)
    const myProfile = await this.spoon.fetchMyProfile(this.tokens.accessToken);
    if (myProfile) {
      this.liveInfo.myId = myProfile.id || 0;
      this.sendToBot('bot:log', { type: 'debug', author: '시스템', text: `내 정보 확인됨: ID:${this.liveInfo.myId}` });
    }

    // 봇 시작 시 중복 인사 기록 초기화
    this.bot.clearEnteredUsers();
    
    // 봇 시작 시 반복 메시지 타이머 재설정
    this.bot.setupRepeatMessages();
    
    this.spoon.connect(channelId, this.tokens.accessToken, this.tokens.roomToken);
  }

  stopBot() {
    this.spoon.disconnect();
    this.bot.stop();
    this.isBotRunning = false;
    this.sendToBot('bot:disconnected');
  }

  async handleSpoonMessage(evt) {
    const liveId = this.tokens.liveId;
    const eventName = evt.eventName;

    // 1. 채팅 메시지 처리 (live_message)
    if (eventName === 'live_message' || eventName === 'ChatMessage') {
      const user = evt.data?.user || evt.eventPayload?.generator || {};
      const author = user.nickname || user.name || '?';
      const userId = user.id;
      const message = evt.update_component?.message?.value || evt.eventPayload?.message || '';

      if (!message) return;

      // 매니저 권한 체크 (DJ 또는 매니저)
      // 1. ID 기반 체크 (타입 차이 방지를 위해 == 사용 및 명시적 숫자 변환)
      const curUserId = Number(userId);
      const djId = Number(this.liveInfo.djId);
      const myId = Number(this.liveInfo.myId);
      const managerIds = (this.liveInfo.managerIds || []).map(id => Number(id));

      const isDjById = curUserId !== 0 && djId !== 0 && (curUserId === djId);
      const isManagerById = curUserId !== 0 && managerIds.includes(curUserId);
      const isMe = curUserId !== 0 && myId !== 0 && (curUserId === myId); // 봇 실행자 본인
      
      // 2. 이벤트 데이터 기반 체크 (보조)
      const isDj = !!(isDjById || isMe || user.is_dj || user.role === 'dj' || evt.data?.is_dj || evt.data?.user?.is_dj || evt.eventPayload?.is_dj || evt.eventPayload?.generator?.is_dj || evt.eventPayload?.generator?.role === 'dj');
      const isManager = !!(isDj || isManagerById || user.is_manager || user.is_staff || user.role === 'manager' || evt.data?.is_manager || evt.data?.user?.is_manager || evt.eventPayload?.is_manager || evt.eventPayload?.generator?.is_manager || evt.eventPayload?.generator?.role === 'manager');

      let displayAuthor = author;
      let chatTag = null;
      if (userId && liveId) {
        const chatProfile = await this.spoon.fetchUserProfile(liveId, userId, this.tokens.accessToken);
        chatTag = chatProfile ? chatProfile.tag : null;
        if (chatTag) displayAuthor = `${author}(${chatTag})`;
        // 프로필 이미지 별도 조회 (비동기, 채팅 흐름 블로킹 없이)
        this.spoon.fetchUserImgUrl(userId, this.tokens.accessToken).then(imgUrl => {
          if (chatTag && imgUrl) this.sendToBot('bot:log', { type: 'user_img', author: chatTag, text: imgUrl });
        });
      }

      this.sendToBot('bot:log', { type: 'chat', author: displayAuthor, text: message });
      this.sendToBot('bot:log', { type: 'debug', author: '권한체크', text: `ID:${userId} / DJ:${this.liveInfo.djId} / 본인:${this.liveInfo.myId} / 결과:${isManager}` });
      
      try {
        this.bot.handleMessage(author, message, this.tokens.streamName, isManager, chatTag, isDj);
      } catch (e) {
        this.sendToBot('bot:log', { type: 'debug', author: '시스템', text: `명령어 처리 중 오류: ${e.message}` });
      }

      // 애청지수 채팅 기록
      try { this.bot.handleActChat(author, chatTag); } catch(e) {}
      return;
    }

    // 2. 입장 메시지 처리
    const isJoinEvent = !!(eventName && (
      eventName === 'live_join' || 
      eventName === 'JoinMessage' || 
      eventName === 'RoomJoin' ||
      eventName === 'live_join_event' ||
      eventName === 'LiveJoin' ||
      eventName === 'UserJoin' ||
      eventName === 'live_user_join' ||
      eventName === 'join' ||
      eventName === 'Join' ||
      eventName.toLowerCase().includes('join')
    ));

    if (isJoinEvent) {
      // 디버깅을 위한 전체 이벤트 데이터 로그 출력
      this.sendToBot('bot:log', { type: 'debug', author: '디버그', text: `입장 이벤트 감지: ${eventName} (데이터: ${JSON.stringify(evt).slice(0, 300)})` });

      const user = evt.data?.author || evt.data?.user || evt.eventPayload?.author || evt.eventPayload?.generator || evt.author || evt.user || {};
      const author = user.nickname || user.name || user.display_name || user.username || '?';
      const userId = user.id || user.user_id || user.userId || 0;

      if (userId && liveId) {
        const tag = await this.spoon.fetchUserTag(liveId, userId, this.tokens.accessToken);
        const logText = tag ? `[${author}] 님이 입장했습니다. (태그: @${tag})` : `[${author}] 님이 입장했습니다. (ID:${userId})`;
        this.sendToBot('bot:log', { type: 'join', author: '입장', text: logText });
        this.bot.handleJoin(author, tag, this.tokens.streamName);
        // 애청지수 자동 출석 (30분마다 1회, 조용히 처리)
        try { this.bot.handleActAttend(author, tag); } catch(e) {}

        // ⭐ 프로필 진단 모드: 켜져 있으면 입장자 프로필 전체 필드 덤프
        //    설정에서 debugProfileDump = true 일 때만 동작 (애청지수 모듈용)
        try {
          const actSet = this.bot.actSettings || {};
          if (actSet.debugProfileDump === true) {
            this.spoon.fetchUserProfileRaw(liveId, userId, this.tokens.accessToken).then(raw => {
              if (!raw) return;
              const keys = Object.keys(raw).sort();
              // 멤버십 관련 추정 키만 골라서 강조 표시
              const hintRegex = /(member|vip|sub|grade|tier|fan|paid|premium|role|badge|level|item)/i;
              const hintKeys = keys.filter(k => hintRegex.test(k) && !/member_count|total_member/.test(k));
              const hintLines = hintKeys.map(k => {
                let v = raw[k];
                if (typeof v === 'object') v = JSON.stringify(v);
                const vs = String(v);
                return `    ${k} = ${vs.length > 200 ? vs.slice(0,200)+'...' : vs}`;
              }).join('\n');
              const msg =
                `🔍 [${author}] 프로필 진단\n` +
                `  전체 키 (${keys.length}개): ${keys.join(', ')}\n` +
                (hintKeys.length > 0
                  ? `  멤버십 추정 필드:\n${hintLines}`
                  : `  멤버십 추정 필드 없음`);
              this.sendToBot('bot:log', { type: 'debug', author: '프로필진단', text: msg });
            }).catch(()=>{});
          }
        } catch(e) {}
      } else if (author && author !== '?') {
        this.sendToBot('bot:log', { type: 'join', author: '입장', text: `[${author}] 님이 입장했습니다. (닉네임 기반)` });
        this.bot.handleJoin(author, null, this.tokens.streamName);
        try { this.bot.handleActAttend(author, null); } catch(e) {}
      }
      return;
    }

    // 3. 좋아요 처리 (LiveFreeLike / live_like)
    if (eventName === 'live_like' || eventName === 'LiveFreeLike') {
      const author = evt.eventPayload?.nickname || evt.data?.author?.nickname || evt.data?.user?.nickname || '시청자';
      const userId = evt.eventPayload?.userId || evt.eventPayload?.user_id || evt.data?.user?.id || 0;

      this.sendToBot('bot:log', { type: 'system', author: '좋아요', text: `${author}님이 좋아요를 눌렀습니다.` });
      this.bot.handleLike(author);

      // userId → tag 조회 후 하트 기록 (userId 있으면 정확한 tag, 없으면 닉네임 fallback)
      if (userId && liveId) {
        this.spoon.fetchUserProfile(liveId, userId, this.tokens.accessToken).then(profile => {
          const tag = profile ? profile.tag : null;
          try { this.bot.handleActHeart(author, tag); } catch(e) {}
        });
      } else {
        try { this.bot.handleActHeart(author, null); } catch(e) {}
      }
      return;
    }

    // 4. 선물 처리 (live_present 및 LiveDonation 등 모든 선물 이벤트 대응)
    if (eventName === 'live_present' || eventName === 'LiveDonation' || eventName === 'DonationMessage') {
      const data = evt.data || evt.eventPayload || evt;
      
      // 유저 정보 추출 (다양한 필드명 대응)
      const user = data.author || data.user || data.generator || data;
      const author = user.nickname || user.name || user.display_name || '?';
      
      // 스푼 개수 추출 (amount, spoonCount, quantity, value 등 모든 가능성 체크)
      const amount = Number(data.amount || data.spoonCount || data.spoon_count || data.quantity || data.value || 0);
      
      // 콤보 횟수 추출 (comboCount, combo_count 등)
      const comboCount = Number(data.comboCount || data.combo_count || data.combo || 1);
      
      // 스티커 정보 추출
      const sticker = data.sticker || data.stickerName || data.sticker_name || data.name || '';
      
      if (amount > 0) {
        const userId = user.id || user.user_id || user.userId || 0;
        this.spoon.fetchUserProfile(liveId, userId, this.tokens.accessToken).then(profile => {
          const tag = profile ? profile.tag : null;
          const displayAuthor = tag ? `${author}(${tag})` : author;
          const logText = `${displayAuthor}님이 ${sticker ? '['+sticker+'] ' : ''}스푼 ${amount}개${comboCount > 1 ? ' X ' + comboCount : ''}를 선물했습니다. 🎁`;
          this.sendToBot('bot:log', { type: 'system', author: '선물', text: logText });
          this.spoon.fetchUserImgUrl(userId, this.tokens.accessToken).then(imgUrl => {
            if (tag && imgUrl) this.sendToBot('bot:log', { type: 'user_img', author: tag, text: imgUrl });
          });
          this.bot.handleGift(author, amount, sticker, comboCount, tag);
          // 애청지수 복권포인트 적립
          try { this.bot.handleActLottoPoint(author, tag, amount); } catch(e) {}
        });
      } else {
        // 디버깅용 로그: 스푼 개수가 0으로 파싱된 경우 전체 데이터 출력
        this.sendToBot('bot:log', { type: 'debug', author: '선물오류', text: `선물 감지되었으나 스푼 개수 파싱 실패: ${JSON.stringify(data).slice(0, 200)}` });
      }
      return;
    }
  }

  async sendChat(text) {
    const channelId = this.tokens.apiStreamName || this.tokens.streamName || this.tokens.liveId;
    await this.spoon.sendChat(channelId, text, this.tokens.accessToken, this.tokens.roomToken);
  }

  createWindows() {
    const { screen } = require('electron');
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const spoonW = Math.min(700, width - 420);

    // 앱 아이콘 (프로젝트 루트의 icon.ico)
    const appIcon = path.join(__dirname, '../../icon.ico');

    this.mainWin = new BrowserWindow({
      width: spoonW, height, x: 0, y: 0, title: '스푼라디오',
      icon: appIcon,
      // 샘플 프로젝트와 동일한 webPreferences (구글 로그인 작동 확인된 구성)
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        webSecurity: false,
        sandbox: false,
        backgroundThrottling: false,
        offscreen: false,
      },
    });
    this.mainWin.setMenuBarVisibility(false);
    // 중요: setUserAgent() 호출하지 않음
    // → Electron 기본 Chrome UA 그대로 사용해야 구글이 "embedded webview"로 차단하지 않음
    const initialUrl = this.getAutoJoinUrl() || 'https://www.spooncast.net';
    this.mainWin.loadURL(initialUrl);

    this.botWin = new BrowserWindow({
      width: 920, height, x: spoonW, y: 0, title: '🎙️ 스푼봇',
      icon: appIcon,
      webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false, preload: path.join(__dirname, '../../preload.js') },
    });
    this.botWin.setMenuBarVisibility(false);
    // 로컬 HTTP 서버를 통해 로드 → YouTube embed 정책 회피 (file:// 차단 우회)
    if (this.localServerPort > 0) {
      const botUrl = `http://127.0.0.1:${this.localServerPort}/bot.html`;
      console.log('[봇창] 로컬 서버로 로드:', botUrl);
      this.botWin.loadURL(botUrl);
    } else {
      // 서버 실행 실패 시 file:// fallback
      console.warn('[봇창] 로컬 서버 없음, file:// 로 fallback (YouTube 재생 안 될 수 있음)');
      this.botWin.loadFile('bot.html');
    }
    
    this.setupWebRequest();

    // 방 이동 감지: URL이 변경될 때마다 토큰 및 방송 정보 초기화 후 재감지
    this.mainWin.webContents.on('did-navigate', (event, url) => {
      if (url.includes('spooncast.net/kr/live/')) {
        this.sendToBot('bot:log', { type: 'system', author: '시스템', text: '방 이동 감지: 새로운 방송 정보를 확인합니다.' });
        
        // 이전 방 정보 초기화 (액세스 토큰은 유지)
        this.tokens.roomToken = '';
        this.tokens.liveId = '';
        this.tokens.streamName = '';
        this.tokens.apiStreamName = '';
        this.liveInfo.djId = 0;
        this.liveInfo.managerIds = [];
        
        // 봇이 실행 중이었다면 중지 (새로운 토큰 감지 시 자동 재시작됨)
        if (this.isBotRunning) {
          this.stopBot();
        }
      }
    });
  }

  sendToBot(ch, data) {
    if (this.botWin && !this.botWin.isDestroyed()) this.botWin.webContents.send(ch, data);
  }
}

module.exports = SpoonBotApp;
