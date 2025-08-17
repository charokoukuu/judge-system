FROM python:3.11-slim

# 作業ディレクトリを設定
WORKDIR /app

# システムの依存関係をインストール（BLE用）
RUN apt-get update && apt-get install -y \
    bluetooth \
    bluez \
    libbluetooth-dev \
    && rm -rf /var/lib/apt/lists/*

# Pythonの依存関係ファイルをコピー
COPY pyproject.toml uv.lock ./

# uvをインストール
RUN pip install uv

# 依存関係をインストール
RUN uv sync --frozen

# アプリケーションのソースコードをコピー
COPY . .

# ポート9000を公開
EXPOSE 9000

# アプリケーションを実行
CMD ["uv", "run", "python", "main.py"]
