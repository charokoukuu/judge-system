import asyncio
import os
from bleak import BleakClient, BleakScanner
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from typing import Optional, Dict

# デバイス1の設定
cybergear_NAME = "M5judge_Cybergear_Ctrl"
cybergear_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
cybergear_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

# デバイス2の設定
led_NAME = "LEDBLE"
led_SERVICE_UUID = "AF4A332B-5C57-4CCE-85DB-922D8B193A07"
led_CHARACTERISTIC_UUID = "6CFCADB4-D196-430E-9D9B-D7B876D13C6E"

# デバイス3の設定
dial_NAME = "M5judge_Display_Ctrl"
dial_SERVICE_UUID = "a3f2c7de-84fb-4a13-bca1-2e7b29c9b302"
dial_CHARACTERISTIC_UUID = "b1d5f92e-1cb9-45a0-b6a7-8c2c92df7c83"



# グローバル接続管理
class BLEConnectionManager:
    def __init__(self):
        self.connections: Dict[str, BleakClient] = {}
        self.connection_lock = asyncio.Lock()
        
    async def connect_device(self, device_name: str, service_uuid: str, characteristic_uuid: str):
        """デバイスに接続"""
        try:
            print(f"Scanning for {device_name}...")
            device = await BleakScanner.find_device_by_filter(
                lambda d, ad: d.name and device_name in d.name
            )

            if not device:
                print(f"Device '{device_name}' not found.")
                return False

            client = BleakClient(device)
            await client.connect()
            print(f"Connected to {device_name}")
            
            # 接続を保存
            self.connections[device_name] = client
            return True
            
        except Exception as e:
            print(f"Failed to connect to {device_name}: {str(e)}")
            return False
    
    async def send_message(self, device_name: str, characteristic_uuid: str, message: str):
        """接続済みデバイスにメッセージを送信"""
        async with self.connection_lock:
            client = self.connections.get(device_name)
            if not client or not client.is_connected:
                print(f"Device {device_name} is not connected")
                return False
                
            try:
                await client.write_gatt_char(characteristic_uuid, message.encode("utf-8"))
                print(f"Sent message to {device_name}: {message}")
                return True
            except Exception as e:
                print(f"Error sending message to {device_name}: {str(e)}")
                # 接続が切れた場合は削除
                if device_name in self.connections:
                    try:
                        await self.connections[device_name].disconnect()
                    except:
                        pass
                    del self.connections[device_name]
                return False
    
    async def disconnect_all(self):
        """全デバイスとの接続を切断"""
        for device_name, client in self.connections.items():
            try:
                if client.is_connected:
                    await client.disconnect()
                    print(f"Disconnected from {device_name}")
            except Exception as e:
                print(f"Error disconnecting from {device_name}: {str(e)}")
        self.connections.clear()
    
    def get_connection_status(self):
        """接続状況を取得"""
        status = {}
        for device_name, client in self.connections.items():
            status[device_name] = client.is_connected if client else False
        return status

# グローバルコネクションマネージャー
connection_manager = BLEConnectionManager()

# FastAPIアプリケーションの初期化
app = FastAPI()

# リクエストボディのモデル
class MessageRequest(BaseModel):
    message: str

@app.on_event("startup")
async def startup_event():
    """アプリケーション起動時に全デバイスに接続"""
    is_docker = os.path.exists('/.dockerenv')
    
    if is_docker:
        print("Docker environment detected. Skipping BLE connections.")
        return
    
    print("Initializing BLE connections...")
    
    # 全デバイスに接続を試行
    cybergear_connected = await connection_manager.connect_device(
        cybergear_NAME, cybergear_SERVICE_UUID, cybergear_CHARACTERISTIC_UUID
    )
    
    led_connected = await connection_manager.connect_device(
        led_NAME, led_SERVICE_UUID, led_CHARACTERISTIC_UUID
    )
    
    dial_connected = await connection_manager.connect_device(
        dial_NAME, dial_SERVICE_UUID, dial_CHARACTERISTIC_UUID
    )
    
    if cybergear_connected:
        print(f"✓ {cybergear_NAME} connected successfully")
    else:
        print(f"✗ Failed to connect to {cybergear_NAME}")
    
    if led_connected:
        print(f"✓ {led_NAME} connected successfully")
    else:
        print(f"✗ Failed to connect to {led_NAME}")
    
    if dial_connected:
        print(f"✓ {dial_NAME} connected successfully")
    else:
        print(f"✗ Failed to connect to {dial_NAME}")
    
    connected_count = sum([cybergear_connected, led_connected, dial_connected])
    if connected_count == 0:
        print("Warning: No devices connected")
    else:
        print(f"BLE initialization complete: {connected_count}/3 devices connected")

