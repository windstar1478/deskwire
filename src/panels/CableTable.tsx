import type { Cable, CableId, Desk, Device } from '../data/types'
import { indexDevices } from '../model/mount'
import { cableFit, indexPorts, typeMismatch } from '../model/derive'
import type { SlackRule } from '../model/geometry'
import { connectorOf } from '../data/setup'

interface Props {
  cables: Cable[]
  devices: Device[]
  desk: Desk
  deskHeight: number
  slack: SlackRule
  activeCableIds: Set<string>
  onLength: (id: CableId, mm: number | null) => void
}

export function CableTable({ cables, devices, desk, deskHeight, slack, activeCableIds, onLength }: Props) {
  const index = indexDevices(devices)
  const ports = indexPorts(devices)

  return (
    <div className="panel cable-panel">
      <p className="hint top-hint">
        보유 길이를 실측값으로 바꾸면 <code>verified</code> 로 표시된다. 경계를 넘는 케이블만 상판 높이를 제한한다.
        “권장”은 부족할 때 사면 되는 가장 짧은 규격 길이다.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>케이블</th>
              <th className="num">보유</th>
              <th className="num">필요</th>
              <th className="num">여유</th>
              <th className="num">권장</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {cables.map((c) => {
              const fit = cableFit(c, deskHeight, ports, index, desk, slack)
              const mismatch = typeMismatch(c, ports)
              const dim = !activeCableIds.has(c.id)
              return (
                <tr key={c.id} className={dim ? 'dim' : undefined}>
                  <td>
                    <span className="swatch" style={{ background: connectorOf(c.type).color }} />
                    <span className="cable-name">{c.name}</span>
                    {fit.crosses && <span className="tag tag-cross">경계</span>}
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      value={c.lengthMm ?? ''}
                      step={100}
                      onChange={(e) =>
                        onLength(c.id, e.target.value === '' ? null : Number(e.target.value))
                      }
                    />
                  </td>
                  <td className="num">{fit.required === undefined ? '—' : Math.round(fit.required)}</td>
                  <td className={`num ${fit.status === 'short' ? 'bad' : fit.status === 'ok' ? 'good' : ''}`}>
                    {fit.marginMm === undefined ? '—' : `${fit.marginMm >= 0 ? '+' : ''}${Math.round(fit.marginMm)}`}
                  </td>
                  <td className="num">
                    {fit.recommendMm ? <span className="tag tag-warn">{fit.recommendMm / 1000}m</span> : ''}
                  </td>
                  <td className="notes">
                    {c.verified === false && <span className="tag">추정</span>}
                    {c.planned && <span className="tag tag-plan">미구매</span>}
                    {c.alternative && <span className="tag">대체자리</span>}
                    {c.intermittent && <span className="tag">간헐</span>}
                    {mismatch && (
                      <span className="tag tag-warn">
                        변환 {mismatch.fromType}→{mismatch.toType}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
