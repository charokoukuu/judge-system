import p5 from "p5";

const sketch = (p: p5) => {
  p.setup = () => {
    // @ts-ignore: p5.js型定義の問題を回避
    p.createCanvas(400, 400);
  };

  p.draw = () => {
    p.background(220);
    p.fill(0);
    // @ts-ignore: p5.js型定義の問題を回避
    p.ellipse(p.width / 2, p.height / 2, 100, 100);
  };
};

new p5(sketch);
