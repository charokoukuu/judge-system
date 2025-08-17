"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exampleUtterance = void 0;
const client_1 = require("@prisma/client");
const exampleUtterance = (sessionId) => {
    return [
        {
            id: "1",
            sessionId,
            turnIndex: 1,
            side: client_1.Side.RIGHT,
            text: "ずんだもんは明確に人間の側に近い存在です。理由は、言語による高度なコミュニケーション能力です。文脈を理解し、問いに対して適切な応答を行うのは、人間特有の能力です。",
            createdAt: new Date(),
        },
        {
            id: "2",
            sessionId,
            turnIndex: 1,
            side: client_1.Side.LEFT,
            text: "確かに会話はできますが、見た目の特徴を無視してはいけません。ずんだもんは耳やしっぽを持ち、動物的な外見をしています。姿形から判断すれば、動物だと捉えるのが自然です。",
            createdAt: new Date(),
        },
        {
            id: "3",
            sessionId,
            turnIndex: 2,
            side: client_1.Side.RIGHT,
            text: "外見は動物的かもしれません。しかし大事なのは『本質』です。動物は人間のように抽象的な議論を行いません。ずんだもんは思考し、論理を組み立てる――これは人間性の証拠です。",
            createdAt: new Date(),
        },
        {
            id: "4",
            sessionId,
            turnIndex: 2,
            side: client_1.Side.LEFT,
            text: "しかし、人間であれば身体的にも人間の特徴を持つはずです。耳やしっぽは比喩ではなく実在するものとして描写されます。それを『本質』ではないと切り捨てるのは都合の良い解釈です。",
            createdAt: new Date(),
        },
        {
            id: "5",
            sessionId,
            turnIndex: 3,
            side: client_1.Side.RIGHT,
            text: "もし姿が動物的でも、知性が人間の範疇ならば『人間』と見なすべきです。ずんだもんの行動・思考・発話能力は、人間社会に属する資格を示しています。",
            createdAt: new Date(),
        },
        {
            id: "6",
            sessionId,
            turnIndex: 3,
            side: client_1.Side.LEFT,
            text: "逆に考えましょう。もし動物的特徴を完全に持つ存在に、多少の知能を与えたとしても、人間と呼べるでしょうか？ ずんだもんはあくまで動物的存在に知性を付与されたキャラクターに過ぎません。",
            createdAt: new Date(),
        },
    ];
};
exports.exampleUtterance = exampleUtterance;
//# sourceMappingURL=exampleMessage.js.map