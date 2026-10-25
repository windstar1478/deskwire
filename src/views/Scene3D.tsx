import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Cable, Desk, Device, DeviceId } from '../data/types'
import { absoluteCenter, indexDevices, lineageOf } from '../model/mount'
import { indexPorts, ownerOf, routeOptsFor } from '../model/derive'
import { cableHoleCenter, routeCable } from '../model/route'
import { connectorOf } from '../data/setup'
import { buildDevice } from './deviceShapes'

interface Props {
  desk: Desk
  deskHeight: number
  devices: Device[]
  cables: Cable[]
  activeCableIds: Set<string>
  selectedDeviceId: DeviceId | null
  onSelect: (id: DeviceId | null) => void
  onHover: (id: DeviceId | null) => void
}

/**
 * 3D 뷰. model/ 이 React 에 의존하지 않게 만들어 둔 덕분에
 * 좌표 계산은 2D 뷰와 완전히 같은 함수를 그대로 쓴다.
 * 씬 좌표는 mm 를 그대로 쓰고, 카메라 거리로 스케일을 맞춘다.
 */
/**
 * 데이터의 z 는 "사용자에게서 멀어지는 거리"(0 = 앞 모서리)인데,
 * 씬에서는 카메라를 앞쪽(높은 z)에 두고 -z 를 바라봐야 +x 가 화면 오른쪽에 온다.
 * 그래야 사용자가 모니터를 바라보는 기준과 좌우가 일치한다.
 * 그래서 씬에 넣을 때 z 를 뒤집는다.
 */
const sz = (z: number, deskD: number) => deskD - z

