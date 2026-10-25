import type { Device, DeviceId, Mount } from '../data/types'

/** 기기가 상판과 함께 움직이는 계열인가, 바닥에 고정된 계열인가. */
export type Lineage = 'desk' | 'ground'

export type DeviceIndex = ReadonlyMap<DeviceId, Device>

export function indexDevices(devices: readonly Device[]): DeviceIndex {
  return new Map(devices.map((d) => [d.id, d]))
}

/**
 * mount 사슬을 따라 올라가 최종 기준면을 찾는다.
 * 참조가 끊기거나 순환이면 'floor' 로 떨어뜨린다 (렌더가 죽지 않게).
 */
export function rootMount(id: DeviceId, index: DeviceIndex): Exclude<Mount, { on: DeviceId }> {
  const seen = new Set<DeviceId>()
  let cur: DeviceId | undefined = id
  while (cur !== undefined) {
    if (seen.has(cur)) return 'floor'
    seen.add(cur)
    const dev = index.get(cur)
    if (!dev) return 'floor'
    const m = dev.mount
    if (typeof m === 'string') return m
    cur = m.on
  }
  return 'floor'
}

/** 그 기기를 받치고 있는 것들 (자기 자신 포함). 케이블은 제 받침을 타고 다닌다. */
export function supportChain(id: DeviceId, index: DeviceIndex): DeviceId[] {
  const out: DeviceId[] = []
  const seen = new Set<DeviceId>()
  let cur: DeviceId | undefined = id
  while (cur !== undefined && !seen.has(cur)) {
    seen.add(cur)
    out.push(cur)
    const m: Mount | undefined = index.get(cur)?.mount
    cur = m !== undefined && typeof m === 'object' ? m.on : undefined
  }
  return out
}

export function lineageOf(id: DeviceId, index: DeviceIndex): Lineage {
  const root = rootMount(id, index)
  return root === 'desktop' || root === 'under-desktop' ? 'desk' : 'ground'
}

/**
 * 기기 바닥면의 절대 높이(mm). 바닥이 0.
 *
 * yOff 는 언제나 "기준면에서 기기 밑면까지의 오프셋"이다 (프로토타입 deskrise.html 의 규약).
 *
 * - floor / fixed          : 바닥에서 yOff
 * - desktop                : 상판 윗면 + yOff
 * - under-desktop          : 상판 윗면 + yOff (yOff 가 음수라 상판 아래로 내려간다)
 * - { on: X }              : X 의 윗면 + yOff
 */
export function absoluteY(id: DeviceId, deskHeight: number, index: DeviceIndex): number {
  const seen = new Set<DeviceId>()
  return resolve(id)

  function resolve(cur: DeviceId): number {
    if (seen.has(cur)) return 0
    seen.add(cur)
    const dev = index.get(cur)
    if (!dev) return 0
    const off = dev.pos.yOff ?? 0
    const m = dev.mount
    if (m === 'floor' || m === 'fixed') return off
    if (m === 'desktop' || m === 'under-desktop') return deskHeight + off
    const parent = index.get(m.on)
    if (!parent) return off
    return resolve(m.on) + parent.dims.h + off
  }
}

/** 기기 중심의 절대 좌표. 케이블 길이 계산은 이 점들 사이로 한다. */
export function absoluteCenter(
  id: DeviceId,
  deskHeight: number,
  index: DeviceIndex,
): { x: number; y: number; z: number } {
  const dev = index.get(id)
  if (!dev) return { x: 0, y: 0, z: 0 }
  return {
    x: dev.pos.x,
    z: dev.pos.z,
    y: absoluteY(id, deskHeight, index) + dev.dims.h / 2,
  }
}
