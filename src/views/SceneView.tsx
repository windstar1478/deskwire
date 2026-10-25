import { useCallback, useRef, useState } from 'react'
import type { Cable, Desk, Device, DeviceId } from '../data/types'
import { extentFor, project, unproject, type View } from '../model/geometry'
import { absoluteCenter, absoluteY, indexDevices, lineageOf } from '../model/mount'
import { indexPorts, ownerOf, routeOptsFor } from '../model/derive'
import { routeCable } from '../model/route'
import { connectorOf } from '../data/setup'

interface Props {
  view: View
  desk: Desk
  deskHeight: number
  devices: Device[]
  cables: Cable[]
  activeCableIds: Set<string>
  selectedDeviceId: DeviceId | null
  onSelect: (id: DeviceId | null) => void
  onMove: (id: DeviceId, pos: Device['pos']) => void
}

const PAD = 220

export function SceneView({
  view,
  desk,
  deskHeight,
  devices,
  cables,
  activeCableIds,
  selectedDeviceId,
  onSelect,
  onMove,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<DeviceId | null>(null)
  const index = indexDevices(devices)
  const ports = indexPorts(devices)

  // 뷰마다 담아야 할 모델 범위가 다르다.
  const box =
    view === 'top'
      ? { u0: -PAD, v0: -PAD, w: desk.w + PAD * 2, h: desk.d + PAD * 2 }
      : view === 'front'
        ? { u0: -PAD, v0: 0, w: desk.w + PAD * 2, h: desk.hMax + 900 }
        : { u0: -PAD, v0: 0, w: desk.d + PAD * 2, h: desk.hMax + 900 }

  /** 화면 V 는 위가 커지는 축이므로, 높이 축을 쓰는 뷰에서는 뒤집는다. */
  const flipV = view !== 'top'
  const toScreen = (u: number, v: number) => ({
    sx: u,
    sy: flipV ? box.v0 + box.h - v : v,
  })

  const clientToModel = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg) return null
      const pt = svg.createSVGPoint()
      pt.x = clientX
      pt.y = clientY
      const ctm = svg.getScreenCTM()
      if (!ctm) return null
      const p = pt.matrixTransform(ctm.inverse())
      return { u: p.x, v: flipV ? box.v0 + box.h - p.y : p.y }
    },
    [box.h, box.v0, flipV],
  )

  const handleMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const dev = index.get(dragging)
    if (!dev) return
    const m = clientToModel(e.clientX, e.clientY)
    if (!m) return

    // project() 는 기기 중심을 내보내므로, 커서를 중심으로 두고 역산한다.
    // top 뷰의 V 는 z(중심), front/side 의 V 는 absoluteY + h/2 다.
    const v =
      view === 'top'
        ? m.v
        : m.v - dev.dims.h / 2 - baselineFor(dev, deskHeight, index)
    onMove(dragging, roundPos(unproject(m.u, v, view, dev.pos)))
  }

  return (
    <svg
      ref={svgRef}
      className="scene"
      viewBox={`${box.u0} ${box.v0} ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={handleMove}
      onPointerUp={() => setDragging(null)}
      onPointerLeave={() => setDragging(null)}
      onPointerDown={(e) => {
        if (e.target === svgRef.current) onSelect(null)
      }}
    >
      <Floor view={view} box={box} toScreen={toScreen} />
      <DeskShape view={view} desk={desk} deskHeight={deskHeight} toScreen={toScreen} />

      {cables.map((c) => {
        const a = ownerOf(c.from, ports, index)
        const b = ownerOf(c.to, ports, index)
        if (!a || !b) return null
        // 3D·길이 계산과 같은 경로를 투영해서 그린다.
        const pts = routeCable(a, b, deskHeight, index, desk, routeOptsFor(c, devices)).map((p) => {
          const q = project(p, view)
          return toScreen(q.u, q.v)
        })
        if (pts.length < 2) return null
        const active = activeCableIds.has(c.id)
        return (
          <path
            key={c.id}
            d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.sx} ${p.sy}`).join(' ')}
            fill="none"
            stroke={connectorOf(c.type).color}
            strokeWidth={active ? 9 : 5}
            strokeOpacity={active ? 0.95 : 0.16}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={c.planned ? '24 18' : undefined}
          />
        )
      })}

      {devices.map((d) => {
        const ext = extentFor(d.dims, view)
        const p = project(absoluteCenter(d.id, deskHeight, index), view)
        const s = toScreen(p.u, p.v)
        const selected = selectedDeviceId === d.id
        return (
          <g
            key={d.id}
            className={`device${selected ? ' is-selected' : ''}`}
            onPointerDown={(e) => {
              e.stopPropagation()
              ;(e.target as Element).setPointerCapture?.(e.pointerId)
              onSelect(d.id)
              setDragging(d.id)
            }}
          >
            <rect
              x={s.sx - ext.w / 2}
              y={s.sy - ext.h / 2}
              width={ext.w}
              height={ext.h}
              rx={8}
              fill={lineageOf(d.id, index) === 'desk' ? 'var(--dev-desk)' : 'var(--dev-ground)'}
              stroke={selected ? 'var(--accent)' : 'var(--dev-stroke)'}
              strokeWidth={selected ? 8 : 3}
              strokeDasharray={d.verified === false ? '16 10' : undefined}
            />
            {selected && (
              <text
                x={s.sx}
                y={s.sy - ext.h / 2 - 22}
                textAnchor="middle"
                fontSize={40}
                fill="var(--accent)"
              >
                {shortName(d.name)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** 그 기기의 yOff 가 기준으로 삼는 면의 절대 높이. 드래그를 yOff 로 되돌릴 때 쓴다. */
function baselineFor(dev: Device, deskHeight: number, index: ReturnType<typeof indexDevices>): number {
  return absoluteY(dev.id, deskHeight, index) - (dev.pos.yOff ?? 0)
}

function roundPos(p: Device['pos']): Device['pos'] {
  return { x: Math.round(p.x), z: Math.round(p.z), yOff: Math.round(p.yOff) }
}

function shortName(name: string): string {
  return name.replace(/\s*\(.*$/, '')
}

interface BoxT {
  u0: number
  v0: number
  w: number
  h: number
}
type ToScreen = (u: number, v: number) => { sx: number; sy: number }

function Floor({ view, box, toScreen }: { view: View; box: BoxT; toScreen: ToScreen }) {
  if (view === 'top') return null
  const s = toScreen(0, 0)
  return (
    <line
      x1={box.u0}
      y1={s.sy}
      x2={box.u0 + box.w}
      y2={s.sy}
      stroke="var(--grid)"
      strokeWidth={6}
    />
  )
}

function DeskShape({
  view,
  desk,
  deskHeight,
  toScreen,
}: {
  view: View
  desk: Desk
  deskHeight: number
  toScreen: ToScreen
}) {
  if (view === 'top') {
    const a = toScreen(0, 0)
    const b = toScreen(desk.w, desk.d)
    return (
      <rect
        x={Math.min(a.sx, b.sx)}
        y={Math.min(a.sy, b.sy)}
        width={desk.w}
        height={desk.d}
        fill="var(--desk-fill)"
        stroke="var(--desk-stroke)"
        strokeWidth={4}
      />
    )
  }
  const width = view === 'front' ? desk.w : desk.d
  const top = toScreen(0, deskHeight)
  const legTop = toScreen(0, deskHeight - desk.thickness)
  const floor = toScreen(0, 0)
  const inset = desk.legInset
  return (
    <g>
      <rect x={0} y={top.sy} width={width} height={desk.thickness} fill="var(--desk-stroke)" />
      <rect x={inset} y={legTop.sy} width={desk.legW} height={floor.sy - legTop.sy} fill="var(--desk-fill)" />
      <rect
        x={width - inset - desk.legW}
        y={legTop.sy}
        width={desk.legW}
        height={floor.sy - legTop.sy}
        fill="var(--desk-fill)"
      />
    </g>
  )
}