export function Scene3D({
  desk,
  deskHeight,
  devices,
  cables,
  activeCableIds,
  selectedDeviceId,
  onSelect,
  onHover,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    content: THREE.Group
    raycaster: THREE.Raycaster
    dispose: () => void
  } | null>(null)

  // 씬은 한 번만 만든다. 데이터 변경은 아래 effect 에서 content 만 갈아끼운다.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x10161a)
    scene.fog = new THREE.Fog(0x10161a, 5200, 12000)

    const camera = new THREE.PerspectiveCamera(38, 1, 10, 20000)
    camera.position.set(1060, 1560, 3350)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(desk.w / 2, 640, desk.d / 2)
    controls.maxPolarAngle = Math.PI / 2 - 0.02
    controls.minDistance = 600
    controls.maxDistance = 9000

    scene.add(new THREE.HemisphereLight(0xbcd4de, 0x1b262c, 1.5))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(1800, 3000, 2200)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    const s = 2600
    key.shadow.camera.left = -s
    key.shadow.camera.right = s
    key.shadow.camera.top = s
    key.shadow.camera.bottom = -s
    key.shadow.camera.far = 9000
    scene.add(key)
    const fill = new THREE.DirectionalLight(0x8fd4e0, 0.35)
    fill.position.set(-1500, 900, -1200)
    scene.add(fill)

    // 바닥
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14000, 14000),
      new THREE.MeshStandardMaterial({ color: 0x151d22, roughness: 1 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(desk.w / 2, 0, desk.d / 2)
    floor.receiveShadow = true
    scene.add(floor)

    const grid = new THREE.GridHelper(12000, 48, 0x2b3a42, 0x1e2a30)
    grid.position.set(desk.w / 2, 1, desk.d / 2)
    scene.add(grid)

    // 정면 표식 — 어디가 내 자리인지 한눈에 보이게 한다.
    // 의자를 세우면 카메라를 가리므로 바닥에 눕힌 표식만 쓴다.
    const seat = new THREE.Group()
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(620, 460),
      new THREE.MeshBasicMaterial({ color: 0x212f36, side: THREE.DoubleSide }),
    )
    plate.rotation.x = -Math.PI / 2
    plate.position.set(desk.w / 2, 4, sz(-560, desk.d))
    seat.add(plate)
    seat.add(floorTag('내 자리 · 정면', desk.w / 2, sz(-560, desk.d)))
    seat.add(floorTag('◀ 좌', -420, sz(-180, desk.d)))
    seat.add(floorTag('우 ▶', desk.w + 420, sz(-180, desk.d)))
    scene.add(seat)

    const content = new THREE.Group()
    scene.add(content)

    const raycaster = new THREE.Raycaster()

    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    let raf = 0
    const tick = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    const dispose = () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
    stateRef.current = { renderer, scene, camera, controls, content, raycaster, dispose }
    return dispose
  }, [desk.w, desk.d])

  // 클릭 선택
  useEffect(() => {
    const st = stateRef.current
    const host = hostRef.current
    if (!st || !host) return
    const onClick = (e: MouseEvent) => {
      const r = st.renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      )
      st.raycaster.setFromCamera(ndc, st.camera)
      const hits = st.raycaster.intersectObjects(st.content.children, true)
      const hit = hits.find((h) => h.object.userData.deviceId)
      onSelect(hit ? (hit.object.userData.deviceId as DeviceId) : null)
    }
    // 호버: 클릭 가능하다는 걸 보여주고, 이름표 없이도 무엇인지 짚어준다.
    let hovered: THREE.Mesh | null = null
    const onMove = (e: MouseEvent) => {
      const r = st.renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      )
      st.raycaster.setFromCamera(ndc, st.camera)
      const hit = st.raycaster
        .intersectObjects(st.content.children, true)
        .find((h) => h.object.userData.deviceId)
      const mesh = (hit?.object as THREE.Mesh) ?? null
      if (mesh === hovered) return
      if (hovered) setEmissive(hovered, 0x000000)
      hovered = mesh
      if (hovered) setEmissive(hovered, 0x1d4d57)
      st.renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab'
      onHover(hovered ? (hovered.userData.deviceId as DeviceId) : null)
    }

    const el = st.renderer.domElement
    el.style.cursor = 'grab'
    el.addEventListener('click', onClick)
    el.addEventListener('pointermove', onMove)
    return () => {
      el.removeEventListener('click', onClick)
      el.removeEventListener('pointermove', onMove)
    }
  }, [onSelect, onHover])

  // 데이터가 바뀌면 content 를 다시 그린다. 객체 수십 개라 전체 재생성으로 충분하다.
  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    const { content } = st
    clear(content)

    const index = indexDevices(devices)
    const ports = indexPorts(devices)

    // 상판 — 뒷변 중앙이 배선홈으로 파여 있다.
    const topMat = new THREE.MeshStandardMaterial({ color: 0x3b4f5a, roughness: 0.75 })
    const top = new THREE.Mesh(desktopGeometry(desk), topMat)
    top.position.set(0, deskHeight, 0)
    top.castShadow = true
    top.receiveShadow = true
    content.add(top)

    // 다리
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a3840, roughness: 0.9 })
    const legH = deskHeight - desk.thickness
    for (const lx of [desk.legInset + desk.legW / 2, desk.w - desk.legInset - desk.legW / 2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(desk.legW, legH, desk.legW), legMat)
      leg.position.set(lx, legH / 2, desk.d / 2)
      leg.castShadow = true
      content.add(leg)
    }

    // 배선트레이 — 상판 하부 브라켓에 걸린 ㄷ자 트레이.
    // 뒷판 중앙에 노치(배선홀)가 파여 있고, 그리로 멀티탭 배선이 들어온다.
    if (desk.tray) {
      const t = desk.tray
      const trayMat = new THREE.MeshStandardMaterial({ color: 0x6f6a5e, roughness: 1 })
      const wall = 8
      const floorY = deskHeight - desk.thickness - t.h
      const trayZ = sz(t.z, desk.d)
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(t.w, wall, t.d + wall * 2), trayMat)
      bottom.position.set(t.x, floorY - wall / 2, trayZ)
      bottom.receiveShadow = true
      content.add(bottom)

      const rearZ = trayZ - (t.d / 2 + wall / 2) // 뒷판은 사용자에게서 먼 쪽
      const frontZ = trayZ + (t.d / 2 + wall / 2)

      // 앞판은 통짜
      const front = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, wall), trayMat)
      front.position.set(t.x, floorY + t.h / 2, frontZ)
      content.add(front)

      // 뒷판도 통짜다. 파인 곳은 상판 쪽이다.
      const rear = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, wall), trayMat)
      rear.position.set(t.x, floorY + t.h / 2, rearZ)
      content.add(rear)
    }

    // 배선홈 표시 — 상판 뒷변에 파인 자리
    const holeCenter = cableHoleCenter(desk)
    if (holeCenter && desk.cableHole) {
      const mark = new THREE.Mesh(
        new THREE.TorusGeometry(desk.cableHole.w * 0.3, 5, 8, 28, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0x3fc4d4 }),
      )
      mark.rotation.x = -Math.PI / 2
      mark.position.set(holeCenter.x, deskHeight + 3, sz(holeCenter.z, desk.d))
      content.add(mark)
    }

    // 기기
    for (const d of devices) {
      const c = absoluteCenter(d.id, deskHeight, index)
      const onDesk = lineageOf(d.id, index) === 'desk'
      const selected = selectedDeviceId === d.id
      const group = buildDevice(d, selected)
      group.position.set(c.x, c.y, sz(c.z, desk.d))
      group.userData.deviceId = d.id
      // 히트 테스트가 자식까지 닿도록 id 를 전부에 심는다.
      group.traverse((o) => {
        o.userData.deviceId = d.id
        if (d.verified === false) {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
          if (m && 'opacity' in m) {
            m.transparent = true
            m.opacity = 0.8
          }
        }
      })
      content.add(group)

      // 이름표를 전부 띄우면 화면이 뒤덮인다. 선택한 것만 보여준다.
      if (selected) {
        content.add(makeLabel(d.name, { ...c, z: sz(c.z, desk.d) }, d.dims.h))
      }
      if (!onDesk) {
        // 바닥 기기는 상판에 가려 안 보일 수 있어 접지 표시를 남긴다.
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(d.dims.w * 0.5, d.dims.w * 0.5 + 14, 32),
          new THREE.MeshBasicMaterial({ color: 0x3d5763, side: THREE.DoubleSide }),
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.set(c.x, 3, sz(c.z, desk.d))
        content.add(ring)
      }
    }

    // 케이블 — 기기 중심을 잇는 맨해튼 경로를 그대로 3D 로 그린다.
    for (const cab of cables) {
      const a = ownerOf(cab.from, ports, index)
      const b = ownerOf(cab.to, ports, index)
      if (!a || !b) continue
      const active = activeCableIds.has(cab.id)
      // 길이 계산과 똑같은 경로를 그린다. 화면과 숫자가 어긋나지 않게.
      const pts = routeCable(a, b, deskHeight, index, desk, routeOptsFor(cab, devices)).map(
        (p) => new THREE.Vector3(p.x, p.y, sz(p.z, desk.d)),
      )
      if (pts.length < 2) continue
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.18)
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(64, pts.length * 18), active ? 8 : 4.5, 6, false),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(connectorOf(cab.type).color),
          roughness: 0.6,
          transparent: !active,
          opacity: active ? 1 : 0.22,
        }),
      )
      tube.castShadow = active
      content.add(tube)
    }
  }, [desk, deskHeight, devices, cables, activeCableIds, selectedDeviceId])

  return <div ref={hostRef} className="scene3d" />
}

