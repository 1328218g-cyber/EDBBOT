class BotEngine {
  constructor(options = {}) {
    this.commands = options.commands || [];
    this.hotkeys = options.hotkeys || [];
    this.joinMsgs = options.joinMsgs || [];
    this.fundings = options.fundings || [];
    this.fundingOptions = options.fundingOptions || { showPercent: true, showDday: true };
    this.flags = Array.isArray(options.flags) ? options.flags : [];
    this.flagOptions = options.flagOptions || { customCmd: '!깃발' };
    this.shieldCount = options.shieldCount || 0;
    this.shieldOptions = options.shieldOptions || { format: "🛡️ 현재 보유 중인 실드는 {실드}개 입니다!", updateFormat: "{icon} 실드 {action} 완료!\n현재 실드: {실드}개" };
    this.songList = options.songList || [];
    this.songSettings = options.songSettings || { enabled: true };
    this.autoSettings = options.autoSettings || { join: [], like: [], gift: [], repeat: [] };
    this.onLog = options.onLog || (() => {});
    this.onSendChat = options.onSendChat || (() => {});
    this.onKeepQuery = options.onKeepQuery || (() => {});
    this.onKeepUse = options.onKeepUse || (() => {});
    this.onCouponCheck = options.onCouponCheck || (() => {});
    this.onRouletteGive = options.onRouletteGive || (() => {});
    this.onActivityRead = options.onActivityRead || (() => {});
    this.onActivityWrite = options.onActivityWrite || (() => {});
    this.miscSettings = options.miscSettings || {};
    this.actSettings = options.actSettings || {};
    this.actData = options.actData || {};
    this.fishingSettings = options.fishingSettings || {};
    this.fishingData = options.fishingData || {};
    this.activeTimers = [];
    this.cmdCounts = {};
    this.cmdTimes = {};
    this.enteredUsers = new Set();
    this.userJoinCounts = {};
    this.rouletteUserLogs = {}; this.hkTimes = {};
    this.maxLen = 100;
    this.sendInterval = 200;
    this.repeatTimers = [];
    // 현재 재생 중인 곡 정보 (!현재곡 응답용)
    // bot.html이 재생할 때마다 app.js를 거쳐 이 필드가 업데이트됨
    this.currentPlaying = null; // { artist, title, videoId, videoTitle, channelTitle, startedAt }
  }

  updateConfig(commands, hotkeys, joinMsgs, autoSettings, fundings, fundingOptions, flags, flagOptions, shieldCount, shieldOptions, songList, songSettings, rouletteSettings, miscSettings, actSettings, actData, fishingSettings, fishingData) {
    this.commands = commands || [];
    this.hotkeys = hotkeys || [];
    this.joinMsgs = joinMsgs || [];
    if (autoSettings && typeof autoSettings === 'object') this.autoSettings = autoSettings;
    this.fundings = fundings || this.fundings;
    this.fundingOptions = fundingOptions || this.fundingOptions;
    this.flags = Array.isArray(flags) ? flags : this.flags;
    this.flagOptions = flagOptions || this.flagOptions;
    if (shieldCount !== undefined) this.shieldCount = shieldCount;
    if (shieldOptions) this.shieldOptions = shieldOptions;
    if (songList) this.songList = songList;
    if (songSettings) this.songSettings = songSettings;
    if (rouletteSettings) this.rouletteSettings = rouletteSettings;
    if (miscSettings !== undefined) this.miscSettings = miscSettings || this.miscSettings;
    if (actSettings !== undefined) this.actSettings = actSettings || this.actSettings;
    if (actData !== undefined) this.actData = actData || this.actData;
    if (fishingSettings !== undefined) this.fishingSettings = fishingSettings || this.fishingSettings;
    if (fishingData !== undefined) this.fishingData = fishingData || this.fishingData;
    if (arguments[17] !== undefined) this.ttsSettings = arguments[17]; // ttsSettings 수신 추가
    if (this.isRunning) this.setupRepeatMessages();
  }

  // 반복 메시지 타이머 설정
  setupRepeatMessages() {
    this.isRunning = true;
    this.repeatTimers.forEach(timer => clearInterval(timer));
    this.repeatTimers = [];

    if (this.autoSettings && this.autoSettings.repeat) {
      this.autoSettings.repeat.forEach(item => {
        const enabled = item.enabled !== false;
        this.onLog({ type: 'debug', author: '반복', text: `반복문구: "${item.text.slice(0,20)}" delay=${item.delay}초 enabled=${enabled}` });
        if (item.text && item.delay > 0 && enabled) {
          const timer = setInterval(() => {
            this.onLog({ type: 'debug', author: '반복', text: `반복문구 전송: "${item.text.slice(0,20)}"` });
            this.sendSplitChat(item.text, '🔄반복');
          }, item.delay * 1000);
          this.repeatTimers.push(timer);
        }
      });
    }

    if (Array.isArray(this.flags)) {
      this.flags.forEach((flag, idx) => {
        if (!flag || flag.enabled === false || !flag.intervalEnabled) return;
        const minutes = parseInt(flag.intervalMinutes || 0);
        const seconds = parseInt(flag.intervalSeconds || 0);
        const delayMs = (minutes * 60 + seconds) * 1000;
        if (!delayMs || delayMs < 1000) return;
        const timer = setInterval(() => {
          const msg = this.buildFlagStatusMessage(idx, flag);
          if (msg) this.sendSplitChat(msg, '🏁깃발');
        }, delayMs);
        this.repeatTimers.push(timer);
      });
    }
  }

  // 중복 인사 기록 초기화 (방송 시작 시 또는 수동)
  clearEnteredUsers() {
    this.enteredUsers.clear();
  }

  handleMessage(author, text, streamName, isManager = false, tag = null, isDj = false) {
    const parts = text.trim().split(/\s+/);
    const first = parts[0].toLowerCase();
    const now = Date.now();

    // 0. 펀딩 명령어 처리 (커스텀 명령어 대응)
    const fundingCmd = (this.fundingOptions?.customCmd || '!펀딩').toLowerCase();
    if (first === fundingCmd) {
      this.onLog({ type: 'debug', author: '디버그', text: `펀딩 명령어 감지: ${text} (매니저여부: ${isManager})` });
      this.handleFundingCommand(parts, isManager);
      return;
    }

    // 0.1 실드 명령어 처리 (커스텀 명령어 대응 + !마실 추가)
    const shieldCmd = (this.shieldOptions?.customCmd || '!실드').toLowerCase();
    if (first === shieldCmd || first === '!마실') {
      this.handleShieldCommand(parts, isManager);
      return;
    }

    const flagCmd = (this.flagOptions?.customCmd || '!깃발').toLowerCase();
    if (first === flagCmd) {
      this.handleFlagCommand(parts, isManager);
      return;
    }

    // 0.2 신청곡 명령어 처리
    const songCmd = (this.songSettings?.customCmd || '!신청곡').toLowerCase();
    const songDelCmd = (this.songSettings?.delCmd || '!제거').toLowerCase();
    const songStopCmd = (this.songSettings?.stopCmd || '!마감').toLowerCase();
    const songStartCmd = (this.songSettings?.startCmd || '!접수').toLowerCase();
    const songResetCmd = (this.songSettings?.resetCmd || '리셋').toLowerCase();
    const isResetCmd = songResetCmd.startsWith('!') ? first === songResetCmd : first === '!' + songResetCmd;

    if (first === songCmd || first === songDelCmd || first === songStopCmd || first === songStartCmd || isResetCmd) {
      this.handleSongCommand(parts, isManager, author);
      return;
    }

    // !현재곡 : 현재 재생 중인 곡을 채팅으로 알림
    const nowPlayingCmd = (this.songSettings?.nowPlayingCmd || '!현재곡').toLowerCase();
    if (first === nowPlayingCmd) {
      this.handleNowPlayingCommand();
      return;
    }

    // 0.2 기타모듈 명령어 처리
    const diceCmd = (this.miscSettings?.diceCmd || '!주사위').toLowerCase();
    const timerCmd = (this.miscSettings?.timerCmd || '!리액션').toLowerCase();
    const ddayCmd = (this.miscSettings?.ddayCmd || '!디데이').toLowerCase();

    if (first === diceCmd) {
      this.handleDice(author, isManager);
      return;
    }
    if (first === timerCmd) {
      this.handleTimer(author, parts, isManager);
      return;
    }
    if (first === ddayCmd) {
      this.handleDday(author, parts, isManager);
      return;
    }

    // 0.2.1 메모 명령어 처리 (DJ/매니저 전용)
    const memoCmd = (this.miscSettings?.memoCmd || '!메모').toLowerCase();
    const memoDelCmd = (this.miscSettings?.memoDelCmd || '!메모제거').toLowerCase();
    const memoResetCmd = (this.miscSettings?.memoResetCmd || '!메모리셋').toLowerCase();

    if (isManager) {
      if (first === memoCmd) {
        this.handleMemo(author, parts);
        return;
      }
      if (first === memoDelCmd) {
        this.handleMemoDelete(author, parts);
        return;
      }
      if (first === memoResetCmd) {
        this.handleMemoReset(author);
        return;
      }
    }

    // 0.3 낚시 게임 명령어 처리
    const fishCmd = (this.fishingSettings?.fishCmd || '!낚시').toLowerCase();
    const diceGameCmd = (this.fishingSettings?.diceGameCmd || '!도박').toLowerCase();
    const oddCmd = (this.fishingSettings?.oddCmd || '!홀').toLowerCase();
    const evenCmd = (this.fishingSettings?.evenCmd || '!짝').toLowerCase();
    const walletCmd = (this.fishingSettings?.walletCmd || '!지갑').toLowerCase();

    if (first === fishCmd) {
      this.handleFishing(author, tag, isManager);
      return;
    }
    if (first === diceGameCmd) {
      this.handleDiceGame(author, tag, parts, isManager);
      return;
    }
    if (first === oddCmd) {
      this.handleOddEven(author, tag, parts, true, isManager);
      return;
    }
    if (first === evenCmd) {
      this.handleOddEven(author, tag, parts, false, isManager);
      return;
    }
    if (first === walletCmd) {
      this.handleWallet(author, tag);
      return;
    }

    // 0.5 애청지수 명령어 처리
    const act = this.actSettings || {};
    const cmdMyInfo   = String(act.cmdMyInfo   || '!내정보').toLowerCase();
    const cmdCreate   = String(act.cmdCreate   || '!내정보 생성').toLowerCase();
    const cmdDelete   = String(act.cmdDelete   || '!내정보 삭제').toLowerCase();
    const cmdRank     = String(act.cmdRank     || '!랭킹').toLowerCase();
    const cmdLotto    = String(act.cmdLotto    || '!복권').toLowerCase();
    const cmdAttend   = String(act.cmdAttend   || '!출석').toLowerCase();
    const cmdAt       = String(act.cmdAt       || '@');

    const fullText = text.trim().toLowerCase();

    // !내정보 생성
    if (fullText === cmdCreate) {
      this.handleActCreate(author, tag);
      return;
    }
    // !내정보 삭제
    if (fullText === cmdDelete) {
      this.handleActDelete(author, tag);
      return;
    }
    // !내정보
    if (fullText === cmdMyInfo) {
      this.handleActMyInfo(author, tag);
      return;
    }
    // !랭킹
    if (fullText === cmdRank) {
      this.handleActRank();
      return;
    }
    // !출석
    if (fullText === cmdAttend) {
      this.handleActAttend(author, tag);
      return;
    }
    // !복권 [수량] or !복권 N1 N2 N3
    if (parts[0].toLowerCase() === cmdLotto) {
      this.handleActLotto(author, tag, parts.slice(1));
      return;
    }
    // @[고유닉] - DJ/매니저만
    if (isManager && parts[0].startsWith(cmdAt) && parts[0].length > cmdAt.length) {
      const targetTag = parts[0].slice(cmdAt.length);
      this.handleActViewOther(targetTag);
      return;
    }

    // !복권지급 / !상점 권한 체크: DJ 또는 actSettings.grantTags 에 등록된 고유닉
    const _grantTagsRaw = Array.isArray(act.grantTags) ? act.grantTags : [];
    const _grantTags = _grantTagsRaw
      .map(t => String(t || '').trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
    const _myTag = String(tag || '').trim().toLowerCase().replace(/^@/, '');
    const canGrant = isDj || (!!_myTag && _grantTags.includes(_myTag));

    // !복권지급 전체 [수량] (DJ 또는 지정 고유닉)
    const cmdLottoGive = (act.cmdLottoGive || '!복권지급').toLowerCase();
    if (canGrant && first === cmdLottoGive && parts[1] === '전체') {
      this.handleActLottoGiveAll(parts[2]);
      return;
    }

    // !복권지급 [고유닉] [수량] (DJ 또는 지정 고유닉)
    if (canGrant && first === cmdLottoGive && parts[1] !== '전체') {
      this.handleActLottoGive(parts[1], parts[2]);
      return;
    }

    // !상점 [고유닉] [경험치] (DJ 또는 지정 고유닉)
    const cmdShop = (act.cmdShop || '!상점').toLowerCase();
    if (canGrant && first === cmdShop) {
      this.handleActShopExp(parts[1], parts[2]);
      return;
    }

    // !우선온 / !우선오프 (DJ/매니저 전용)
    const priorityOnCmd = (this.songSettings?.priorityOnCmd || '!우선온').toLowerCase();
    const priorityOffCmd = (this.songSettings?.priorityOffCmd || '!우선오프').toLowerCase();
    if (isManager) {
      if (first === priorityOnCmd) {
        this.songSettings.priority = true;
        this.sendSplitChat('✅ 신청곡 우선 추가(1번 추가) 기능이 활성화되었습니다.', '🎵신청곡');
        this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'priority', value: true }) });
        return;
      }
      if (first === priorityOffCmd) {
        this.songSettings.priority = false;
        this.sendSplitChat('❌ 신청곡 우선 추가(1번 추가) 기능이 비활성화되었습니다.', '🎵신청곡');
        this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'priority', value: false }) });
        return;
      }
    }

    // !이름온 / !이름오프 (DJ/매니저 전용) — 신청곡 목록에 신청자 닉네임 표시 여부
    const nameOnCmd = (this.songSettings?.nameOnCmd || '!이름온').toLowerCase();
    const nameOffCmd = (this.songSettings?.nameOffCmd || '!이름오프').toLowerCase();
    if (isManager) {
      if (first === nameOnCmd) {
        this.songSettings.showNicknames = true;
        this.sendSplitChat('✅ 신청곡 목록에 신청자 닉네임을 표시합니다.', '🎵신청곡');
        this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'showNicknames', value: true }) });
        return;
      }
      if (first === nameOffCmd) {
        this.songSettings.showNicknames = false;
        this.sendSplitChat('❌ 신청곡 목록에서 신청자 닉네임을 숨깁니다.', '🎵신청곡');
        this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'showNicknames', value: false }) });
        return;
      }
    }

    // 0.3 !킵 명령어 처리 (optKeep이 활성화된 룰렛의 유저 기록 조회)
    if (first === '!킵' || first === '킵') {
      this.handleKeepCommand(author, tag);
      return;
    }

    // 0.3.1 !킵사용 [번호] [수량] 명령어 처리
    if (first === '!킵사용') {
      this.handleKeepUseCommand(author, tag, parts.slice(1));
      return;
    }

    // 0.4.0 !룰렛지급N [고유닉] [수량] 명령어 처리 (DJ 전용)
    const rouletteGiveMatch = first.match(/^!룰렛지급(\d+)$/);
    if (rouletteGiveMatch) {
      if (!isDj) {
        this.sendSplitChat(`🎡 !룰렛지급 명령어는 DJ만 사용할 수 있습니다.`, '🎡룰렛');
        return;
      }
      const giveIdx = parseInt(rouletteGiveMatch[1]);
      const giveTarget = parts[1];
      const giveCount = parseInt(parts[2]) || 1;
      this.handleRouletteGive(giveIdx, giveTarget, giveCount);
      return;
    }

    // 0.4 !룰렛메뉴N-P 명령어 처리 (룰렛 목록 확인, P는 페이지 번호)
    const rouletteMenuMatch = first.match(/^!룰렛메뉴(\d+)(?:-(\d+))?$/);
    if (rouletteMenuMatch) {
      const rouletteIdx = parseInt(rouletteMenuMatch[1]);
      const pageNum = parseInt(rouletteMenuMatch[2]) || 1;
      this.handleRouletteMenuCommand(rouletteIdx, pageNum);
      return;
    }

    const rouletteMatch = first.match(/^!룰렛(\d+)$/);
    if (rouletteMatch) {
      const rouletteIdx = parseInt(rouletteMatch[1]);
      const useCount = parseInt(parts[1]) || 1;
      this.handleRouletteCommand(author, tag, rouletteIdx, useCount, isManager, streamName, isDj);
      return;
    }

    // 1. 일반 커맨드 처리
    for (const cmd of this.commands) {
      if (first !== cmd.trigger.toLowerCase()) continue;
      const ms = (cmd.cooldown || 10) * 1000;
      const last = this.cmdTimes[cmd.trigger] || 0;
      
      if (now - last < ms) return;
      
      this.cmdCounts[cmd.trigger] = (this.cmdCounts[cmd.trigger] || 0) + 1;
      this.cmdTimes[cmd.trigger] = now;
      
      const reply = this.resolveVars(cmd.response, author, this.cmdCounts[cmd.trigger], streamName);
      this.sendSplitChat(reply, '🤖봇');
      return;
    }

    // 2. 단축키 명령어 처리
    for (const hk of this.hotkeys) {
      if (first !== hk.trigger.toLowerCase()) continue;
      const perm = (hk.perm || 'all').toLowerCase();
      if (perm === 'dj' && !isDj) return;
      if (perm === 'manager' && !isManager) return;
      if (!isManager) {
        const now = Date.now();
        const lastTime = this.hkTimes[hk.trigger] || 0;
        const cooldown = (hk.cooldown || 0) * 1000;
        if (now - lastTime < cooldown) {
          const remain = Math.ceil((cooldown - (now - lastTime)) / 1000);
          this.sendSplitChat(`⏳ ${author}님, ${remain}초 후에 다시 사용할 수 있습니다.`, '⌨️단축');
          return;
        }
        this.hkTimes[hk.trigger] = now;
      }
      this.sendSplitChat(hk.response, '⌨️단축');
      return;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 낚시 게임 관련 함수들
  // ═══════════════════════════════════════════════════════════════════════

  _getFishingUserKey(author, tag) {
    return tag || author;
  }

  _initFishingUser(key) {
    if (!this.fishingData[key]) {
      this.fishingData[key] = {
        nickname: key,
        money: 0,
        lastFishingTime: 0,
        totalFishes: 0,
        totalMoney: 0
      };
    }
  }

  handleFishing(author, tag, isManager) {
    const key = this._getFishingUserKey(author, tag);
    this._initFishingUser(key);

    const now = Date.now();
    const cooldown = (this.fishingSettings?.cooldown || 30) * 1000; // 기본 30초
    const lastTime = this.fishingData[key].lastFishingTime || 0;

    if (now - lastTime < cooldown) {
      const remainSec = Math.ceil((cooldown - (now - lastTime)) / 1000);
      this.sendSplitChat(`🎣 ${author}님, ${remainSec}초 후에 다시 낚시할 수 있습니다.`, '🎣낚시');
      return;
    }

    let fishes = this.fishingSettings?.fishes || [];
    
    // [강제 복구 로직] 만약 물고기 목록이 비어있다면, 기본 40종 데이터를 강제로 주입합니다.
    if (!fishes || fishes.length === 0) {
      this.onLog({ type: 'debug', author: '낚시', text: '물고기 목록이 비어있어 기본 40종 데이터를 강제로 로드합니다.' });
      
      const defaultFishes = [
        { name: "피라미", probability: 15, money: 100 }, { name: "붕어", probability: 12, money: 200 },
        { name: "잉어", probability: 10, money: 500 }, { name: "메기", probability: 8, money: 800 },
        { name: "가물치", probability: 6, money: 1200 }, { name: "쏘가리", probability: 5, money: 2000 },
        { name: "은어", probability: 5, money: 1500 }, { name: "송어", probability: 4, money: 2500 },
        { name: "산천어", probability: 3, money: 3500 }, { name: "철갑상어", probability: 1, money: 15000 },
        { name: "고등어", probability: 10, money: 400 }, { name: "갈치", probability: 8, money: 900 },
        { name: "조기", probability: 8, money: 700 }, { name: "멸치", probability: 15, money: 50 },
        { name: "참치", probability: 2, money: 8000 }, { name: "연어", probability: 4, money: 3000 },
        { name: "광어", probability: 6, money: 1800 }, { name: "우럭", probability: 7, money: 1400 },
        { name: "도미", probability: 4, money: 4000 }, { name: "농어", probability: 5, money: 2200 },
        { name: "방어", probability: 3, money: 5000 }, { name: "민어", probability: 2, money: 7000 },
        { name: "대구", probability: 5, money: 2500 }, { name: "명태", probability: 7, money: 1200 },
        { name: "아귀", probability: 4, money: 3500 }, { name: "복어", probability: 3, money: 6000 },
        { name: "개불", probability: 8, money: 500 }, { name: "멍게", probability: 8, money: 600 },
        { name: "해삼", probability: 6, money: 1500 }, { name: "전복", probability: 3, money: 10000 },
        { name: "낙지", probability: 5, money: 2500 }, { name: "문어", probability: 3, money: 6500 },
        { name: "오징어", probability: 7, money: 1800 }, { name: "꼴뚜기", probability: 10, money: 300 },
        { name: "꽃게", probability: 5, money: 3000 }, { name: "대게", probability: 2, money: 12000 },
        { name: "킹크랩", probability: 1, money: 25000 }, { name: "랍스터", probability: 1, money: 20000 },
        { name: "황금잉어", probability: 0.5, money: 50000 }, { name: "전설의 고래", probability: 0.1, money: 200000 }
      ];
      
      if (!this.fishingSettings) this.fishingSettings = {};
      this.fishingSettings.fishes = defaultFishes;
      fishes = defaultFishes;
      
      this.onLog({ type: 'debug', author: '낚시', text: `기본 데이터 ${fishes.length}종 로드 완료.` });
    }

    // 확률에 따라 물고기 선택
    const random = Math.random() * 100;
    let cumulativeProb = 0;
    let selectedFish = fishes[0];

    for (const fish of fishes) {
      cumulativeProb += (fish.probability || 0);
      if (random <= cumulativeProb) {
        selectedFish = fish;
        break;
      }
    }

    // 물고기 가격 최소/최대 범위 랜덤 적용
    const minPrice = selectedFish.minMoney !== undefined ? selectedFish.minMoney : (selectedFish.money || 10);
    const maxPrice = selectedFish.maxMoney !== undefined ? selectedFish.maxMoney : (selectedFish.money || 100);
    
    // 최소값이 최대값보다 크면 스왑
    const actualMin = Math.min(minPrice, maxPrice);
    const actualMax = Math.max(minPrice, maxPrice);
    
    const reward = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin;

    this.fishingData[key].money += reward;
    this.fishingData[key].lastFishingTime = now;
    this.fishingData[key].totalFishes += 1;
    this.fishingData[key].totalMoney += reward;

    const msg = `🎣 ${author}님이 [${selectedFish.name}]를 잡았습니다! (+${reward}원)`;
    this.sendSplitChat(msg, '🎣낚시');
    this.onLog({ type: 'fishing', author: '낚시', text: JSON.stringify({ user: author, fish: selectedFish.name, money: reward, data: this.fishingData[key] }) });
  }

  handleDiceGame(author, tag, parts, isManager) {
    const key = this._getFishingUserKey(author, tag);
    this._initFishingUser(key);

    const amount = parseInt(parts[1]) || 0;
    if (amount <= 0) {
      this.sendSplitChat(`🎲 사용법: !도박 [금액]`, '🎲도박');
      return;
    }

    if (this.fishingData[key].money < amount) {
      this.sendSplitChat(`🎲 ${author}님, 잔액이 부족합니다. (보유: ${this.fishingData[key].money}원)`, '🎲도박');
      return;
    }

    this.fishingData[key].money -= amount;

    const userDice = Math.floor(Math.random() * 6) + 1;
    const botDice = Math.floor(Math.random() * 6) + 1;

    const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    let reward = 0;
    let result = '';

    if (userDice > botDice) {
      reward = amount * 2;
      this.fishingData[key].money += reward;
      result = `🎲 ${author}님 ${faces[userDice]} vs 봇 ${faces[botDice]} - 승리! +${reward}원`;
    } else if (userDice < botDice) {
      result = `🎲 ${author}님 ${faces[userDice]} vs 봇 ${faces[botDice]} - 패배... -${amount}원`;
    } else {
      this.fishingData[key].money += amount;
      result = `🎲 ${author}님 ${faces[userDice]} vs 봇 ${faces[botDice]} - 무승부! 환불됨`;
    }

    this.sendSplitChat(result, '🎲도박');
    this.onLog({ type: 'dice_game', author: '도박', text: JSON.stringify({ user: author, userDice, botDice, amount, reward, data: this.fishingData[key] }) });
  }

  handleOddEven(author, tag, parts, isOdd, isManager) {
    const key = this._getFishingUserKey(author, tag);
    this._initFishingUser(key);

    const amount = parseInt(parts[1]) || 0;
    if (amount <= 0) {
      const cmd = isOdd ? '!홀' : '!짝';
      this.sendSplitChat(`🎰 사용법: ${cmd} [금액]`, '🎰홀짝');
      return;
    }

    if (this.fishingData[key].money < amount) {
      this.sendSplitChat(`🎰 ${author}님, 잔액이 부족합니다. (보유: ${this.fishingData[key].money}원)`, '🎰홀짝');
      return;
    }

    this.fishingData[key].money -= amount;

    const randomNum = Math.floor(Math.random() * 100) + 1;
    const isEven = randomNum % 2 === 0;
    let reward = 0;
    let result = '';

    if ((isOdd && !isEven) || (!isOdd && isEven)) {
      reward = amount * 2;
      this.fishingData[key].money += reward;
      const choice = isOdd ? '홀' : '짝';
      result = `🎰 ${author}님이 선택한 [${choice}] - 결과: ${randomNum} (${isEven ? '짝' : '홀'}) 🎉 +${reward}원`;
    } else {
      const choice = isOdd ? '홀' : '짝';
      result = `🎰 ${author}님이 선택한 [${choice}] - 결과: ${randomNum} (${isEven ? '짝' : '홀'}) 아쉽네요...`;
    }

    this.sendSplitChat(result, '🎰홀짝');
    this.onLog({ type: 'odd_even', author: '홀짝', text: JSON.stringify({ user: author, choice: isOdd ? '홀' : '짝', number: randomNum, amount, reward }) });
  }

  handleWallet(author, tag) {
    const key = this._getFishingUserKey(author, tag);
    this._initFishingUser(key);

    const money = this.fishingData[key].money || 0;
    const totalFishes = this.fishingData[key].totalFishes || 0;
    const totalMoney = this.fishingData[key].totalMoney || 0;

    const msg = `💰 ${author}님의 지갑\n현재 잔액: ${money}원\n총 낚시: ${totalFishes}마리\n총 획득: ${totalMoney}원`;
    this.sendSplitChat(msg, '💰지갑');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 기존 함수들 (원본 유지)
  // ═══════════════════════════════════════════════════════════════════════

  // 지정 인사 및 자동 환영 메시지 처리
  handleJoin(nickname, tag, streamName) {
    const userKey = tag || nickname;
    this.onLog({ type: 'debug', author: '디버그', text: `handleJoin 호출: ${nickname} (태그: ${tag})` });
    
    // 재입장 시에도 메시지가 나오도록 중복 방지 로직 제거 (또는 완화)
    // if (this.enteredUsers.has(userKey)) {
    //   this.onLog({ type: 'debug', author: '디버그', text: `이미 입장 처리된 유저: ${userKey}` });
    //   return;
    // }
    this.enteredUsers.add(userKey);

    // 입장 횟수 증가
    this.userJoinCounts[userKey] = (this.userJoinCounts[userKey] || 0) + 1;
    const joinCount = this.userJoinCounts[userKey];

    // 1. 지정 인사 (우선순위 높음)
    const normTag = tag ? tag.replace(/@/g, '').trim().toLowerCase() : null;
    const normNick = nickname ? nickname.trim().toLowerCase() : null;
    
    let joinMatched = false;
    for (const jm of this.joinMsgs) {
      const savedTarget = jm.tag.replace(/@/g, '').trim().toLowerCase();
      if ((normTag && (normTag === savedTarget || normTag.includes(savedTarget))) || 
          (normNick && (normNick === savedTarget || normNick.includes(savedTarget)))) {
        const reply = this.resolveVars(jm.response, nickname, joinCount, streamName)
          .replace(/{count}/g, joinCount);
        setTimeout(() => this.sendSplitChat(reply, '👋인사'), 1500);
        joinMatched = true;
        break;
      }
    }

    // 2. 자동 환영 메시지 (지정 인사가 없을 때만 랜덤으로 하나 선택)
    if (!joinMatched && this.autoSettings && this.autoSettings.join && this.autoSettings.join.length > 0) {
      const validMsgs = this.autoSettings.join.filter(m => m.text && m.enabled !== false);
      if (validMsgs.length > 0) {
        const item = validMsgs[Math.floor(Math.random() * validMsgs.length)];
        const reply = item.text
          .replace(/{nickname}/g, nickname)
          .replace(/{count}/g, joinCount);
        setTimeout(() => this.sendSplitChat(reply, '✨환영'), (item.delay || 1) * 1000);
      }
    }
  }

  handleLike(nickname) {
    if (this.autoSettings.like && this.autoSettings.like.length > 0) {
      const validMsgs = this.autoSettings.like.filter(m => m.text && m.enabled !== false);
      if (validMsgs.length > 0) {
        const item = validMsgs[Math.floor(Math.random() * validMsgs.length)];
        const reply = item.text.replace(/{nickname}/g, nickname);
        setTimeout(() => this.sendSplitChat(reply, '❤️좋아요'), (item.delay || 0) * 1000);
      }
    }
  }

  handleGift(nickname, amount, sticker = '', comboCount = 1, tag = null) {
    const totalAmount = Number(amount || 0) * Math.max(1, Number(comboCount || 1));

    // 1. 자동 선물 감사 메시지
    if (this.autoSettings.gift && this.autoSettings.gift.length > 0) {
      const validMsgs = this.autoSettings.gift.filter(m => m.text && m.enabled !== false);
      if (validMsgs.length > 0) {
        const item = validMsgs[Math.floor(Math.random() * validMsgs.length)];
        // {amount}가 콤보를 포함한 총 개수를 나타내도록 totalAmount 사용
        const reply = item.text.replace(/{nickname}/g, nickname).replace(/{amount}/g, totalAmount);
        setTimeout(() => this.sendSplitChat(reply, '🎁선물'), (item.delay || 0) * 1000);
      }
    }

    if (Array.isArray(this.flags) && totalAmount > 0) {
      this.flags.forEach((flag, idx) => {
        if (!flag || flag.enabled === false || flag.mode !== 'auto') return;
        
        const current = Number(flag.current || 0);
        const goal = Number(flag.goal || 0);
        
        // 이미 달성했으면 무시
        if (goal > 0 && current >= goal) return;
        
        // 적립 (목표치를 넘지 않게 제한)
        const nextVal = current + totalAmount;
        flag.current = goal > 0 ? Math.min(goal, nextVal) : nextVal;
        
        this.notifyFlagUpdate(idx);

        // 선물 수신 시 자동 적립된 깃발 상태를 즉시 출력
        const statusMsg = this.buildFlagStatusMessage(idx, flag);
        if (statusMsg) {
          this.sendSplitChat(statusMsg, '🏁깃발');
        }
        
        // 방금 달성한 경우 추가 알림
        if (goal > 0 && flag.current >= goal && current < goal) {
          this.sendSplitChat(`🎉 축하합니다! '${flag.title}' 목표를 달성했습니다!`, '🏁깃발');
        }
      });
    }
    this.checkRoulette(nickname, amount, sticker, comboCount, tag);
  }

  checkRoulette(nickname, amount, sticker = '', comboCount = 1, tag = null) {
    if (!this.rouletteSettings || !Array.isArray(this.rouletteSettings)) return;

    this.rouletteSettings.forEach(r => {
      if (!r.enabled || !r.items || r.items.length === 0) return;

      let shouldRun = false;
      let runCount = 0;

      if (r.type === 'spoon') {
        const targetAmount = Number(r.amount);
        if (targetAmount > 0) {
          const payout = r.payout || 'combo';
          if (payout === 'normal') {
            // 일반: 정확히 X스푼 단발 선물일 때만 1회 (콤보 무시)
            if (amount === targetAmount && comboCount === 1) {
              shouldRun = true;
              runCount = 1;
            }
          } else if (payout === 'combo') {
            // 콤보: X스푼 X N개 선물 시 N회
            if (amount === targetAmount && comboCount > 0) {
              shouldRun = true;
              runCount = comboCount;
            }
          } else if (payout === 'dist') {
            // 배분: 총 금액(단발X콤보) 내에서 X스푼당 1회
            const totalAmount = amount * comboCount;
            if (totalAmount >= targetAmount) {
              shouldRun = true;
              runCount = Math.floor(totalAmount / targetAmount);
            }
          }
        }
      } else if (r.type === 'sticker') {
        const targetSticker = String(r.amount || '').trim().toLowerCase();
        const currentSticker = String(sticker || '').trim().toLowerCase();
        if (targetSticker && currentSticker && (currentSticker === targetSticker || currentSticker.includes(targetSticker))) {
          shouldRun = true;
          // 스티커도 콤보 횟수(comboCount)만큼 실행되도록 수정
          runCount = comboCount > 0 ? comboCount : 1;
        }
      }

      if (shouldRun && runCount > 0) {
        this.onLog({ type: 'debug', author: '룰렛', text: `룰렛 실행: ${r.name} (${runCount}회)` });
        this.runRouletteMulti(r, nickname, runCount, tag);
      }
    });
  }

  runRouletteMulti(roulette, nickname, count, tag = null) {
    const items = roulette.items;
    const totalProb = items.reduce((sum, item) => sum + parseFloat(item.prob || 0), 0);
    if (totalProb <= 0) return;

    const results = [];
    for (let i = 0; i < count; i++) {
      let random = Math.random() * totalProb;
      let selectedItem = null;
      for (const item of items) {
        if (random < parseFloat(item.prob || 0)) {
          selectedItem = item;
          break;
        }
        random -= parseFloat(item.prob || 0);
      }
      if (!selectedItem) selectedItem = items[items.length - 1];
      results.push(selectedItem);
    }

    // 결과 집계 (동일 항목 합산)
    const summary = {};
    results.forEach(item => {
      if (!summary[item.name]) summary[item.name] = { count: 0, noLog: !!item.noLog };
      summary[item.name].count += 1;
      // 로그 기록 (기록안함 제외)
      if (!item.noLog) {
        this.onLog({
          type: 'system',
          author: '룰렛결과',
          text: `${tag ? nickname+'('+tag+')' : nickname} - ${roulette.name}: ${item.name}`
        });
      }
    });

    // optKeep: 유저별 룰렛 기록 저장 (tag 기준)
    if (roulette.optKeep) {
      const keepKey = tag || nickname;
      if (!this.rouletteUserLogs[keepKey]) this.rouletteUserLogs[keepKey] = [];
      Object.entries(summary).forEach(([name, info]) => {
        const cnt = info.count;
        // 기록안함 체크된 항목은 킵목록에도 저장하지 않음
        if (info.noLog) return;
        this.rouletteUserLogs[keepKey].push({
          rouletteName: roulette.name,
          itemName: name,
          count: cnt,
          time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        });
        for (let i = 0; i < cnt; i++) {
          this.onLog({
            type: 'roulette_keep',
            author: nickname,
            text: JSON.stringify({ item: name, tag: keepKey })
          });
        }
      });
    }

    // 메시지 구성 및 자동 적립 처리
    let resultMsg = `[🎡${roulette.name}] ${nickname}님 당첨! 🎉`;
    Object.entries(summary).forEach(([name, info]) => {
      const cnt = info.count;
      resultMsg += `\n👉 ${name}${cnt > 1 ? `(${cnt})` : ''}`;

      // 1. 실드 자동 처리 (커스텀 명칭 대응)
      const shieldCmdName = (this.shieldOptions?.customCmd || '!실드').replace('!', '').trim();
      const shieldRegex = new RegExp(`${shieldCmdName}\\s*([+-]\\d+)`);
      const shieldMatch = name.match(shieldRegex);
      
      if (shieldMatch) {
        const amount = parseInt(shieldMatch[1]) * cnt;
        this.shieldCount += amount;
        this.onLog({ type: 'shield_update', author: shieldCmdName, text: String(this.shieldCount) });
        this.onLog({ type: 'debug', author: '자동처리', text: `룰렛 당첨으로 ${shieldCmdName} ${amount}개 자동 반영 (현재: ${this.shieldCount})` });
        
        const action = amount >= 0 ? '적립' : '차감';
        this.sendSplitChat(`[자동] ${shieldCmdName} ${Math.abs(amount)}개가 ${action}되었습니다. (현재: ${this.shieldCount}개)`, '🛡️실드');
      }

      // 2. 복권 자동 처리 (복권 숫자장)
      const lottoMatch = name.match(/복권\s*(\d+)장/);
      if (lottoMatch) {
        const amount = parseInt(lottoMatch[1]) * cnt;
        const key = tag || nickname;
        // 애청지수 데이터가 있는 경우에만 지급
        const actKey = this._findActKey(nickname, tag);
        if (actKey && this.actData[actKey]) {
          this.actData[actKey].lotto = (this.actData[actKey].lotto || 0) + amount;
          this._actSave();
          this.onLog({ type: 'debug', author: '자동처리', text: `룰렛 당첨으로 @${actKey}님에게 복권 ${amount}장 자동 지급` });
          
          const nick = this.actData[actKey].nickname || nickname;
          this.sendSplitChat(`[자동] ${nick}님에게 복권 ${amount}장이 지급되었습니다. (현재: ${this.actData[actKey].lotto}장)`, '⭐복권');
        }
      }
    });

    this.sendSplitChat(resultMsg, '🎡룰렛');
  }

  handleDice(author, isManager = false) {
    if (!isManager) return; // DJ/매니저만 가능
    const result = Math.floor(Math.random() * 6) + 1;
    const faces = ['', '⚀','⚁','⚂','⚃','⚄','⚅'];
    const msg = (this.miscSettings?.diceMsg || '🎲 {user}님의 주사위: {result}!')
      .replace(/{user}/g, author)
      .replace(/{result}/g, `${faces[result]} ${result}`);
    this.sendSplitChat(msg, '🎲주사위');
  }

  handleTimer(author, parts, isManager = false) {
    // 목록 조회
    if (parts.length === 1) {
      if (this.activeTimers.length === 0) {
        this.sendSplitChat('⏱️ 등록된 타이머가 없습니다.', '⏱️타이머');
        return;
      }
      const now = Date.now();
      const list = this.activeTimers.map((t, i) => {
        const remain = Math.max(0, Math.ceil((t.endsAt - now) / 60000));
        return `${i + 1}. ${t.content} — ${remain}분 후`;
      }).join('\n');
      this.sendSplitChat('⏱️ 타이머 목록\n' + list, '⏱️타이머');
      return;
    }
    // 등록: [cmd] [분] [내용] — 매니저/DJ만 가능
    if (!isManager) {
      this.sendSplitChat('⏱️ 타이머 등록은 DJ/매니저만 가능합니다.', '⏱️타이머');
      return;
    }
    const min = parseInt(parts[1]);
    if (isNaN(min) || min <= 0) {
      this.sendSplitChat('⏱️ 사용법: [명령어] [분] [내용]', '⏱️타이머');
      return;
    }
    const content = parts.slice(2).join(' ') || '타이머';
    const endsAt = Date.now() + min * 60 * 1000;
    const timerIdx = this.activeTimers.length;
    const timeout = setTimeout(() => {
      const alertMsg = (this.miscSettings?.timerAlertMsg || '🔔 {content} 시간이 됐습니다!')
        .replace(/{content}/g, content).replace(/{min}/g, min);
      this.sendSplitChat(alertMsg, '⏱️타이머');
      const idx = this.activeTimers.findIndex(t => t.endsAt === endsAt && t.content === content);
      if (idx !== -1) this.activeTimers.splice(idx, 1);
      this.onLog({ type: 'timer_alert', author: '타이머', text: String(idx) });
    }, min * 60 * 1000);
    this.activeTimers.push({ content, endsAt, timeout });
    const setMsg = (this.miscSettings?.timerSetMsg || '⏱️ {min}분 후 알림: {content}')
      .replace(/{min}/g, min).replace(/{content}/g, content);
    this.sendSplitChat(setMsg, '⏱️타이머');
    // UI 목록 동기화
    this.onLog({ type: 'timer_update', author: '타이머', text: JSON.stringify(
      this.activeTimers.map(t => ({ content: t.content, endsAt: t.endsAt }))
    )});
  }

  handleDday(author, parts, isManager = false) {
    const ms = this.miscSettings || {};
    if (!ms.ddays) ms.ddays = [];
    // 목록 조회
    if (parts.length === 1) {
      if (ms.ddays.length === 0) {
        this.sendSplitChat('📅 등록된 디데이가 없습니다.', '📅디데이');
        return;
      }
      const today = new Date(); today.setHours(0,0,0,0);
      const list = ms.ddays.map((d, i) => {
        const target = new Date(d.date); target.setHours(0,0,0,0);
        const diff = Math.round((target - today) / 86400000);
        const label = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-Day!' : `D+${Math.abs(diff)}`;
        return `${i + 1}. ${d.content} (${d.date}) ${label}`;
      }).join('\n');
      this.sendSplitChat('📅 디데이 목록\n' + list, '📅디데이');
      return;
    }
    // 등록: [cmd] [MM-DD] [내용] — 매니저/DJ만 가능
    if (!isManager) {
      this.sendSplitChat('📅 디데이 등록은 DJ/매니저만 가능합니다.', '📅디데이');
      return;
    }
    const datePart = parts[1];
    if (!/^\d{2}-\d{2}$/.test(datePart)) {
      this.sendSplitChat('📅 사용법: [명령어] [MM-DD] [내용]', '📅디데이');
      return;
    }
    // 연도 자동 결정: 올해 해당 날짜가 이미 지났으면 내년으로
    const now = new Date();
    const thisYear = now.getFullYear();
    let date = `${thisYear}-${datePart}`;
    const targetThisYear = new Date(date); targetThisYear.setHours(0,0,0,0);
  }

  // 메모장 기능
  handleMemo(author, parts) {
    if (parts.length === 1) {
      if (!this.miscSettings.memos || this.miscSettings.memos.length === 0) {
        this.sendSplitChat('📝 현재 등록된 메모가 없습니다.', '📝메모');
        return;
      }
      let msg = '📝 현재 등록된 메모 목록 📝\n';
      this.miscSettings.memos.forEach((m, i) => {
        msg += `${i+1}. ${m}\n`;
      });
      this.sendSplitChat(msg.trim(), '📝메모');
      return;
    }

    const content = parts.slice(1).join(' ');
    if (!content) return;

    if (!this.miscSettings.memos) this.miscSettings.memos = [];
    this.miscSettings.memos.push(content);
    this.sendSplitChat(`✅ 메모 '${content}'가 추가되었습니다.`, '📝메모');
    this.onLog({ type: 'memo_update', author: '시스템', text: JSON.stringify(this.miscSettings.memos) });
  }

  handleMemoDelete(author, parts) {
    if (parts.length < 2) {
      this.sendSplitChat('⚠️ 사용법: !메모제거 [번호]', '📝메모');
      return;
    }
    const idx = parseInt(parts[1]) - 1;
    if (isNaN(idx) || !this.miscSettings.memos || !this.miscSettings.memos[idx]) {
      this.sendSplitChat('⚠️ 올바른 메모 번호를 입력해주세요.', '📝메모');
      return;
    }
    const removed = this.miscSettings.memos.splice(idx, 1);
    this.sendSplitChat(`🗑️ 메모 '${removed[0]}'가 삭제되었습니다.`, '📝메모');
    this.onLog({ type: 'memo_update', author: '시스템', text: JSON.stringify(this.miscSettings.memos) });
  }

  handleMemoReset(author) {
    this.miscSettings.memos = [];
    this.sendSplitChat('🧹 모든 메모가 초기화되었습니다.', '📝메모');
    this.onLog({ type: 'memo_update', author: '시스템', text: JSON.stringify(this.miscSettings.memos) });
    const today = new Date(); today.setHours(0,0,0,0);
    if (targetThisYear < today) date = `${thisYear + 1}-${datePart}`;
    const content = parts.slice(2).join(' ') || '디데이';
    ms.ddays.push({ date, content });
    this.miscSettings = ms;
    const setMsg = (ms.ddaySetMsg || '📅 디데이 등록: {content} ({date})')
      .replace(/{content}/g, content).replace(/{date}/g, date);
    this.sendSplitChat(setMsg, '📅디데이');
    // UI 동기화
    this.onLog({ type: 'dday_update', author: '디데이', text: JSON.stringify(ms.ddays) });
  }

  handleKeepCommand(author, tag) {
    const keepKey = tag || author;
    this.onKeepQuery({ keepKey, author });
  }

  handleKeepUseCommand(author, tag, args) {
    if (args.length < 1) {
      this.sendSplitChat(`📋 사용법: !킵사용 [번호] [수량]\n(예: !킵사용 1 1)`, '🎡킵');
      return;
    }
    const keepKey = tag || author;
    const index = parseInt(args[0]);
    const count = parseInt(args[1]) || 1;

    if (isNaN(index) || index <= 0) {
      this.sendSplitChat(`📋 올바른 번호를 입력해주세요.`, '🎡킵');
      return;
    }
    if (isNaN(count) || count <= 0) {
      this.sendSplitChat(`📋 올바른 수량을 입력해주세요.`, '🎡킵');
      return;
    }

    this.onKeepUse({ keepKey, author, index, count });
  }

  handleKeepReply(author, msg) {
    this.sendSplitChat(msg, '🎡킵');
  }

  // !룰렛N [수량] 명령어 처리
  handleRouletteMenuCommand(rouletteIdx, pageNum = 1) {
    if (!this.rouletteSettings || !Array.isArray(this.rouletteSettings)) {
      this.sendSplitChat(`🎡 등록된 룰렛이 없습니다.`, '🎡룰렛');
      return;
    }
    const arrayIdx = rouletteIdx - 1;
    if (arrayIdx < 0 || arrayIdx >= this.rouletteSettings.length) {
      this.sendSplitChat(`🎡 룰렛${rouletteIdx}은 등록되어 있지 않습니다.`, '🎡룰렛');
      return;
    }

    const roulette = this.rouletteSettings[arrayIdx];
    if (!roulette.items || roulette.items.length === 0) {
      this.sendSplitChat(`🎡 ${roulette.name} 룰렛에 등록된 항목이 없습니다.`, '🎡룰렛');
      return;
    }

    const itemsPerPage = 20;
    const totalItems = roulette.items.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    // 페이지 번호 유효성 체크
    if (pageNum < 1) pageNum = 1;
    if (pageNum > totalPages) pageNum = totalPages;

    const startIdx = (pageNum - 1) * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, totalItems);
    const pageItems = roulette.items.slice(startIdx, endIdx);

    const itemList = pageItems.map((item, i) => `${startIdx + i + 1}. ${item.name}`).join('\n');
    const msg = `🎡 [${roulette.name}] 항목 (${pageNum}/${totalPages}p)\n${itemList}\n\n💡 !룰렛메뉴${rouletteIdx}-번호 로 다른 페이지 확인 가능`;
    this.sendSplitChat(msg, '🎡룰렛');
  }

  handleRouletteCommand(author, tag, rouletteIdx, useCount, isManager, streamName, isDj = false) {
    // 룰렛 인덱스 유효성 체크 (1부터 시작)
    if (!this.rouletteSettings || !Array.isArray(this.rouletteSettings)) {
      this.sendSplitChat(`🎡 등록된 룰렛이 없습니다.`, '🎡룰렛');
      return;
    }
    const arrayIdx = rouletteIdx - 1;
    if (arrayIdx < 0 || arrayIdx >= this.rouletteSettings.length) {
      this.sendSplitChat(`🎡 룰렛${rouletteIdx}은 등록되어 있지 않습니다.`, '🎡룰렛');
      return;
    }

    const roulette = this.rouletteSettings[arrayIdx];
    if (!roulette.enabled) {
      this.sendSplitChat(`🎡 ${roulette.name} 룰렛은 현재 비활성화 상태입니다.`, '🎡룰렛');
      return;
    }
    if (!roulette.items || roulette.items.length === 0) {
      this.sendSplitChat(`🎡 ${roulette.name} 룰렛에 등록된 항목이 없습니다.`, '🎡룰렛');
      return;
    }

    // 수량 유효성
    if (isNaN(useCount) || useCount <= 0) {
      this.sendSplitChat(`🎡 사용법: !룰렛${rouletteIdx} [수량]`, '🎡룰렛');
      return;
    }
    if (useCount > 50) {
      this.sendSplitChat(`🎡 한 번에 최대 50회까지만 실행할 수 있습니다.`, '🎡룰렛');
      return;
    }

    // DJ는 룰렛권 없이 바로 실행 (매니저는 룰렛권 필요)
    if (isDj) {
      this.onLog({ type: 'debug', author: '룰렛', text: `DJ 직접 실행: ${roulette.name} x ${useCount}` });
      this.runRouletteMulti(roulette, author, useCount, tag);
      return;
    }

    // 일반 시청자: 룰렛권 보유량 확인 후 차감 (파일 I/O는 app.js에서 처리)
    const keepKey = tag || author;
    this.onCouponCheck({
      keepKey,
      author,
      rouletteIdx,
      useCount,
      rouletteName: roulette.name
    });
  }

  // app.js에서 룰렛권 확인/차감 후 결과 전달
  handleCouponReply(author, tag, rouletteIdx, useCount, success, remaining, rouletteName) {
    if (!success) {
      const have = Number(remaining || 0);
      this.sendSplitChat(`🎡 ${author}님, 룰렛${rouletteIdx}(${rouletteName || ''}) 권이 부족합니다.\n(요청:${useCount}개 / 보유:${have}개)`, '🎡룰렛');
      return;
    }

    // 차감 성공 → 룰렛 실행
    const arrayIdx = rouletteIdx - 1;
    const roulette = this.rouletteSettings && this.rouletteSettings[arrayIdx];
    if (!roulette) {
      this.sendSplitChat(`🎡 룰렛${rouletteIdx}을 찾을 수 없습니다.`, '🎡룰렛');
      return;
    }

    this.sendSplitChat(`🎡 ${author}님이 룰렛${rouletteIdx} 권 ${useCount}개를 사용했습니다! (잔여: ${remaining}개)`, '🎡룰렛');
    this.runRouletteMulti(roulette, author, useCount, tag);
  }

  // !룰렛지급N [고유닉] [수량] - DJ 전용 룰렛권 지급
  handleRouletteGive(rouletteIdx, targetTag, count) {
    // 룰렛 인덱스 유효성 체크
    if (!this.rouletteSettings || !Array.isArray(this.rouletteSettings)) {
      this.sendSplitChat(`🎡 등록된 룰렛이 없습니다.`, '🎡룰렛');
      return;
    }
    const arrayIdx = rouletteIdx - 1;
    if (arrayIdx < 0 || arrayIdx >= this.rouletteSettings.length) {
      this.sendSplitChat(`🎡 룰렛${rouletteIdx}은 등록되어 있지 않습니다.`, '🎡룰렛');
      return;
    }

    // 대상 고유닉 유효성 체크
    if (!targetTag) {
      this.sendSplitChat(`🎡 사용법: !룰렛지급${rouletteIdx} [고유닉] [수량]`, '🎡룰렛');
      return;
    }

    // 수량 유효성 체크
    if (isNaN(count) || count <= 0) {
      this.sendSplitChat(`🎡 올바른 수량을 입력해주세요.`, '🎡룰렛');
      return;
    }

    const rouletteName = this.rouletteSettings[arrayIdx].name || `룰렛${rouletteIdx}`;

    // app.js의 onRouletteGive 콜백을 통해 파일에 룰렛권 적립
    this.onRouletteGive({ rouletteIdx, rouletteName, targetTag, count });
  }

  // app.js에서 룰렛권 지급 완료 후 결과 전달
  handleRouletteGiveReply(rouletteIdx, rouletteName, targetTag, count, success, newTotal, errorMsg) {
    if (!success) {
      this.sendSplitChat(`🎡 룰렛권 지급 실패: ${errorMsg || '알 수 없는 오류'}`, '🎡룰렛');
      return;
    }
    this.sendSplitChat(
      `🎁 [${rouletteName}] 룰렛${rouletteIdx}권 ${count}개를 @${targetTag}님에게 지급했습니다!\n(현재 보유: ${newTotal}개)`,
      '🎡룰렛'
    );
  }

  handleShieldCommand(parts, isManager) {
    const cmd = parts[0].toLowerCase();
    
    // !마실 명령어는 무조건 매니저 전용으로 동작
    if (cmd === '!마실' && !isManager) return;

    // !실드 (조회) - 인자가 하나일 때
    if (parts.length === 1) {
      let msg = this.shieldOptions?.format || "🛡️ 현재 보유 중인 실드는 {실드}개 입니다!";
      msg = msg.replace(/{실드}/g, this.shieldCount.toLocaleString('ko-KR'));
      this.sendSplitChat(msg, '🛡️실드');
      return;
    }

    // !실드 [수량] 또는 !마실 [수량] (적립/차감 - DJ/매니저 전용)
    if (parts.length >= 2) {
      if (!isManager) {
        // 일반 유저가 숫자를 붙여서 사용하면 조회만 시켜주거나 무시
        let msg = this.shieldOptions?.format || "🛡️ 현재 보유 중인 실드는 {실드}개 입니다!";
        msg = msg.replace(/{실드}/g, this.shieldCount.toLocaleString('ko-KR'));
        this.sendSplitChat(msg, '🛡️실드');
        return;
      }

      // 인자에서 숫자만 추출 (기호 포함)
      const inputStr = parts[1];
      let amt = 0;
      if (inputStr.startsWith('+')) {
        amt = parseInt(inputStr.substring(1));
      } else if (inputStr.startsWith('-')) {
        amt = -parseInt(inputStr.substring(1));
      } else {
        // !마실 명령어는 기호 없는 숫자 입력 시 차감으로 처리
        // !실드 명령어는 기호 없는 숫자 입력 시 적립으로 처리
        const rawAmt = parseInt(inputStr);
        if (cmd === '!마실') {
          amt = -rawAmt; // !마실 50 → -50 (차감)
        } else {
          amt = rawAmt; // !실드 50 → +50 (적립)
        }
      }

      if (isNaN(amt)) {
        const usageCmd = cmd;
        this.sendSplitChat(`사용법: ${usageCmd} [수량] (예: ${usageCmd} 10 또는 ${usageCmd} -5)`, '🛡️실드');
        return;
      }

      this.shieldCount += amt;
      
      const action = amt >= 0 ? `✅ ${amt}개 적립` : `🔻 ${Math.abs(amt)}개 차감`;
      this.sendSplitChat(`${action} 완료!\n현재 보유 실드: ${this.shieldCount.toLocaleString('ko-KR')}개`, '🛡️실드');
      
      // UI 갱신을 위해 로그 발생
      this.onLog({ type: 'shield_update', author: '실드', text: this.shieldCount.toString() });
    }
  }

  buildFlagStatusMessage(index, flag) {
    if (!flag) return '';
    const current = Number(flag.current || 0);
    const goal = Number(flag.goal || 0);
    const percent = goal > 0 ? Math.min(100, Math.floor((current / goal) * 100)) : 0;
    let template = String(flag.outputFormat || '=== {title} ====\n{current}/{goal} {percent}%');
    return template
      .replace(/{index}/g, String(index + 1))
      .replace(/{title}/g, String(flag.title || `깃발${index + 1}`))
      .replace(/{current}/g, current.toLocaleString('ko-KR'))
      .replace(/{goal}/g, goal.toLocaleString('ko-KR'))
      .replace(/{percent}/g, String(percent))
      .replace(/\\n/g, '\n')
      .trim();
  }

  notifyFlagUpdate(index) {
    const flag = this.flags[index];
    if (!flag) return;
    this.onLog({
      type: 'flag_update',
      author: '깃발',
      text: JSON.stringify({ index, current: Number(flag.current || 0) })
    });
  }

  handleFlagCommand(parts, isManager) {
    if (!this.flags || this.flags.length === 0) {
      this.sendSplitChat('현재 등록된 깃발이 없습니다.', '🏁깃발');
      return;
    }

    if (parts.length === 1) {
      const allMsg = this.flags.map((flag, idx) => this.buildFlagStatusMessage(idx, flag)).filter(Boolean).join('\n\n');
      if (allMsg) this.sendSplitChat(allMsg, '🏁깃발');
      return;
    }

    const maybeIndex = parseInt(parts[1]) - 1;
    if (!isNaN(maybeIndex) && this.flags[maybeIndex]) {
      if (parts.length === 2) {
        const msg = this.buildFlagStatusMessage(maybeIndex, this.flags[maybeIndex]);
        if (msg) this.sendSplitChat(msg, '🏁깃발');
        return;
      }

      if (!isManager) {
        const msg = this.buildFlagStatusMessage(maybeIndex, this.flags[maybeIndex]);
        if (msg) this.sendSplitChat(msg, '🏁깃발');
        return;
      }

      const amt = parseInt(parts[2]);
      if (isNaN(amt)) {
        this.sendSplitChat('사용법: !깃발 또는 !깃발 [번호] [숫자]', '🏁깃발');
        return;
      }

      const flag = this.flags[maybeIndex];
      const current = Number(flag.current || 0);
      const goal = Number(flag.goal || 0);
      
      // 적립 시 목표치 초과 방지 (차감은 0까지)
      let nextVal = current + amt;
      if (amt > 0 && goal > 0) nextVal = Math.min(goal, nextVal);
      if (amt < 0) nextVal = Math.max(0, nextVal);
      
      flag.current = nextVal;
      
      const action = amt >= 0 ? `${amt.toLocaleString('ko-KR')} 적립` : `${Math.abs(amt).toLocaleString('ko-KR')} 차감`;
      const percent = goal > 0 ? Math.min(100, Math.floor((Number(flag.current || 0) / goal) * 100)) : 0;
      
      let statusMsg = `🏁 ${flag.title} ${action} 완료!\n현재: ${Number(flag.current || 0).toLocaleString('ko-KR')} / ${Number(flag.goal || 0).toLocaleString('ko-KR')} (${percent}%)`;
      if (goal > 0 && flag.current >= goal) statusMsg += '\n✨ 목표 달성! ✨';
      
      this.sendSplitChat(statusMsg, '🏁깃발');
      this.notifyFlagUpdate(maybeIndex);
      return;
    }

    const msg = this.flags.map((flag, idx) => this.buildFlagStatusMessage(idx, flag)).filter(Boolean).join('\n\n');
    if (msg) this.sendSplitChat(msg, '🏁깃발');
  }

  handleFundingCommand(parts, isManager) {
    const options = this.fundingOptions || { 
      showPercent: true, 
      showDday: true, 
      customCmd: "!펀딩",
      customHeader: "🪙 진행중인 {month}월 펀딩 🪙",
      customFormat: "{index}. {title}\\n💰{current}/{goal} [{percent} {dday}]" 
    };

    // !펀딩 (목록 조회)
    if (parts.length === 1 || (parts.length === 2 && !isNaN(parseInt(parts[1])))) {
      if (!this.fundings || this.fundings.length === 0) {
        this.sendSplitChat('현재 진행 중인 펀딩이 없습니다.', '💰펀딩');
        return;
      }

      const itemsPerPage = 20;
      const totalItems = this.fundings.length;
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      let pageNum = parts.length === 2 ? parseInt(parts[1]) : 1;

      if (pageNum < 1) pageNum = 1;
      if (pageNum > totalPages) pageNum = totalPages;

      const startIdx = (pageNum - 1) * itemsPerPage;
      const endIdx = Math.min(startIdx + itemsPerPage, totalItems);
      const pageItems = this.fundings.slice(startIdx, endIdx);

      const now = new Date();
      const month = now.getMonth() + 1;
      const today = new Date().setHours(0,0,0,0);
      
      // 커스텀 헤더 적용 (페이지 정보 추가)
      let header = (options.customHeader || "🪙 진행중인 {month}월 펀딩 🪙")
        .replace(/{month}/g, month)
        .replace(/\\n/g, "\n");
      
      let msg = `${header} (${pageNum}/${totalPages}p)\n`;

      pageItems.forEach((f, i) => {
        const globalIdx = startIdx + i;
        const percent = Math.min(100, Math.floor((f.current / f.goal) * 100)) || 0;
        
        let ddayText = 'D-Day';
        if (f.endDate) {
          const diff = new Date(f.endDate) - today;
          const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
          ddayText = days === 0 ? 'D-Day' : (days > 0 ? `D-${days}` : `종료`);
        }

        // 커스텀 포맷 적용
        let format = options.customFormat || "{index}. {title}\\n💰{current}/{goal} [{percent} {dday}]";
        let itemMsg = format
          .replace(/{index}/g, globalIdx + 1)
          .replace(/{title}/g, f.title)
          .replace(/{current}/g, f.current.toLocaleString())
          .replace(/{goal}/g, f.goal.toLocaleString())
          .replace(/{percent}/g, options.showPercent ? `${percent}%` : "")
          .replace(/{dday}/g, options.showDday ? ddayText : "")
          .replace(/\\n/g, "\n");

        msg += itemMsg + "\n";
      });

      if (totalPages > 1) {
        msg += `\n💡 !펀딩 [페이지번호] 로 다른 페이지 확인 가능`;
      }

      this.sendSplitChat(msg.trim(), '💰펀딩');
      return;
    }

    // !펀딩 [번호] [금액] (적립/차감 - DJ/매니저 전용)
    if (parts.length >= 3) {
      // isManager가 falsy이면 권한 없음 (null, undefined, false, 0 모두 차단)
      if (!isManager) {
        this.onLog({ type: 'debug', author: '디버그', text: `권한 없음: isManager=${isManager}` });
        return;
      }

      const idx = parseInt(parts[1]) - 1;
      const amt = parseInt(parts[2]);

      if (isNaN(idx) || isNaN(amt) || !this.fundings[idx]) {
        this.onLog({ type: 'debug', author: '디버그', text: `파싱 실패 또는 펀딩 없음: idx=${idx}, amt=${amt}` });
        this.sendSplitChat('사용법: !펀딩 [번호] [숫자] (음수 입력 시 차감)', '💰펀딩');
        return;
      }

      this.fundings[idx].current += amt;
      const f = this.fundings[idx];
      const percent = Math.min(100, Math.floor((f.current / f.goal) * 100)) || 0;
      
      // 적립/차감 여부에 따라 메시지 분기
      const action = amt >= 0 ? `${amt.toLocaleString()} 적립` : `${Math.abs(amt).toLocaleString()} 차감`;
      const icon = amt >= 0 ? '✅' : '🔻';
      this.sendSplitChat(`${icon} ${f.title} ${action} 완료!\n현재: ${f.current.toLocaleString()} / ${f.goal.toLocaleString()} (${percent}%)`, '💰펀딩');
      
      // UI 갱신을 위해 메인 프로세스로 알림 (IPC를 통해 bot.html로 전달)
      this.onLog({ 
        type: 'funding_update', 
        author: '펀딩', 
        text: JSON.stringify({ index: idx, current: f.current }) 
      });
    }
  }

  handleLeave(nickname, tag) {
    const userKey = tag || nickname;
    if (this.enteredUsers.has(userKey)) {
      this.enteredUsers.delete(userKey);
    }
  }

  // 재생 중인 곡 정보를 외부(bot.html → app.js)가 업데이트
  updateCurrentPlaying(info) {
    if (!info) {
      this.currentPlaying = null;
      return;
    }
    this.currentPlaying = {
      artist: info.artist || '',
      title: info.title || '',
      videoId: info.videoId || '',
      videoTitle: info.videoTitle || '',
      channelTitle: info.channelTitle || '',
      startedAt: info.startedAt || Date.now(),
    };
  }

  // !현재곡 명령어: 현재 재생 중인 곡 이름을 채팅으로 출력
  handleNowPlayingCommand() {
    const cur = this.currentPlaying;
    if (!cur || (!cur.artist && !cur.title && !cur.videoTitle)) {
      this.sendSplitChat('🎵 현재 재생 중인 곡이 없습니다.', '🎵현재곡');
      return;
    }
    // 기본은 "아티스트 - 제목" 형식, 없으면 YouTube 영상 제목 사용
    let label;
    if (cur.artist && cur.title) {
      label = `${cur.artist} - ${cur.title}`;
    } else if (cur.videoTitle) {
      label = cur.videoTitle;
    } else {
      label = '알 수 없는 곡';
    }
    this.sendSplitChat(`🎵 현재 재생 중: ${label}`, '🎵현재곡');
  }

  handleSongCommand(parts, isManager, author) {
    const cmd = parts[0].toLowerCase();
    const songCmd = (this.songSettings?.customCmd || '!신청곡').toLowerCase();
    const songDelCmd = (this.songSettings?.delCmd || '!제거').toLowerCase();
    const songStopCmd = (this.songSettings?.stopCmd || '!마감').toLowerCase();
    const songStartCmd = (this.songSettings?.startCmd || '!접수').toLowerCase();
    const songResetCmd = (this.songSettings?.resetCmd || '리셋').toLowerCase();
    const isResetCmd = songResetCmd.startsWith('!') ? cmd === songResetCmd : cmd === '!' + songResetCmd;

    // 0. !리셋 (단독 명령어 처리, 매니저 전용)
    if (isResetCmd) {
      if (!isManager) return;
      this.songList = [];
      this.sendSplitChat('✅ 신청곡 목록이 초기화되었습니다.', '🎵신청곡');
      this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'clear' }) });
      return;
    }

    // 1. !마감 (매니저 전용)
    if (cmd === songStopCmd) {
      if (!isManager) return;
      this.songSettings.enabled = false;
      this.sendSplitChat('🚫 신청곡 접수가 마감되었습니다.', '🎵신청곡');
      this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'status', enabled: false }) });
      return;
    }

    // 2. !접수 (매니저 전용)
    if (cmd === songStartCmd) {
      if (!isManager) return;
      this.songSettings.enabled = true;
      this.sendSplitChat('🟢 신청곡 접수가 시작되었습니다.', '🎵신청곡');
      this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'status', enabled: true }) });
      return;
    }

    // 3. !제거 [번호...] (매니저 전용)
    if (cmd === songDelCmd) {
      if (!isManager) return;
      if (parts.length < 2) {
        this.sendSplitChat(`사용법: ${songDelCmd} [번호1] [번호2] ...`, '🎵신청곡');
        return;
      }

      const indices = parts.slice(1)
        .map(p => parseInt(p) - 1)
        .filter(idx => !isNaN(idx) && idx >= 0 && idx < this.songList.length);

      if (indices.length === 0) return;

      const uniqueIndices = [...new Set(indices)].sort((a, b) => b - a);
      uniqueIndices.forEach(idx => {
        this.songList.splice(idx, 1);
      });

      this.sendSplitChat(`✅ 신청곡 ${uniqueIndices.length}개를 제거했습니다.`, '🎵신청곡');
      this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'remove', indices: uniqueIndices }) });
      return;
    }

    // 4. !신청곡 관련
    if (cmd === songCmd) {
      // 4.1 !신청곡 단독 입력 시 리스트 출력
      if (parts.length === 1) {
        if (this.songList.length === 0) {
          this.sendSplitChat('현재 대기 중인 신청곡이 없습니다.', '🎵신청곡');
          return;
        }
        let msg = (this.songSettings?.listHeader || '🎵 현재 신청곡 목록 🎵') + '\n';
        const format = this.songSettings?.listFormat || '{index}. {artist} - {title}';
        const showNick = !!this.songSettings?.showNicknames;
        this.songList.forEach((s, i) => {
          let line = format
            .replace(/{index}/g, i + 1)
            .replace(/{artist}/g, s.artist)
            .replace(/{title}/g, s.title);
          // 신청자 닉네임 표시 옵션 ON 이면 괄호로 덧붙임
          if (showNick && s.user) {
            // s.user 가 "닉네임(고유닉)" 형식일 수 있으므로 닉네임만 추출
            const nickOnly = String(s.user).replace(/\(.*?\)\s*$/, '').trim() || s.user;
            line += ` (${nickOnly})`;
          }
          msg += line + '\n';
        });
        this.sendSplitChat(msg.trim(), '🎵신청곡');
        return;
      }

      const sub = parts[1]?.toLowerCase();

      // 4.2 리셋 (서브 명령어 처리, 매니저 전용)
      if (sub === songResetCmd.replace('!', '')) {
        if (!isManager) return;
        this.songList = [];
        this.sendSplitChat('✅ 신청곡 목록이 초기화되었습니다.', '🎵신청곡');
        this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: 'clear' }) });
        return;
      }

      // 4.3 곡 신청
      if (!this.songSettings.enabled) {
        this.sendSplitChat('🚫 현재는 신청곡을 받지 않는 시간입니다.', '🎵신청곡');
        return;
      }

      let artist = parts[1];
      let title = parts.slice(2).join(' ');
      if (!title) {
        title = artist;
        artist = '알수없음';
      }

      const newSong = { artist, title, user: author };
      const regFormat = this.songSettings?.regFormat || '✅ [{artist} - {title}] 신청 완료! (대기: {count}번)';
      
      if (this.songSettings.priority) {
        this.songList.unshift(newSong);
        let res = regFormat
          .replace(/{artist}/g, artist)
          .replace(/{title}/g, title)
          .replace(/{count}/g, '1');
        this.sendSplitChat(res + ' (우선순위 추가)', '🎵신청곡');
      } else {
        this.songList.push(newSong);
        let res = regFormat
          .replace(/{artist}/g, artist)
          .replace(/{title}/g, title)
          .replace(/{count}/g, this.songList.length);
        this.sendSplitChat(res, '🎵신청곡');
      }
      
      this.onLog({ type: 'song_update', author: '시스템', text: JSON.stringify({ action: this.songSettings.priority ? 'unshift' : 'add', song: newSong }) });
    }
  }

  // 메시지 분할 전송 로직
  sendSplitChat(text, typeLabel) {
    // 1. 줄바꿈 정규화 및 최대 5개(빈 줄 4줄)로 제한
    let normalizedText = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    normalizedText = normalizedText.replace(/\n{6,}/g, '\n\n\n\n\n');
    
    if (!normalizedText.trim()) return;

    const lines = normalizedText.split('\n');
    const chunks = [];
    let currentChunk = null;

    // 현재 쌓인 청크를 전송 목록에 추가 (완전히 비어있지 않은 경우에만)
    const flushChunk = () => {
      if (currentChunk !== null && currentChunk.replace(/\n/g, '').trim() !== '') {
        chunks.push(currentChunk);
      }
      currentChunk = null;
    };

    for (let line of lines) {
      // 한 줄이 최대 길이를 초과하는 경우 강제 분할
      if (line.length > this.maxLen) {
        flushChunk();
        for (let i = 0; i < line.length; i += this.maxLen) {
          chunks.push(line.substring(i, i + this.maxLen));
        }
        continue;
      }

      // 줄바꿈을 포함하여 다음 청크 구성 시도
      const nextPotentialChunk = currentChunk === null ? line : currentChunk + "\n" + line;
      
      if (nextPotentialChunk.length > this.maxLen) {
        flushChunk();
        currentChunk = line;
      } else {
        currentChunk = nextPotentialChunk;
      }
    }

    flushChunk();

    chunks.forEach((chunk, index) => {
      setTimeout(() => {
        this.onSendChat(chunk);
        this.onLog({ type: 'bot', author: typeLabel, text: chunk });
      }, index * this.sendInterval);
    });
  }

  resolveVars(tpl, user, count, streamName) {
    const t = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    const shieldStr = this.shieldCount.toLocaleString('ko-KR');
    return tpl
      .replace(/{유저}/g, user)
      .replace(/{시간}/g, t)
      .replace(/{횟수}/g, shieldStr) // {횟수} 변수를 실드 개수로 매핑 (기존 요청 호환)
      .replace(/{실드}/g, shieldStr)
      .replace(/{스트림}/g, streamName || '');
  }

  stop() {
    this.isRunning = false;
    this.repeatTimers.forEach(timer => clearInterval(timer));
    this.repeatTimers = [];
  }

  // ══════════════════════════════════════════
  //  ⭐ 애청지수 메서드
  // ══════════════════════════════════════════

  _actKey(author, tag) {
    return tag || author;
  }

  // tag → author → nickname 순서로 actData에서 key 탐색
  _findActKey(author, tag) {
    if (tag && this.actData[tag]) return tag;
    if (this.actData[author]) return author;
    const found = Object.keys(this.actData).find(k => this.actData[k].nickname === author);
    return found || null;
  }

  _actGetLevel(exp) {
    // ⭐ 레벨 공식 (누적 증가 방식 / 삼각수):
    //    Lv.N → Lv.(N+1) 필요 EXP = N × lvBase
    //    Lv.L 도달 누적 EXP = lvBase × L × (L-1) / 2
    //    lvBase=100 기준: Lv.5→6=500, Lv.8→9=800
    const base = Number(this.actSettings.lvBase) || 100;
    const e = Math.max(0, Number(exp) || 0);
    const level = Math.max(1, Math.floor((1 + Math.sqrt(1 + 8 * e / base)) / 2));
    const curStart = base * level * (level - 1) / 2;
    const nextExp  = base * level;
    return {
      level,
      curExp:  Math.max(0, e - curStart),
      nextExp
    };
  }

  _actRank(key) {
    const entries = Object.entries(this.actData).sort((a, b) => (b[1].exp||0) - (a[1].exp||0));
    const idx = entries.findIndex(([k]) => k === key);
    return idx >= 0 ? idx + 1 : 0;
  }

  _actFormat(tpl, data) {
    const v = (val) => (val === undefined || val === null || val === '') ? '0' : String(val);
    return tpl
      .replace(/{nickname}/g, data.nickname || '')
      .replace(/{tag}/g, data.tag || '')
      .replace(/{rank}/g, v(data.rank))
      .replace(/{level}/g, v(data.level))
      .replace(/{exp}/g, v(data.exp))
      .replace(/{nextExp}/g, v(data.nextExp))
      .replace(/{heart}/g, v(data.heart))
      .replace(/{chat}/g, v(data.chat))
      .replace(/{attend}/g, v(data.attend))
      .replace(/{lp}/g, v(data.lp))
      .replace(/{lpMax}/g, v(data.lpMax))
      .replace(/{lotto}/g, v(data.lotto))
      .replace(/{count}/g, v(data.count))
      .replace(/{totalExp}/g, v(data.totalExp))
      .replace(/{winNums}/g, data.winNums || '')
      .replace(/{myNums}/g, data.myNums || '');
  }

  _actSave() {
    this.onActivityWrite(this.actData);
  }

  // 레벨업 복권 보상 체크: exp 증가 직후 호출. prevExp는 증가 전 값.
  // interval(예: 10) 레벨 경계를 넘을 때마다 amount만큼 복권 지급.
  _actCheckLvReward(key, prevExp) {
    const s = this.actSettings;
    if (s.lvUpLottoEnabled === false) return;
    const interval = Math.max(1, Number(s.lvUpLottoInterval) || 10);
    const amount = Math.max(1, Number(s.lvUpLottoAmount) || 1);
    const d = this.actData[key];
    if (!d) return;
    const prevLevel = this._actGetLevel(prevExp || 0).level;
    const newLevel = this._actGetLevel(d.exp || 0).level;
    if (newLevel <= prevLevel) return;
    // 넘긴 interval 경계 수
    const crossings = Math.floor(newLevel / interval) - Math.floor(prevLevel / interval);
    if (crossings <= 0) return;
    const totalGift = crossings * amount;
    d.lotto = (d.lotto || 0) + totalGift;
    const nick = d.nickname || key;
    const tpl = s.msgLvUpLotto || '🎉 {nickname}님 Lv.{level} 달성! 복권 {amount}장 지급! (보유: {lotto}장)';
    this.sendSplitChat(
      String(tpl)
        .replace(/{nickname}/g, nick)
        .replace(/{level}/g, newLevel)
        .replace(/{amount}/g, totalGift)
        .replace(/{lotto}/g, d.lotto),
      '⭐레벨업'
    );
  }

  // exp 증가 + 레벨업 보상 체크를 한 번에. key는 actData의 키여야 함.
  _grantExp(key, delta) {
    if (!this.actData[key]) return;
    const prevExp = this.actData[key].exp || 0;
    this.actData[key].exp = prevExp + delta;
    this._actCheckLvReward(key, prevExp);
  }

  // !내정보 생성
  handleActCreate(author, tag) {
    const key = this._actKey(author, tag);
    if (this.actData[key]) {
      this.sendSplitChat(`⚠️ ${author}님은 이미 애청지수 정보가 있습니다.`, '⭐애청');
      return;
    }
    this.actData[key] = { nickname: author, heart: 0, chat: 0, attend: 0, lp: 0, lotto: 0, exp: 0, lastAttend: '' };
    this._actSave();
    const msg = this._actFormat(
      this.actSettings.msgCreate || '✅ {nickname}님의 애청지수 정보가 생성되었습니다!',
      { nickname: author, tag: key }
    );
    this.sendSplitChat(msg, '⭐애청');
  }

  // !내정보 삭제
  handleActDelete(author, tag) {
    const key = this._findActKey(author, tag);
    if (!key) {
      this.sendSplitChat(`⚠️ ${author}님의 정보가 없습니다.`, '⭐애청');
      return;
    }
    delete this.actData[key];
    this._actSave();
    const msg = this._actFormat(
      this.actSettings.msgDeleteOk || '🗑️ {nickname}님의 애청지수 정보가 삭제되었습니다.',
      { nickname: author, tag: key }
    );
    this.sendSplitChat(msg, '⭐애청');
  }

  // !내정보
  handleActMyInfo(author, tag) {
    const key = this._findActKey(author, tag);
    if (!key) {
      this.sendSplitChat(`⚠️ ${author}님은 정보가 없습니다. '!내정보 생성' 으로 등록하세요.`, '⭐애청');
      return;
    }
    const d = this.actData[key];
    const { level, curExp, nextExp } = this._actGetLevel(d.exp || 0);
    const rank = this._actRank(key);
    const lpMax = Number(this.actSettings.lottoExchange) || 22;
    const tpl = this.actSettings.msgMyInfo ||
      "[ '{nickname}'님 활동정보 ]\n순위 : {rank}위\n레벨 : {level} ({exp}/{nextExp})\n하트 : {heart}\n채팅 : {chat}\n출석 : {attend}\n복권포인트 : {lp}/{lpMax}\n복권 : {lotto}";
    const msg = this._actFormat(tpl, {
      nickname: d.nickname || author, tag: key,
      rank, level, exp: curExp, nextExp,
      heart: d.heart || 0, chat: d.chat || 0, attend: d.attend || 0,
      lp: d.lp || 0, lpMax, lotto: d.lotto || 0
    });
    this.sendSplitChat(msg, '⭐애청');
  }

  // !랭킹
  handleActRank() {
    const sorted = Object.entries(this.actData)
      .sort((a, b) => (b[1].exp||0) - (a[1].exp||0))
      .slice(0, 5);
    if (sorted.length === 0) {
      this.sendSplitChat('📊 아직 애청지수 데이터가 없습니다.', '⭐애청');
      return;
    }
    const header = this.actSettings.msgRankHeader || '🏆 애청지수 TOP 5 🏆';
    const lineTpl = this.actSettings.msgRankLine || '{rank}위: {nickname} (Lv.{level})';
    let msg = header + '\n';
    sorted.forEach(([key, d], i) => {
      const { level } = this._actGetLevel(d.exp || 0);
      msg += this._actFormat(lineTpl, {
        rank: i + 1, nickname: d.nickname || key, level, exp: d.exp || 0
      }) + '\n';
    });
    this.sendSplitChat(msg.trim(), '⭐애청');
  }

  // !복권
  handleActLotto(author, tag, args) {
    const key = this._findActKey(author, tag);
    if (!key) {
      this.sendSplitChat(`⚠️ ${author}님은 정보가 없습니다. '!내정보 생성' 으로 등록하세요.`, '⭐애청');
      return;
    }
    const d = this.actData[key];

    const s = this.actSettings;
    const exp1st   = Number(s.lotto1st)   || 3000;
    const exp2nd   = Number(s.lotto2nd)   || 500;
    const exp3rd   = Number(s.lotto3rd)   || 100;
    const expFail  = Number(s.lottoFail)  || 1;

    // 지정 복권: !복권 1 2 8 (숫자 3개)
    const nums = args.map(a => parseInt(a)).filter(n => !isNaN(n) && n >= 1 && n <= 9);
    if (nums.length === 3) {
      // 지정 복권 1장 사용
      if ((d.lotto || 0) < 1) {
        this.sendSplitChat(`⚠️ ${author}님의 복권이 없습니다.`, '⭐애청');
        return;
      }
      d.lotto -= 1;
      const winNums = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5).slice(0, 3).sort((a,b)=>a-b);
      const myNums = nums.slice().sort((a,b)=>a-b);
      const matches = myNums.filter(n => winNums.includes(n)).length;
      let gainExp = expFail, grade = '💀 꽝(0개)';
      if (matches === 3) { gainExp = exp1st; grade = '🥇 1등(3개)'; }
      else if (matches === 2) { gainExp = exp2nd; grade = '🥈 2등(2개)'; }
      else if (matches === 1) { gainExp = exp3rd; grade = '🥉 3등(1개)'; }
      this._grantExp(key, gainExp);
      this._actSave();

      const headerTpl = s.msgLottoHeader || '🎰 {nickname}님의 복권 {count}개 지정 결과';
      const winTpl    = s.msgLottoWin    || '🎊당첨번호:{winNums}';
      const myTpl     = s.msgLottoMy     || '✨나의번호:{myNums}';
      const totalTpl  = s.msgLottoTotal  || '🎁 총 획득 경험치: +{totalExp} EXP';
      const msg =
        this._actFormat(headerTpl, { nickname: d.nickname||author, count: 1 }) + '\n' +
        this._actFormat(winTpl, { winNums: winNums.join(',') }) + '\n' +
        this._actFormat(myTpl,  { myNums: myNums.join(',') }) + '\n' +
        '━━━━━━━━━━━━━━\n' +
        `🥇 1등(3개): ${matches===3?1:0}회 (+${exp1st} EXP)\n` +
        `🥈 2등(2개): ${matches===2?1:0}회 (+${exp2nd} EXP)\n` +
        `🥉 3등(1개): ${matches===1?1:0}회 (+${exp3rd} EXP)\n` +
        `💀 꽝(0개): ${matches===0?1:0}회 (+${expFail} EXP)\n` +
        '━━━━━━━━━━━━━━\n' +
        this._actFormat(totalTpl, { totalExp: gainExp });
      this.sendSplitChat(msg, '⭐복권');
      return;
    }

    // 자동 복권: !복권 or !복권 20
    const count = args.length > 0 && !isNaN(parseInt(args[0])) ? parseInt(args[0]) : (d.lotto || 0);
    if (count <= 0 || (d.lotto || 0) <= 0) {
      this.sendSplitChat(`⚠️ ${author}님의 복권이 없습니다.`, '⭐애청');
      return;
    }
    const useCount = Math.min(count, d.lotto || 0);
    d.lotto -= useCount;

    let cnt1=0, cnt2=0, cnt3=0, cntFail=0;
    for (let i = 0; i < useCount; i++) {
      const win = [1,2,3,4,5,6,7,8,9].sort(()=>Math.random()-0.5).slice(0,3);
      const my  = [1,2,3,4,5,6,7,8,9].sort(()=>Math.random()-0.5).slice(0,3);
      const m = my.filter(n => win.includes(n)).length;
      if (m===3) cnt1++; else if (m===2) cnt2++; else if (m===1) cnt3++; else cntFail++;
    }
    const totalExp = cnt1*exp1st + cnt2*exp2nd + cnt3*exp3rd + cntFail*expFail;
    this._grantExp(key, totalExp);
    this._actSave();

    const headerTpl = s.msgLottoAutoHeader || '🎰 {nickname}님의 복권 {count}개 자동 결과';
    const totalTpl  = s.msgLottoTotal      || '🎁 총 획득 경험치: +{totalExp} EXP';
    const msg =
      this._actFormat(headerTpl, { nickname: d.nickname||author, count: useCount }) + '\n' +
      '━━━━━━━━━━━━━━\n' +
      `🥇 1등(3개): ${cnt1}회 (+${exp1st} EXP)\n` +
      `🥈 2등(2개): ${cnt2}회 (+${exp2nd} EXP)\n` +
      `🥉 3등(1개): ${cnt3}회 (+${exp3rd} EXP)\n` +
      `💀 꽝(0개): ${cntFail}회 (+${expFail} EXP)\n` +
      '━━━━━━━━━━━━━━\n' +
      this._actFormat(totalTpl, { totalExp });
    this.sendSplitChat(msg, '⭐복권');
  }

  // !복권지급 전체 [수량]
  handleActLottoGiveAll(amountStr) {
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount === 0) {
      this.sendSplitChat(`⚠️ 사용법: !복권지급 전체 [수량] (음수 입력 시 차감)`, '⭐애청');
      return;
    }
    let count = 0;
    for (const key in this.actData) {
      this.actData[key].lotto = Math.max(0, (this.actData[key].lotto || 0) + amount);
      count++;
    }
    if (count > 0) {
      this._actSave();
      const action = amount > 0 ? '지급' : '차감';
      this.sendSplitChat(`🎁 등록된 모든 유저(${count}명)의 복권이 ${Math.abs(amount)}장 ${action}되었습니다.`, '⭐복권');
    } else {
      this.sendSplitChat(`⚠️ 등록된 유저가 없습니다.`, '⭐애청');
    }
  }

  // !복권지급 [고유닉] [수량]
  handleActLottoGive(targetTag, amountStr) {
    const amount = parseInt(amountStr);
    if (!targetTag || isNaN(amount) || amount === 0) {
      this.sendSplitChat(`⚠️ 사용법: !복권지급 [고유닉] [수량] (음수 입력 시 차감)`, '⭐애청');
      return;
    }
    const d = this.actData[targetTag];
    if (!d) {
      this.sendSplitChat(`⚠️ '${targetTag}' 유저의 정보가 없습니다.`, '⭐애청');
      return;
    }
    d.lotto = Math.max(0, (d.lotto || 0) + amount);
    this._actSave();
    const action = amount > 0 ? '지급' : '차감';
    this.sendSplitChat(`🎁 ${d.nickname || targetTag}님의 복권이 ${Math.abs(amount)}장 ${action}되었습니다. (현재: ${d.lotto}장)`, '⭐복권');
  }

  // !상점 [고유닉] [경험치]
  handleActShopExp(targetTag, expStr) {
    const expAmount = parseInt(expStr);
    if (!targetTag || isNaN(expAmount)) {
      this.sendSplitChat(`⚠️ 사용법: !상점 [고유닉] [경험치]`, '⭐애청');
      return;
    }
    const d = this.actData[targetTag];
    if (!d) {
      this.sendSplitChat(`⚠️ '${targetTag}' 유저의 정보가 없습니다.`, '⭐애청');
      return;
    }
    this._grantExp(targetTag, expAmount);
    this._actSave();
    const action = expAmount >= 0 ? '지급' : '차감';
    this.sendSplitChat(`🛍️ ${d.nickname || targetTag}님의 경험치가 ${Math.abs(expAmount)}만큼 ${action}되었습니다. (현재: ${d.exp} EXP)`, '⭐상점');
  }

  // @[고유닉] - DJ/매니저 전용 타인 정보 조회
  handleActViewOther(targetTag) {
    const d = this.actData[targetTag];
    if (!d) {
      this.sendSplitChat(`⚠️ '${targetTag}' 유저의 정보가 없습니다.`, '⭐애청');
      return;
    }
    const { level, curExp, nextExp } = this._actGetLevel(d.exp || 0);
    const rank = this._actRank(targetTag);
    const lpMax = Number(this.actSettings.lottoExchange) || 22;
    const tpl = this.actSettings.msgMyInfo ||
      "[ '{nickname}'님 활동정보 ]\n순위 : {rank}위\n레벨 : {level} ({exp}/{nextExp})\n하트 : {heart}\n채팅 : {chat}\n출석 : {attend}\n복권포인트 : {lp}/{lpMax}\n복권 : {lotto}";
    const msg = this._actFormat(tpl, {
      nickname: d.nickname || targetTag, tag: targetTag,
      rank, level, exp: curExp, nextExp,
      heart: d.heart||0, chat: d.chat||0, attend: d.attend||0,
      lp: d.lp||0, lpMax, lotto: d.lotto||0
    });
    this.sendSplitChat(msg, '⭐애청');
  }

  // 하트 수신 시 외부에서 호출
  handleActHeart(author, tag) {
    // 1) tag로 먼저 찾기
    let key = tag || author;
    if (!this.actData[key]) {
      // 2) author(닉네임)로 찾기
      if (this.actData[author]) {
        key = author;
      } else {
        // 3) actData 전체에서 nickname이 일치하는 유저 찾기
        const found = Object.keys(this.actData).find(k => this.actData[k].nickname === author);
        if (found) key = found;
        else return; // 등록된 유저 없음
      }
    }
    this.actData[key].nickname = author;
    this.actData[key].heart = (this.actData[key].heart || 0) + 1;
    this._grantExp(key, Number(this.actSettings.scoreHeart) || 1);
    this._actSave();
  }

  // 채팅 수신 시 외부에서 호출
  handleActChat(author, tag) {
    let key = tag || author;
    if (!this.actData[key]) {
      if (this.actData[author]) {
        key = author;
      } else {
        const found = Object.keys(this.actData).find(k => this.actData[k].nickname === author);
        if (found) key = found;
        else return;
      }
    }
    this.actData[key].nickname = author;
    this.actData[key].chat = (this.actData[key].chat || 0) + 1;
    this._grantExp(key, Number(this.actSettings.scoreChat) || 2);
    this._actSave();
  }

  // 출석 자동 처리 (입장 시 자동 호출, 30분마다 1회, 채팅 출력 없음)
  handleActAttend(author, tag) {
    const key = this._findActKey(author, tag);
    if (!key) return; // 미등록 유저는 조용히 무시
    const now = Date.now();
    const lastAttend = this.actData[key].lastAttendTime || 0;
    const interval = 30 * 60 * 1000; // 30분
    if (now - lastAttend < interval) return; // 아직 30분 안 됨, 조용히 무시
    this.actData[key].lastAttendTime = now;
    this.actData[key].attend = (this.actData[key].attend || 0) + 1;
    this._grantExp(key, Number(this.actSettings.scoreAttend) || 10);
    this._actSave();
  }

  // 복권포인트 적립 (스푼 선물 1개당 1포인트, exchange 도달시 복권 1장 지급 + 채팅 알림)
  //  + 복권포인트 1개당 scoreLottoPoint EXP 지급
  handleActLottoPoint(author, tag, amount) {
    let key = tag || author;
    if (!this.actData[key]) {
      if (this.actData[author]) key = author;
      else {
        const found = Object.keys(this.actData).find(k => this.actData[k].nickname === author);
        if (found) key = found;
        else return;
      }
    }
    const exchange    = Number(this.actSettings.lottoExchange)  || 22;
    const expPerPoint = Number(this.actSettings.scoreLottoPoint) || 5;
    this.actData[key].lp = (this.actData[key].lp || 0) + amount;
    // ⭐ 복권포인트 1개당 scoreLottoPoint EXP 지급
    if (amount > 0 && expPerPoint > 0) {
      this._grantExp(key, amount * expPerPoint);
    }
    let gained = 0;
    while (this.actData[key].lp >= exchange) {
      this.actData[key].lp -= exchange;
      this.actData[key].lotto = (this.actData[key].lotto || 0) + 1;
      gained++;
    }
    if (gained > 0) {
      const nick = this.actData[key].nickname || author;
      this.sendSplitChat(
        `🎟️ ${nick}님 복권 ${gained}장 지급! (보유: ${this.actData[key].lotto}장 | 포인트: ${this.actData[key].lp}/${exchange})`,
        '⭐복권'
      );
    }
    this._actSave();
  }
}

module.exports = BotEngine;