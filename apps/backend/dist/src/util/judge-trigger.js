"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ledTrigger = exports.judgeTrigger = exports.State = void 0;
const axios_1 = require("axios");
const audioPlay_1 = require("./audioPlay");
var State;
(function (State) {
    State["idle"] = "idle";
    State["loading"] = "loading";
    State["judging"] = "judging";
    State["left"] = "left";
    State["right"] = "right";
    State["recordingL"] = "recordingL";
    State["recordingR"] = "recordingR";
    State["finishL"] = "finishL";
    State["finishR"] = "finishR";
})(State || (exports.State = State = {}));
const judgeTrigger = async (message, options) => {
    const { isMute, state } = options || { state: State.idle };
    setTimeout(() => {
        if (!isMute) {
            (0, audioPlay_1.playLocalAudio)(audioPlay_1.playMode.GEAR);
        }
    }, 700);
    axios_1.default
        .post("http://localhost:9000/send/cybergear", {
        message: `${message},${state}`,
    })
        .then((response) => {
        console.log("Response:", response.data);
    })
        .catch((error) => {
        console.error("Error:", error);
    });
    axios_1.default
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
exports.judgeTrigger = judgeTrigger;
const ledTrigger = async (state) => {
    axios_1.default
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
exports.ledTrigger = ledTrigger;
//# sourceMappingURL=judge-trigger.js.map