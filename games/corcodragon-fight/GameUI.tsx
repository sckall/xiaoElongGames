/**
 * 《鳄龙咆哮》3D 客户端（Three.js，第一人称）。
 *
 * 分层：
 * - FpsGameView：纯渲染/HUD 组件，通过 FpsDriver 与「本地引擎」或「联机 socket」解耦；
 * - CorcodragonFightLocalScreen：本地 vs AI（浏览器内直接 tick 引擎）；
 * - CorcodragonFightDetailScreen：大厅详情/配置页。
 * 联机 driver 在 apps/web 的 useRealtimeGame 中实现，不放在本包（避免循环依赖）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { chooseAIInputs } from './ai';
import { CorcodragonFightEngine } from './engine';
import {
  ARENA_HALF,
  EYE_Y,
  HERO_DEFS,
  HERO_LIST,
  WEAPON_DEFS,
  WEAPON_IDS,
  WALL_HEIGHT,
} from './defs';
import type {
  GameModeKind,
  HeroId,
  RealtimeInputAction,
  Snapshot,
  SnapshotEffect,
  SnapshotPlayer,
  WeaponId,
} from './defs';
import './game.css';

// ---------------- 颜色与常量 ----------------

const HERO_COLORS: Record<HeroId, number> = {
  yanren: 0xff6a3d,
  yingxiao: 0x9b5cff,
  tiebi: 0x3d8cff,
  lingyin: 0x3dd68c,
  guilei: 0xffcc33,
};
const TEAM_COLORS = { A: 0xff7a45, B: 0x4da3ff };

function heroColor(hero: HeroId | null, team: string): number {
  if (hero) return HERO_COLORS[hero];
  return team === 'B' ? TEAM_COLORS.B : TEAM_COLORS.A;
}

interface PlayerRender {
  group: THREE.Group;
  label: THREE.Sprite;
  shield: THREE.Mesh;
  target: THREE.Vector3;
  yaw: number;
  alive: boolean;
  visible: boolean;
  shieldVal: number;
}

interface Tracer {
  line: THREE.Line;
  born: number;
}

// ---------------- 通用驱动契约 ----------------

export interface FpsDriver {
  snapshot: Snapshot | null;
  myId: string | null;
  online: boolean;
  error: string | null;
  send: (input: RealtimeInputAction) => void;
  onExit: () => void;
  onRestart?: () => void;
}

export interface FightConfig {
  mode: GameModeKind;
  scoreLimit: number;
}

// ---------------- 3D 视图 + HUD ----------------

export function FpsGameView({ driver }: { driver: FpsDriver }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const driverRef = useRef(driver);
  driverRef.current = driver;
  const snapRef = useRef<Snapshot | null>(null);
  snapRef.current = driver.snapshot;

  const [locked, setLocked] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [hitAt, setHitAt] = useState(0);
  const [killFeed, setKillFeed] = useState<string[]>([]);

  // 视图/输入状态（本帧立即生效，再同步给引擎）
  const viewRef = useRef({ yaw: 0, pitch: 0, init: false });
  const keysRef = useRef<Record<string, boolean>>({});
  const localPosRef = useRef(new THREE.Vector3(0, 0, 0));
  const lastMoveRef = useRef({ x: 0, z: 0 });
  const lastAliveRef = useRef(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const worldBuiltRef = useRef(false);
  const playerRendersRef = useRef(new Map<string, PlayerRender>());
  const effectMeshesRef = useRef(new Map<number, THREE.Object3D>());
  const tracerRef = useRef<Tracer[]>([]);
  const gunRef = useRef<THREE.Group | null>(null);
  const muzzleRef = useRef<THREE.Mesh | null>(null);
  const muzzleBornRef = useRef(-1);
  const clockRef = useRef(new THREE.Clock());

  // ---- 静态 3D 世界 ----
  const buildWorld = useCallback((snap: Snapshot) => {
    const host = hostRef.current;
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!host || !scene || !renderer) return;
    const hostRect = host.getBoundingClientRect();
    const camera = new THREE.PerspectiveCamera(
      75,
      Math.max(0.5, hostRect.width / Math.max(1, hostRect.height)),
      0.08,
      220,
    );
    camera.rotation.order = 'YXZ';
    cameraRef.current = camera;

    scene.background = new THREE.Color(0x0b1220);
    scene.fog = new THREE.Fog(0x0b1220, 35, 95);
    const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x1a2432, 1.25);
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(20, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.far = 90;
    scene.add(hemi, sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA_HALF * 2 + 8, ARENA_HALF * 2 + 8),
      new THREE.MeshStandardMaterial({ color: 0x27303f, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(ARENA_HALF * 2 + 8, ARENA_HALF * 2 + 8, 0x61789c, 0x34405a);
    grid.position.y = 0.02;
    scene.add(grid);

    const boxMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4f, roughness: 0.9 });
    for (const b of snap.arena.obstacles) {
      const w = b.maxX - b.minX;
      const d = b.maxZ - b.minZ;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, b.height, d), boxMat);
      mesh.position.set((b.minX + b.maxX) / 2, b.height / 2, (b.minZ + b.maxZ) / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x3b4b6b, roughness: 0.85 });
    const wallDefs = [
      { w: ARENA_HALF * 2 + 9, d: 1, x: 0, z: ARENA_HALF + 0.5 },
      { w: ARENA_HALF * 2 + 9, d: 1, x: 0, z: -ARENA_HALF - 0.5 },
      { w: 1, d: ARENA_HALF * 2 + 9, x: ARENA_HALF + 0.5, z: 0 },
      { w: 1, d: ARENA_HALF * 2 + 9, x: -ARENA_HALF - 0.5, z: 0 },
    ];
    for (const w of wallDefs) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, WALL_HEIGHT + 1, w.d), wallMat);
      mesh.position.set(w.x, (WALL_HEIGHT + 1) / 2, w.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    worldBuiltRef.current = true;
  }, []);

  // ---- 初始化渲染器 ----
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    canvasRef.current = renderer.domElement;
    rendererRef.current = renderer;
    sceneRef.current = new THREE.Scene();

    const resize = () => {
      const r = host.getBoundingClientRect();
      renderer.setSize(Math.max(1, r.width), Math.max(1, r.height));
      const cam = cameraRef.current;
      if (cam) {
        cam.aspect = Math.max(0.5, r.width / Math.max(1, r.height));
        cam.updateProjectionMatrix();
      }
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, clockRef.current.getDelta());
      const snap = snapRef.current;
      const me = snap?.players.find((p) => p.id === driverRef.current.myId) ?? null;
      const cam = cameraRef.current;
      const scene = sceneRef.current;
      if (!scene || !cam || !renderer) return;

      if (me && me.alive && snap?.phase === 'playing' && locked) {
        const hero = me.hero ? HERO_DEFS[me.hero] : HERO_DEFS.yanren;
        let speed = hero.speed;
        if (me.ads) speed *= 0.5;
        if (me.stealthT > 0) speed *= 1.25;
        const k = keysRef.current;
        const yaw = viewRef.current.yaw;
        const fw = { x: Math.sin(yaw), z: Math.cos(yaw) };
        const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
        const mz = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
        const mx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
        const len = Math.hypot(mx, mz) || 1;
        const dx = (fw.x * mz + right.x * mx) / len;
        const dz = (fw.z * mz + right.z * mx) / len;
        localPosRef.current.x += dx * speed * dt;
        localPosRef.current.z += dz * speed * dt;
      }
      if (me) {
        const target = new THREE.Vector3(me.pos.x, me.pos.y, me.pos.z);
        const k2 = driverRef.current.online ? 8 : 12;
        localPosRef.current.lerp(target, Math.min(1, k2 * dt));
      }
      if (cam) {
        const bob =
          me && me.alive && (keysRef.current.KeyW || keysRef.current.KeyA || keysRef.current.KeyS || keysRef.current.KeyD)
            ? Math.sin(performance.now() / 110) * 0.025
            : 0;
        cam.position.set(
          localPosRef.current.x,
          localPosRef.current.y + EYE_Y + bob,
          localPosRef.current.z,
        );
        // Three.js 相机默认朝 -z；引擎视角约定 yaw=0 朝 +z，因此补偿 π
        cam.rotation.y = viewRef.current.yaw + Math.PI;
        cam.rotation.x = viewRef.current.pitch;
      }

      // 其他玩家平滑插值
      for (const [id, pr] of playerRendersRef.current) {
        if (id === driverRef.current.myId) continue;
        pr.group.visible = pr.visible && pr.alive;
        if (!pr.visible || !pr.alive) continue;
        pr.group.position.lerp(pr.target, Math.min(1, 12 * dt));
        pr.group.rotation.y += (pr.yaw - pr.group.rotation.y) * Math.min(1, 10 * dt);
        pr.shield.visible = pr.shieldVal > 0;
        if (pr.shield.visible) {
          const s = 1.1 + Math.sin(performance.now() / 180) * 0.04;
          pr.shield.scale.setScalar(s);
        }
      }

      // 特效
      const now = performance.now();
      for (const [id, mesh] of effectMeshesRef.current) {
        const eff = snap?.effects.find((e) => e.id === id);
        if (!eff) continue;
        const frac = Math.max(0, Math.min(1, eff.t / Math.max(0.001, eff.duration)));
        mesh.position.set(eff.pos.x, Math.max(0.03, eff.pos.y), eff.pos.z);
        const mat = (mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (mat && 'opacity' in mat) {
          if (eff.kind === 'explosion') {
            mesh.scale.setScalar(0.6 + (1 - frac) * eff.radius * 0.9);
            mat.opacity = Math.max(0, frac) * 0.9;
          } else if (eff.kind === 'fireTrail' || eff.kind === 'stormZone') {
            mat.opacity = Math.max(0, frac) * 0.55;
            mesh.rotation.z = now / 500;
          } else if (eff.kind === 'healZone') {
            mat.opacity = Math.max(0, frac) * 0.35 + Math.sin(now / 150) * 0.06;
          } else {
            mat.opacity = Math.max(0, frac);
          }
        }
      }

      // 弹道
      for (const tr of tracerRef.current) {
        const mat = (tr.line.material as THREE.LineBasicMaterial);
        mat.opacity = Math.max(0, 0.85 - (now - tr.born) / 120);
      }
      const expired = tracerRef.current.filter((t) => now - t.born >= 120);
      for (const tr of expired) {
        scene.remove(tr.line);
        tr.line.geometry.dispose();
        (tr.line.material as THREE.Material).dispose();
      }
      tracerRef.current = tracerRef.current.filter((t) => now - t.born < 120);

      // 枪口火光
      if (muzzleRef.current) {
        muzzleRef.current.visible = now - muzzleBornRef.current < 70;
      }

      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      host.removeChild(renderer.domElement);
      sceneRef.current = null;
      rendererRef.current = null;
      worldBuiltRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 快照 → 场景对象 ----
  useEffect(() => {
    const snap = driver.snapshot;
    if (!snap) return;
    if (!worldBuiltRef.current) buildWorld(snap);
    const scene = sceneRef.current;
    const me = snap.players.find((p) => p.id === driver.myId);

    // 视角初始化/重生同步
    if (me && !viewRef.current.init) {
      viewRef.current = { yaw: me.yaw, pitch: me.pitch, init: true };
      localPosRef.current.set(me.pos.x, me.pos.y, me.pos.z);
      lastAliveRef.current = me.alive;
    }
    if (me && !lastAliveRef.current && me.alive) {
      viewRef.current.yaw = me.yaw;
      viewRef.current.pitch = me.pitch;
      localPosRef.current.set(me.pos.x, me.pos.y, me.pos.z);
    }
    if (me) lastAliveRef.current = me.alive;

    // 其他玩家模型
    for (const p of snap.players) {
      if (p.id === driver.myId) continue;
      let pr = playerRendersRef.current.get(p.id);
      if (!pr && scene) {
        const color = heroColor(p.hero, p.team);
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 1.35, 12), mat);
        body.position.y = 0.78;
        body.castShadow = true;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), mat);
        head.position.y = 1.78;
        head.castShadow = true;
        group.add(body, head);
        const shield = new THREE.Mesh(
          new THREE.SphereGeometry(1, 16, 12),
          new THREE.MeshBasicMaterial({
            color: 0x3d9bff,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
          }),
        );
        shield.position.y = 1.0;
        group.add(shield);
        const label = makeNameSprite(p.name, color);
        group.add(label);
        scene.add(group);
        pr = {
          group,
          label,
          shield,
          target: new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z),
          yaw: p.yaw,
          alive: p.alive,
          visible: p.visible,
          shieldVal: p.shield,
        };
        playerRendersRef.current.set(p.id, pr);
      }
      if (pr) {
        pr.target.set(p.pos.x, p.pos.y, p.pos.z);
        pr.yaw = p.yaw;
        pr.alive = p.alive;
        pr.visible = p.visible;
        pr.shieldVal = p.shield;
      }
    }

    // 特效对象
    if (scene) {
      const seen = new Set<number>();
      for (const eff of snap.effects) {
        seen.add(eff.id);
        let mesh = effectMeshesRef.current.get(eff.id);
        if (!mesh) {
          mesh = makeEffectMesh(eff);
          scene.add(mesh);
          effectMeshesRef.current.set(eff.id, mesh);
        }
      }
      for (const [id, mesh] of effectMeshesRef.current) {
        if (!seen.has(id)) {
          scene.remove(mesh);
          disposeObject(mesh);
          effectMeshesRef.current.delete(id);
        }
      }
    }

    // 枪模型
    if (me && scene && cameraRef.current) {
      if (gunRef.current?.userData.weapon !== me.weapon) {
        if (gunRef.current) {
          cameraRef.current.remove(gunRef.current);
          disposeObject(gunRef.current);
        }
        const gun = makeGun(me.weapon);
        gun.userData.weapon = me.weapon;
        gunRef.current = gun;
        muzzleRef.current = gun.userData.muzzle as THREE.Mesh;
        cameraRef.current.add(gun);
      }
      if (gunRef.current && muzzleRef.current) {
        gunRef.current.visible = me.alive;
        muzzleRef.current.visible = false;
      }
    }

    // 事件 → 弹道 / 命中反馈
    for (const ev of snap.events) {
      if (ev.kind === 'shot' && ev.pos && scene) {
        const shooter = snap.players.find((p) => p.id === ev.shooterId);
        if (shooter && !shooter.visible && shooter.id !== driver.myId) continue;
        const from = new THREE.Vector3(ev.pos.x, ev.pos.y, ev.pos.z).clone();
        let start: THREE.Vector3;
        if (ev.shooterId === driver.myId) {
          start = new THREE.Vector3(localPosRef.current.x, localPosRef.current.y + EYE_Y, localPosRef.current.z);
          muzzleBornRef.current = performance.now();
        } else if (shooter && shooter.visible) {
          start = new THREE.Vector3(shooter.pos.x, shooter.pos.y + EYE_Y, shooter.pos.z);
        } else {
          continue;
        }
        const geo = new THREE.BufferGeometry().setFromPoints([start, from]);
        const line = new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85 }),
        );
        line.frustumCulled = false;
        scene.add(line);
        tracerRef.current.push({ line, born: performance.now() });
      }
      if (ev.kind === 'hit' && ev.targetId === driver.myId) {
        setHitAt(performance.now());
      }
      if (ev.kind === 'kill' && ev.text) {
        setKillFeed((f) => [...f.slice(-5), ev.text]);
      }
    }
  }, [driver.snapshot, driver.myId, buildWorld]);

  // ---- 输入 ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const send = (input: RealtimeInputAction) => driverRef.current.send(input);
    const syncMove = () => {
      const k = keysRef.current;
      const yaw = viewRef.current.yaw;
      const fw = { x: Math.sin(yaw), z: Math.cos(yaw) };
      const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const mz = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
      const mx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
      const len = Math.hypot(mx, mz);
      const nx = len > 0 ? (fw.x * mz + right.x * mx) / len : 0;
      const nz = len > 0 ? (fw.z * mz + right.z * mx) / len : 0;
      const last = lastMoveRef.current;
      if (Math.abs(nx - last.x) > 1e-4 || Math.abs(nz - last.z) > 1e-4) {
        lastMoveRef.current = { x: nx, z: nz };
        send({ type: 'move', x: nx, z: nz });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setShowScore(true);
        return;
      }
      if (e.repeat) return;
      keysRef.current[e.code] = true;
      switch (e.code) {
        case 'KeyW':
        case 'KeyA':
        case 'KeyS':
        case 'KeyD':
          syncMove();
          break;
        case 'Space':
          send({ type: 'jump', pressed: true });
          break;
        case 'KeyR':
          send({ type: 'reload' });
          break;
        case 'Digit1':
          send({ type: 'switchWeapon', weapon: 'rifle' });
          break;
        case 'Digit2':
          send({ type: 'switchWeapon', weapon: 'sniper' });
          break;
        case 'Digit3':
          send({ type: 'switchWeapon', weapon: 'pistol' });
          break;
        case 'Digit4':
          send({ type: 'switchWeapon', weapon: 'dagger' });
          break;
        case 'KeyQ':
          send({ type: 'skill' });
          break;
        case 'KeyE':
          send({ type: 'ult' });
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        setShowScore(false);
        return;
      }
      keysRef.current[e.code] = false;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) syncMove();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      const v = viewRef.current;
      v.yaw -= e.movementX * 0.0022;
      v.pitch -= e.movementY * 0.0022;
      v.pitch = Math.max(-1.4, Math.min(1.4, v.pitch));
      send({ type: 'look', yaw: v.yaw, pitch: v.pitch });
    };
    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) send({ type: 'fire', pressed: true });
      if (e.button === 2) send({ type: 'ads', pressed: true });
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) send({ type: 'fire', pressed: false });
      if (e.button === 2) send({ type: 'ads', pressed: false });
    };
    const onLockChange = () => setLocked(document.pointerLockElement === canvas);
    const onContext = (e: Event) => e.preventDefault();
    const onClick = () => {
      const snap = snapRef.current;
      if (snap?.phase === 'playing') canvas.requestPointerLock();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerlockchange', onLockChange);
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('click', onClick);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      // 释放输入，避免离开后服务器还认为在开火
      send({ type: 'fire', pressed: false });
      send({ type: 'ads', pressed: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 非对局阶段自动释放鼠标锁定，保证遮罩按钮可点
  useEffect(() => {
    if (driver.snapshot?.phase !== 'playing' && document.pointerLockElement === canvasRef.current) {
      document.exitPointerLock();
    }
  }, [driver.snapshot?.phase]);

  const snap = driver.snapshot;
  const me = snap?.players.find((p) => p.id === driver.myId) ?? null;
  const winnerName = snap?.winnerId ? snap.players.find((p) => p.id === snap.winnerId)?.name : null;

  return (
    <div className="ccf-root">
      <div className="ccf-canvas-host" ref={hostRef} />
      <button className="ccf-exit" onClick={driver.onExit} title="退出对局">
        ← 退出
      </button>
      {me && me.alive && snap?.phase === 'playing' && (
        <>
          <div className={`ccf-crosshair ${performance.now() - hitAt < 150 ? 'hit' : ''}`} />
          <div className={`ccf-damage-vignette ${performance.now() - hitAt < 180 ? 'on' : ''}`} />
          <Hud snap={snap} me={me} killFeed={killFeed} />
        </>
      )}
      {showScore && snap && <Scoreboard snap={snap} myId={driver.myId} />}

      {snap?.phase === 'heroSelect' && (
        <HeroSelect
          snap={snap}
          myId={driver.myId}
          onPick={(hero) => driver.send({ type: 'selectHero', hero })}
          onExit={driver.onExit}
        />
      )}
      {snap?.phase === 'playing' && me && !me.alive && (
        <div className="ccf-overlay" style={{ pointerEvents: 'none' }}>
          <div className="ccf-overlay-panel">
            <div className="ccf-title">💀 你阵亡了</div>
            <div className="ccf-big-num">{Math.max(0, Math.ceil(me.respawnIn))}</div>
            <p className="ccf-muted">即将自动重返战场……</p>
          </div>
        </div>
      )}
      {snap?.phase === 'gameOver' && (
        <div className="ccf-overlay">
          <div className="ccf-overlay-panel">
            <div className="ccf-title">🏆 对局结束</div>
            <p className="ccf-muted">
              {snap.mode === 'tdm'
                ? `胜者：${snap.winnerTeam === 'A' ? '鳄龙队' : '炎龙队'}（${snap.teamScores.A}:${snap.teamScores.B}）`
                : `胜者：${winnerName ?? '—'}`}
            </p>
            <Scoreboard snap={snap} myId={driver.myId} />
            <div className="ccf-overlay-actions">
              {driver.onRestart && <button onClick={driver.onRestart}>🔁 再来一局</button>}
              <button onClick={driver.onExit}>← 退出</button>
            </div>
          </div>
        </div>
      )}
      {!locked && snap?.phase === 'playing' && me?.alive && (
        <button className="ccf-hint" onClick={() => canvasRef.current?.requestPointerLock()}>
          🖱️ 点击锁定鼠标开始操作（WASD 移动 / 左键射击 / 右键开镜 / R 换弹 / 1-4 切枪 / Q 技能 / E 终极技）
        </button>
      )}
      {driver.error && <div className="ccf-hint" style={{ top: 10 }}>⚠️ {driver.error}</div>}
    </div>
  );
}

function makeNameSprite(name: string, color: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 12), 128, 32);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(2.6, 0.65, 1);
  sprite.position.y = 2.45;
  return sprite;
}

function makeGun(weapon: WeaponId): THREE.Group {
  const g = new THREE.Group();
  const colors: Record<WeaponId, number> = {
    rifle: 0x2b3242,
    sniper: 0x1d2533,
    pistol: 0x3a4252,
    dagger: 0x9aa4b5,
  };
  const len = weapon === 'sniper' ? 1.0 : weapon === 'dagger' ? 0.42 : 0.62;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.12, len),
    new THREE.MeshStandardMaterial({ color: colors[weapon], roughness: 0.4 }),
  );
  body.position.set(0.22, -0.2, -0.55);
  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.045, weapon === 'sniper' ? 0.5 : 0.22),
    new THREE.MeshStandardMaterial({ color: 0x11151d, roughness: 0.3 }),
  );
  barrel.position.set(0.22, -0.14, -0.55 - len / 2 - 0.1);
  const muzzle = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    }),
  );
  muzzle.position.set(0.22, -0.14, -1.15);
  muzzle.visible = false;
  g.add(body, barrel, muzzle);
  g.userData.muzzle = muzzle;
  return g;
}

function makeEffectMesh(eff: SnapshotEffect): THREE.Object3D {
  if (eff.kind === 'bomb') {
    return new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x111111 }),
    );
  }
  if (eff.kind === 'explosion') {
    return new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 14),
      new THREE.MeshBasicMaterial({
        color: 0xffa040,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
  }
  const colors = {
    fireTrail: 0xff6a2a,
    healZone: 0x2fd06a,
    stormZone: 0x6fa2ff,
  } as const;
  const kind = eff.kind === 'fireTrail' || eff.kind === 'healZone' || eff.kind === 'stormZone' ? eff.kind : 'fireTrail';
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(eff.radius, 26),
    new THREE.MeshBasicMaterial({
      color: colors[kind],
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.05;
  return mesh;
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}

// ---------------- HUD / 计分板 / 英雄选择 ----------------

function Hud({ snap, me, killFeed }: { snap: Snapshot; me: SnapshotPlayer; killFeed: string[] }) {
  const hero = me.hero ? HERO_DEFS[me.hero] : null;
  const wd = WEAPON_DEFS[me.weapon];
  const hpPct = Math.max(0, Math.min(100, (me.hp / me.maxHp) * 100));
  const shieldPct = Math.max(0, Math.min(100, (me.shield / 80) * 100));
  const ads = me.ads;
  return (
    <div className="ccf-hud">
      <div className="ccf-hud-top">
        <div className="ccf-chips">
          <span className="ccf-chip">🎯 {snap.mode === 'tdm' ? `团队死斗 ${snap.teamScores.A}:${snap.teamScores.B}/${snap.scoreLimit}` : `自由混战 ${me.kills}/${snap.scoreLimit}`}</span>
          <span className="ccf-chip">⏱ {Math.max(0, Math.ceil(snap.timeLeft / 1000))}s</span>
          <span className="ccf-chip">🏆 {me.score} 分 · {me.kills} 杀 {me.deaths} 死</span>
        </div>
        {hero && (
          <span className="ccf-chip">
            {hero.emoji} {hero.name} · {hero.role} · {wd.emoji} {wd.name}
          </span>
        )}
      </div>
      <div className="ccf-killfeed">
        {killFeed.map((t, i) => (
          <div key={`${t}-${i}`} className="ccf-kill-item">{t}</div>
        ))}
      </div>

      <div className="ccf-hud-bottom-left">
        <div className="ccf-hp-row">
          <span className="ccf-hp-label">❤️ {Math.ceil(me.hp)}</span>
          <div className="ccf-hp-bar"><div className="ccf-hp-fill" style={{ width: `${hpPct}%` }} /></div>
        </div>
        <div className="ccf-hp-row">
          <span className="ccf-hp-label">🛡️ {Math.ceil(me.shield)}</span>
          <div className="ccf-shield-bar"><div className="ccf-shield-fill" style={{ width: `${shieldPct}%` }} /></div>
        </div>
        <div className="ccf-ammo">
          <span className="ccf-ammo-cur">{me.reloading ? '…' : me.ammo}</span>
          <span className="ccf-ammo-sep">/</span>
          <span className="ccf-ammo-res">{wd.reserve === Infinity ? '∞' : me.reserve}</span>
          <span className="ccf-ammo-meta">
            {me.reloading ? `换弹中 ${(me.reloadT / 1000).toFixed(1)}s` : ads ? '🔍 开镜' : wd.name}
          </span>
        </div>
      </div>

      <div className="ccf-hud-bottom-right">
        <div className={`ccf-skill ccf-skill-box ${me.skillCd <= 0 ? 'ready' : ''}`}>
          <span className="ccf-skill-key">Q</span>
          <span className="ccf-skill-name">{hero ? hero.skillName : '技能'}</span>
          {me.skillCd > 0 && <span className="ccf-cd">{me.skillCd.toFixed(1)}</span>}
        </div>
        <div className={`ccf-skill ccf-skill-box ${me.ultCharge >= 100 ? 'ready' : ''}`}>
          <span className="ccf-skill-key">E</span>
          <span className={`ccf-skill-name ${me.ultCharge >= 100 ? 'ccf-ult-ready' : ''}`}>
            {hero ? hero.ultName : '终极技'} · {Math.floor(me.ultCharge)}%
          </span>
          {me.ultCharge < 100 && (
            <div className="ccf-shield-bar" style={{ width: 90, flex: 'none' }}>
              <div className="ccf-ult-ready" style={{ width: `${me.ultCharge}%`, height: '100%', background: '#ffd166' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Scoreboard({ snap, myId }: { snap: Snapshot; myId: string | null }) {
  const rows = [...snap.players]
    .filter((p) => p.visible || p.id === myId)
    .sort((a, b) => b.score - a.score || b.kills - a.kills);
  return (
    <div className="ccf-scoreboard">
      <table>
        <thead>
          <tr>
            <th>玩家</th>
            <th>英雄</th>
            <th>击杀</th>
            <th>死亡</th>
            <th>积分</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className={p.id === myId ? 'me-row' : ''}>
              <td>{p.name}{p.isBot ? ' 🤖' : ''}{p.id === myId ? '（你）' : ''}</td>
              <td>{p.hero ? HERO_DEFS[p.hero].emoji : '—'}</td>
              <td>{p.kills}</td>
              <td>{p.deaths}</td>
              <td>{p.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeroSelect({
  snap,
  myId,
  onPick,
  onExit,
}: {
  snap: Snapshot;
  myId: string | null;
  onPick: (hero: HeroId) => void;
  onExit: () => void;
}) {
  const me = snap.players.find((p) => p.id === myId);
  return (
    <div className="ccf-overlay">
      <div className="ccf-overlay-panel">
        <div className="ccf-title">🐊 选择你的英雄</div>
        <p className="ccf-muted">
          {me?.hero ? '可重新选择；全部玩家就绪后开战' : `剩余 ${Math.max(0, Math.ceil(snap.heroSelectLeft / 1000))} 秒自动分配`}
        </p>
        <div className="ccf-hero-grid">
          {HERO_LIST.map((h) => (
            <button
              key={h.key}
              className={`ccf-hero-card ${me?.hero === h.key ? 'ccf-ult-ready' : ''}`}
              onClick={() => onPick(h.key)}
            >
              <div className="ccf-hero-emoji">{h.emoji}</div>
              <div className="ccf-hero-name">{h.name}</div>
              <div className="ccf-hero-role">{h.role} · {h.hp} 生命</div>
              <div className="ccf-hero-desc">
                <b>Q {h.skillName}</b>：{h.skillDesc}
                <br />
                <b>E {h.ultName}</b>：{h.ultDesc}
              </div>
            </button>
          ))}
        </div>
        <p className="ccf-muted">已选：{snap.players.filter((p) => p.hero).map((p) => `${p.name}→${p.hero ? HERO_DEFS[p.hero].name : ''}`).join(' · ') || '暂无'}</p>
        <div className="ccf-overlay-actions">
          <button onClick={onExit}>← 退出</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- 本地 vs AI ----------------

export function CorcodragonFightLocalScreen({
  playerCount,
  myName,
  config,
  onExit,
}: {
  playerCount: number;
  myName: string;
  config: FightConfig;
  onExit: () => void;
}) {
  const [round, setRound] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const engineRef = useRef<CorcodragonFightEngine | null>(null);

  useEffect(() => {
    const players = [
      { id: 'you', name: myName || '你', isBot: false },
      ...Array.from({ length: Math.max(1, playerCount - 1) }, (_, i) => ({
        id: `bot${i + 1}`,
        name: ['阿呆', '梅林', '小圆', '老巴', '铁柱', '花卷'][i % 6],
        isBot: true,
      })),
    ];
    const engine = new CorcodragonFightEngine(players, {
      mode: config.mode,
      scoreLimit: config.scoreLimit,
      matchTimeMs: config.mode === 'ffa' ? 10 * 60_000 : 8 * 60_000,
    });
    engineRef.current = engine;
    let raf = 0;
    let last = performance.now();
    let lastSnap = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(60, Math.max(0, now - last));
      last = now;
      engine.tick(dt);
      if (now - lastSnap >= 45) {
        lastSnap = now;
        setSnapshot(engine.getSnapshot('you'));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      engineRef.current = null;
    };
  }, [round, playerCount, myName, config.mode, config.scoreLimit]);

  const send = useCallback((input: RealtimeInputAction) => {
    engineRef.current?.applyInput('you', input);
  }, []);

  return (
    <FpsGameView
      driver={{
        snapshot,
        myId: 'you',
        online: false,
        error: null,
        send,
        onExit,
        onRestart: () => setRound((r) => r + 1),
      }}
    />
  );
}

// ---------------- 详情/配置页 ----------------

export function CorcodragonFightDetailScreen({
  playerCount,
  onPlayerCountChange,
  onPlayLocal,
  onPlayOnline,
  onlineReady = false,
  onBack,
}: {
  playerCount: number;
  onPlayerCountChange: (n: number) => void;
  onPlayLocal: (config: FightConfig) => void;
  onPlayOnline: (config: FightConfig) => void;
  onlineReady?: boolean;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<GameModeKind>('ffa');
  const [scoreLimit, setScoreLimit] = useState(15);
  const config = { mode, scoreLimit };
  return (
    <div className="page detail-page">
      <div className="panel detail-panel ccf-detail-panel">
        <div className="detail-head">
          <span className="detail-emoji">🐊</span>
          <div className="detail-title">
            <h1>鳄龙咆哮</h1>
            <span className="detail-meta">实时 · 3D 英雄射击｜2-7 人｜20Hz 服务端权威</span>
          </div>
        </div>
        <p className="detail-desc">
          第一人称 3D 英雄射击：5 位鳄龙英雄（冲刺/隐身/护盾/治疗/炸弹）× 4 种武器，
          服务端权威判定弹道与技能，先到击杀线者获胜。建议使用桌面浏览器 + 鼠标键盘。
        </p>

        <div className="detail-modes">
          <section className="detail-mode">
            <h2>⚔️ 对战设置</h2>
            <div className="field">
              <span>模式</span>
              <div className="ccf-mode-row">
                <button className={`ccf-mode-btn ${mode === 'ffa' ? 'active' : ''}`} onClick={() => setMode('ffa')}>
                  🆚 自由混战
                </button>
                <button className={`ccf-mode-btn ${mode === 'tdm' ? 'active' : ''}`} onClick={() => setMode('tdm')}>
                  🤝 团队死斗
                </button>
              </div>
            </div>
            <div className="field">
              <span>击杀线</span>
              <select className="bot-select" value={scoreLimit} onChange={(e) => setScoreLimit(Number(e.target.value))}>
                {[10, 15, 25].map((n) => (
                  <option key={n} value={n}>{n} 杀</option>
                ))}
              </select>
            </div>
          </section>

          <section className="detail-mode">
            <h2>🎮 本地 vs AI（浏览器内）</h2>
            <div className="field">
              <span>玩家总数（其余为 AI）</span>
              <div className="count-picker">
                {Array.from({ length: 6 }, (_, i) => i + 2).map((n) => (
                  <button key={n} className={n === playerCount ? 'count-btn active' : 'count-btn'} onClick={() => onPlayerCountChange(n)}>
                    {n} 人
                  </button>
                ))}
              </div>
            </div>
            <button className="primary-btn big" onClick={() => onPlayLocal(config)}>
              🎮 开始（本地 vs AI）
            </button>
          </section>

          <section className="detail-mode">
            <h2>🌐 联机对战</h2>
            <p className="muted">
              创建房间分享房间码，2-7 人同房；服务端权威 20Hz 同步，支持 AI 补位。
            </p>
            <button className="primary-btn big" disabled={!onlineReady} onClick={() => onPlayOnline(config)}>
              {onlineReady ? '🌐 进入联机大厅' : '🔧 联机通道接入中……'}
            </button>
          </section>
        </div>

        <details className="rules">
          <summary>📜 规则与操作</summary>
          <ul>
            <li>先到击杀线获胜（自由混战看个人、团队死斗看队伍），超时按分数判定。</li>
            <li>武器：1 步枪（自动）· 2 狙击枪（爆头 250）· 3 手枪（无限备弹）· 4 匕首（近战）。</li>
            <li>右键开镜（狙击/步枪更准），R 换弹；爆头伤害翻倍以上，远距离伤害衰减。</li>
            <li>Q 主动技能、E 终极技（随时间/伤害/击杀充能）；死亡 3 秒后自动重生。</li>
          </ul>
          <div className="ccf-controls-grid">
            <span>🖱️ 鼠标：环顾 / 左键射击 / 右键开镜</span>
            <span>⌨️ WASD 移动 · 空格跳跃</span>
            <span>🔢 1-4 切枪 · R 换弹</span>
            <span>⚡ Q 技能 · E 终极技 · Tab 计分板</span>
          </div>
          <h3>五位英雄</h3>
          {HERO_LIST.map((h) => (
            <div key={h.key} className="ccf-hero-line">
              <b>{h.emoji} {h.name}</b>
              <span>{h.role} · {h.hp}HP · Q {h.skillName}（{h.skillDesc}）· E {h.ultName}（{h.ultDesc}）</span>
            </div>
          ))}
          <h3>四种武器</h3>
          {WEAPON_IDS.map((w) => (
            <div key={w} className="ccf-hero-line">
              <b>{WEAPON_DEFS[w].emoji} {WEAPON_DEFS[w].name}</b>
              <span>
                伤害 {WEAPON_DEFS[w].damage} · 射速 {Math.round(1000 / WEAPON_DEFS[w].interval)}/秒 · 弹匣 {WEAPON_DEFS[w].magSize === Infinity ? '∞' : WEAPON_DEFS[w].magSize} · {WEAPON_DEFS[w].desc}
              </span>
            </div>
          ))}
        </details>

        <button className="ghost-btn" onClick={onBack}>
          ← 返回游戏大厅
        </button>
      </div>
    </div>
  );
}

// 保持 chooseAIInputs 引用（本地扩展点，未来本地观战/回放可能用到）
void chooseAIInputs;
