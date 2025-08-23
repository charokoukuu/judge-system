import asyncio
import os
import time
from bleak import BleakClient, BleakScanner
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from typing import Optional, Dict
import logging

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
        self.reconnect_config = {
            "max_retries": 5,
            "base_delay": 1.0,  # 基本待機時間（秒）
            "max_delay": 30.0,  # 最大待機時間（秒）
            "health_check_interval": 10.0  # ヘルスチェック間隔（秒）
        }
        self.device_configs = {
            cybergear_NAME: {
                "service_uuid": cybergear_SERVICE_UUID,
                "characteristic_uuid": cybergear_CHARACTERISTIC_UUID
            },
            led_NAME: {
                "service_uuid": led_SERVICE_UUID,
                "characteristic_uuid": led_CHARACTERISTIC_UUID
            },
            dial_NAME: {
                "service_uuid": dial_SERVICE_UUID,
                "characteristic_uuid": dial_CHARACTERISTIC_UUID
            }
        }
        self.reconnect_tasks = {}
        self.health_check_task = None
        
    async def connect_device(self, device_name: str, service_uuid: str, characteristic_uuid: str):
        """デバイスに接続"""
        try:
            logging.info(f"Scanning for {device_name}...")
            device = await BleakScanner.find_device_by_filter(
                lambda d, ad: d.name and device_name in d.name
            )

            if not device:
                logging.warning(f"Device '{device_name}' not found.")
                return False

            client = BleakClient(device)
            await client.connect()
            logging.info(f"Connected to {device_name}")
            
            # 接続を保存
            self.connections[device_name] = client
            return True
            
        except Exception as e:
            logging.error(f"Failed to connect to {device_name}: {str(e)}")
            return False
    
    async def connect_device_with_retry(self, device_name: str, service_uuid: str, characteristic_uuid: str, max_retries: int = None):
        """リトライ機能付きデバイス接続"""
        if max_retries is None:
            max_retries = self.reconnect_config["max_retries"]
            
        for attempt in range(max_retries):
            try:
                success = await self.connect_device(device_name, service_uuid, characteristic_uuid)
                if success:
                    logging.info(f"Successfully connected to {device_name} on attempt {attempt + 1}")
                    return True
                    
            except Exception as e:
                logging.error(f"Connection attempt {attempt + 1} failed for {device_name}: {str(e)}")
            
            if attempt < max_retries - 1:
                # 指数バックオフによる待機時間計算
                delay = min(
                    self.reconnect_config["base_delay"] * (2 ** attempt),
                    self.reconnect_config["max_delay"]
                )
                logging.info(f"Waiting {delay:.1f} seconds before retry for {device_name}")
                await asyncio.sleep(delay)
        
        logging.error(f"Failed to connect to {device_name} after {max_retries} attempts")
        return False
    
    async def check_connection_health(self, device_name: str):
        """デバイス接続の健全性をチェック"""
        client = self.connections.get(device_name)
        if not client:
            return False
            
        try:
            # 接続状態をチェック
            return client.is_connected
        except Exception as e:
            logging.error(f"Health check failed for {device_name}: {str(e)}")
            return False
    
    async def start_auto_reconnect(self, device_name: str):
        """特定デバイスの自動再接続を開始"""
        if device_name in self.reconnect_tasks:
            # 既存のタスクをキャンセル
            self.reconnect_tasks[device_name].cancel()
        
        self.reconnect_tasks[device_name] = asyncio.create_task(
            self._auto_reconnect_loop(device_name)
        )
    
    async def _auto_reconnect_loop(self, device_name: str):
        """自動再接続ループ"""
        try:
            while True:
                await asyncio.sleep(self.reconnect_config["health_check_interval"])
                
                # 接続状態をチェック
                is_healthy = await self.check_connection_health(device_name)
                
                if not is_healthy:
                    logging.warning(f"Connection lost for {device_name}, attempting reconnection...")
                    
                    # 古い接続をクリーンアップ
                    if device_name in self.connections:
                        try:
                            await self.connections[device_name].disconnect()
                        except:
                            pass
                        del self.connections[device_name]
                    
                    # 再接続を試行
                    config = self.device_configs[device_name]
                    success = await self.connect_device_with_retry(
                        device_name,
                        config["service_uuid"],
                        config["characteristic_uuid"]
                    )
                    
                    if success:
                        logging.info(f"Successfully reconnected to {device_name}")
                    else:
                        logging.error(f"Failed to reconnect to {device_name}")
                        
        except asyncio.CancelledError:
            logging.info(f"Auto-reconnect loop cancelled for {device_name}")
        except Exception as e:
            logging.error(f"Auto-reconnect loop error for {device_name}: {str(e)}")
    
    async def start_health_monitoring(self):
        """全デバイスのヘルスモニタリングを開始"""
        if self.health_check_task:
            self.health_check_task.cancel()
            
        self.health_check_task = asyncio.create_task(self._health_monitoring_loop())
    
    async def _health_monitoring_loop(self):
        """ヘルスモニタリングループ"""
        try:
            while True:
                await asyncio.sleep(self.reconnect_config["health_check_interval"])
                
                for device_name in self.device_configs.keys():
                    is_healthy = await self.check_connection_health(device_name)
                    
                    if not is_healthy and device_name not in self.reconnect_tasks:
                        logging.warning(f"Starting auto-reconnect for disconnected device: {device_name}")
                        await self.start_auto_reconnect(device_name)
                        
        except asyncio.CancelledError:
            logging.info("Health monitoring loop cancelled")
        except Exception as e:
            logging.error(f"Health monitoring loop error: {str(e)}")
    
    async def send_message(self, device_name: str, characteristic_uuid: str, message: str):
        """接続済みデバイスにメッセージを送信（自動再接続付き）"""
        async with self.connection_lock:
            client = self.connections.get(device_name)
            if not client or not client.is_connected:
                logging.warning(f"Device {device_name} is not connected, attempting reconnection...")
                
                # 自動再接続を試行
                config = self.device_configs.get(device_name)
                if config:
                    success = await self.connect_device_with_retry(
                        device_name,
                        config["service_uuid"],
                        config["characteristic_uuid"],
                        max_retries=3  # メッセージ送信時は短時間で再試行
                    )
                    if not success:
                        return False
                    client = self.connections.get(device_name)
                else:
                    return False
                
            try:
                await client.write_gatt_char(characteristic_uuid, message.encode("utf-8"))
                logging.info(f"Sent message to {device_name}: {message}")
                return True
            except Exception as e:
                logging.error(f"Error sending message to {device_name}: {str(e)}")
                # 接続が切れた場合は削除して自動再接続を開始
                if device_name in self.connections:
                    try:
                        await self.connections[device_name].disconnect()
                    except:
                        pass
                    del self.connections[device_name]
                
                # 自動再接続を開始
                await self.start_auto_reconnect(device_name)
                return False
    
    async def disconnect_all(self):
        """全デバイスとの接続を切断"""
        # ヘルスモニタリングを停止
        if self.health_check_task:
            self.health_check_task.cancel()
            
        # 自動再接続タスクを停止
        for task in self.reconnect_tasks.values():
            task.cancel()
        self.reconnect_tasks.clear()
        
        # 全接続を切断
        for device_name, client in self.connections.items():
            try:
                if client.is_connected:
                    await client.disconnect()
                    logging.info(f"Disconnected from {device_name}")
            except Exception as e:
                logging.error(f"Error disconnecting from {device_name}: {str(e)}")
        self.connections.clear()
    
    def get_connection_status(self):
        """接続状況を取得"""
        status = {}
        for device_name, client in self.connections.items():
            status[device_name] = client.is_connected if client else False
        return status
    
    async def force_reconnect_all(self):
        """全デバイスの強制再接続"""
        logging.info("Starting force reconnection for all devices...")
        
        # 既存接続をクリア
        await self.disconnect_all()
        
        # 全デバイスに再接続
        results = {}
        for device_name, config in self.device_configs.items():
            success = await self.connect_device_with_retry(
                device_name,
                config["service_uuid"],
                config["characteristic_uuid"]
            )
            results[device_name] = success
            
            if success:
                # 自動再接続を開始
                await self.start_auto_reconnect(device_name)
        
        # ヘルスモニタリングを再開
        await self.start_health_monitoring()
        
        return results

