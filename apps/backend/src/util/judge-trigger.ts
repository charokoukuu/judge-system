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

export const judgeTrigger = async (
  message: string,
  options?: { isMute?: boolean; state?: State }
) => {
  const { isMute, state } = options || { state: State.idle };
  setTimeout(() => {
    if (!isMute) {
      playLocalAudio(playMode.GEAR);
    }
  }, 700);
  axios
    .post("http://localhost:9000/send/cybergear", {
      message: `${message},${state}`,
    })
    .then((response) => {
      console.log("Response:", response.data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
  axios
    .post("http://localhost:9000/send/dial", {
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
