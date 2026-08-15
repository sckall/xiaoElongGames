/**
 * 《鳄龙咆哮》本地 3D 客户端 UI 冒烟：进详情页 → 选英雄 → 观察对局并截图。
 * 用法：先启动前端(5173)，`node scripts/smoke-corcodragon-fight.mjs`
 * 输出：docs/screenshots/corcodragon-fight/（截图留档）
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.TM_WEB ?? 'http://127.0.0.1:5173';
const OUT = fileURLToPath(new URL('../docs/screenshots/corcodragon-fight/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.log('⚠️ pageerror:', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('⚠️ console.error:', msg.text().slice(0, 200));
  });

  await page.goto(BASE);
  await page.waitForSelector('.setup-panel');
  await page.click('button.primary-btn.big');
  await page.waitForSelector('.hall-page');
  await page.locator('.hall-card').filter({ hasText: '鳄龙咆哮' }).click();
  await page.waitForSelector('.ccf-detail-panel');
  const aiStyle = process.env.TM_AI_STYLE === 'movement' ? 'movement' : 'combat';
  if (aiStyle === 'movement') {
    await page.locator('.bot-select').last().selectOption('movement');
    await sleep(200);
  }
  await sleep(300);
  await shot(page, `2026-08-15-detail${aiStyle === 'movement' ? '-movement' : ''}`);
  console.log(`✅ detail（AI=${aiStyle}）`);

  await page.click('button:has-text("开始（本地 vs AI）")');
  await page.waitForSelector('.ccf-hero-grid');
  await sleep(400);
  await shot(page, '2026-08-15-hero-select');
  console.log('✅ hero-select');

  await page.locator('.ccf-hero-card').first().click();
  await page.waitForSelector('.ccf-canvas-host canvas');
  // 等世界与玩家模型初始化
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (await page.locator('.ccf-crosshair').count()) break;
  }
  await sleep(1800);
  await shot(page, '2026-08-15-battle');
  console.log('✅ battle');

  // 等待 bot 对局推进，观察击杀信息/计分变化
  await sleep(12_000);
  await shot(page, '2026-08-15-battle-late');
  if (aiStyle === 'movement') {
    const kills = await page.locator('.ccf-kill-item').count();
    if (kills > 0) {
      console.log(`❌ 移动测试 AI 出现 ${kills} 条击杀信息`);
      process.exit(1);
    }
    console.log('✅ 移动测试 AI：12 秒内无射击/击杀');
  }
  console.log('✅ battle-late');

  // 计分板（Tab 在未锁鼠标时也应可用）
  await page.keyboard.press('Tab');
  await sleep(400);
  await shot(page, '2026-08-15-scoreboard');
  console.log('✅ scoreboard');
  await page.keyboard.press('Tab');

  await page.close();
  console.log('🎉 本地冒烟完成');
} finally {
  await browser.close();
}
