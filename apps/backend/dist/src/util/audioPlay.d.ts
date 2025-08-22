export declare enum playMode {
    GEAR = 0,
    VICTORY_RIGHT = 1,
    VICTORY_LEFT = 2,
    MAGIC_SCALE = 3,
    TURN_START = 4,
    JUDGMENT = 5,
    ERROR = 6
}
export declare const audioPlaySync: (mode: playMode) => void;
export declare const playLocalAudio: (mode: playMode, volume?: number) => Promise<void>;
export declare const playLocalAudioAsync: (mode: playMode, volume?: number, onComplete?: () => void, onError?: (error: Error) => void) => void;
export declare const playLocalAudioSequence: (modes: playMode[], volume?: number, interval?: number) => Promise<void>;
export declare const playLocalAudioRepeat: (mode: playMode, repeatCount: number, volume?: number, interval?: number) => Promise<void>;
