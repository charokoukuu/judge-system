import axios from "axios";

export const judgeTrigger = async (message: string) => {
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
