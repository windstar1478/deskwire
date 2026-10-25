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

  // 상판 위끼리 — 공중을 가로지르지 않고 상판 바로 위를 타고 간다.
  const surfaceY = deskHeight + SURFACE_CLEARANCE
  if (aTop && bTop) {
    const build = (cz: number) =>
      dedupe([
        pa,
        { x: pa.x, y: surfaceY, z: pa.z },
        { x: pa.x, y: surfaceY, z: cz },
        { x: pb.x, y: surfaceY, z: cz },
        { x: pb.x, y: surfaceY, z: pb.z },
        pb,
      ])
    // 뒤쪽부터 앞으로 훑으며 아무것도 뚫지 않는 통로를 고른다.
    return pickClear(build, backCandidates(backZ), boxes)
  }

  // 한쪽이라도 상판 아래(트레이·바닥)면 배선 통로를 쓴다.
  const build = (cz: number) => {
    const enterA = descend(pa, aTop, surfaceY, corridorY, cz, hole)
    const enterB = descend(pb, bTop, surfaceY, corridorY, cz, hole)
    return dedupe([
      pa,
      ...enterA,
      { x: enterA.at(-1)?.x ?? pa.x, y: corridorY, z: cz },
      { x: enterB.at(-1)?.x ?? pb.x, y: corridorY, z: cz },
      ...[...enterB].reverse(),
      pb,
    ])
  }
  return pickClear(build, corridorCandidates(corridorZ, desk), boxes)
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
  build: (z: number) => Point[],
  candidates: readonly number[],
  boxes: readonly Box[],
): Point[] {
  if (boxes.length === 0) return build(candidates[0]!)
  let best: { path: Point[]; hits: number } | undefined
  for (const z of candidates) {
    const path = build(z)
    const hits = pathHits(path, boxes).length
    if (hits === 0) return path
    if (!best || hits < best.hits) best = { path, hits }
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
  fromTop: boolean,
  surfaceY: number,
  corridorY: number,
  corridorZ: number,
  hole: { x: number; z: number } | undefined,
): Point[] {
  if (fromTop && hole) {
    // 상판 위로 내려와 통로까지 물러선 뒤, 축을 따라 배선홈으로 가서 수직으로 떨어진다.
    // 통로(corridorZ)는 바깥에서 후보를 훑어 정하므로 여기서 기기 z 를 그대로 쓰지 않는다.
    return [
      { x: p.x, y: surfaceY, z: p.z },
      { x: p.x, y: surfaceY, z: corridorZ },
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
