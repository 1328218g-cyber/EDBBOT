
// ── 하드키 인증 및 권한 신청 모듈 ──
let myHardkey = '';
let isAuthorized = false;

async function checkHardkeyAuth() {
  try {
    // 1. 하드키 가져오기 (Electron의 machineId 등 활용)
    myHardkey = await window.ipc.invoke('auth:get-hardkey');
    document.getElementById('myHardkeyDisplay').textContent = myHardkey;

    // 2. 구글 시트 데이터 기반 인증 확인
    const result = await window.ipc.invoke('auth:check', myHardkey);
    isAuthorized = result.authorized;

    if (!isAuthorized) {
      document.getElementById('authOverlay').style.display = 'flex';
      // 봇 시작 버튼 비활성화
      const btnStart = document.getElementById('btnStart');
      if (btnStart) btnStart.disabled = true;
    } else {
      document.getElementById('authOverlay').style.display = 'none';
    }
  } catch (e) {
    console.error('인증 확인 중 오류:', e);
  }
}

function openRequestModal() {
  document.getElementById('requestModal').style.display = 'flex';
}

function closeRequestModal() {
  document.getElementById('requestModal').style.display = 'none';
}

async function submitRequest() {
  const djName = document.getElementById('reqDjName').value.trim();
  const spoonId = document.getElementById('reqSpoonId').value.trim();
  const btn = document.getElementById('btnSubmitRequest');

  if (!djName || !spoonId) {
    alert('DJ 닉네임과 고유닉을 모두 입력해주세요.');
    return;
  }

  btn.disabled = true;
  btn.textContent = '신청 중...';

  try {
    const success = await window.ipc.invoke('auth:request-permission', {
      djName,
      spoonId,
      hardkey: myHardkey
    });

    if (success) {
      alert('권한 신청이 완료되었습니다!\n관리자 승인 후 이용 가능합니다.');
      closeRequestModal();
    } else {
      alert('신청 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  } catch (e) {
    alert('오류 발생: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '신청 완료';
  }
}

// 기존 init 함수를 확장하여 인증 체크 추가
const originalInitForAuth = init;
init = async function() {
  await checkHardkeyAuth();
  if (isAuthorized) {
    await originalInitForAuth();
  }
};
