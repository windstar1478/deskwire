import type { Cable, Desk, Device } from '../data/types'
import { indexDevices } from '../model/mount'
import { indexPorts, maxDeskHeight, shortagesAt } from '../model/derive'
import type { SlackRule } from '../model/geometry'

export function HeightPanel({
  cables,
  devices,
  desk,
  slack,
  workingHeight,
  onSlack,
  onWorkingHeight,
}: {
  cables: Cable[]
  devices: Device[]
  desk: Desk
  slack: SlackRule
  workingHeight: number
  onSlack: (s: Partial<SlackRule>) => void
  onWorkingHeight: (mm: number) => void
}) {
  const index = indexDevices(devices)
  const ports = indexPorts(devices)
  const ceiling = maxDeskHeight(cables, ports, index, desk, slack)
  const short = shortagesAt(cables, workingHeight, ports, index, desk, slack, devices)
  const nameOf = (id: string) => cables.find((c) => c.id === id)?.name ?? id

  return (
    <div className="panel">
      <h2>실사용 높이에서의 판정</h2>
      <label className="slider-row">
        <span>실사용 높이</span>
        <input
          type="range"
          min={desk.hMin}
          max={desk.hMax}
          step={10}
          value={workingHeight}
          onChange={(e) => onWorkingHeight(Number(e.target.value))}
        />
        <b>{workingHeight}mm</b>
      </label>
      <div className={`big ${short.length > 0 ? 'over' : 'ok'}`}>
        {short.length > 0 ? `부족 ${short.length}건` : '전부 충분'}
      </div>
      {short.length > 0 ? (
        <ul className="load-list">
          {short.map((f) => (
            <li key={f.cable.id}>
              <span>{f.cable.name}</span>
              <b className="bad">
                {Math.round(f.marginMm!)} mm
                {f.recommendMm && <em> → {f.recommendMm / 1000}m 면 해결</em>}
              </b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">이 높이에서는 모든 경계 케이블이 여유를 만족한다.</p>
      )}

      <h3>전 구간(630~1280) 기준</h3>
      <p className="hint">
        {ceiling.shortAtMin.length > 0 ? (
          <>
            최저 {desk.hMin}mm 에서도 모자란 케이블:{' '}
            <b>{ceiling.shortAtMin.map((l) => nameOf(l.cableId)).join(', ')}</b>
          </>
        ) : (
          <>
            최대 <b>{ceiling.maxHeight}mm</b> 까지. 한계를 만드는 케이블:{' '}
            <b>{ceiling.limitedBy.map((l) => nameOf(l.cableId)).join(', ')}</b>
          </>
        )}
      </p>

      <h3>여유 규칙 <span className="undecided">B2 미결정</span></h3>
      <label className="slider-row">
        <span>비례 여유</span>
        <input
          type="range"
          min={0}
          max={40}
          value={Math.round(slack.ratio * 100)}
          onChange={(e) => onSlack({ ratio: Number(e.target.value) / 100 })}
        />
        <b>{Math.round(slack.ratio * 100)}%</b>
      </label>
      <label className="slider-row">
        <span>고정 여유</span>
        <input
          type="range"
          min={0}
          max={300}
          step={10}
          value={slack.fixedMm}
          onChange={(e) => onSlack({ fixedMm: Number(e.target.value) })}
        />
        <b>{slack.fixedMm}mm</b>
      </label>
      <p className="hint">
        케이블은 상판 뒷변 중앙에 파인 배선홈으로 내려가 트레이에 담긴다. 직선 거리보다 한참 돌아가므로,
        여유를 0으로 낮춰도 부족분이 남는다 — 여유율이 아니라 경로가 결론을 결정한다.
      </p>
    </div>
  )
}