/**
 * 상판. 뒷변 중앙이 배선홈으로 파여 있다.
 * 셰이프는 씬 좌표(x, sceneZ)로 그린다 — 씬에서 z 를 뒤집으므로 뒷변이 sceneZ = 0 이다.
 * 원점은 상판 윗면이고 아래로 두께만큼 내려간다.
 */
function desktopGeometry(desk: Desk): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  const hole = desk.cableHole
  shape.moveTo(0, 0)
  if (hole) {
    const half = Math.min(hole.w, desk.w * 0.9) / 2
    const cut = Math.min(hole.depth, desk.d * 0.5)
    shape.lineTo(hole.x - half, 0)
    // 완만하게 파고들었다 다시 나오는 홈
    shape.bezierCurveTo(hole.x - half * 0.45, 0, hole.x - half * 0.45, cut, hole.x, cut)
    shape.bezierCurveTo(hole.x + half * 0.45, cut, hole.x + half * 0.45, 0, hole.x + half, 0)
  }
  shape.lineTo(desk.w, 0)
  shape.lineTo(desk.w, desk.d)
  shape.lineTo(0, desk.d)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: desk.thickness, bevelEnabled: false })
  // 셰이프 평면을 눕히고, 두께가 아래로 향하게 한다.
  geo.rotateX(Math.PI / 2)
  return geo
}

function setEmissive(mesh: THREE.Mesh, color: number) {
  const mat = mesh.material as THREE.MeshStandardMaterial
  if (mat?.emissive) mat.emissive.setHex(color)
}

function clear(group: THREE.Group) {
  for (const child of [...group.children]) {
    group.remove(child)
    child.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose()
    })
  }
}

/** 바닥에 눕혀 놓는 방향 표식. */
function floorTag(text: string, x: number, z: number): THREE.Sprite {
  const sprite = textSprite(text, 'rgba(16,22,26,0.55)', '#a8c2ce', 46)
  sprite.position.set(x, 6, z)
  return sprite
}

/** 기기 위에 뜨는 이름표. 카메라를 향하도록 sprite 로 만든다. */
function makeLabel(
  name: string,
  c: { x: number; y: number; z: number },
  height: number,
): THREE.Sprite {
  const sprite = textSprite(name.replace(/\s*\(.*$/, ''), 'rgba(63,196,212,0.94)', '#07181c', 44)
  sprite.position.set(c.x, c.y + height / 2 + 70, c.z)
  return sprite
}

function textSprite(text: string, bg: string, fg: string, font: number): THREE.Sprite {
  const pad = 16
  const cv = document.createElement('canvas')
  const probe = cv.getContext('2d')!
  const face = `500 ${font}px -apple-system, "Apple SD Gothic Neo", sans-serif`
  probe.font = face
  cv.width = Math.ceil(probe.measureText(text).width + pad * 2)
  cv.height = font + pad * 2
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cv.width, cv.height)
  ctx.font = face
  ctx.fillStyle = fg
  ctx.textBaseline = 'middle'
  ctx.fillText(text, pad, cv.height / 2)

  const tex = new THREE.CanvasTexture(cv)
  tex.minFilter = THREE.LinearFilter
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
  )
  const scale = 0.62
  sprite.scale.set(cv.width * scale, cv.height * scale, 1)
  sprite.renderOrder = 999
  return sprite
}