@app.on_event("shutdown")
async def shutdown_event():
    """アプリケーション終了時に全接続を切断"""
    print("Shutting down BLE connections...")
    await connection_manager.disconnect_all()

async def send_message_to_all_devices_persistent(message: str):
    """持続接続を使用して全デバイスに並行してメッセージを送信"""
    
    # 全デバイスに並行して送信
    tasks = [
        connection_manager.send_message(cybergear_NAME, cybergear_CHARACTERISTIC_UUID, message),
        connection_manager.send_message(led_NAME, led_CHARACTERISTIC_UUID, message),
        connection_manager.send_message(dial_NAME, dial_CHARACTERISTIC_UUID, message)
    ]
    
    # 全タスクを実行
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 結果をチェック
    success_count = 0
    error_messages = []
    
    device_names = [cybergear_NAME, led_NAME, dial_NAME]
    for i, result in enumerate(results):
        device_name = device_names[i]
        if isinstance(result, Exception):
            error_messages.append(f"{device_name}: {str(result)}")
        elif result:
            success_count += 1
        else:
            error_messages.append(f"{device_name}: Failed to send")
    
    if success_count == 0:
        raise Exception(f"Failed to send to all devices: {'; '.join(error_messages)}")
    elif error_messages:
        print(f"Partial success: {success_count}/3 devices. Errors: {'; '.join(error_messages)}")
    else:
        print(f"Successfully sent message to all {success_count} devices")

# レガシー関数（後方互換性のため残す）
async def send_message_to_device(device_name: str, service_uuid: str, characteristic_uuid: str, message: str):
    """指定されたデバイスにメッセージを送信（一時接続）"""
    try:
        device = await BleakScanner.find_device_by_filter(
            lambda d, ad: d.name and device_name in d.name
        )

        if not device:
            print(f"Device '{device_name}' not found.")
            raise Exception(f"Device '{device_name}' not found")

        async with BleakClient(device) as client:
            print(f"Connected to {device_name}")
            
            # メッセージをバイト列に変換して送信
            await client.write_gatt_char(characteristic_uuid, message.encode("utf-8"))
            print(f"Sent message to {device_name}: {message}")
    except Exception as e:
        print(f"Error sending message to {device_name}: {str(e)}")
        raise

async def send_message_to_all_devices(message: str):
    """両方のデバイスに並行してメッセージを送信（一時接続）"""
    print("Scanning for devices...")
    
    # 両方のデバイスに並行して送信
    tasks = [
        send_message_to_device(cybergear_NAME, cybergear_SERVICE_UUID, cybergear_CHARACTERISTIC_UUID, message),
        send_message_to_device(led_NAME, led_SERVICE_UUID, led_CHARACTERISTIC_UUID, message)
    ]
    
    # 両方のタスクを実行し、エラーがあっても他の送信を継続
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 結果をチェック
    success_count = 0
    error_messages = []
    
    for i, result in enumerate(results):
        device_name = cybergear_NAME if i == 0 else led_NAME
        if isinstance(result, Exception):
            error_messages.append(f"{device_name}: {str(result)}")
        else:
            success_count += 1
    
    if success_count == 0:
        raise Exception(f"Failed to send to all devices: {'; '.join(error_messages)}")
    elif error_messages:
        print(f"Partial success: {success_count}/2 devices. Errors: {'; '.join(error_messages)}")
    else:
        print(f"Successfully sent message to all {success_count} devices")

async def send_message(message: str):
    """レガシー関数 - 後方互換性のため残す（デバイス1のみ）"""
    await send_message_to_device(cybergear_NAME, cybergear_SERVICE_UUID, cybergear_CHARACTERISTIC_UUID, message)

