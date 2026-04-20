import os
import sys
import requests
import subprocess
import time

# 설정
REPO_OWNER = "1328218g-cyber"
REPO_NAME = "EDBBOT"
CURRENT_VERSION = "v1.0.0"

def check_for_updates():
    print(f"현재 버전: {CURRENT_VERSION}")
    api_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest"
    
    try:
        response = requests.get(api_url)
        if response.status_code == 200:
            latest_release = response.json()
            latest_version = latest_release['tag_name']
            
            if latest_version != CURRENT_VERSION:
                print(f"새로운 버전 발견: {latest_version}")
                for asset in latest_release['assets']:
                    if asset['name'].endswith('.exe'):
                        download_url = asset['browser_download_url']
                        update_program(download_url, asset['name'])
                        return True
            else:
                print("최신 버전을 사용 중입니다.")
        else:
            print("업데이트 확인 실패.")
    except Exception as e:
        print(f"에러 발생: {e}")
    return False

def update_program(url, filename):
    print("업데이트 다운로드 중...")
    r = requests.get(url, stream=True)
    new_filename = "update_" + filename
    with open(new_filename, 'wb') as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    
    print("업데이트 적용 중... 프로그램을 재시작합니다.")
    
    # 배치를 사용하여 파일 교체 및 재실행
    with open("update.bat", "w") as f:
        f.write(f"@echo off\n")
        f.write(f"timeout /t 2 /nobreak > nul\n")
        f.write(f"del \"{sys.argv[0]}\"\n")
        f.write(f"move \"{new_filename}\" \"{sys.argv[0]}\"\n")
        f.write(f"start \"\" \"{sys.argv[0]}\"\n")
        f.write(f"del \"%~f0\"\n")
    
    subprocess.Popen(["update.bat"], shell=True)
    sys.exit()

def main():
    print("EDBBOT 실행 중...")
    if check_for_updates():
        return
    
    # 실제 봇 로직이 들어갈 부분
    while True:
        print("봇이 작동 중입니다... (종료하려면 Ctrl+C)")
        time.sleep(10)

if __name__ == \"__main__\":
    main()
