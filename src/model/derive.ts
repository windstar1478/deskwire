import type {
  Cable,
  CableId,
  Desk,
  Device,
  DeviceId,
  EndpointId,
  Port,
  PortId,
  SetupData,
} from '../data/types'
import { absoluteY, lineageOf, type DeviceIndex, type Lineage } from './mount'
import { applySlack, pathLength, recommendedLength, DEFAULT_SLACK, type SlackRule } from './geometry'

export type PortIndex = ReadonlyMap<PortId, { port: Port; deviceId: DeviceId }>

export function indexPorts(devices: readonly Device[]): PortIndex {
  const m = new Map<PortId, { port: Port; deviceId: DeviceId }>()
  for (const d of devices) for (const p of d.ports ?? []) m.set(p.id, { port: p, deviceId: d.id })
  return m
}

/** 케이블 끝(포트 ID 또는 기기 ID)이 붙어 있는 기기. */
export function ownerOf(endpoint: EndpointId, ports: PortIndex, devices: DeviceIndex): DeviceId | undefined {
  return ports.get(endpoint)?.deviceId ?? (devices.has(endpoint) ? endpoint : undefined)
}

export function portOf(endpoint: EndpointId, ports: PortIndex): Port | undefined {
  return ports.get(endpoint)?.port
}

/**
 * 그 케이블의 경로 옵션.
 * - 간헐 연결(기타)은 배선트레이를 타지 않는다.
 * - avoid 를 주면 다른 기기를 뚫지 않도록 통로를 고른다.
 */
export function routeOptsFor(cable: Cable, avoid?: readonly Device[]) {
  return { direct: cable.intermittent === true, avoid }
}

/** 길이 판정 대상인가. 동글처럼 직결되는 것은 lengthMm 이 0 이라 대상이 아니다. */
export function hasPhysicalLength(cable: Cable): boolean {
  return (cable.lengthMm ?? 0) > 0
}

/** 양끝이 서로 다른 계열(상판계 vs 바닥계)에 있는가 — 이 케이블만 책상 상승을 제한한다. */
export function crossesBoundary(cable: Cable, ports: PortIndex, devices: DeviceIndex): boolean {
  const a = ownerOf(cable.from, ports, devices)
  const b = ownerOf(cable.to, ports, devices)
  if (!a || !b) return false
  return lineageOf(a, devices) !== lineageOf(b, devices)
}

export function lineageOfCableEnd(
  endpoint: EndpointId,
  ports: PortIndex,
  devices: DeviceIndex,
): Lineage | undefined {
  const owner = ownerOf(endpoint, ports, devices)
  return owner ? lineageOf(owner, devices) : undefined
}

/** 이 높이에서 케이블이 실제로 필요로 하는 길이(여유 포함). */
export function requiredLength(
  cable: Cable,
  deskHeight: number,
  ports: PortIndex,
  devices: DeviceIndex,
  desk: Desk,
  slack: SlackRule = DEFAULT_SLACK,
  avoid?: readonly Device[],
): number | undefined {
  const a = ownerOf(cable.from, ports, devices)
  const b = ownerOf(cable.to, ports, devices)
  if (!a || !b) return undefined
  return applySlack(
    pathLength(a, b, deskHeight, devices, desk, routeOptsFor(cable, avoid)),
    slack,
  )
}

export interface CableFit {
  cable: Cable
  crosses: boolean
  required: number | undefined
  have: number | undefined
  /** 보유 - 필요. 음수면 부족. */
  marginMm: number | undefined
  status: 'ok' | 'short' | 'unknown'
  /** 부족할 때, 사서 바꾸면 되는 가장 짧은 규격 길이. */
  recommendMm?: number
}

export function cableFit(
  cable: Cable,
  deskHeight: number,
  ports: PortIndex,
  devices: DeviceIndex,
  desk: Desk,
  slack: SlackRule = DEFAULT_SLACK,
  avoid?: readonly Device[],
): CableFit {
  const crosses = crossesBoundary(cable, ports, devices)
  const required = requiredLength(cable, deskHeight, ports, devices, desk, slack, avoid)
  const have = hasPhysicalLength(cable) ? cable.lengthMm : undefined
  if (required === undefined || have === undefined) {
    return { cable, crosses, required, have, marginMm: undefined, status: 'unknown' }
  }
  const marginMm = have - required
  if (marginMm >= 0) return { cable, crosses, required, have, marginMm, status: 'ok' }
  return {
    cable,
    crosses,
    required,
    have,
    marginMm,
    status: 'short',
    recommendMm: recommendedLength(required),
  }
}

