"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.judgeTrigger = void 0;
const axios_1 = require("axios");
const audioPlay_1 = require("./audioPlay");
const judgeTrigger = async (message) => {
    setTimeout(() => {
        (0, audioPlay_1.playLocalAudio)(audioPlay_1.playMode.GEAR);
    }, 1000);
    axios_1.default
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
exports.judgeTrigger = judgeTrigger;
//# sourceMappingURL=judge-trigger.js.map