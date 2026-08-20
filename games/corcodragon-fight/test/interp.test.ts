import { describe, expect, it } from 'vitest';
import { lerpAngle, sampleRemote } from '../interp';

const s = (t: number, x: number, yaw = 0) => ({ t, x, y: 0, z: 0, yaw });

describe('sampleRemote（服务端时间戳插值）', () => {
  it('在两个样本之间线性插值', () => {
    const out = sampleRemote([s(0, 0), s(100, 10)], 50);
    expect(out?.x).toBeCloseTo(5);
  });

  it('早于最早样本时用最早样本，晚于最新样本时钳制到最新（不外推）', () => {
    expect(sampleRemote([s(100, 1), s(200, 2)], 0)?.x).toBe(1);
    expect(sampleRemote([s(100, 1), s(200, 2)], 999)?.x).toBe(2);
  });

  it('空样本返回 null', () => {
    expect(sampleRemote([], 100)).toBeNull();
  });

  it('yaw 按最短路径插值（跨 ±π）', () => {
    const out = sampleRemote([s(0, 0, Math.PI - 0.1), s(100, 0, -Math.PI + 0.1)], 50);
    expect(out?.yaw).toBeCloseTo(Math.PI);
  });
});

describe('lerpAngle', () => {
  it('普通区间线性插值', () => {
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5);
  });

  it('跨 ±π 走短边', () => {
    expect(Math.abs(lerpAngle(3.1, -3.1, 0.5))).toBeCloseTo(Math.PI);
  });
});
