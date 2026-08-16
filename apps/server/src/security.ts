/**
 * 服务端安全基元：IP 识别（防 XFF 伪造）、输入裁剪、房间设置白名单。
 *
 * 原则：只信任显式开启 TRUST_PROXY=1 时反代注入的 X-Forwarded-For；
 * 直连部署时 XFF 是客户端可伪造的请求头，绝不能用于限流/审计。
 */
import { AUTOPILOT_DELAYS, DEFAULT_ROOM_SETTINGS, type RoomSettings } from '@tm/rules';

export const MAX_JOIN_CODE_LEN = 16;
/** realtime 每玩家每秒最大输入条数（洪泛保护；正常客户端 look+move 节流后约 120/s） */
export const MAX_RT_INPUT_PER_SEC = 240;
const AI_SPEED_MIN = 300;
const AI_SPEED_MAX = 4000;

export interface ClientAddressInfo {
  address?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/** 获取用于限流/审计的客户端 IP；未启用信任代理时忽略 X-Forwarded-For */
export function clientIp(handshake: ClientAddressInfo, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = handshake.headers?.['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.trim()) {
      const first = fwd.split(',')[0].trim();
      if (first) return first.slice(0, 64);
    }
  }
  const addr = handshake.address;
  return typeof addr === 'string' && addr ? addr.slice(0, 64) : 'unknown';
}

/** 房间码：只保留字母数字并限长，防止超长字符串/异常字符进入房间表 */
export function sanitizeJoinCode(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_JOIN_CODE_LEN);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 房间设置白名单：任何伪造/越界字段都会被忽略或钳制 */
export function sanitizeRoomSettings(raw: unknown): RoomSettings {
  const next: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  if (!isRecord(raw)) return next;
  if (raw.aiSpeed != null) {
    const v = Math.floor(Number(raw.aiSpeed));
    if (Number.isFinite(v)) {
      next.aiSpeed = Math.max(AI_SPEED_MIN, Math.min(AI_SPEED_MAX, v));
    }
  }
  if (typeof raw.autopilot === 'string' && raw.autopilot in AUTOPILOT_DELAYS) {
    next.autopilot = raw.autopilot as RoomSettings['autopilot'];
  }
  return next;
}
