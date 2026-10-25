import type { Device, DeviceId } from '../data/types'
import { absoluteY, type DeviceIndex } from './mount'

export interface Box {
  id: DeviceId
  min: { x: number; y: number; z: number }
  max: { x: number; y: number; z: number }
}

export type Point = { x: number; y: number; z: number }

/**
 * 기기의 실제 점유 부피.
 * 좌우·앞뒤는 margin 만큼 깎아 스치는 것을 통과로 보지 않지만,
 * 아랫면은 깎지 않는다. 그래야 상판 위를 기는 선이 기기 밑으로 숨지 못한다.
 */
export function deviceBox(d: Device, deskHeight: number, index: DeviceIndex, margin = 6): Box {
  const y = absoluteY(d.id, deskHeight, index)
  const hw = Math.max(0, d.dims.w / 2 - margin)
  const hd = Math.max(0, d.dims.d / 2 - margin)
  return {
    id: d.id,
    min: { x: d.pos.x - hw, y, z: d.pos.z - hd },
    max: { x: d.pos.x + hw, y: y + Math.max(0, d.dims.h - margin), z: d.pos.z + hd },
  }
}

/** 이 케이블이 피해야 할 기기들. 양끝에 꽂히는 기기는 당연히 제외한다. */
export function obstaclesFor(
  devices: readonly Device[],
  exclude: ReadonlySet<DeviceId>,
  deskHeight: number,
  index: DeviceIndex,
): Box[] {
  return devices
    .filter((d) => !exclude.has(d.id) && d.dims.w > 0 && d.dims.h > 0)
    .map((d) => deviceBox(d, deskHeight, index))
}

/** 선분이 박스를 관통하는가 (slab 판정). */
export function segmentHitsBox(a: Point, b: Point, box: Box): boolean {
  let t0 = 0
  let t1 = 1
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = b[axis] - a[axis]
    const lo = box.min[axis]
    const hi = box.max[axis]
    if (Math.abs(d) < 1e-6) {
      if (a[axis] < lo || a[axis] > hi) return false
      continue
    }
    let tA = (lo - a[axis]) / d
    let tB = (hi - a[axis]) / d
    if (tA > tB) [tA, tB] = [tB, tA]
    t0 = Math.max(t0, tA)
    t1 = Math.min(t1, tB)
    if (t0 > t1) return false
  }
  return true
}

/** 경로 전체가 뚫고 지나가는 기기들. */
export function pathHits(points: readonly Point[], boxes: readonly Box[]): DeviceId[] {
  const hit = new Set<DeviceId>()
  for (let i = 1; i < points.length; i++) {
    for (const box of boxes) {
      if (segmentHitsBox(points[i - 1]!, points[i]!, box)) hit.add(box.id)
    }
  }
  return [...hit]
}
