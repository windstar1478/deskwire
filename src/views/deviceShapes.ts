import * as THREE from 'three'
import type { Device } from '../data/types'

/**
 * 기기별 최소한의 특징을 잡은 형상.
 * 전부 박스로 두면 무엇이 무엇인지 알 수 없어서, 알아볼 정도의 특징만 넣는다.
 *
 * 규약: 그룹의 원점이 기기의 중심. **앞면은 +z 방향**을 본다.
 * 씬에서 z 를 뒤집어 넣기 때문에, 씬의 +z 가 사용자 쪽이 된다.
 */

const BODY = { roughness: 0.55, metalness: 0.15 }

function mat(color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, ...BODY, ...o })
}

const C = {
  shell: 0x51707f,
  shellDark: 0x33474f,
  screen: 0x141d24,
  metal: 0x8d9ba3,
  black: 0x22292d,
  accent: 0x3fc4d4,
  wood: 0x6b5233,
}

/** 기기 계열별 기본 색. 전부 같은 색이면 형상이 읽히지 않는다. */
const TONE: Record<string, number> = {
  spkL: 0x2c3338,
  spkR: 0x2c3338,
  pc: 0x39464d,
  itf: 0x3d4a52,
  kbd: 0x4a5a64,
  mouse: 0x4a5a64,
  monitor: 0x3a464e,
  monitor2: 0x3a464e,
  dock: 0x2f3a40,
  stand: 0x5e7280,
  strip: 0xd6d8d3,
}

export function buildDevice(d: Device, selected: boolean): THREE.Group {
  const g = new (class extends THREE.Group {})()
  const { w, h, d: dep } = d.dims
  const shell = selected ? C.accent : (TONE[d.id] ?? C.shell)

  switch (d.id) {
    case 'monitor':
      panel(g, w, h, dep, shell)
      break
    case 'monitor2':
      panel(g, w, h, dep, shell)
      break
    case 'arm':
      monitorArm(g, w, h, dep)
      break
    case 'spkL':
    case 'spkR':
      speaker(g, w, h, dep, shell, d.id === 'spkL')
      break
    case 'hpstand':
      headphoneStand(g, w, h, dep)
      break
    case 'hd600':
    case 'headset':
      headphones(g, w, h, dep, d.id === 'headset' ? C.black : C.shellDark)
      break
    case 'pc':
      tower(g, w, h, dep, shell)
      break
    case 'kbd':
      keyboard(g, w, h, dep, shell)
      break
    case 'mouse':
      mouse(g, w, h, dep, shell)
      break
    case 'itf':
      audioInterface(g, w, h, dep, shell)
      break
    case 'stand':
      riser(g, w, h, dep, shell)
      break
    case 'pad':
      disc(g, w, h, C.shellDark)
      break
    case 'dock':
      dock(g, w, h, dep, shell)
      break
    case 'guitar':
      guitar(g, w, h, dep)
      break
    case 'strip':
      powerStrip(g, w, h, dep)
      break
    case 'wall':
      outlet(g, w, h, dep)
      break
    case 'light':
      lightBar(g, w, h, dep)
      break
    default:
      add(g, new THREE.BoxGeometry(w, h, dep), mat(shell), 0, 0, 0)
  }
  return g
}

/* ---------- 부품 헬퍼 ---------- */

function add(
  g: THREE.Group,
  geo: THREE.BufferGeometry,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
) {
  const mesh = new THREE.Mesh(geo, m)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  g.add(mesh)
  return mesh
}

function cyl(r: number, height: number, seg = 24) {
  return new THREE.CylinderGeometry(r, r, height, seg)
}

/* ---------- 기기별 ---------- */

