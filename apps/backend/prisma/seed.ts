import { PrismaClient, Side, SessionState, Winner } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // 既存データを削除（開発環境用）
  await prisma.aIResponse.deleteMany();
  await prisma.verdict.deleteMany();
  await prisma.turnResult.deleteMany();
  await prisma.utterance.deleteMany();
  await prisma.session.deleteMany();

  console.log("🗑️  Cleared existing data");

  // サンプルセッション1: 完了済みの議論
  const session1 = await prisma.session.create({
    data: {
      id: "session_1",
      theme: "リモートワークは生産性を向上させるか",
      state: SessionState.FINISHED,
      createdAt: new Date("2024-08-15T10:00:00Z"),
      endedAt: new Date("2024-08-15T10:05:00Z"),
    },
  });

  // セッション1の発話データ
  await prisma.utterance.createMany({
    data: [
      {
        sessionId: session1.id,
        side: Side.RIGHT,
        turnIndex: 1,
        text: "リモートワークは確実に生産性を向上させます。通勤時間の削減により、その時間を業務に充てることができ、集中できる環境で作業することで質の高いアウトプットが期待できます。",
        createdAt: new Date("2024-08-15T10:00:30Z"),
      },
      {
        sessionId: session1.id,
        side: Side.LEFT,
        turnIndex: 1,
        text: "しかし、リモートワークではコミュニケーションが希薄になり、チームワークが損なわれます。対面でのやり取りがないことで、創造性やイノベーションが生まれにくくなるのが現実です。",
        createdAt: new Date("2024-08-15T10:01:00Z"),
      },
      {
        sessionId: session1.id,
        side: Side.RIGHT,
        turnIndex: 2,
        text: "デジタルツールの発達により、リモートでも効果的なコミュニケーションは可能です。むしろ、会議の効率化や文書化が進み、情報共有がより体系的に行われるようになります。",
        createdAt: new Date("2024-08-15T10:02:30Z"),
      },
      {
        sessionId: session1.id,
        side: Side.LEFT,
        turnIndex: 2,
        text: "ツールがあっても、人間の感情や微細なニュアンスは伝わりません。特に新入社員の教育や複雑なプロジェクトでは、対面でのサポートが不可欠です。",
        createdAt: new Date("2024-08-15T10:03:00Z"),
      },
      {
        sessionId: session1.id,
        side: Side.RIGHT,
        turnIndex: 3,
        text: "最終的に、リモートワークは個人の生産性を最大化し、ワークライフバランスを改善することで、長期的に企業全体のパフォーマンス向上に貢献します。",
        createdAt: new Date("2024-08-15T10:04:00Z"),
      },
      {
        sessionId: session1.id,
        side: Side.LEFT,
        turnIndex: 3,
        text: "短期的な効率は上がるかもしれませんが、長期的には組織の結束力低下、企業文化の希薄化により、持続可能な成長は困難になると考えます。",
        createdAt: new Date("2024-08-15T10:04:30Z"),
      },
    ],
  });

  // セッション1のターン結果
  await prisma.turnResult.createMany({
    data: [
      {
        sessionId: session1.id,
        turnIndex: 1,
        rate: 0.3, // 右側やや優勢
        scoresJson: {
          LOGIC: { right: 4, left: 3 },
          EVIDENCE: { right: 3, left: 3 },
          CLARITY: { right: 4, left: 3 },
        },
      },
      {
        sessionId: session1.id,
        turnIndex: 2,
        rate: 0.1, // 僅差で右側優勢
        scoresJson: {
          LOGIC: { right: 4, left: 4 },
          EVIDENCE: { right: 3, left: 3 },
          CLARITY: { right: 4, left: 3 },
        },
      },
      {
        sessionId: session1.id,
        turnIndex: 3,
        rate: 0.2, // 右側優勢
        scoresJson: {
          LOGIC: { right: 4, left: 3 },
          EVIDENCE: { right: 4, left: 3 },
          CLARITY: { right: 4, left: 4 },
        },
      },
    ],
  });

  // セッション1の最終判定
  await prisma.verdict.create({
    data: {
      sessionId: session1.id,
      winner: Winner.RIGHT,
      rationale:
        "右側の論者は、具体的な解決策と長期的視点を提示し、反論に対しても建設的な回答を行いました。データ駆動な議論展開が評価されます。",
    },
  });

  // セッション2: 進行中の議論
  const session2 = await prisma.session.create({
    data: {
      id: "session_2",
      theme: "AIは人間の雇用を奪うか",
      state: SessionState.TURN1_RIGHT,
      createdAt: new Date("2024-08-16T14:00:00Z"),
    },
  });

  // セッション3: 準備完了状態
  const session3 = await prisma.session.create({
    data: {
      id: "session_3",
      theme: "宇宙開発は地球の問題解決より優先されるべきか",
      state: SessionState.READY,
      createdAt: new Date("2024-08-16T15:00:00Z"),
    },
  });

  // セッション4: もう一つの完了済み議論
  const session4 = await prisma.session.create({
    data: {
      id: "session_4",
      theme: "学校教育でプログラミングは必修科目にするべきか",
      state: SessionState.FINISHED,
      createdAt: new Date("2024-08-14T09:00:00Z"),
      endedAt: new Date("2024-08-14T09:06:00Z"),
    },
  });

  // セッション4の発話データ（簡略版）
  await prisma.utterance.createMany({
    data: [
      {
        sessionId: session4.id,
        side: Side.RIGHT,
        turnIndex: 1,
        text: "プログラミングは21世紀の読み書きそろばんです。デジタル社会を生き抜くための基礎スキルとして、全ての子どもが学ぶべきです。",
      },
      {
        sessionId: session4.id,
        side: Side.LEFT,
        turnIndex: 1,
        text: "限られた授業時間で、国語や数学などの基礎学力が疎かになるリスクがあります。プログラミングは専門分野として、選択制にするべきです。",
      },
      {
        sessionId: session4.id,
        side: Side.RIGHT,
        turnIndex: 2,
        text: "プログラミング教育は論理的思考力を育成します。これは数学や理科の学習にも相乗効果をもたらし、全体的な学力向上に寄与します。",
      },
      {
        sessionId: session4.id,
        side: Side.LEFT,
        turnIndex: 2,
        text: "教員の指導力不足や設備の問題もあります。質の低い授業では逆効果になる可能性があり、まずは教育環境の整備が先決です。",
      },
      {
        sessionId: session4.id,
        side: Side.RIGHT,
        turnIndex: 3,
        text: "困難はありますが、段階的な導入と教員研修により解決可能です。将来の国際競争力のために、今から始めることが重要です。",
      },
      {
        sessionId: session4.id,
        side: Side.LEFT,
        turnIndex: 3,
        text: "急激な変化よりも、子どもたちの興味や適性を見極めながら、多様な選択肢を提供する教育システムが望ましいと考えます。",
      },
    ],
  });

  await prisma.turnResult.createMany({
    data: [
      {
        sessionId: session4.id,
        turnIndex: 1,
        rate: 0.4,
        scoresJson: {
          LOGIC: { right: 4, left: 3 },
          EVIDENCE: { right: 3, left: 3 },
          CLARITY: { right: 5, left: 4 },
        },
      },
      {
        sessionId: session4.id,
        turnIndex: 2,
        rate: -0.1, // 左側やや優勢
        scoresJson: {
          LOGIC: { right: 3, left: 4 },
          EVIDENCE: { right: 3, left: 4 },
          CLARITY: { right: 4, left: 4 },
        },
      },
      {
        sessionId: session4.id,
        turnIndex: 3,
        rate: 0.2,
        scoresJson: {
          LOGIC: { right: 4, left: 3 },
          EVIDENCE: { right: 4, left: 3 },
          CLARITY: { right: 4, left: 4 },
        },
      },
    ],
  });

  await prisma.verdict.create({
    data: {
      sessionId: session4.id,
      winner: Winner.RIGHT,
      rationale:
        "右側は将来性と教育効果を軸に一貫した主張を展開。左側の懸念点にも具体的な解決策を提示し、説得力のある議論でした。",
    },
  });

  // AIレスポンスのサンプル
  await prisma.aIResponse.createMany({
    data: [
      {
        sessionId: session1.id,
        turnIndex: 1,
        text: "第1ターンでは、右側がリモートワークのメリットを生産性の観点から論じ、左側がコミュニケーションの課題を指摘しました。",
      },
      {
        sessionId: session1.id,
        turnIndex: 2,
        text: "第2ターンでは、デジタルツールの活用可能性と人間的なコミュニケーションの重要性について、より深い議論が展開されました。",
      },
      {
        sessionId: session1.id,
        turnIndex: 3,
        text: "最終ターンでは、長期的な視点から両者の主張が示され、個人の生産性と組織の結束力のバランスが争点となりました。",
      },
    ],
  });

  console.log("✅ Seed completed successfully!");
  console.log(`📊 Created ${await prisma.session.count()} sessions`);
  console.log(`💬 Created ${await prisma.utterance.count()} utterances`);
  console.log(`📈 Created ${await prisma.turnResult.count()} turn results`);
  console.log(`⚖️ Created ${await prisma.verdict.count()} verdicts`);
  console.log(`🤖 Created ${await prisma.aIResponse.count()} AI responses`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
