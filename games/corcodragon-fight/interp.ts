/**
 * 联机渲染插值：按服务端时间戳在最近两个快照样本之间插值。
 * 参考 Gaffer On Games "Snapshot Interpolation"。
 * 保持零依赖纯函数，便于单测。
 */

export interface RemoteSample {
  /** 服务端引擎时钟 t（毫秒） */
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + delta * t;
}

/**
 * 渲染时间 = 客户端当前时间 - 网络时钟偏移 - 插值缓冲；
 * 在 straddle renderTime 的两个样本间线性插值。
 * - renderTime 早于最早样本 → 用最早样本；
 * - renderTime 晚于最新样本 → 用最新样本（不做外推，避免橡皮筋）。
 */
export function sampleRemote(
  samples: RemoteSample[],
  t: number,
): { x: number; y: number; z: number; yaw: number } | null {
  if (samples.length === 0) return null;
  if (t <= samples[0].t) {
    const s = samples[0];
    return { x: s.x, y: s.y, z: s.z, yaw: s.yaw };
  }
  const last = samples[samples.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y, z: last.z, yaw: last.yaw };
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
      return {
        x: a.x + (b.x - a.x) * k,
        y: a.y + (b.y - a.y) * k,
        z: a.z + (b.z - a.z) * k,
        yaw: lerpAngle(a.yaw, b.yaw, k),
      };
    }
  }
  return { x: last.x, y: last.y, z: last.z, yaw: last.yaw };
}
