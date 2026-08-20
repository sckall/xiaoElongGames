/**
 * 服务端安全冒烟（需先启动服务端）：
 * 1) 未设 TRUST_PROXY 时，伪造不同 X-Forwarded-For 不能绕过每 IP 连接限流；
 * 2) 超长房间码/垃圾设置 payload 不会导致崩溃或污染房间状态。
 * 用法：`pnpm --filter @tm/server exec node scripts/security-smoke.mjs`
 */
import { io } from 'socket.io-client';

const URL = process.env.TM_SERVER ?? 'http://127.0.0.1:8787';
const MAX_CONNS = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  console.error(`❌ ${msg}`);
  process.exit(1);
};

// 1) 伪造不同 XFF 的 9 个连接：默认不信任 XFF → 第 9 个应被限流断开
const sockets = [];
for (let i = 0; i < MAX_CONNS; i++) {
  const s = io(URL, {
    transports: ['websocket'],
    extraHeaders: { 'x-forwarded-for': `6.6.6.${i + 1}` },
  });
  sockets.push(s);
}
await Promise.all(sockets.map((s) => new Promise((r) => s.on('connect', r))));
let ninthConnected = false;
const ninth = io(URL, {
  transports: ['websocket'],
  extraHeaders: { 'x-forwarded-for': '9.9.9.9' },
});
ninth.on('connect', () => (ninthConnected = true));
ninth.on('disconnect', () => (ninthConnected = false));
await sleep(1500);
if (ninthConnected) fail('伪造 XFF 绕过了每 IP 连接限流（TRUST_PROXY 应默认关闭）');
console.log('✅ 伪造 XFF 无法绕过连接限流');

// 2) 超长房间码 + 垃圾房间设置
const a = sockets[0];
const created = await new Promise((resolve) =>
  a.emit('createRoom', { name: '安全测试', botCount: 0, settings: { aiSpeed: 999999, autopilot: 'hack', isAdmin: true } }, resolve),
);
if (!created.ok) fail(`建房失败：${created.error}`);
const joined = await new Promise((resolve) =>
  a.emit('joinRoom', { code: 'A'.repeat(10000) + '!@#', name: 'x' }, resolve),
);
if (joined.ok) fail('超长/非法房间码不应成功加入');
const rooms = await new Promise((resolve) => a.emit('listRooms', resolve));
const item = rooms.rooms.find((r) => r.code === created.code);
if (!item) fail('房间列表缺少新建房间');
console.log('✅ 超长房间码被拒绝，垃圾设置未导致异常');

sockets.forEach((s) => s.disconnect());
ninth.disconnect();
await sleep(300);
console.log('🎉 安全冒烟通过');
process.exit(0);
