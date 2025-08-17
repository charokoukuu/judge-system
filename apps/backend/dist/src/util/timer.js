"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timer = void 0;
const timer = async (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};
exports.timer = timer;
//# sourceMappingURL=timer.js.map