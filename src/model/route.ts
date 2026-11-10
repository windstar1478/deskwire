import type { Desk, Device, DeviceId, Vec3 } from '../data/types'
import { absoluteCenter, lineageOf, supportChain, type DeviceIndex } from './mount'
import { obstaclesFor, pathHits, type Box } from './obstacle'

export type Point = { x: number; y: number; z: number }

/** 상판 뒷변 배선홈의 중심 위치. 홈은 뒷변에서 앞으로 depth 만큼 파여 있다. */
export function cableHoleCenter(desk: Desk): { x: number; z: number } | undefined {
  const hole = desk.cableHole
  if (!hole) return undefined
  return { x: hole.x, z: desk.d - hole.depth / 2 }
}

/**
 * 홈을 통과할 수 있는 x 후보들.
 * 홈은 폭이 있으므로 중심으로만 지나갈 이유가 없다 — 중심 바로 옆에 기기가 있으면
 * 비켜서 지나간다. 중심부터 바깥쪽으로 번갈아 넓혀 간다.
 */
function holeXCandidates(desk: Desk): number[] {
  const hole = desk.cableHole
  if (!hole) return [0]
  const reach = Math.max(0, hole.w / 2 - 20) // 가장자리 여유
  const out = [hole.x]
  for (let d = 40; d <= reach; d += 40) {
    out.push(hole.x - d, hole.x + d)
  }
  return out
}

/**
 * 케이블이 실제로 지나가는 경로.
 *
 * 직선으로 이으면 다른 기기를 관통한다. 실제로는 이렇게 간다:
 *  - 상판 위끼리     → 받침대 뒤쪽을 타고 넘어간다
 *  - 경계를 넘을 때  → 상판 뒷변 배선홈으로 내려가 배선트레이를 통과한다
 *  - 상판 아래끼리   → 트레이 높이에서 바로 간다
 *
 * 순수 함수라 2D·3D 렌더러와 길이 계산이 같은 경로를 쓴다.
 */
export interface RouteOptions {
  /**
   * 트레이를 거치지 않고 바로 잇는다.
   * 기타처럼 연주할 때만 전면 잭에 꽂는 케이블은 배선트레이를 타지 않는다.
   */
  direct?: boolean
  /**
   * 피해 가야 할 기기 목록. 주면 경로가 기기를 뚫지 않도록 통로를 고른다.
   * 양끝에 꽂히는 기기는 여기서 알아서 뺀다.
   */
  avoid?: readonly Device[]
}

export function routeCable(
  a: DeviceId,
  b: DeviceId,
  deskHeight: number,
  index: DeviceIndex,
  desk: Desk,
  opts: RouteOptions = {},
): Point[] {
  const pa = absoluteCenter(a, deskHeight, index)
  const pb = absoluteCenter(b, deskHeight, index)

  const corridorY = corridorLevel(deskHeight, desk)
  const corridorZ = desk.tray?.z ?? desk.d - 120
  const backZ = desk.d - 40
  const hole = cableHoleCenter(desk)

  const aTop = isAboveDesktop(a, index, deskHeight, pa, desk)
  const bTop = isAboveDesktop(b, index, deskHeight, pb, desk)

  // 상시 배선이 아니면 트레이에 넣지 않는다 — 축을 따라 바로 간다.
  if (opts.direct) {
    return dedupe([pa, { x: pb.x, y: pa.y, z: pa.z }, { x: pb.x, y: pa.y, z: pb.z }, pb])
  }

  const boxes = obstacleBoxes(a, b, deskHeight, index, opts)
  const holeXs = holeXCandidates(desk)

  // 상판 위끼리 — 공중을 가로지르지 않고 상판 바로 위를 타고 간다.
  const surfaceY = deskHeight + SURFACE_CLEARANCE
  if (aTop && bTop) {
    const ra = riserAt(a, index)
    const rb = riserAt(b, index)
    const build = (cz: number) =>
      dedupe([
        pa,
        { x: ra.x, y: pa.y, z: pa.z },
        { x: ra.x, y: pa.y, z: ra.z },
        { x: ra.x, y: surfaceY, z: ra.z },
        { x: ra.x, y: surfaceY, z: cz },
        { x: rb.x, y: surfaceY, z: cz },
        { x: rb.x, y: surfaceY, z: rb.z },
        { x: rb.x, y: pb.y, z: rb.z },
        { x: rb.x, y: pb.y, z: pb.z },
        pb,
      ])
    // 뒤쪽부터 앞으로 훑으며 아무것도 뚫지 않는 통로를 고른다.
    return pickClear((cz) => build(cz), backCandidates(backZ), [0], boxes)
  }

  // 한쪽이라도 상판 아래(트레이·바닥)면 배선 통로를 쓴다.
  const build = (cz: number, holeX: number) => {
    const h = hole ? { x: holeX, z: hole.z } : undefined
    const enterA = descend(pa, riserAt(a, index), aTop, surfaceY, corridorY, cz, h)
    const enterB = descend(pb, riserAt(b, index), bTop, surfaceY, corridorY, cz, h)
    return dedupe([
      pa,
      ...enterA,
      { x: enterA.at(-1)?.x ?? pa.x, y: corridorY, z: cz },
      { x: enterB.at(-1)?.x ?? pb.x, y: corridorY, z: cz },
      ...[...enterB].reverse(),
      pb,
    ])
  }
  return pickClear(build, corridorCandidates(corridorZ, desk), holeXs, boxes)
}