/** 모니터: 베젤 + 살짝 파인 화면. 화면이 앞(-z)을 본다. */
function panel(g: THREE.Group, w: number, h: number, dep: number, shell: number) {
  add(g, new THREE.BoxGeometry(w, h, dep), mat(shell), 0, 0, 0)
  add(
    g,
    new THREE.BoxGeometry(w * 0.955, h * 0.93, 2),
    mat(C.screen, { roughness: 0.28, emissive: 0x0a1418 }),
    0,
    h * 0.02,
    dep / 2 + 1.5,
  )
}

function monitorArm(g: THREE.Group, w: number, h: number, dep: number) {
  const m = mat(C.metal, { metalness: 0.55, roughness: 0.4 })
  add(g, cyl(w * 0.28, h * 0.9), m, 0, -h * 0.05, 0)
  add(g, new THREE.BoxGeometry(w * 0.7, h * 0.1, dep * 1.6), m, 0, h * 0.45, dep * 0.3)
}

/** 스피커: 캐비닛 + 우퍼 콘 + 트위터. 좌측 유닛만 볼륨 노브가 있다. */
function speaker(
  g: THREE.Group,
  w: number,
  h: number,
  dep: number,
  shell: number,
  active: boolean,
) {
  add(g, new THREE.BoxGeometry(w, h, dep), mat(shell), 0, 0, 0)
  const face = dep / 2 + 1
  const woofR = w * 0.34
  add(g, cyl(woofR, 8, 28), mat(C.black, { roughness: 0.9 }), 0, -h * 0.16, face)
    .rotation.set(Math.PI / 2, 0, 0)
  add(g, cyl(woofR * 0.42, 10, 20), mat(C.shellDark), 0, -h * 0.16, face + 3).rotation.set(
    Math.PI / 2,
    0,
    0,
  )
  add(g, cyl(w * 0.11, 8, 20), mat(C.black, { roughness: 0.9 }), 0, h * 0.26, face).rotation.set(
    Math.PI / 2,
    0,
    0,
  )
  // 베이스 리플렉스 포트
  add(g, cyl(w * 0.08, 6, 16), mat(C.screen), 0, h * 0.4, face).rotation.set(Math.PI / 2, 0, 0)
  if (active) {
    add(g, cyl(w * 0.075, 12, 16), mat(C.metal, { metalness: 0.6 }), w * 0.3, -h * 0.36, face)
      .rotation.set(Math.PI / 2, 0, 0)
  }
}

/** 헤드폰 거치대: 원형 받침 + 기둥 + T바 + 양끝 후크 (사진 형태). */
function headphoneStand(g: THREE.Group, w: number, h: number, dep: number) {
  const m = mat(C.metal, { metalness: 0.7, roughness: 0.3 })
  const baseR = Math.min(w, dep) * 0.42
  add(g, cyl(baseR, 14, 40), m, 0, -h / 2 + 7, 0)
  add(g, cyl(baseR * 0.92, 6, 40), m, 0, -h / 2 + 17, 0)
  add(g, cyl(w * 0.045, h * 0.88, 20), m, 0, 0, 0)

  // T 바
  const barY = h / 2 - 10
  add(g, new THREE.BoxGeometry(w, 14, dep * 0.42), m, 0, barY, 0)
  // 양끝에서 아래로 꺾인 후크
  for (const sx of [-1, 1]) {
    add(g, new THREE.BoxGeometry(w * 0.1, 34, dep * 0.42), m, sx * (w / 2 - w * 0.05), barY - 22, 0)
    add(
      g,
      new THREE.BoxGeometry(w * 0.2, 12, dep * 0.42),
      m,
      sx * (w / 2 - w * 0.1),
      barY - 36,
      0,
    )
  }
}

/**
 * 헤드폰: 헤드밴드 아치 + 이어컵.
 * 거치대 후크에 걸면 이어컵이 좌우가 아니라 **앞뒤로** 늘어진다.
 * 그래서 컵 축과 밴드 아치는 z(앞뒤)를 따라 선다.
 */