# グローバルコネクションマネージャー
connection_manager = BLEConnectionManager()

# FastAPIアプリケーションの初期化
app = FastAPI()

# ログ設定
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# リクエストボディのモデル
class MessageRequest(BaseModel):
    message: str

@app.on_event("startup")
async def startup_event():
    """アプリケーション起動時に全デバイスに接続"""
    is_docker = os.path.exists('/.dockerenv')
    
    if is_docker:
        logging.info("Docker environment detected. Skipping BLE connections.")
        return
    
    logging.info("Initializing BLE connections...")
    
    # 全デバイスに接続を試行（リトライ機能付き）
    cybergear_connected = await connection_manager.connect_device_with_retry(
        cybergear_NAME, cybergear_SERVICE_UUID, cybergear_CHARACTERISTIC_UUID
    )
    
    led_connected = await connection_manager.connect_device_with_retry(
        led_NAME, led_SERVICE_UUID, led_CHARACTERISTIC_UUID
    )
    
    dial_connected = await connection_manager.connect_device_with_retry(
        dial_NAME, dial_SERVICE_UUID, dial_CHARACTERISTIC_UUID
    )
    
    if cybergear_connected:
        logging.info(f"✓ {cybergear_NAME} connected successfully")
        await connection_manager.start_auto_reconnect(cybergear_NAME)
    else:
        logging.warning(f"✗ Failed to connect to {cybergear_NAME}")
    
    if led_connected:
        logging.info(f"✓ {led_NAME} connected successfully")
        await connection_manager.start_auto_reconnect(led_NAME)
    else:
        logging.warning(f"✗ Failed to connect to {led_NAME}")
    
    if dial_connected:
        logging.info(f"✓ {dial_NAME} connected successfully")
        await connection_manager.start_auto_reconnect(dial_NAME)
    else:
        logging.warning(f"✗ Failed to connect to {dial_NAME}")
    
    connected_count = sum([cybergear_connected, led_connected, dial_connected])
    if connected_count == 0:
        logging.warning("Warning: No devices connected")
    else:
        logging.info(f"BLE initialization complete: {connected_count}/3 devices connected")
    
    # ヘルスモニタリングを開始
    await connection_manager.start_health_monitoring()
    logging.info("Health monitoring started for all devices")

