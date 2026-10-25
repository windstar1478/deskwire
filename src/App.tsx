import { useEffect, useMemo, useState } from 'react'
import { usePatchmap } from './store'
import { cablesForScenario, desk } from './data/setup'
import type { View } from './model/geometry'
import { indexDevices } from './model/mount'
import { indexPorts, shortagesAt } from './model/derive'
import { SceneView } from './views/SceneView'
import { Scene3D } from './views/Scene3D'
import { CableTable } from './panels/CableTable'
import { LoadPanel } from './panels/LoadPanel'
import { HeightPanel } from './panels/HeightPanel'
import { ScenarioPanel } from './panels/ScenarioPanel'
import { DevicePanel } from './panels/DevicePanel'
import { QuestionPanel } from './panels/QuestionPanel'

/** '3d' 는 투영 함수를 쓰지 않으므로 View 와 별도로 둔다. */
type ViewMode = View | '3d'

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: '3d', label: '3D' },
  { id: 'front', label: '정면' },
  { id: 'top', label: '평면' },
  { id: 'side', label: '측면' },
]

type Tab = 'diag' | 'setup' | 'open'

const TABS: { id: Tab; label: string }[] = [
  { id: 'diag', label: '진단' },
  { id: 'setup', label: '구성' },
  { id: 'open', label: '확인' },
]

export default function App() {
  const { state, dispatch, devices, cables } = usePatchmap()
  // 호버와 탭은 저장할 필요 없는 화면 상태라 리듀서에 넣지 않는다.
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('diag')
  const [tableOpen, setTableOpen] = useState(false)

  const activeCableIds = useMemo(
    () => new Set(cablesForScenario(state.scenarioId).map((c) => c.id)),
    [state.scenarioId],
  )
  const selected = devices.find((d) => d.id === state.selectedDeviceId)
  const hovered = devices.find((d) => d.id === hoveredId)

  // 기기를 고르면 그 정보가 있는 탭으로 따라간다.
  useEffect(() => {
    if (state.selectedDeviceId) setTab('setup')
  }, [state.selectedDeviceId])

  const shortCount = useMemo(() => {
    const index = indexDevices(devices)
    return shortagesAt(
      cables,
      state.workingHeight,
      indexPorts(devices),
      index,
      desk,
      state.slack,
      devices,
    ).length
  }, [cables, devices, state.workingHeight, state.slack])

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          deskwire
        </div>

        <div className="seg" role="group" aria-label="뷰 전환">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={state.viewMode === v.id ? 'is-on' : undefined}
              onClick={() => dispatch({ type: 'setView', view: v.id })}
            >
              {v.label}
            </button>
          ))}
        </div>

        <label className="height">
          <span className="lbl">상판 높이</span>
          <input
            type="range"
            min={desk.hMin}
            max={desk.hMax}
            value={state.deskHeight}
            onChange={(e) => dispatch({ type: 'setDeskHeight', mm: Number(e.target.value) })}
          />
          <output>
            {state.deskHeight}
            <i>mm</i>
          </output>
        </label>

        <div className="head-right">
          <label className="switch">
            <input
              type="checkbox"
              checked={state.includePlanned}
              onChange={() => dispatch({ type: 'togglePlanned' })}
            />
            <span className="track" aria-hidden="true" />
            <span>예정 기기</span>
          </label>
          <button className="ghost" onClick={() => dispatch({ type: 'reset' })}>
            초기화
          </button>
        </div>
      </header>

      <main>
        <section className="stage">
          <div className="canvas">
            {state.viewMode === '3d' ? (
              <Scene3D
                desk={desk}
                deskHeight={state.deskHeight}
                devices={devices}
                cables={cables}
                activeCableIds={activeCableIds}
                selectedDeviceId={state.selectedDeviceId}
                onSelect={(id) => dispatch({ type: 'selectDevice', id })}
                onHover={setHoveredId}
              />
            ) : (
              <SceneView
                view={state.viewMode}
                desk={desk}
                deskHeight={state.deskHeight}
                devices={devices}
                cables={cables}
                activeCableIds={activeCableIds}
                selectedDeviceId={state.selectedDeviceId}
                onSelect={(id) => dispatch({ type: 'selectDevice', id })}
                onMove={(id, pos) => dispatch({ type: 'moveDevice', id, pos })}
              />
            )}
            <p className="stage-hint">
              {hovered ? (
                <b className="hovered">{hovered.name}</b>
              ) : state.viewMode === '3d' ? (
                '드래그로 회전 · 휠로 확대 · 기기 클릭으로 선택'
              ) : (
                '기기를 드래그해 배치를 옮긴다 · 이 뷰가 다루는 축만 바뀐다'
              )}
            </p>
          </div>

          <div className={`drawer${tableOpen ? ' is-open' : ''}`}>
            <button className="drawer-bar" onClick={() => setTableOpen((v) => !v)}>
              <span className="chev" aria-hidden="true" />
              케이블
              <em>{cables.length}</em>
              {shortCount > 0 && <span className="pill pill-bad">부족 {shortCount}</span>}
              <span className="spacer" />
              <span className="drawer-cue">{tableOpen ? '접기' : '펼치기'}</span>
            </button>
            {tableOpen && (
              <CableTable
                cables={cables}
                devices={devices}
                desk={desk}
                deskHeight={state.deskHeight}
                slack={state.slack}
                activeCableIds={activeCableIds}
                onLength={(id, mm) => dispatch({ type: 'setLength', id, mm })}
              />
            )}
          </div>
        </section>

        <aside>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'is-on' : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === 'diag' && shortCount > 0 && <i className="dot" aria-hidden="true" />}
              </button>
            ))}
          </nav>

          <div className="tab-body">
            {tab === 'diag' && (
              <>
                <HeightPanel
                  cables={cables}
                  devices={devices}
                  desk={desk}
                  slack={state.slack}
                  workingHeight={state.workingHeight}
                  onSlack={(slack) => dispatch({ type: 'setSlack', slack })}
                  onWorkingHeight={(mm) => dispatch({ type: 'setWorkingHeight', mm })}
                />
                <LoadPanel devices={devices} desk={desk} deskHeight={state.deskHeight} />
              </>
            )}
            {tab === 'setup' && (
              <>
                <ScenarioPanel
                  scenarioId={state.scenarioId}
                  onSelect={(id) => dispatch({ type: 'setScenario', id })}
                />
                <DevicePanel
                  device={selected}
                  pendingPortId={state.pendingPortId}
                  onPort={(id) => dispatch({ type: 'clickPort', id })}
                />
              </>
            )}
            {tab === 'open' && <QuestionPanel />}
          </div>
        </aside>
      </main>
    </div>
  )
}