function headphones(g: THREE.Group, w: number, h: number, dep: number, color: number) {
  const m = mat(color, { roughness: 0.75 })
  const span = dep * 0.36 // 이어컵 중심까지의 거리 (앞뒤)

  // 후크에 걸려 매달리므로 헤드밴드가 상자 위쪽에 온다.
  const band = add(
    g,
    new THREE.TorusGeometry(span, dep * 0.045, 10, 28, Math.PI),
    m,
    0,
    h * 0.28,
    0,
  )
  band.rotation.y = Math.PI / 2 // 아치를 앞뒤 평면으로 세운다

  for (const sz of [-1, 1]) {
    const cup = add(g, cyl(h * 0.24, w * 0.55, 26), m, 0, h * 0.02, sz * span)
    cup.rotation.x = Math.PI / 2 // 컵 축을 앞뒤로
    const pad = add(
      g,
      cyl(h * 0.2, w * 0.3, 26),
      mat(C.black, { roughness: 0.95 }),
      0,
      h * 0.02,
      sz * (span - w * 0.2),
    )
    pad.rotation.x = Math.PI / 2
  }
}

/** PC 케이스: 본체 + 전면 유리 + 하단 받침. */
function tower(g: THREE.Group, w: number, h: number, dep: number, shell: number) {
  add(g, new THREE.BoxGeometry(w, h, dep), mat(shell), 0, 0, 0)
  add(
    g,
    new THREE.BoxGeometry(w * 0.9, h * 0.86, 3),
    mat(0x2b3f4a, { roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.55 }),
    0,
    h * 0.02,
    dep / 2 + 2,
  )
  add(g, new THREE.BoxGeometry(w * 0.86, 22, dep * 0.8), mat(C.black), 0, -h / 2 - 10, 0)
}

/** 키보드: 바닥판 + 살짝 솟은 키 영역. */
function keyboard(g: THREE.Group, w: number, h: number, dep: number, shell: number) {
  add(g, new THREE.BoxGeometry(w, h * 0.55, dep), mat(shell), 0, -h * 0.22, 0)
  add(
    g,
    new THREE.BoxGeometry(w * 0.94, h * 0.5, dep * 0.86),
    mat(C.black, { roughness: 0.85 }),
    0,
    h * 0.2,
    0,
  )
}

/** 마우스: 뒤가 부풀고 앞이 낮은 형태. */
function mouse(g: THREE.Group, w: number, h: number, dep: number, shell: number) {
  const geo = new THREE.SphereGeometry(0.5, 20, 14)
  const body = add(g, geo, mat(shell, { roughness: 0.5 }), 0, 0, dep * 0.08)
  body.scale.set(w, h * 1.7, dep)
  const clip = add(g, new THREE.BoxGeometry(w * 0.06, h * 0.6, dep * 0.55), mat(C.black), 0, h * 0.3, dep * 0.2)
  clip.castShadow = false
}

/** 오디오 인터페이스: 본체 + 큰 게인 노브 두 개 + 모니터 노브. */
function audioInterface(g: THREE.Group, w: number, h: number, dep: number, shell: number) {
  add(g, new THREE.BoxGeometry(w, h, dep), mat(shell), 0, 0, 0)
  const face = dep / 2 + 1
  const knob = mat(C.black, { roughness: 0.7 })
  for (const kx of [-w * 0.32, -w * 0.1]) {
    add(g, cyl(h * 0.3, 10, 18), knob, kx, 0, face).rotation.set(Math.PI / 2, 0, 0)
  }
  add(g, cyl(h * 0.42, 12, 22), mat(C.metal, { metalness: 0.6 }), w * 0.3, 0, face).rotation.set(
    Math.PI / 2,
    0,
    0,
  )
}

/** 모니터 받침대: 상판 + 양쪽 다리 (아래가 비어 있다). */
function riser(g: THREE.Group, w: number, h: number, dep: number, shell: number) {
  const m = mat(shell)
  add(g, new THREE.BoxGeometry(w, h * 0.22, dep), m, 0, h * 0.39, 0)
  for (const sx of [-1, 1]) {
    add(g, new THREE.BoxGeometry(w * 0.05, h * 0.78, dep * 0.9), m, sx * (w / 2 - w * 0.03), -h * 0.11, 0)
  }
}

