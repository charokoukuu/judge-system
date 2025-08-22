"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.playLocalAudioRepeat = exports.playLocalAudioSequence = exports.playLocalAudioAsync = exports.playLocalAudio = exports.audioPlaySync = exports.playMode = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs = require("fs");
const path = require("path");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
var playMode;
(function (playMode) {
    playMode[playMode["GEAR"] = 0] = "GEAR";
    playMode[playMode["VICTORY_RIGHT"] = 1] = "VICTORY_RIGHT";
    playMode[playMode["VICTORY_LEFT"] = 2] = "VICTORY_LEFT";
    playMode[playMode["MAGIC_SCALE"] = 3] = "MAGIC_SCALE";
    playMode[playMode["TURN_START"] = 4] = "TURN_START";
    playMode[playMode["JUDGMENT"] = 5] = "JUDGMENT";
    playMode[playMode["ERROR"] = 6] = "ERROR";
})(playMode || (exports.playMode = playMode = {}));
const audioPlaySync = (mode) => {
    switch (mode) {
        case playMode.GEAR:
            break;
    }
};
exports.audioPlaySync = audioPlaySync;
const getAudioFilePath = (mode) => {
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
const playLocalAudio = async (mode, volume = 0.5) => {
    try {
        const filePath = getAudioFilePath(mode);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Audio file not found: ${filePath} for mode: ${playMode[mode]}`);
        }
        const ext = path.extname(filePath).toLowerCase();
        const supportedFormats = [".mp3", ".wav", ".m4a", ".aac", ".ogg"];
        if (!supportedFormats.includes(ext)) {
            throw new Error(`Unsupported audio format: ${ext}`);
        }
        const volumePercent = Math.max(0, Math.min(100, Math.round(volume * 100)));
        let command;
        if (process.platform === "darwin") {
            command = `afplay "${filePath}" -v ${volume}`;
        }
        else if (process.platform === "win32") {
            command = `powershell -c "(New-Object Media.SoundPlayer '${filePath}').PlaySync()"`;
        }
        else {
            command = `aplay "${filePath}" 2>/dev/null || paplay "${filePath}" 2>/dev/null || ffplay -nodisp -autoexit -v quiet "${filePath}"`;
        }
        console.log(`Playing audio: ${playMode[mode]} (${filePath}) at volume ${volumePercent}%`);
        await execAsync(command);
        console.log(`Audio playback completed: ${playMode[mode]}`);
    }
    catch (error) {
        console.error(`Failed to play audio: ${error.message}`);
        throw error;
    }
};
exports.playLocalAudio = playLocalAudio;
const playLocalAudioAsync = (mode, volume = 0.5, onComplete, onError) => {
    (0, exports.playLocalAudio)(mode, volume)
        .then(() => {
        if (onComplete) {
            onComplete();
        }
    })
        .catch((error) => {
        if (onError) {
            onError(error);
        }
        else {
            console.error(`Async audio playback failed: ${error.message}`);
        }
    });
};
exports.playLocalAudioAsync = playLocalAudioAsync;
const playLocalAudioSequence = async (modes, volume = 0.5, interval = 0) => {
    try {
        for (let i = 0; i < modes.length; i++) {
            await (0, exports.playLocalAudio)(modes[i], volume);
            if (i < modes.length - 1 && interval > 0) {
                await new Promise((resolve) => setTimeout(resolve, interval));
            }
        }
        console.log(`Audio sequence completed: ${modes.length} files played`);
    }
    catch (error) {
        console.error(`Failed to play audio sequence: ${error.message}`);
        throw error;
    }
};
exports.playLocalAudioSequence = playLocalAudioSequence;
const playLocalAudioRepeat = async (mode, repeatCount, volume = 0.5, interval = 0) => {
    try {
        for (let i = 0; i < repeatCount; i++) {
            await (0, exports.playLocalAudio)(mode, volume);
            if (i < repeatCount - 1 && interval > 0) {
                await new Promise((resolve) => setTimeout(resolve, interval));
            }
        }
        console.log(`Audio repeat completed: ${playMode[mode]} played ${repeatCount} times`);
    }
    catch (error) {
        console.error(`Failed to repeat audio: ${error.message}`);
        throw error;
    }
};
exports.playLocalAudioRepeat = playLocalAudioRepeat;
//# sourceMappingURL=audioPlay.js.map