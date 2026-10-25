/** deskwire 도메인 타입. data.json 의 형태를 그대로 따른다. */

export type DeviceId = string
export type PortId = string
export type CableId = string

/** 케이블 끝은 포트일 수도, 기기일 수도 있다 (전원 케이블은 기기↔기기). */
export type EndpointId = PortId | DeviceId

export type ConnectorType = string

/**
 * 높이를 절대값으로 저장하지 않고 관계로 표현한다.
 * 상판 높이 슬라이더 하나만 바꿔도 전부 따라 움직이게 하기 위함.
 */
export type Mount =
  | 'floor'
  | 'fixed'
  | 'desktop'
  | 'under-desktop'
  | { on: DeviceId }

export interface Vec3 {
  /** 좌우. 책상 좌측 끝이 0. */
  x: number
  /** 앞뒤. 책상 앞쪽 끝이 0. */
  z: number
  /** 해당 mount 기준면에서의 오프셋. */
  yOff: number
}

export interface Dims {
  w: number
  d: number
  h: number
}

export interface Port {
  id: PortId
  label: string
  type: ConnectorType
  dir: 'in' | 'out'
  /** 물리적으로 배타적인 포트쌍 (2i2 전면 잭 vs 후면 XLR). */
  conflictsWith?: PortId[]
}

export interface Device {
  id: DeviceId
  name: string
  category: string
  dims: Dims
  mount: Mount
  pos: Vec3
  weightKg: number
  /** false = 추정값. UI에 반드시 노출할 것. */
  verified?: boolean
  notes?: string
  specs?: Record<string, string>
  ports?: Port[]
  /** plannedDevices 에서 온 기기인가. */
  planned?: boolean
}

export interface Cable {
  id: CableId
  name: string
  from: EndpointId
  to: EndpointId
  type: ConnectorType
  /** 보유 길이. 없거나 0이면 길이 판정 대상이 아니다 (동글 등 직결). */
  lengthMm?: number
  verified?: boolean
  /** 아직 구매하지 않음. */
  planned?: boolean
  /** 대체 연결 자리 (동시에 쓰지 않음). */
  alternative?: boolean
  /** 상시 연결이 아님 (기타 등). */
  intermittent?: boolean
  /** 이 케이블들과 동시에 존재할 수 없음. */
  exclusiveWith?: CableId[]
  notes?: string
}

export interface Scenario {
  id: string
  name: string
  activeCables?: CableId[]
  notes?: string[]
}

/** 상판 하부에 걸어 쓰는 배선트레이. 멀티탭과 전원선이 여기 들어간다. */
export interface Tray {
  /** 내부 치수 */
  w: number
  d: number
  h: number
  x: number
  z: number
  verified?: boolean
  notes?: string
}

/**
 * 상판 뒷변 중앙이 파인 배선홈. 케이블이 여기로 내려가 배선트레이에 담긴다.
 * 트레이 뒷판이 아니라 상판 자체가 파여 있다.
 */
export interface CableHole {
  /** 홈 중심의 좌우 위치 */
  x: number
  /** 홈의 가로 폭 */
  w: number
  /** 상판 뒷변에서 앞쪽으로 파고든 깊이 */
  depth: number
  verified?: boolean
  notes?: string
}

export interface Desk {
  model: string
  w: number
  d: number
  thickness: number
  hMin: number
  hMax: number
  loadCapKg: number
  loadCapDistributedKg: number
  legInset: number
  legW: number
  verified?: boolean
  notes?: string
  tray?: Tray
  cableHole?: CableHole
}

export interface ConnectorTypeDef {
  label: string
  color: string
}

export interface OpenQuestion {
  id: string
  q: string
  blocks?: string[]
  fallback?: string
  contact?: string
  note?: string
}

export interface PowerItem {
  name: string
  peakW: number
  note?: string
}

export interface Power {
  note: string
  items: PowerItem[]
  outletsNeededNow: number
  outletsRecommended: number
  warnings: string[]
}

export interface SetupData {
  desk: Desk
  connectorTypes: Record<ConnectorType, ConnectorTypeDef>
  devices: Device[]
  plannedDevices: Device[]
  cables: Cable[]
  scenarios: Scenario[]
  power: Power
  openQuestions: OpenQuestion[]
}
