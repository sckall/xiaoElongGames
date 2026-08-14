/**
 * 联机服务端端到端冒烟测试：
 * 建房 → 加入 → 开局 → 双客户端按状态随机行动 → 断线重连 → 校验。
 * 用法：先启动服务端，再 `node scripts/smoke.mjs [服务器地址]`
 */
import { io } from 'socket.io-client';

const URL = process.argv[2] ?? 'http://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(msg) {
  console.error(`❌ 冒烟失败：${msg}`);
  process.exit(1);
}

function makeClient() {
  const s = io(URL, { transports: ['websocket', 'polling'] });
  const out = { s, states: 0, errors: [], lastView: null, gameOver: false };
  s.on('error', (m) => out.errors.push(m));
  s.on('state', (v) => {
    out.states++;
    out.lastView = v;
    if (v.phase === 'gameOver') out.gameOver = true;
  });
  return out;
}

function emitAck(s, ev, payload) {
  return new Promise((resolve) => s.emit(ev, payload, resolve));
}

function autoPlay(out) {
  const v = out.lastView;
  if (!v || out.gameOver || !v.isYourTurn || v.phase !== 'playing') return;
  const magics = v.legalMagics;
  if (magics.length > 0 && Math.random() < 0.8) {
    out.s.emit('declareSpell', { magic: magics[Math.floor(Math.random() * magics.length)] });
  } else {
    out.s.emit('endTurn');
  }
}

// 1. 建房（带 2 个 AI）
const A = makeClient();
await sleep(300);
const created = await emitAck(A.s, 'createRoom', { name: '冒烟房主', botCount: 2 });
if (!created.ok) fail(`建房失败：${created.error}`);
console.log(`✅ 房间已创建：${created.code}`);

// 2. 第二人加入
const B = makeClient();
await sleep(300);
const joined = await emitAck(B.s, 'joinRoom', { code: created.code, name: '冒烟房客' });
if (!joined.ok) fail(`加入失败：${joined.error}`);
console.log('✅ 第二人加入成功');

// 3. 开局
await sleep(300);
A.s.emit('startGame');
await sleep(600);
if (!A.lastView || !B.lastView) fail('开局后未收到游戏状态');
console.log('✅ 对局开始，双方均收到状态');

// 4. 随机行动直到游戏结束（或超时）
const deadline = Date.now() + 90_000;
while (Date.now() < deadline && !(A.gameOver && B.gameOver)) {
  autoPlay(A);
  autoPlay(B);
  await sleep(350);
}
if (!A.gameOver && !B.gameOver) fail('90 秒内对局未结束');
console.log('✅ 对局正常结束（联机游戏可达终局）');

// 5. 断线重连：房主断开后凭 token 重连
A.s.disconnect();
await sleep(800);
const C = makeClient();
await sleep(300);
const re = await emitAck(C.s, 'joinRoom', {
  code: created.code,
  name: '冒烟房主',
  token: created.playerId,
});
if (!re.ok) fail(`重连失败：${re.error}`);
await sleep(1500);
if (C.states === 0) fail('重连后未收到游戏状态');
console.log('✅ 断线重连成功');

const errors = [...A.errors, ...B.errors, ...C.errors].filter(
  (e) => !String(e).includes('断开'),
);
if (errors.length > 0) fail(`收到服务端错误：${errors.join('；')}`);

console.log(`✅ 冒烟通过：A states=${A.states}，B states=${B.states}，C states=${C.states}`);
A.s.disconnect();
B.s.disconnect();
C.s.disconnect();
process.exit(0);
