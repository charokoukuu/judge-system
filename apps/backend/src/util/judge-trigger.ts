import axios from "axios";
import { playLocalAudio, playMode } from "./audioPlay";

export const judgeTrigger = async (message: string) => {
  setTimeout(() => {
    playLocalAudio(playMode.GEAR);
  }, 1000);
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