@app.on_event("shutdown")
async def shutdown_event():
    """アプリケーション終了時に全接続を切断"""
    logging.info("Shutting down BLE connections...")
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
            "reconnect": "/reconnect",
            "status": "/status",
            "health_monitoring": {
                "start": "/health-monitoring/start",
                "stop": "/health-monitoring/stop"
            }
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
        # 強制再接続を実行
        results = await connection_manager.force_reconnect_all()
        
        success_count = sum(results.values())
        
        return {
            "status": "success" if success_count > 0 else "partial_failure",
            "message": f"Reconnection complete: {success_count}/3 devices connected",
            "connections": results,
            "auto_reconnect_enabled": True,
            "health_monitoring_enabled": True
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reconnection failed: {str(e)}")

# 接続状態エンドポイント
@app.get("/status")
async def get_connection_status():
    """現在の接続状態とヘルスチェック情報を取得"""
    connection_status = connection_manager.get_connection_status()
    
    return {
        "connections": connection_status,
        "health_monitoring": {
            "enabled": connection_manager.health_check_task is not None and not connection_manager.health_check_task.done(),
            "check_interval": connection_manager.reconnect_config["health_check_interval"]
        },
        "auto_reconnect": {
            "active_tasks": list(connection_manager.reconnect_tasks.keys()),
            "config": connection_manager.reconnect_config
        },
        "timestamp": time.time()
    }

# ヘルスモニタリング制御エンドポイント
@app.post("/health-monitoring/start")
async def start_health_monitoring():
    """ヘルスモニタリングを開始"""
    is_docker = os.path.exists('/.dockerenv')
    
    if is_docker:
        return {"status": "success", "message": "Health monitoring start skipped (Docker mock mode)"}
    
    try:
        await connection_manager.start_health_monitoring()
        return {"status": "success", "message": "Health monitoring started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start health monitoring: {str(e)}")

@app.post("/health-monitoring/stop")
async def stop_health_monitoring():
    """ヘルスモニタリングを停止"""
    is_docker = os.path.exists('/.dockerenv')
    
    if is_docker:
        return {"status": "success", "message": "Health monitoring stop skipped (Docker mock mode)"}
    
    try:
        if connection_manager.health_check_task:
            connection_manager.health_check_task.cancel()
        return {"status": "success", "message": "Health monitoring stopped"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop health monitoring: {str(e)}")

if __name__ == "__main__":
    logging.info("Starting BLE HTTP Server with Auto-Reconnection...")
    logging.info("Server will be available at: http://localhost:9000")
    logging.info(f"Configured devices:")
    logging.info(f"  Device 1: {cybergear_NAME}")
    logging.info(f"  Device 2: {led_NAME}")
    logging.info(f"  Device 3: {dial_NAME}")
    logging.info("Available endpoints:")
    logging.info("  POST /send - Send to all devices (persistent connection)")
    logging.info("  POST /send/cybergear - Send to cybergear only")
    logging.info("  POST /send/led - Send to led only")
    logging.info("  POST /send/dial - Send to dial only")
    logging.info("  POST /reconnect - Reconnect to all devices")
    logging.info("  GET /status - Connection status and health info")
    logging.info("  POST /health-monitoring/start - Start health monitoring")
    logging.info("  POST /health-monitoring/stop - Stop health monitoring")
    logging.info("  GET / - Health check and connection status")
    logging.info("Example: curl -X POST http://localhost:9000/send -H 'Content-Type: application/json' -d '{\"message\":\"0\"}'")
    logging.info("\nAuto-reconnection features:")
    logging.info("  - Automatic reconnection on connection loss")
    logging.info("  - Exponential backoff retry strategy")
    logging.info("  - Continuous health monitoring")
    logging.info("  - Background reconnection tasks")
    logging.info(f"  - Health check interval: {connection_manager.reconnect_config['health_check_interval']} seconds")
    uvicorn.run(app, host="0.0.0.0", port=9000)