/**
 * KayKit Adventurers 英雄模型与引擎碰撞盒的对齐。
 *
 * 引擎命中盒是以玩家坐标 (x, z) 为中心的竖直胶囊（脚底 0.15m ~ 头顶 1.85m）。
 * KayKit 场景包里武器/盾牌/法杖/帽子会显著撑大整棵节点树的 AABB：
 * - 剑/盾向前（+z）伸展 → 用整树 AABB 中心会把身体向后推；
 * - 弩向左（-x）伸展 → 会把身体向右推；
 * - 法师帽把高度撑到 ~3m → 会把整个人物缩矮。
 *
 * 因此只用「头/躯干/四肢」等身体核心网格来归一高度，
 * 只用「躯干/腿」网格来求水平中心，使身体与碰撞胶囊对齐，
 * 武器、帽子等附件仍按模型原始姿态延伸。
 */
import * as THREE from 'three';

/** 参与高度归一的身体核心网格（KayKit 命名：*_Body / *_Head(_...) / *_Leg*） */
const HEIGHT_PART_RE = /_(Body|Head|Leg)/;
/** 参与水平对齐的躯干/腿部网格（这两类网格在 KayKit 里都围绕原点建模） */
const ALIGN_PART_RE = /_(Body|Leg)/;

export interface HeroModelPlacement {
  scale: number;
  x: number;
  y: number;
  z: number;
}

function boundsOfMatchingMeshes(model: THREE.Object3D, pattern: RegExp): THREE.Box3 | null {
  const box = new THREE.Box3();
  let found = false;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!pattern.test(mesh.name)) return;
    box.expandByObject(mesh);
    found = true;
  });
  return found ? box : null;
}

/**
 * 计算把 `model` 放入玩家渲染组所需的缩放与平移：
 * - 高度：身体核心（头/躯干/腿）归一为 targetHeight，脚底贴地（局部 y=0）；
 * - 水平：躯干/腿的 AABB 中心对齐到局部原点，即对齐引擎胶囊的 x/z 中心。
 * 找不到命名核心网格时回退到整树 AABB，保证非 KayKit 模型也能用。
 */
export function heroModelPlacement(model: THREE.Object3D, targetHeight: number): HeroModelPlacement {
  const full = new THREE.Box3().setFromObject(model);
  const heightBox = boundsOfMatchingMeshes(model, HEIGHT_PART_RE) ?? full;
  const alignBox = boundsOfMatchingMeshes(model, ALIGN_PART_RE) ?? heightBox;
  const size = new THREE.Vector3();
  heightBox.getSize(size);
  const center = new THREE.Vector3();
  alignBox.getCenter(center);
  const s = targetHeight / Math.max(0.01, size.y);
  return {
    scale: s,
    x: -center.x * s,
    y: -heightBox.min.y * s,
    z: -center.z * s,
  };
}
