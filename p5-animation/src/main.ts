import p5 from "p5";

// 粒子の定義
interface Particle {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  floatingX: number;
  floatingY: number;
  floatingZ: number;
  size: number;
  opacity: number;
  noise: number;
}

const sketch = (p: p5) => {
  let particles: Particle[] = [];
  let rotationX = 0;
  let rotationY = 0;
  let formationProgress = 0;
  const sphereRadius = 80;
  const numParticles = 800;

  p.setup = () => {
    // @ts-ignore: p5.js型定義の問題を回避
    p.createCanvas(800, 600, p.WEBGL);

    // 粒子を初期化
    for (let i = 0; i < numParticles; i++) {
      // 画面全体にランダムに散らばった初期位置（より狭い範囲）
      const floatingX = p.random(-300, 300);
      const floatingY = p.random(-200, 200);
      const floatingZ = p.random(-200, 200);

      // 球体上の目標位置
      const phi = p.random(0, p.TWO_PI);
      const theta = p.random(0, p.PI);
      const r = sphereRadius * (0.9 + p.random(0.2));

      const targetX = r * p.sin(theta) * p.cos(phi);
      const targetY = r * p.sin(theta) * p.sin(phi);
      const targetZ = r * p.cos(theta);

      particles.push({
        x: floatingX,
        y: floatingY,
        z: floatingZ,
        targetX: targetX,
        targetY: targetY,
        targetZ: targetZ,
        floatingX: floatingX,
        floatingY: floatingY,
        floatingZ: floatingZ,
        size: p.random(1, 3),
        opacity: p.random(100, 200),
        noise: p.random(1000),
      });
    }
  };

  p.draw = () => {
    // 背景
    // @ts-ignore
    p.background(5, 15, 35);

    // ライティング
    // @ts-ignore
    p.ambientLight(60, 80, 120);
    // @ts-ignore
    p.pointLight(150, 180, 255, 0, 0, 200);

    // 形成の進行度を更新
    // @ts-ignore
    formationProgress = (p.sin(p.frameCount * 0.01) + 1) * 0.5;

    // 回転を更新
    rotationX += 0.005;
    rotationY += 0.008;

    // 3D変換
    // @ts-ignore
    p.rotateX(rotationX);
    // @ts-ignore
    p.rotateY(rotationY);

    // 粒子を描画
    for (let particle of particles) {
      // ノイズによる浮遊の動き
      // @ts-ignore
      const time = p.frameCount * 0.01;
      // @ts-ignore
      const noiseX = (p.noise(particle.noise + time) - 0.5) * 20;
      // @ts-ignore
      const noiseY = (p.noise(particle.noise + 100 + time) - 0.5) * 20;
      // @ts-ignore
      const noiseZ = (p.noise(particle.noise + 200 + time) - 0.5) * 20;

      // 現在位置を計算（浮遊位置から球体位置への補間）
      const currentFloatingX = particle.floatingX + noiseX;
      const currentFloatingY = particle.floatingY + noiseY;
      const currentFloatingZ = particle.floatingZ + noiseZ;

      particle.x = p.lerp(
        currentFloatingX,
        particle.targetX,
        formationProgress
      );
      particle.y = p.lerp(
        currentFloatingY,
        particle.targetY,
        formationProgress
      );
      particle.z = p.lerp(
        currentFloatingZ,
        particle.targetZ,
        formationProgress
      );

      // 透明度の変化
      // @ts-ignore
      const pulse = p.sin(p.frameCount * 0.02 + particle.noise) * 0.3 + 0.7;
      const currentOpacity = particle.opacity * pulse;

      // @ts-ignore
      p.push();
      // @ts-ignore
      p.translate(particle.x, particle.y, particle.z);

      // 水色の粒子
      p.noStroke();
      // @ts-ignore
      const colorShift = p.sin(p.frameCount * 0.015 + particle.noise) * 50;
      p.fill(50 + colorShift, 150 + colorShift, 255, currentOpacity);

      // 粒子を描画
      // @ts-ignore
      p.sphere(particle.size);

      // @ts-ignore
      p.pop();
    }

    // 中心の光るコア
    if (formationProgress > 0.6) {
      // @ts-ignore
      p.push();
      p.noStroke();
      const coreOpacity = (formationProgress - 0.6) * 150;
      p.fill(100, 200, 255, coreOpacity);
      // @ts-ignore
      p.sphere(12);
      // @ts-ignore
      p.pop();
    }
  };
};

new p5(sketch);
