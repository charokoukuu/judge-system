import axios from "axios";
import { playLocalAudio, playMode } from "./audioPlay";

export enum State {
  idle = "idle",
  loading = "loading",
  judging = "judging",
  left = "left",
  right = "right",
  recordingL = "recordingL",
  recordingR = "recordingR",
  finishL = "finishL",
  finishR = "finishR",
}

export const judgeTrigger = async (message: string, isMute?: boolean) => {
  setTimeout(() => {
    if (!isMute) {
      playLocalAudio(playMode.GEAR);
    }
  }, 1000);
  axios
    .post("http://localhost:9000/send/cybergear", {
      message: message,
    })
    .then((response) => {
      console.log("Response:", response.data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
};

export const ledTrigger = async (state: State) => {
  axios
    .post("http://localhost:9000/send/led", {
      message: `${0},${state}`,
    })
    .then((response) => {
      console.log("Response:", response.data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
};
