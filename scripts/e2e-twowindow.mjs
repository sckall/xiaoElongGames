/**
 * 双窗口联机回归测试（复现「本地多人联机无法开启游戏」问题）。
 * 两个页面共享同一浏览器上下文（同源共享 localStorage，与真实同机双窗口一致）：
 * A 创建房间 → B 加入 → 大厅应显示 2 名真人 → 房主点开始 → 双方都应进入对局界面。
 * 用法：先启动服务端(8787)与前端(5173)，再 `node scripts/e2e-twowindow.mjs`
 */
import { chromium } from 'playwright';

const BASE = process.env.TM_WEB ?? 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
const fail = (m) => {
  console.error(`❌ 失败：${m}`);
  failed = true;
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  // ---- 窗口 A：创建房间 ----
  const A = await ctx.newPage();
  await A.goto(BASE);
  await A.waitForSelector('.setup-panel');
  await A.fill('.setup-panel input[type=text], .setup-panel input:not([maxlength="4"])', '房主测试');
  await A.click('text=🌐 联机对战');
  await A.click('button.primary-btn.big');
  await A.waitForSelector('.lobby-panel');
  await A.fill('.lobby-panel input:first-of-type', '房主测试');
  // AI 选 0，保证只能靠第二个真人开局
  await A.selectOption('.lobby-panel select.bot-select', '0');
  await A.click('text=➕ 创建房间');
  await A.waitForSelector('.room-code');
  const code = (await A.textContent('.rc-code'))?.trim().slice(0, 4) ?? '';
  console.log(`✅ A 创建房间：${code}`);

  // ---- 窗口 B（同上下文 = 同 localStorage）：加入 ----
  const B = await ctx.newPage();
  await B.goto(BASE);
  await B.waitForSelector('.setup-panel');
  await B.click('text=🌐 联机对战');
  await B.click('button.primary-btn.big');
  await B.waitForSelector('.lobby-panel');
  await B.fill('.lobby-panel input:first-of-type', '房客测试');
  await B.fill('.code-input', code);
  await B.locator('button.primary-btn', { hasText: '加入' }).click();
  await B.waitForSelector('.room-code', { timeout: 10000 }).catch(async () => {
    const err = await B.locator('.error-box').textContent().catch(() => null);
    fail(`B 加入失败：${err ?? '未知错误'}`);
  });
  if (failed) throw new Error('B join failed');
  console.log('✅ B 加入成功');

  // ---- 大厅应显示 2 名真人 ----
  await sleep(500);
  const playersA = await A.locator('.room-players li').count();
  const playersB = await B.locator('.room-players li').count();
  if (playersA !== 2) fail(`A 大厅应有 2 名玩家，实际 ${playersA}（旧 bug：B 会顶掉 A）`);
  if (playersB !== 2) fail(`B 大厅应有 2 名玩家，实际 ${playersB}`);
  else console.log('✅ 双方大厅均显示 2 名玩家');

  // ---- 房主开始 ----
  const startBtn = A.locator('button.primary-btn.big');
  if (await startBtn.isDisabled()) fail('开始按钮被禁用（人数不足）');
  await startBtn.click();
  await A.waitForSelector('.game-page', { timeout: 8000 });
  await B.waitForSelector('.game-page', { timeout: 8000 });
  console.log('✅ 双方均进入对局界面，开局成功');

  // 双方都应是各自视角（自己手牌为牌背）
  const backsA = await A.locator('.seat.you .card-back').count();
  const backsB = await B.locator('.seat.you .card-back').count();
  if (backsA !== 5) fail(`A 视角应有 5 张牌背，实际 ${backsA}`);
  if (backsB !== 5) fail(`B 视角应有 5 张牌背，实际 ${backsB}`);
  else console.log('✅ 双方视角正确（自己手牌背对自己）');
} finally {
  await browser.close();
}

if (failed) process.exit(1);
console.log('✅ 双窗口联机回归测试通过');
process.exit(0);
