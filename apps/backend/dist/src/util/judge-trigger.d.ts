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
export declare const judgeTrigger: (message: string, options?: {
    isMute?: boolean;
    state?: State;
}) => Promise<void>;
export declare const ledTrigger: (state: State) => Promise<void>;
