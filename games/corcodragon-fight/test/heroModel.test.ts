import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { heroModelPlacement } from '../heroModel';

function boxMesh(name: string, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
  mesh.name = name;
  mesh.position.set(x, y, z);
  return mesh;
}

/** 用 KayKit 命名构造身体核心：脚底 y=0，头高 2.2m，躯干/腿围绕原点 */
function addBodyCore(group: THREE.Group): void {
  group.add(boxMesh('Hero_LegLeft', 0.3, 0.5, 0.4, 0.15, 0.25, 0));
  group.add(boxMesh('Hero_LegRight', 0.3, 0.5, 0.4, -0.15, 0.25, 0));
  group.add(boxMesh('Hero_Body', 0.8, 0.9, 0.7, 0, 0.75, 0));
  group.add(boxMesh('Hero_Head', 0.6, 1.0, 0.6, 0, 1.7, 0));
}

describe('heroModelPlacement', () => {
  it('高度只用身体核心归一，脚底贴地', () => {
    const group = new THREE.Group();
    addBodyCore(group);
    // 高帽子：会撑大整树 AABB 高度，但不属于身体核心
    group.add(boxMesh('Hero_Hat', 1.2, 1.0, 1.2, 0, 2.5, 0));
    const p = heroModelPlacement(group, 1.85);
    // 核心头高 2.2m（脚底 0 → 头顶 2.2）
    expect(p.scale).toBeCloseTo(1.85 / 2.2, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it('水平中心只用躯干/腿对齐，武器/盾牌不把身体带偏', () => {
    const group = new THREE.Group();
    addBodyCore(group);
    // 剑向前 +z 伸出很远、盾向左 -x 伸出很远（旧逻辑按整树 AABB 居中会反向偏移）
    group.add(boxMesh('1H_Sword', 0.1, 0.1, 2.0, 0.9, 1.0, 1.2));
    group.add(boxMesh('Rectangle_Shield', 1.4, 0.6, 0.1, -0.9, 1.0, 0.3));
    const p = heroModelPlacement(group, 1.85);
    expect(p.scale).toBeCloseTo(1.85 / 2.2, 5);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('法师模型：帽子不参与高度归一，身体中心不会被长帽檐带偏', () => {
    const group = new THREE.Group();
    addBodyCore(group);
    // 长帽檐向 -z 伸出、帽子把高度撑到 3m
    group.add(boxMesh('Mage_Hat', 0.4, 0.4, 1.6, 0, 2.2, -0.6));
    const p = heroModelPlacement(group, 1.85);
    expect(p.scale).toBeCloseTo(1.85 / 2.2, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('找不到核心网格时回退到整树 AABB（保持旧行为可用）', () => {
    const group = new THREE.Group();
    // 无 KayKit 命名：整树 AABB 即唯一依据
    group.add(boxMesh('Cube_A', 1, 2, 1, 0.5, 1, 0.5));
    const p = heroModelPlacement(group, 1.85);
    expect(p.scale).toBeCloseTo(1.85 / 2, 5);
    expect(p.x).toBeCloseTo(-0.5 * (1.85 / 2), 5);
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(-0.5 * (1.85 / 2), 5);
  });
});
