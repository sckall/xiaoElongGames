/**
 * 账号级 userId 的生成与持久化。
 *
 * 设计：
 * - 首次访问：生成 UUIDv4，写到 localStorage['tm-user-id']，永久不变
 * - 后续访问：直接读 localStorage
 * - 失效/缺失：重新生成（用户清缓存也算"换设备"）
 *
 * 未来扩展点：
 * - Steamworks 接入后：用真实 SteamID（string）覆盖
 * - OAuth 接入后：用 OAuth sub 覆盖
 * - 切换账号功能：暴露 setUserId() 入口
 *
 * 注意：
 * - 这是**纯前端**方案（无服务端校验），仅用于「同一浏览器跨会话识别」
 * - 不要把它当「不可伪造的身份」使用——真正的鉴权要靠服务端 Steamworks / OAuth 验签
 */

const STORAGE_KEY = 'tm-user-id';

/**
 * 生成符合 v8.1 协议的 userId（UUIDv4）。
 * 用 crypto.randomUUID()（现代浏览器原生支持，IE 不支持但本项目不要求）。
 */
function genUserId(): string {
  // crypto.randomUUID 在 https / localhost 下可用；本地 file:// 不可用
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 兜底：低质量随机（仅理论可能命中）
  return 'user-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

let cached: string | null = null;

/**
 * 获取当前用户的 userId。首次访问自动生成并持久化。
 * 调用方无需关心缓存。
 */
export function getUserId(): string {
  if (cached) return cached;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && /^[a-zA-Z0-9-]{8,64}$/.test(stored)) {
      cached = stored;
      return stored;
    }
  } catch {
    // localStorage 不可用（如隐私模式），降级到内存
  }
  const fresh = genUserId();
  try {
    localStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    // ignore
  }
  cached = fresh;
  return fresh;
}

/**
 * 显式重置 userId（测试 / 「切换账号」功能用）。
 * 重置后下次 getUserId() 会生成新的。
 */
export function resetUserId(): void {
  cached = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}