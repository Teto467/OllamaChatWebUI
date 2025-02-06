@echo off
REM Python の存在を確認
where python >nul 2>&1
if errorlevel 1 (
    echo Python が見つかりません。Python をインストールしてください。
    pause
    exit /b 1
)

REM このバッチファイルのあるディレクトリに移動
cd /d "%~dp0"

REM run.py を実行（必要なライブラリが無い場合は install.py が実行されます）
python run.py

pause 