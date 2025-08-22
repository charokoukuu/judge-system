export declare enum State {
    idle = "idle",
    loading = "loading",
    judging = "judging",
    left = "left",
    right = "right",
    recordingL = "recordingL",
    recordingR = "recordingR",
    finishL = "finishL",
    finishR = "finishR"
}
export declare const judgeTrigger: (message: string, isMute?: boolean) => Promise<void>;
export declare const ledTrigger: (state: State) => Promise<void>;