# POSTエンドポイント
@app.post("/send")
async def send_ble_message(request: MessageRequest):
    # Docker環境かどうかをチェック
    is_docker = os.path.exists('/.dockerenv')
    
    try:
        if is_docker:
            # Docker環境では実際のBLE送信をスキップしてモックレスポンスを返す
            print(f"Docker environment detected. Mocking BLE send for message: {request.message}")
            return {"status": "success", "message": f"Message '{request.message}' sent successfully to all devices (Docker mock mode)"}
        else:
            # ローカル環境では持続接続を使用して両方のBLEデバイスに送信
            await send_message_to_all_devices_persistent(request.message)
            return {"status": "success", "message": f"Message '{request.message}' sent successfully to all devices"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send message: {str(e)}")

# 個別デバイス用エンドポイント
@app.post("/send/cybergear")
async def send_ble_message_cybergear(request: MessageRequest):
    """デバイス1（M5judge_Cybergear_Ctrl）のみに送信"""
    is_docker = os.path.exists('/.dockerenv')
    
    try:
        if is_docker:
            print(f"Docker environment detected. Mocking BLE send to cybergear for message: {request.message}")
            return {"status": "success", "message": f"Message '{request.message}' sent successfully to cybergear (Docker mock mode)"}
        else:
            success = await connection_manager.send_message(cybergear_NAME, cybergear_CHARACTERISTIC_UUID, request.message)
            if success:
                return {"status": "success", "message": f"Message '{request.message}' sent successfully to cybergear"}
            else:
                raise HTTPException(status_code=500, detail="Failed to send message to cybergear")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send message to cybergear: {str(e)}")

@app.post("/send/led")
async def send_ble_message_led(request: MessageRequest):
    """デバイス2（LEDBLE）のみに送信"""
    is_docker = os.path.exists('/.dockerenv')
    
    try:
        if is_docker:
            print(f"Docker environment detected. Mocking BLE send to led for message: {request.message}")
            return {"status": "success", "message": f"Message '{request.message}' sent successfully to led (Docker mock mode)"}
        else:
            success = await connection_manager.send_message(led_NAME, led_CHARACTERISTIC_UUID, request.message)
            if success:
                return {"status": "success", "message": f"Message '{request.message}' sent successfully to led"}
            else:
                raise HTTPException(status_code=500, detail="Failed to send message to led")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send message to led: {str(e)}")

@app.post("/send/dial")
async def send_ble_message_dial(request: MessageRequest):
    """デバイス3（dial）のみに送信"""
    is_docker = os.path.exists('/.dockerenv')
    
    try:
        if is_docker:
            print(f"Docker environment detected. Mocking BLE send to dial for message: {request.message}")
            return {"status": "success", "message": f"Message '{request.message}' sent successfully to dial (Docker mock mode)"}
        else:
            success = await connection_manager.send_message(dial_NAME, dial_CHARACTERISTIC_UUID, request.message)
            if success:
                return {"status": "success", "message": f"Message '{request.message}' sent successfully to dial"}
            else:
                raise HTTPException(status_code=500, detail="Failed to send message to dial")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send message to dial: {str(e)}")

# ヘルスチェックエンドポイント
@app.get("/")
async def health_check():
    connection_status = connection_manager.get_connection_status()
    return {
        "status": "ok", 
        "message": "BLE Server is running",
        "devices": {
            "cybergear": cybergear_NAME,
            "led": led_NAME,
            "dial": dial_NAME
        },
        "connections": connection_status,
        "endpoints": {
            "send_all": "/send",
            "send_cybergear": "/send/cybergear", 
            "send_led": "/send/led",
            "send_dial": "/send/dial",
            "reconnect": "/reconnect"
        }
    }

# 再接続エンドポイント
@app.post("/reconnect")
async def reconnect_devices():
    """デバイスへの再接続を試行"""
    is_docker = os.path.exists('/.dockerenv')
    
    if is_docker:
        return {"status": "success", "message": "Reconnection skipped (Docker mock mode)"}
    
    try:
        # 既存接続を切断
        await connection_manager.disconnect_all()
        
        # 再接続を試行
        cybergear_connected = await connection_manager.connect_device(
            cybergear_NAME, cybergear_SERVICE_UUID, cybergear_CHARACTERISTIC_UUID
        )
        
        led_connected = await connection_manager.connect_device(
            led_NAME, led_SERVICE_UUID, led_CHARACTERISTIC_UUID
        )
        
        dial_connected = await connection_manager.connect_device(
            dial_NAME, dial_SERVICE_UUID, dial_CHARACTERISTIC_UUID
        )
        
        results = {
            "cybergear": cybergear_connected,
            "led": led_connected,
            "dial": dial_connected
        }
        
        success_count = sum(results.values())
        
        return {
            "status": "success" if success_count > 0 else "partial_failure",
            "message": f"Reconnection complete: {success_count}/3 devices connected",
            "connections": results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reconnection failed: {str(e)}")

if __name__ == "__main__":
    print("Starting BLE HTTP Server with Persistent Connections...")
    print("Server will be available at: http://localhost:9000")
    print(f"Configured devices:")
    print(f"  Device 1: {cybergear_NAME}")
    print(f"  Device 2: {led_NAME}")
    print(f"  Device 3: {dial_NAME}")
    print("Available endpoints:")
    print("  POST /send - Send to all devices (persistent connection)")
    print("  POST /send/cybergear - Send to cybergear only")
    print("  POST /send/led - Send to led only")
    print("  POST /send/dial - Send to dial only")
    print("  POST /reconnect - Reconnect to all devices")
    print("  GET / - Health check and connection status")
    print("Example: curl -X POST http://localhost:9000/send -H 'Content-Type: application/json' -d '{\"message\":\"0\"}'")
    print("\nNote: All 3 devices will be connected at startup and connections maintained for faster sending.")
    uvicorn.run(app, host="0.0.0.0", port=9000)