export interface HeightLimit {
  cableId: CableId
  /** 이 케이블이 허용하는 최대 상판 높이. hMin 에서도 부족하면 hMin 미만을 의미한다. */
  maxHeight: number
  /** hMin 에서조차 길이가 모자란가. */
  shortAtMin: boolean
}

/**
 * 케이블 하나가 허용하는 최대 상판 높이.
 * 필요 길이가 높이에 대해 단조증가한다는 보장이 없으므로 이분법 대신 스캔한다.
 */
export function maxHeightFor(
  cable: Cable,
  ports: PortIndex,
  devices: DeviceIndex,
  desk: Desk,
  slack: SlackRule = DEFAULT_SLACK,
  stepMm = 1,
): HeightLimit | undefined {
  if (!hasPhysicalLength(cable)) return undefined
  if (!crossesBoundary(cable, ports, devices)) return undefined
  const have = cable.lengthMm!
  let best = desk.hMin
  let shortAtMin = false
  for (let h = desk.hMin; h <= desk.hMax; h += stepMm) {
    const need = requiredLength(cable, h, ports, devices, desk, slack)
    if (need === undefined) return undefined
    if (need <= have) best = h
    else if (h === desk.hMin) shortAtMin = true
  }
  return { cableId: cable.id, maxHeight: best, shortAtMin }
}

export interface DeskHeightCeiling {
  /** 모든 경계 케이블을 만족시키는 최대 상판 높이. */
  maxHeight: number
  /** 그 한계를 만든 케이블들. */
  limitedBy: HeightLimit[]
  /** hMin 에서도 이미 부족한 케이블들 — 있으면 maxHeight 는 의미가 없다. */
  shortAtMin: HeightLimit[]
}

/** 가장 먼저 한계에 닿는 케이블이 책상 전체의 상승 한계를 결정한다. */
export function maxDeskHeight(
  cables: readonly Cable[],
  ports: PortIndex,
  devices: DeviceIndex,
  desk: Desk,
  slack: SlackRule = DEFAULT_SLACK,
): DeskHeightCeiling {
  const limits = cables
    .map((c) => maxHeightFor(c, ports, devices, desk, slack))
    .filter((l): l is HeightLimit => l !== undefined)

  if (limits.length === 0) {
    return { maxHeight: desk.hMax, limitedBy: [], shortAtMin: [] }
  }
  const maxHeight = Math.min(...limits.map((l) => l.maxHeight))
  return {
    maxHeight,
    limitedBy: limits.filter((l) => l.maxHeight === maxHeight),
    shortAtMin: limits.filter((l) => l.shortAtMin),
  }
}

/** 특정 높이에서 길이가 모자란 케이블들. 실사용 높이 판정에 쓴다. */
export function shortagesAt(
  cables: readonly Cable[],
  height: number,
  ports: PortIndex,
  devices: DeviceIndex,
  desk: Desk,
  slack: SlackRule = DEFAULT_SLACK,
  avoid?: readonly Device[],
): CableFit[] {
  return cables
    .map((c) => cableFit(c, height, ports, devices, desk, slack, avoid))
    .filter((f) => f.status === 'short')
    .sort((a, b) => (a.marginMm ?? 0) - (b.marginMm ?? 0))
}

/* ---------- 하중 ---------- */

export interface LoadSummary {
  /** 상판계에 실린 무게 합계. */
  totalKg: number
  capKg: number
  distributedCapKg: number
  ratio: number
  status: 'ok' | 'warn' | 'over'
  /** 무게가 추정값인 기기가 섞여 있는가. */
  hasEstimates: boolean
  items: { device: Device; kg: number }[]
}

/**
 * 상판 위 무게 합계.
 * B3 미결정 상태의 기본값: 정격 100kg 기준으로 판정하고 분산 130kg 은 참고로 병기.
 */