function disc(g: THREE.Group, w: number, h: number, color: number) {
  add(g, cyl(w / 2, h, 32), mat(color, { roughness: 0.8 }), 0, 0, 0)
}

/**
 * NS2 독 + 본체 일체.
 * 본체가 독 안으로 들어가는 구조라 하나의 덩어리로 그린다.
 * 앞면에 화면, 좌우에 조이콘(검정)이 보인다.
 */
function dock(g: THREE.Group, w: number, h: number, dep: number, shell: number) {
  add(g, new THREE.BoxGeometry(w, h, dep), mat(shell), 0, 0, 0)
  const face = dep / 2 + 1
  add(
    g,
    new THREE.BoxGeometry(w * 0.58, h * 0.64, 2),
    mat(C.screen, { roughness: 0.3, emissive: 0x0b1a20 }),
    0,
    h * 0.07,
    face,
  )
  // 조이콘 — 검정
  for (const sx of [-1, 1]) {
    add(
      g,
      new THREE.BoxGeometry(w * 0.17, h * 0.68, dep * 0.92),
      mat(C.black, { roughness: 0.6 }),
      sx * w * 0.395,
      h * 0.07,
      0,
    )
  }
  // 독에 꽂히는 자리
  add(g, new THREE.BoxGeometry(w * 0.74, 5, dep * 0.5), mat(C.shellDark), 0, -h / 2 + 4, 0)
}

/** 기타: 바디 + 넥 + 헤드. 세워 둔 상태. */
function guitar(g: THREE.Group, w: number, h: number, dep: number) {
  const body = add(g, new THREE.SphereGeometry(0.5, 18, 14), mat(0xb8623a, { roughness: 0.4 }), 0, -h * 0.32, 0)
  body.scale.set(w, h * 0.42, dep * 1.6)
  add(g, new THREE.BoxGeometry(w * 0.16, h * 0.5, dep * 0.7), mat(C.wood), 0, h * 0.12, dep * 0.1)
  add(g, new THREE.BoxGeometry(w * 0.26, h * 0.09, dep * 0.7), mat(C.wood), 0, h * 0.42, dep * 0.1)
}

/** 멀티탭: 몸통 + 소켓 구멍. */
function powerStrip(g: THREE.Group, w: number, h: number, dep: number) {
  add(g, new THREE.BoxGeometry(w, h, dep), mat(0xd6d8d3, { roughness: 0.8 }), 0, 0, 0)
  const n = 6
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5)
    add(g, cyl(h * 0.3, 4, 18), mat(C.screen), x, h / 2 - 1, 0)
  }
}

function outlet(g: THREE.Group, w: number, h: number, dep: number) {
  add(g, new THREE.BoxGeometry(w, h, dep), mat(0xe2e4e0, { roughness: 0.85 }), 0, 0, 0)
  for (const sy of [-1, 1]) {
    add(g, cyl(h * 0.22, 4, 20), mat(C.screen), 0, sy * h * 0.24, dep / 2 + 1).rotation.set(
      Math.PI / 2,
      0,
      0,
    )
  }
}

/** 모니터 조명: 바 + 아래를 향한 발광면. */
function lightBar(g: THREE.Group, w: number, h: number, dep: number) {
  add(g, new THREE.BoxGeometry(w, h, dep * 0.5), mat(C.shellDark), 0, 0, 0)
  add(
    g,
    new THREE.BoxGeometry(w * 0.94, 3, dep * 0.34),
    mat(0xfff0d0, { emissive: 0xffe6b0, emissiveIntensity: 0.9, roughness: 1 }),
    0,
    -h / 2 - 1,
    0,
  )
}
