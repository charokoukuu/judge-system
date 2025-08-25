"use client";

import { useEffect, useState } from "react";
import { Socket } from "socket.io-client";

interface ServerStatus {
  uptime: number;
  restartScheduled: boolean;
  connectedClients: number;
  activeSessions: number;
  restartConfig: {
    enabled: boolean;
    delayMs: number;
    gracefulShutdownTimeoutMs: number;
    minUptimeMs: number;
  };
}

interface ServerMonitorProps {
  socket: Socket | null;
}

export function ServerMonitor({ socket }: ServerMonitorProps) {
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [restartReason, setRestartReason] = useState("");

  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      setIsConnected(true);
      requestServerStatus();
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setServerStatus(null);
    };

    const handleServerStatus = (status: ServerStatus) => {
      setServerStatus(status);
      setLastUpdate(new Date());
    };

    const handleServerRestarting = (data: {
      message: string;
      timestamp: string;
    }) => {
      console.warn("Server is restarting:", data.message);
      setServerStatus(null);
    };

    const handleRestartAcknowledged = (data: {
      message: string;
      reason: string;
      timestamp: string;
    }) => {
      console.log("Restart acknowledged:", data);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("admin:server_status_response", handleServerStatus);
    socket.on("server:restarting", handleServerRestarting);
    socket.on("admin:restart_acknowledged", handleRestartAcknowledged);

    // 接続状態をチェック
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("admin:server_status_response", handleServerStatus);
      socket.off("server:restarting", handleServerRestarting);
      socket.off("admin:restart_acknowledged", handleRestartAcknowledged);
    };
  }, [socket]);

  const requestServerStatus = () => {
    if (socket?.connected) {
      socket.emit("admin:server_status");
    }
  };

  const triggerRestart = () => {
    if (socket?.connected && restartReason.trim()) {
      socket.emit("admin:trigger_restart", { reason: restartReason.trim() });
      setRestartReason("");
    }
  };

  const toggleAutoRestart = () => {
    if (socket?.connected && serverStatus) {
      socket.emit("admin:update_restart_config", {
        enabled: !serverStatus.restartConfig.enabled,
      });
    }
  };

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">サーバー監視</h3>
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-sm">{isConnected ? "接続中" : "切断中"}</span>
        </div>
      </div>

      {serverStatus && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-600">
                稼働時間
              </label>
              <div className="text-lg">{formatUptime(serverStatus.uptime)}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">
                接続クライアント数
              </label>
              <div className="text-lg">{serverStatus.connectedClients}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">
                アクティブセッション数
              </label>
              <div className="text-lg">{serverStatus.activeSessions}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">
                再起動予定
              </label>
              <div
                className={`text-lg ${serverStatus.restartScheduled ? "text-orange-600" : "text-green-600"}`}
              >
                {serverStatus.restartScheduled ? "はい" : "いいえ"}
              </div>
            </div>
          </div>

          <div className="border-t pt-3">
            <h4 className="font-medium mb-2">再起動設定</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                自動再起動: {serverStatus.restartConfig.enabled ? "ON" : "OFF"}
              </div>
              <div>遅延時間: {serverStatus.restartConfig.delayMs}ms</div>
              <div>
                最小稼働時間: {serverStatus.restartConfig.minUptimeMs}ms
              </div>
              <div>
                タイムアウト:{" "}
                {serverStatus.restartConfig.gracefulShutdownTimeoutMs}ms
              </div>
            </div>
          </div>

          {lastUpdate && (
            <div className="text-xs text-gray-500">
              最終更新: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={requestServerStatus}
          disabled={!isConnected}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded disabled:bg-gray-300"
        >
          更新
        </button>

        {serverStatus && (
          <button
            onClick={toggleAutoRestart}
            disabled={!isConnected}
            className="px-3 py-1 text-sm bg-yellow-500 text-white rounded disabled:bg-gray-300"
          >
            自動再起動: {serverStatus.restartConfig.enabled ? "OFF" : "ON"}
          </button>
        )}
      </div>

      <div className="mt-4 border-t pt-4">
        <h4 className="font-medium mb-2">手動再起動</h4>
        <div className="flex gap-2">
          <input
            type="text"
            value={restartReason}
            onChange={(e) => setRestartReason(e.target.value)}
            placeholder="再起動の理由 (任意)"
            className="flex-1 px-2 py-1 border rounded text-sm"
            disabled={!isConnected}
          />
          <button
            onClick={triggerRestart}
            disabled={!isConnected || !restartReason.trim()}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded disabled:bg-gray-300"
          >
            再起動
          </button>
        </div>
      </div>
    </div>
  );
}