export function totalLoad(
  devices: readonly Device[],
  index: DeviceIndex,
  desk: Desk,
  warnAt = 0.8,
): LoadSummary {
  const onDesk = devices.filter((d) => lineageOf(d.id, index) === 'desk')
  const items = onDesk.map((device) => ({ device, kg: device.weightKg ?? 0 }))
  const totalKg = items.reduce((s, i) => s + i.kg, 0)
  const ratio = totalKg / desk.loadCapKg
  return {
    totalKg,
    capKg: desk.loadCapKg,
    distributedCapKg: desk.loadCapDistributedKg,
    ratio,
    status: ratio > 1 ? 'over' : ratio >= warnAt ? 'warn' : 'ok',
    hasEstimates: onDesk.some((d) => d.verified === false),
    items: items.sort((a, b) => b.kg - a.kg),
  }
}

/* ---------- 상판 하부 여유 ---------- */

/** 상판 아랫면에 매단 기기의 바닥까지 여유. 음수면 바닥에 닿는다. */
export function underDeskClearance(
  devices: readonly Device[],
  deskHeight: number,
  index: DeviceIndex,
): { device: Device; clearanceMm: number }[] {
  return devices
    .filter((d) => d.mount === 'under-desktop')
    .map((device) => ({ device, clearanceMm: absoluteY(device.id, deskHeight, index) }))
}

/* ---------- 포트 / 타입 충돌 ---------- */

export interface PortConflict {
  portId: PortId
  cableIds: CableId[]
}

/** 한 포트에 연결이 둘 이상 — 스위처나 믹서가 필요하다는 신호. */
export function portConflicts(cables: readonly Cable[], ports: PortIndex): PortConflict[] {
  const use = new Map<PortId, CableId[]>()
  for (const c of cables) {
    for (const end of [c.from, c.to]) {
      if (!ports.has(end)) continue
      const list = use.get(end) ?? []
      list.push(c.id)
      use.set(end, list)
    }
  }
  return [...use.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([portId, cableIds]) => ({ portId, cableIds }))
}

export interface TypeMismatch {
  cableId: CableId
  fromType: string
  toType: string
}

/** 양끝 커넥터 타입 불일치 — 변환이 필요하다는 뜻. */
export function typeMismatch(cable: Cable, ports: PortIndex): TypeMismatch | undefined {
  const a = portOf(cable.from, ports)
  const b = portOf(cable.to, ports)
  if (!a || !b || a.type === b.type) return undefined
  return { cableId: cable.id, fromType: a.type, toType: b.type }
}

export interface ChannelConflict {
  portId: PortId
  conflictsWith: PortId
  cableIds: CableId[]
}

/** 2i2 처럼 물리적으로 배타적인 포트쌍이 동시에 쓰이는가. */
export function channelConflicts(cables: readonly Cable[], ports: PortIndex): ChannelConflict[] {
  const used = new Map<PortId, CableId[]>()
  for (const c of cables) {
    for (const end of [c.from, c.to]) {
      if (!ports.has(end)) continue
      used.set(end, [...(used.get(end) ?? []), c.id])
    }
  }
  const out: ChannelConflict[] = []
  const seen = new Set<string>()
  for (const [portId, cableIds] of used) {
    const port = portOf(portId, ports)
    for (const other of port?.conflictsWith ?? []) {
      if (!used.has(other)) continue
      const key = [portId, other].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ portId, conflictsWith: other, cableIds: [...cableIds, ...(used.get(other) ?? [])] })
    }
  }
  return out
}

/** exclusiveWith 로 묶인 케이블이 동시에 활성인가 (동글은 한 곳에만 꽂힌다). */
export function exclusivityViolations(active: readonly Cable[]): CableId[][] {
  const ids = new Set(active.map((c) => c.id))
  const out: CableId[][] = []
  const seen = new Set<string>()
  for (const c of active) {
    for (const other of c.exclusiveWith ?? []) {
      if (!ids.has(other)) continue
      const key = [c.id, other].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      out.push([c.id, other])
    }
  }
  return out
}

/* ---------- 전력 ---------- */

export function totalPowerW(data: SetupData): number {
  return data.power.items.reduce((s, i) => s + i.peakW, 0)
}
