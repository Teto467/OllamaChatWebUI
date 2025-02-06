#!/usr/bin/env python3
import subprocess
import sys

packages = [
    "fastapi",
    "uvicorn[standard]",
    "aiohttp",
    "jinja2"
]

def install_package(package):
    print(f"Installing {package}...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])

def install_all_packages():
    for package in packages:
        install_package(package)
    print("全てのライブラリがインストールされました。")

if __name__ == "__main__":
    install_all_packages() 