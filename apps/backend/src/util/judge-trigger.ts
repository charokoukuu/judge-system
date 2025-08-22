import axios from "axios";
import { playLocalAudio, playMode } from "./audioPlay";

export const judgeTrigger = async (message: string) => {
  playLocalAudio(playMode.GEAR);
  axios
    .post("http://localhost:9000/send", {
      message: message,
    })
    .then((response) => {
      console.log("Response:", response.data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
};