/** 양끝 기기를 뺀 장애물 상자들. avoid 를 주지 않으면 검사하지 않는다. */
function obstacleBoxes(
  a: DeviceId,
  b: DeviceId,
  deskHeight: number,
  index: DeviceIndex,
  opts: RouteOptions,
): Box[] {
  if (!opts.avoid) return []
  // 양끝 기기와, 그것들을 받치고 있는 것들은 장애물이 아니다.
  const exclude = new Set([...supportChain(a, index), ...supportChain(b, index)])
  return obstaclesFor(opts.avoid, exclude, deskHeight, index)
}

/**
 * 후보 통로를 순서대로 시도해 아무것도 뚫지 않는 첫 경로를 쓴다.
 * 전부 막히면 가장 적게 걸리는 것을 쓴다 — 경로가 아예 없는 것보다 낫다.
 */
function pickClear(
  build: (z: number, holeX: number) => Point[],
  candidates: readonly number[],
  holeXs: readonly number[],
  boxes: readonly Box[],
): Point[] {
  if (boxes.length === 0) return build(candidates[0]!, holeXs[0]!)
  let best: { path: Point[]; hits: number } | undefined
  for (const holeX of holeXs) {
    for (const z of candidates) {
      const path = build(z, holeX)
      const hits = pathHits(path, boxes).length
      if (hits === 0) return path
      if (!best || hits < best.hits) best = { path, hits }
    }
  }
  return best!.path
}

/** 상판 위 통로 후보 — 뒤쪽부터 앞으로. */
function backCandidates(backZ: number): number[] {
  const out: number[] = []
  for (let z = backZ; z >= 60; z -= 20) out.push(z)
  return out
}

/** 상판 아래 통로 후보 — 트레이 위치에서 시작해 앞뒤로 벌려 본다. */
function corridorCandidates(corridorZ: number, desk: Desk): number[] {
  const out = [corridorZ]
  for (let d = 20; d <= 360; d += 20) {
    if (corridorZ - d > 40) out.push(corridorZ - d)
    if (corridorZ + d < desk.d - 20) out.push(corridorZ + d)
  }
  return out
}

/**
 * 그 기기의 케이블이 오르내리는 지점.
 * 모니터암에 달린 모니터면 암이 서 있는 자리다 — 선은 허공이 아니라 제 받침을 탄다.
 */
function riserAt(id: DeviceId, index: DeviceIndex): { x: number; z: number } {
  const chain = supportChain(id, index)
  const base = index.get(chain[chain.length - 1] ?? id) ?? index.get(id)
  return { x: base?.pos.x ?? 0, z: base?.pos.z ?? 0 }
}

/** 배선 통로(트레이 안쪽)의 높이. */
/** 상판 위를 기는 선의 높이. 표면에서 살짝 띄운다. */
export const SURFACE_CLEARANCE = 12

export function corridorLevel(deskHeight: number, desk: Desk): number {
  const trayH = desk.tray?.h ?? 120
  return deskHeight - desk.thickness - trayH / 2
}

function isAboveDesktop(
  id: DeviceId,
  index: DeviceIndex,
  deskHeight: number,
  p: Point,
  desk: Desk,
): boolean {
  return lineageOf(id, index) === 'desk' && p.y > deskHeight - desk.thickness
}

/** 그 끝이 배선 통로까지 내려가는 구간. 상판 위면 배선홀을 거친다. */
function descend(
  p: Point,
  riser: { x: number; z: number },
  fromTop: boolean,
  surfaceY: number,
  corridorY: number,
  corridorZ: number,
  hole: { x: number; z: number } | undefined,
): Point[] {
  if (fromTop && hole) {
    // 제 받침을 타고 상판까지 내려온 뒤, 통로로 물러서서 배선홈으로 가 수직으로 떨어진다.
    // 통로(corridorZ)는 바깥에서 후보를 훑어 정하므로 여기서 기기 z 를 그대로 쓰지 않는다.
    return [
      { x: riser.x, y: p.y, z: p.z },
      { x: riser.x, y: p.y, z: riser.z },
      { x: riser.x, y: surfaceY, z: riser.z },
      { x: riser.x, y: surfaceY, z: corridorZ },
      { x: hole.x, y: surfaceY, z: corridorZ },
      { x: hole.x, y: surfaceY, z: hole.z },
      { x: hole.x, y: corridorY, z: hole.z },
      { x: hole.x, y: corridorY, z: corridorZ },
    ]
  }
  return [
    { x: p.x, y: corridorY, z: p.z },
    { x: p.x, y: corridorY, z: corridorZ },
  ]
}

/** 경로 총 길이 — 실제로 꺾여 도는 거리. */
export function routeLength(points: readonly Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  }
  return total
}

function dedupe(points: Point[]): Point[] {
  return points.filter((p, i) => {
    if (i === 0) return true
    const q = points[i - 1]!
    return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > 1
  })
}

export function toVec3(p: Point): Vec3 {
  return { x: p.x, z: p.z, yOff: p.y }
}
