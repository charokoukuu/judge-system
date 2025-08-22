import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

export enum playMode {
  GEAR,
  VICTORY_RIGHT,
  VICTORY_LEFT,
  MAGIC_SCALE,
  TURN_START,
  JUDGMENT,
  ERROR,
}

export const audioPlaySync = (mode: playMode) => {
  switch (mode) {
    case playMode.GEAR:
      // GEARモードの処理
      break;
  }
};

/**
 * playModeに基づいてファイルパスを決定する関数
 * @param mode 再生モード
 * @returns ファイルパス
 */
const getAudioFilePath = (mode: playMode): string => {
  const audioDir = path.join(__dirname, "../../../assets/audio");

  switch (mode) {
    case playMode.GEAR:
      return path.join(audioDir, "gear.mp3");
    case playMode.VICTORY_RIGHT:
      return path.join(audioDir, "victory-right.mp3");
    case playMode.VICTORY_LEFT:
      return path.join(audioDir, "victory-left.mp3");
    case playMode.MAGIC_SCALE:
      return path.join(audioDir, "magic-scale.wav");
    case playMode.TURN_START:
      return path.join(audioDir, "turn-start.mp3");
    case playMode.JUDGMENT:
      return path.join(audioDir, "judgment.wav");
    case playMode.ERROR:
      return path.join(audioDir, "error.mp3");
    default:
      throw new Error(`Unknown play mode: ${mode}`);
  }
};

/**
 * ローカルの音源ファイルを再生する関数
 * @param mode 再生モード
 * @param volume 音量（0.0-1.0、デフォルト: 0.5）
 * @returns Promise<void>
 */
export const playLocalAudio = async (
  mode: playMode,
  volume: number = 0.5
): Promise<void> => {
  try {
    const filePath = getAudioFilePath(mode);

    // ファイルの存在確認
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Audio file not found: ${filePath} for mode: ${playMode[mode]}`
      );
    }

    // ファイル拡張子の確認
    const ext = path.extname(filePath).toLowerCase();
    const supportedFormats = [".mp3", ".wav", ".m4a", ".aac", ".ogg"];

    if (!supportedFormats.includes(ext)) {
      throw new Error(`Unsupported audio format: ${ext}`);
    }

    // 音量を0-100の範囲に変換
    const volumePercent = Math.max(0, Math.min(100, Math.round(volume * 100)));

    // プラットフォーム別の再生コマンド
    let command: string;

    if (process.platform === "darwin") {
      // macOS - afplayを使用
      command = `afplay "${filePath}" -v ${volume}`;
    } else if (process.platform === "win32") {
      // Windows - PowerShellを使用
      command = `powershell -c "(New-Object Media.SoundPlayer '${filePath}').PlaySync()"`;
    } else {
      // Linux - aplayまたはpaplayを使用
      command = `aplay "${filePath}" 2>/dev/null || paplay "${filePath}" 2>/dev/null || ffplay -nodisp -autoexit -v quiet "${filePath}"`;
    }

    console.log(
      `Playing audio: ${playMode[mode]} (${filePath}) at volume ${volumePercent}%`
    );

    // 音源を再生（非同期）
    await execAsync(command);

    console.log(`Audio playback completed: ${playMode[mode]}`);
  } catch (error) {
    console.error(`Failed to play audio: ${error.message}`);
    throw error;
  }
};

/**
 * ローカルの音源ファイルを非同期で再生する関数（ノンブロッキング）
 * @param mode 再生モード
 * @param volume 音量（0.0-1.0、デフォルト: 0.5）
 * @param onComplete 再生完了時のコールバック関数
 * @param onError エラー時のコールバック関数
 */
export const playLocalAudioAsync = (
  mode: playMode,
  volume: number = 0.5,
  onComplete?: () => void,
  onError?: (error: Error) => void
): void => {
  playLocalAudio(mode, volume)
    .then(() => {
      if (onComplete) {
        onComplete();
      }
    })
    .catch((error) => {
      if (onError) {
        onError(error);
      } else {
        console.error(`Async audio playback failed: ${error.message}`);
      }
    });
};

/**
 * 複数の音源ファイルを順次再生する関数
 * @param modes 再生モード配列
 * @param volume 音量（0.0-1.0、デフォルト: 0.5）
 * @param interval 音源間の間隔（ミリ秒、デフォルト: 0）
 * @returns Promise<void>
 */
export const playLocalAudioSequence = async (
  modes: playMode[],
  volume: number = 0.5,
  interval: number = 0
): Promise<void> => {
  try {
    for (let i = 0; i < modes.length; i++) {
      await playLocalAudio(modes[i], volume);

      // 最後の音源でなければ間隔を設ける
      if (i < modes.length - 1 && interval > 0) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    console.log(`Audio sequence completed: ${modes.length} files played`);
  } catch (error) {
    console.error(`Failed to play audio sequence: ${error.message}`);
    throw error;
  }
};

/**
 * 指定された回数、音源を繰り返し再生する関数
 * @param mode 再生モード
 * @param repeatCount 繰り返し回数
 * @param volume 音量（0.0-1.0、デフォルト: 0.5）
 * @param interval 繰り返し間の間隔（ミリ秒、デフォルト: 0）
 * @returns Promise<void>
 */
export const playLocalAudioRepeat = async (
  mode: playMode,
  repeatCount: number,
  volume: number = 0.5,
  interval: number = 0
): Promise<void> => {
  try {
    for (let i = 0; i < repeatCount; i++) {
      await playLocalAudio(mode, volume);

      // 最後の再生でなければ間隔を設ける
      if (i < repeatCount - 1 && interval > 0) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    console.log(
      `Audio repeat completed: ${playMode[mode]} played ${repeatCount} times`
    );
  } catch (error) {
    console.error(`Failed to repeat audio: ${error.message}`);
    throw error;
  }
};
