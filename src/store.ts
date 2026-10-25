import { useEffect, useMemo, useReducer } from 'react'
import type { Cable, CableId, DeviceId, PortId, Vec3 } from './data/types'
import { allDevices, cables as baseCables, desk } from './data/setup'
import type { View } from './model/geometry'
import { DEFAULT_SLACK, type SlackRule } from './model/geometry'

/** 저장 스키마 버전. data.json 이 바뀌면 올린다 (M8 기본값: 불일치 시 초기화). */
export const SCHEMA_VERSION = 3
// 이름이 deskwire 로 바뀌었지만 키는 유지한다 — 바꾸면 저장해 둔 배치가 날아간다.
const STORAGE_KEY = 'patchmap:v1'

/** 질문 6 답변: 평소 700~710mm 에서 쓴다. 위쪽을 잡아 710 을 기준으로 둔다. */
export const DEFAULT_WORKING_HEIGHT = 710

export type ViewMode = View | '3d'

export interface State {
  viewMode: ViewMode
  deskHeight: number
  /** 평소 실제로 쓰는 높이. 판정의 기준점 — 전 구간을 만족시킬 필요는 없다. */
  workingHeight: number
  scenarioId: string
  includePlanned: boolean
  slack: SlackRule
  /** 드래그로 옮긴 기기의 위치. 없으면 data.json 값을 쓴다. */
  posOverrides: Record<DeviceId, Vec3>
  /** 실측으로 갱신한 케이블 길이. */
  lengthOverrides: Record<CableId, number>
  /** 사용자가 추가/해제한 연결. */
  addedCables: Cable[]
  removedCableIds: CableId[]
  selectedDeviceId: DeviceId | null
  pendingPortId: PortId | null
}

const initial: State = {
  viewMode: '3d',
  deskHeight: DEFAULT_WORKING_HEIGHT,
  workingHeight: DEFAULT_WORKING_HEIGHT,
  scenarioId: 'all',
  includePlanned: false,
  slack: DEFAULT_SLACK,
  posOverrides: {},
  lengthOverrides: {},
  addedCables: [],
  removedCableIds: [],
  selectedDeviceId: null,
  pendingPortId: null,
}

export type Action =
  | { type: 'setView'; view: ViewMode }
  | { type: 'setDeskHeight'; mm: number }
  | { type: 'setWorkingHeight'; mm: number }
  | { type: 'setScenario'; id: string }
  | { type: 'togglePlanned' }
  | { type: 'setSlack'; slack: Partial<SlackRule> }
  | { type: 'moveDevice'; id: DeviceId; pos: Vec3 }
  | { type: 'setLength'; id: CableId; mm: number | null }
  | { type: 'selectDevice'; id: DeviceId | null }
  | { type: 'clickPort'; id: PortId }
  | { type: 'removeCable'; id: CableId }
  | { type: 'reset' }
  | { type: 'hydrate'; state: State }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'setView':
      return { ...s, viewMode: a.view }
    case 'setDeskHeight':
      return { ...s, deskHeight: clamp(a.mm, desk.hMin, desk.hMax) }
    case 'setWorkingHeight':
      return { ...s, workingHeight: clamp(a.mm, desk.hMin, desk.hMax) }
    case 'setScenario':
      return { ...s, scenarioId: a.id }
    case 'togglePlanned':
      return { ...s, includePlanned: !s.includePlanned }
    case 'setSlack':
      return { ...s, slack: { ...s.slack, ...a.slack } }
    case 'moveDevice':
      return { ...s, posOverrides: { ...s.posOverrides, [a.id]: a.pos } }
    case 'setLength': {
      const next = { ...s.lengthOverrides }
      if (a.mm === null) delete next[a.id]
      else next[a.id] = a.mm
      return { ...s, lengthOverrides: next }
    }
    case 'selectDevice':
      return { ...s, selectedDeviceId: a.id }
    case 'clickPort': {
      if (s.pendingPortId === null) return { ...s, pendingPortId: a.id }
      if (s.pendingPortId === a.id) return { ...s, pendingPortId: null }
      const cable: Cable = {
        id: `user-${s.pendingPortId}-${a.id}`,
        name: '사용자 연결',
        from: s.pendingPortId,
        to: a.id,
        type: 'usb',
        planned: true,
      }
      const exists = s.addedCables.some((c) => c.id === cable.id)
      return {
        ...s,
        pendingPortId: null,
        addedCables: exists ? s.addedCables : [...s.addedCables, cable],
      }
    }
    case 'removeCable':
      return s.addedCables.some((c) => c.id === a.id)
        ? { ...s, addedCables: s.addedCables.filter((c) => c.id !== a.id) }
        : { ...s, removedCableIds: [...s.removedCableIds, a.id] }
    case 'reset':
      return initial
    case 'hydrate':
      return a.state
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

export function usePatchmap() {
  const [state, dispatch] = useReducer(reducer, initial)

  // 불러오기 — 스키마 버전이 다르면 조용히 버린다.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { version: number; state: State }
      if (parsed.version === SCHEMA_VERSION) dispatch({ type: 'hydrate', state: parsed.state })
    } catch {
      /* 저장분이 깨졌으면 기본값으로 시작한다 */
    }
  }, [])

  // 저장
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, state }))
    } catch {
      /* 용량 초과 등은 무시 — 저장 실패가 앱을 막지 않는다 */
    }
  }, [state])

  const devices = useMemo(() => {
    return allDevices(state.includePlanned).map((d) => {
      const override = state.posOverrides[d.id]
      return override ? { ...d, pos: override } : d
    })
  }, [state.includePlanned, state.posOverrides])

  const cables = useMemo(() => {
    const removed = new Set(state.removedCableIds)
    return [...baseCables, ...state.addedCables]
      .filter((c) => !removed.has(c.id))
      .map((c) => {
        const mm = state.lengthOverrides[c.id]
        return mm === undefined ? c : { ...c, lengthMm: mm, verified: true }
      })
  }, [state.addedCables, state.removedCableIds, state.lengthOverrides])

  return { state, dispatch, devices, cables }
}
