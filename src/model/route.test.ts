import { describe, expect, it } from 'vitest'
import { cables, desk, devices, plannedDevices } from '../data/setup'
import { indexPorts, ownerOf, routeOptsFor } from './derive'
import { obstaclesFor, pathHits } from './obstacle'
import { absoluteY, indexDevices, supportChain } from './mount'
import { cableHoleCenter, corridorLevel, routeCable, routeLength } from './route'

const dIndex = indexDevices([...devices, ...plannedDevices])
const H = 710

/** 경로가 축을 따라만 꺾이는가 (대각선으로 상판을 가로지르지 않는가). */
function isAxisAligned(points: { x: number; y: number; z: number }[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const moved = [a.x !== b.x, a.y !== b.y, a.z !== b.z].filter(Boolean).length
    if (moved > 1) return false
  }
  return true
}

describe('배선 경로', () => {
  it('책상에 배선트레이와 배선홀이 정의돼 있다', () => {
    expect(desk.tray).toBeDefined()
    expect(desk.tray!.w).toBe(660)
    expect(desk.tray!.h).toBe(140)
    expect(desk.cableHole).toBeDefined()
  })

  it('배선홈은 상판 뒷변 중앙이 파인 것이다 — 트레이 뒷판이 아니다', () => {
    const hole = desk.cableHole!
    expect(hole.verified).toBe(true)
    expect(hole.x).toBe(desk.w / 2) // 중앙
    expect(hole.depth).toBeGreaterThan(0)
    expect(hole.depth).toBeLessThan(desk.d / 2) // 상판을 가로지르지는 않는다
    // 홈의 중심은 상판 뒷변 바로 안쪽
    const center = cableHoleCenter(desk)!
    expect(center.z).toBe(desk.d - hole.depth / 2)
    expect(center.z).toBeGreaterThan(desk.d - hole.depth)
  })

  it('모니터는 좌측 30% 후면 클램프의 모니터암을 따라 높이가 정해진다', () => {
    const arm = dIndex.get('arm')!
    const monitor = dIndex.get('monitor')!
    expect(arm.pos.x).toBe(Math.round(desk.w * 0.3))
    expect(arm.pos.z).toBeGreaterThan(desk.d * 0.9) // 후면
    expect(monitor.mount).toEqual({ on: 'arm' })
    // 암 윗면에 그대로 얹힌다
    expect(absoluteY('monitor', H, dIndex)).toBe(absoluteY('arm', H, dIndex) + arm.dims.h)
  })

  it('받침대가 상판 배선홈보다 앞에 있다', () => {
    const stand = dIndex.get('stand')!
    expect(stand.pos.z + stand.dims.d / 2).toBeLessThan(desk.d - desk.cableHole!.depth)
  })

  it('멀티탭이 트레이 안에 들어간다', () => {
    const strip = dIndex.get('strip')!
    const tray = desk.tray!
    expect(strip.dims.w).toBeLessThanOrEqual(tray.w)
    expect(strip.dims.h).toBeLessThanOrEqual(tray.h)
    expect(strip.pos.yOff).toBe(-(desk.thickness + tray.h))
  })

  it('경계를 넘는 케이블은 배선홈을 거쳐 트레이 높이로 내려간다', () => {
    const path = routeCable('pc', 'stand', H, dIndex, desk)
    const corridorY = corridorLevel(H, desk)
    const center = cableHoleCenter(desk)!
    expect(path.some((p) => Math.abs(p.y - corridorY) < 1)).toBe(true)
    expect(path.some((p) => p.x === center.x && Math.abs(p.z - center.z) < 1)).toBe(true)
  })

  it('모든 구간이 축을 따라 꺾인다', () => {
    for (const [a, b] of [
      ['pc', 'stand'],
      ['pc', 'monitor'],
      ['strip', 'wall'],
      ['itf', 'spkL'],
    ] as const) {
      expect(isAxisAligned(routeCable(a, b, H, dIndex, desk))).toBe(true)
    }
  })

  it('상판 위끼리는 트레이로 내려가지 않는다', () => {
    const path = routeCable('itf', 'spkL', H, dIndex, desk)
    const corridorY = corridorLevel(H, desk)
    expect(path.every((p) => p.y > corridorY)).toBe(true)
  })

  it('direct 옵션은 트레이를 우회한다 — 간헐 연결용', () => {
    const viaTray = routeLength(routeCable('guitar', 'itf', H, dIndex, desk))
    const direct = routeLength(routeCable('guitar', 'itf', H, dIndex, desk, { direct: true }))
    expect(direct).toBeLessThan(viaTray)
  })

  it('경로 길이는 직선 거리보다 길다 — 실제로 돌아가기 때문', () => {
    const path = routeCable('pc', 'stand', H, dIndex, desk)
    const a = path[0]!
    const b = path.at(-1)!
    const straight = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    expect(routeLength(path)).toBeGreaterThan(straight)
  })

  it('상판을 올리면 경계 케이블 경로가 길어진다', () => {
    const low = routeLength(routeCable('pc', 'stand', desk.hMin, dIndex, desk))
    const high = routeLength(routeCable('pc', 'stand', desk.hMax, dIndex, desk))
    expect(high).toBeGreaterThan(low)
  })
})

describe('선이 다른 물건을 뚫지 않는다', () => {
  // 보유 기기만 본다. 추가 예정 기기는 켰을 때만 경로에 끼어든다.
  const idx = indexDevices(devices)
  const pIdx = indexPorts(devices)

  /**
   * 양끝 기기와 그것들을 받치는 것들을 뺀 나머지를 뚫는지 본다.
   * 헤드폰 선이 제 거치대를 타고 내려오는 건 관통이 아니다.
   */
  function hitsFor(cable: (typeof cables)[number], avoid = true, h = H) {
    const a = ownerOf(cable.from, pIdx, idx)
    const b = ownerOf(cable.to, pIdx, idx)
    if (!a || !b) return []
    const path = routeCable(a, b, h, idx, desk, routeOptsFor(cable, avoid ? devices : undefined))
    const exclude = new Set([...supportChain(a, idx), ...supportChain(b, idx)])
    return pathHits(path, obstaclesFor(devices, exclude, h, idx))
  }

  it('모든 케이블이 양끝 기기 외에는 아무것도 통과하지 않는다', () => {
    const offenders = cables
      .map((c) => ({ id: c.id, hits: hitsFor(c) }))
      .filter((r) => r.hits.length > 0)
    expect(offenders).toEqual([])
  })

  it('회피를 끄면 실제로 뚫는 케이블이 있다 — 회피가 일을 하고 있다는 뜻', () => {
    const offenders = cables.filter((c) => hitsFor(c, false).length > 0)
    expect(offenders.length).toBeGreaterThan(0)
  })

  it('상판을 어느 높이로 올려도 뚫지 않는다', () => {
    for (const h of [desk.hMin, 800, 900, 1100, desk.hMax]) {
      const offenders = cables
        .map((c) => ({ id: c.id, hits: hitsFor(c, true, h) }))
        .filter((r) => r.hits.length > 0)
      expect({ h, offenders }).toEqual({ h, offenders: [] })
    }
  })
})
