import asyncio
import os
from bleak import BleakClient, BleakScanner
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

DEVICE_NAME = "M5judge_Cybergear_Ctrl"
SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

# FastAPIアプリケーションの初期化
app = FastAPI()

# リクエストボディのモデル
class MessageRequest(BaseModel):
    message: str

async def send_message(message: str):
    # デバイスをスキャン
    print("Scanning for devices...")
    try:
        device = await BleakScanner.find_device_by_filter(
            lambda d, ad: d.name and DEVICE_NAME in d.name
        )

        if not device:
            print(f"Device '{DEVICE_NAME}' not found.")
            raise Exception(f"Device '{DEVICE_NAME}' not found")

        async with BleakClient(device) as client:
            print(f"Connected to {DEVICE_NAME}")
            
            # メッセージをバイト列に変換して送信
            await client.write_gatt_char(CHARACTERISTIC_UUID, message.encode("utf-8"))
            print(f"Sent message: {message}")
    except Exception as e:
        print(f"Error in send_message: {str(e)}")
        raise

# POSTエンドポイント
@app.post("/send")
async def send_ble_message(request: MessageRequest):
    # Docker環境かどうかをチェック
    is_docker = os.path.exists('/.dockerenv')
    
    try:
        if is_docker:
            # Docker環境では実際のBLE送信をスキップしてモックレスポンスを返す
            print(f"Docker environment detected. Mocking BLE send for message: {request.message}")
            return {"status": "success", "message": f"Message '{request.message}' sent successfully (Docker mock mode)"}
        else:
            # ローカル環境では実際にBLEデバイスに送信
            await send_message(request.message)
            return {"status": "success", "message": f"Message '{request.message}' sent successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send message: {str(e)}")

# ヘルスチェックエンドポイント
@app.get("/")
async def health_check():
    return {"status": "ok", "message": "BLE Server is running"}

if __name__ == "__main__":
    print("Starting BLE HTTP Server...")
    print("Server will be available at: http://localhost:8000")
    print("Send POST requests to: http://localhost:8000/send")
    print("Example: curl -X POST http://localhost:8000/send -H 'Content-Type: application/json' -d '{\"message\":\"0\"}'")
    uvicorn.run(app, host="0.0.0.0", port=9000)