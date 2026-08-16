/**
 * 《鳄龙咆哮》程序化音效引擎（Web Audio，零素材依赖）。
 *
 * 为什么程序化：仓库保持自包含、无版权风险、无网络加载；音色可随武器/英雄
 * 参数即时生成。后续替换正式素材时，只需把本文件的 play* 方法换成
 * AudioBuffer 播放（见 docs/ASSETS.md 素材接入方案）。
 */
import type { WeaponId } from './defs';

export class SfxPlayer {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private ambientStarted = false;

  /** 必须在用户手势里调用一次（浏览器自动播放策略） */
  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.34;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.6;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 训练场/对局底噪：很轻的风声循环 */
  private startAmbient(): void {
    if (!this.ctx || !this.master || !this.noise || this.ambientStarted) return;
    this.ambientStarted = true;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
  }

  /** 脚步声（按步幅触发，音量随节奏微调） */
  step(): void {
    if (!this.ready()) return;
    this.osc('sine', 95 + Math.random() * 20, 55, 0.1, 0.07);
  }

  private ready(): boolean {
    return this.enabled && !!this.ctx && !!this.master && !!this.noise;
  }

  private env(vol: number, attack: number, decay: number, when = 0): GainNode | null {
    if (!this.ctx || !this.master) return null;
    const t = this.ctx.currentTime + when;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.master);
    return g;
  }

  private osc(type: OscillatorType, from: number, to: number, vol: number, dur: number, when = 0): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const g = this.env(vol, 0.002, dur, when);
    if (!g) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.01);
  }

  private burst(vol: number, dur: number, filterFrom: number, filterTo: number, when = 0): void {
    if (!this.ctx || !this.noise) return;
    const t0 = this.ctx.currentTime + when;
    const g = this.env(vol, 0.002, dur, when);
    if (!g) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(filterFrom, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, filterTo), t0 + dur);
    f.Q.value = 0.8;
    src.connect(f);
    f.connect(g);
    src.start(t0, Math.random() * 0.2);
    src.stop(t0 + dur + 0.01);
  }

  shoot(weapon: WeaponId): void {
    if (!this.ready()) return;
    switch (weapon) {
      case 'rifle':
        this.burst(0.5, 0.09, 1800, 600);
        this.osc('square', 210, 70, 0.16, 0.07);
        break;
      case 'sniper':
        this.burst(0.9, 0.3, 900, 180);
        this.osc('sine', 160, 45, 0.5, 0.28);
        this.osc('square', 90, 30, 0.18, 0.16, 0.02);
        break;
      case 'pistol':
        this.burst(0.35, 0.06, 2200, 900);
        this.osc('square', 320, 110, 0.14, 0.05);
        break;
      case 'dagger':
        this.burst(0.2, 0.05, 4000, 1800);
        this.osc('triangle', 800, 200, 0.08, 0.04);
        break;
    }
  }

  hit(headshot = false): void {
    if (!this.ready()) return;
    if (headshot) {
      this.osc('sine', 1320, 1760, 0.34, 0.07);
      this.osc('sine', 1980, 1980, 0.22, 0.06, 0.03);
    } else {
      // 身体命中：明显的“哒”声（高频短促 + 低音底）
      this.osc('square', 1400, 900, 0.3, 0.05);
      this.osc('sine', 180, 120, 0.2, 0.06);
      this.burst(0.16, 0.04, 2200, 1400);
    }
  }

  hurt(): void {
    this.osc('sine', 160, 110, 0.2, 0.09);
  }

  /** 子弹被铁壁能量护盾吸收的钝响 */
  shieldBlock(): void {
    if (!this.ready()) return;
    this.osc('sine', 240, 160, 0.18, 0.08);
    this.burst(0.1, 0.05, 1200, 500);
  }

  kill(): void {
    this.osc('sine', 130, 45, 0.34, 0.22);
    this.osc('sine', 660, 880, 0.12, 0.16, 0.04);
  }

  reload(): void {
    this.osc('square', 700, 700, 0.08, 0.035);
    this.osc('square', 520, 520, 0.08, 0.035, 0.16);
    this.osc('square', 900, 900, 0.09, 0.03, 0.34);
  }

  switchWeapon(): void {
    this.osc('square', 420, 420, 0.07, 0.04);
  }

  jump(): void {
    this.burst(0.14, 0.1, 700, 1400);
  }

  skill(hero: string | null): void {
    if (!this.ready()) return;
    switch (hero) {
      case 'yanren':
        this.burst(0.5, 0.25, 500, 2500);
        this.osc('sawtooth', 90, 240, 0.12, 0.2);
        break;
      case 'yingxiao':
        this.osc('sine', 500, 180, 0.12, 0.24);
        this.burst(0.1, 0.2, 1200, 400);
        break;
      case 'tiebi':
        this.osc('sine', 320, 620, 0.2, 0.12);
        this.osc('sine', 640, 640, 0.12, 0.08, 0.08);
        break;
      case 'lingyin':
        this.osc('sine', 523, 523, 0.12, 0.12);
        this.osc('sine', 659, 659, 0.12, 0.12, 0.1);
        this.osc('sine', 784, 784, 0.12, 0.14, 0.2);
        break;
      case 'guilei':
        this.osc('square', 880, 880, 0.1, 0.05);
        this.osc('square', 880, 880, 0.1, 0.05, 0.14);
        break;
      default:
        this.burst(0.2, 0.15, 900, 1800);
    }
  }

  ult(hero: string | null): void {
    if (!this.ready()) return;
    if (hero === 'yanren' || hero === 'guilei') {
      this.burst(0.9, 0.55, 400, 80);
      this.osc('sine', 90, 30, 0.5, 0.5);
    } else if (hero === 'lingyin') {
      this.osc('sine', 392, 784, 0.2, 0.5);
    } else if (hero === 'tiebi') {
      this.osc('sawtooth', 70, 120, 0.25, 0.4);
    } else {
      this.osc('sine', 700, 200, 0.2, 0.35);
    }
  }

  heal(): void {
    this.osc('sine', 640, 960, 0.1, 0.12);
  }

  respawn(): void {
    this.osc('sine', 440, 880, 0.16, 0.2);
  }
}
