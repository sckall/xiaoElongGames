/**
 * 联机服务端端到端冒烟测试：
 * 建房 → 普通加入（不带 token，回归「同机多窗口无法开局」bug）→ 房间设置 →
 * 开局 → 随机对战至终局 → 断线重连 → 全员退出后房间关闭。
 * 用法：先启动服务端，再 `node scripts/smoke.mjs [服务器地址]`
 */
import { io } from 'socket.io-client';

const URL = process.argv[2] ?? 'http://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;

function fail(msg) {
  console.error(`❌ 冒烟失败：${msg}`);
  failed = true;
}

function makeClient() {
  const s = io(URL, { transports: ['websocket', 'polling'] });
  const out = { s, states: 0, errors: [], lastView: null, gameOver: false, lobby: null };
  s.on('error', (m) => out.errors.push(m));
  s.on('lobby', (info) => (out.lobby = info));
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

// 1. 建房（带 1 个 AI + 密码）
const A = makeClient();
await sleep(300);
const created = await emitAck(A.s, 'createRoom', { name: '冒烟房主', botCount: 1, password: 'pw123' });
if (!created.ok) fail(`建房失败：${created.error}`);
else console.log(`✅ 房间已创建（带密码）：${created.code}`);

// 2. 密码校验：无密码/错误密码被拒，正确密码可加入
const B = makeClient();
await sleep(300);
const noPw = await emitAck(B.s, 'joinRoom', { code: created.code, name: '冒烟房客' });
if (noPw.ok) fail('无密码加入带锁房间应当被拒绝');
const wrongPw = await emitAck(B.s, 'joinRoom', { code: created.code, name: '冒烟房客', password: 'x' });
if (wrongPw.ok) fail('错误密码应当被拒绝');
const joined = await emitAck(B.s, 'joinRoom', { code: created.code, name: '冒烟房客', password: 'pw123' });
if (!joined.ok) fail(`正确密码加入失败：${joined.error}`);
await sleep(300);
if (!A.lobby || A.lobby.humanCount !== 2) fail(`大厅应有 2 名真人，实际 ${A.lobby?.humanCount}`);
else console.log('✅ 密码校验生效（无密码/错误密码拒绝，正确密码加入）');

// 2.5 房间列表应包含带锁房间
const listRes = await new Promise((resolve) => A.s.emit('listRooms', resolve));
const found = (listRes?.rooms ?? []).find((r) => r.code === created.code);
if (!found || !found.hasPassword || found.playerCount !== 3) {
  fail(`房间列表异常：${JSON.stringify(found)}`);
} else {
  console.log('✅ 房间列表返回带锁房间（人数 3/5）');
}

// 3. 房间设置：托管策略改为立即托管、AI 提速
A.s.emit('updateSettings', { settings: { autopilot: 'instant', aiSpeed: 500 } });
await sleep(300);
if (A.lobby?.settings.autopilot !== 'instant') fail('updateSettings 未生效');
else console.log('✅ 房间设置（托管策略/AI 节奏）生效');

// 4. 开局
A.s.emit('startGame');
await sleep(600);
if (!A.lastView || !B.lastView) fail('开局后未收到游戏状态');
else console.log('✅ 对局开始，双方均收到状态');

// 5. 随机行动直到游戏结束（或超时）；轮末由房主 A 手动开始下一轮
const deadline = Date.now() + 90_000;
while (Date.now() < deadline && !(A.gameOver && B.gameOver)) {
  if (A.lastView?.phase === 'roundEnd') {
    A.s.emit('nextRound');
    await sleep(500);
    continue;
  }
  autoPlay(A);
  autoPlay(B);
  await sleep(300);
}
if (!A.gameOver && !B.gameOver) fail('90 秒内对局未结束');
else console.log('✅ 对局正常结束（联机游戏可达终局）');

// 6. 断线重连：房主断开后凭 token 重连
A.s.disconnect();
await sleep(800);
const C = makeClient();
await sleep(300);
const re = await emitAck(C.s, 'joinRoom', {
  code: created.code,
  name: '冒烟房主',
  token: created.playerId,
});
if (!re.ok || !re.rejoin) fail(`重连失败：${re.error ?? '未识别为 rejoin'}`);
await sleep(1200);
if (C.states === 0) fail('重连后未收到游戏状态');
else console.log('✅ 断线重连恢复座位');

// 7. 全员退出 → 房间关闭
C.s.emit('leaveRoom');
B.s.emit('leaveRoom');
await sleep(800);
const health = await fetch(`${URL}/healthz`).then((r) => r.json()).catch(() => null);
if (!health) fail('healthz 不可用');
else if (health.rooms !== 0) fail(`全员退出后房间未关闭（rooms=${health.rooms}）`);
else console.log('✅ 全员退出后房间自动关闭');

const errors = [...A.errors, ...B.errors, ...C.errors].filter((e) => !String(e).includes('断开'));
if (errors.length > 0) fail(`收到服务端错误：${errors.join('；')}`);

C.s.disconnect();
B.s.disconnect();
A.s.disconnect();

if (failed) process.exit(1);
console.log(`✅ 冒烟全部通过：A=${A.states} states，B=${B.states}，C=${C.states}`);
process.exit(0);
