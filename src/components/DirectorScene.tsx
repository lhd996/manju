import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, Html, Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { DirectorActor, DirectorCam } from '../types'

export type Actor = DirectorActor
export type CamState = DirectorCam

export function camPosition(cam: CamState) {
  const rad = (cam.az * Math.PI) / 180
  return new THREE.Vector3(cam.dist * Math.sin(rad), cam.height, cam.dist * Math.cos(rad))
}

function applyCam(camera: THREE.PerspectiveCamera, cam: CamState) {
  const p = camPosition(cam)
  camera.position.copy(p)
  camera.lookAt(0, cam.targetY, 0)
  if (camera.fov !== cam.fov) {
    camera.fov = cam.fov
    camera.updateProjectionMatrix()
  }
}

/** 镜头视角：每帧把相机锁在被设定的机位上 */
function Rig({ cam, view }: { cam: CamState; view: 'orbit' | 'shot' }) {
  const { camera } = useThree()
  useFrame(() => {
    if (view !== 'shot') return
    applyCam(camera as THREE.PerspectiveCamera, cam)
  })
  return null
}

/** 拖角色：用原生 pointer 事件 + 地面射线，避免和 OrbitControls 抢事件 */
function Dragger({
  dragId,
  onMove,
  onEnd,
}: {
  dragId: string | null
  onMove: (id: string, x: number, z: number) => void
  onEnd: () => void
}) {
  const { gl, camera } = useThree()
  useEffect(() => {
    if (!dragId) return
    const el = gl.domElement
    const ray = new THREE.Raycaster()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const ndc = new THREE.Vector2()
    const hit = new THREE.Vector3()

    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      if (ray.ray.intersectPlane(plane, hit)) onMove(dragId, hit.x, hit.z)
    }
    const up = () => onEnd()

    el.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragId, gl, camera, onMove, onEnd])
  return null
}

/** 把当前机位渲染成一张图（长边 1024），供发布到画布 */
function CaptureBridge({
  camRef,
  onReady,
}: {
  camRef: React.MutableRefObject<CamState>
  onReady: (fn: (longEdge?: number) => string) => void
}) {
  const { gl, scene, camera, size } = useThree()

  useEffect(() => {
    onReady((longEdge = 1024) => {
      const cam = camRef.current
      const c = camera as THREE.PerspectiveCamera
      const prevFov = c.fov
      const prevAspect = c.aspect
      const aspect = size.width / size.height
      const h = aspect < 1 ? longEdge : Math.round(longEdge / aspect)
      const w = aspect < 1 ? Math.round(longEdge * aspect) : longEdge

      applyCam(c, cam)
      c.aspect = w / h
      c.updateProjectionMatrix()
      gl.setSize(w, h, false)
      gl.render(scene, c)
      const dataUrl = gl.domElement.toDataURL('image/png')
      gl.setSize(size.width, size.height, false)
      c.aspect = prevAspect
      c.fov = prevFov
      c.updateProjectionMatrix()
      return dataUrl
    })
  }, [gl, scene, camera, size, camRef, onReady])

  return null
}

function Mannequin({
  actor,
  label,
  selected,
  onSelect,
  onDragStart,
}: {
  actor: Actor
  label: string
  selected: boolean
  onSelect: () => void
  onDragStart: () => void
}) {
  const s = actor.scale
  const skin = '#e7bd97'
  const cloth = actor.color
  // rotY 存的是角度，three.js 用弧度
  const rot = (actor.rotY * Math.PI) / 180

  return (
    <group
      position={[actor.x, 0, actor.z]}
      rotation={[0, rot, 0]}
      scale={[s, s, s]}
      onPointerDown={(e) => {
        e.stopPropagation()
        onSelect()
        onDragStart()
      }}
    >
      {/* 腿 */}
      {[-0.1, 0.1].map((x) => (
        <group key={`leg-${x}`}>
          <mesh position={[x, 0.72, 0]} castShadow>
            <capsuleGeometry args={[0.068, 0.22, 6, 12]} />
            <meshStandardMaterial color={cloth} roughness={0.62} />
          </mesh>
          <mesh position={[x, 0.55, 0]}>
            <sphereGeometry args={[0.062, 14, 12]} />
            <meshStandardMaterial color={cloth} roughness={0.62} />
          </mesh>
          <mesh position={[x, 0.325, 0]} castShadow>
            <capsuleGeometry args={[0.055, 0.34, 6, 12]} />
            <meshStandardMaterial color={cloth} roughness={0.62} />
          </mesh>
          <mesh position={[x, 0.04, 0.05]} castShadow>
            <boxGeometry args={[0.11, 0.08, 0.25]} />
            <meshStandardMaterial color="#2b2b33" roughness={0.7} />
          </mesh>
        </group>
      ))}

      {/* 髋 + 躯干（上宽下窄，肩线更明显） */}
      <mesh position={[0, 0.94, 0]} castShadow>
        <capsuleGeometry args={[0.14, 0.1, 6, 14]} />
        <meshStandardMaterial color={cloth} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.16, 0]} scale={[1, 1, 0.78]} castShadow>
        <capsuleGeometry args={[0.165, 0.26, 8, 16]} />
        <meshStandardMaterial color={cloth} roughness={0.55} />
      </mesh>

      {/* 肩 + 手臂（略微外张，避免僵直） */}
      {[-1, 1].map((dir) => (
        <group key={`arm-${dir}`} rotation={[0, 0, dir * -0.12]} position={[dir * 0.2, 1.32, 0]}>
          <mesh scale={[1.1, 1, 0.9]}>
            <sphereGeometry args={[0.072, 16, 12]} />
            <meshStandardMaterial color={cloth} roughness={0.55} />
          </mesh>
          <mesh position={[0, -0.16, 0]} castShadow>
            <capsuleGeometry args={[0.052, 0.18, 6, 12]} />
            <meshStandardMaterial color={cloth} roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.29, 0]}>
            <sphereGeometry args={[0.05, 14, 12]} />
            <meshStandardMaterial color={cloth} roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.41, 0]} castShadow>
            <capsuleGeometry args={[0.045, 0.16, 6, 12]} />
            <meshStandardMaterial color={cloth} roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.525, 0]}>
            <sphereGeometry args={[0.054, 14, 12]} />
            <meshStandardMaterial color={skin} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* 颈 + 头 */}
      <mesh position={[0, 1.435, 0]}>
        <cylinderGeometry args={[0.05, 0.058, 0.1, 14]} />
        <meshStandardMaterial color={skin} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.56, 0]} scale={[0.94, 1.04, 0.98]} castShadow>
        <sphereGeometry args={[0.11, 24, 18]} />
        <meshStandardMaterial color={skin} roughness={0.45} />
      </mesh>
      {/* 朝向：鼻梁 + 眼睛（正面一眼能认出来） */}
      <mesh position={[0, 1.555, 0.102]}>
        <boxGeometry args={[0.034, 0.05, 0.055]} />
        <meshStandardMaterial color="#c99a72" roughness={0.5} />
      </mesh>
      {[-0.038, 0.038].map((x) => (
        <mesh key={`eye-${x}`} position={[x, 1.578, 0.092]}>
          <sphereGeometry args={[0.016, 12, 10]} />
          <meshStandardMaterial color="#15151c" roughness={0.35} />
        </mesh>
      ))}
      {/* 胸前的浅色面板：背面看是纯色，正反一目了然 */}
      <mesh position={[0, 1.16, 0.112]}>
        <boxGeometry args={[0.19, 0.24, 0.035]} />
        <meshStandardMaterial color="#ececf4" roughness={0.55} />
      </mesh>
      {/* 头发（薄壳，帮助下压"人偶感"） */}
      <mesh position={[0, 1.6, -0.014]} scale={[1.02, 0.88, 1.02]}>
        <sphereGeometry args={[0.112, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
        <meshStandardMaterial color="#20202a" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[0.3, selected ? 0.38 : 0.33, 40]} />
        <meshBasicMaterial color={selected ? '#a78bfa' : actor.color} transparent opacity={selected ? 0.95 : 0.35} />
      </mesh>
      <Html
        position={[0, 1.85, 0]}
        center
        distanceFactor={7}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        zIndexRange={[10, 0]}
      >
        <div className={`actor-tag ${selected ? 'is-on' : ''}`}>{label}</div>
      </Html>
    </group>
  )
}

export function DirectorScene({
  actors,
  cam,
  view,
  selectedId,
  onSelect,
  onMoveActor,
  onDragEnd,
  onReadyCapture,
}: {
  actors: Actor[]
  cam: CamState
  view: 'orbit' | 'shot'
  selectedId: string | null
  onSelect: (id: string) => void
  onMoveActor: (id: string, x: number, z: number) => void
  onDragEnd: () => void
  onReadyCapture: (fn: (longEdge?: number) => string) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const camRef = useRef(cam)
  camRef.current = cam
  const target = new THREE.Vector3(0, cam.targetY, 0)
  const camPos = camPosition(cam)

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      camera={{ position: [4.2, 2.6, 5.2], fov: 45 }}
      onPointerMissed={() => onSelect('')}
    >
      <color attach="background" args={['#0a0a12']} />
      <fog attach="fog" args={['#0a0a12', 14, 34]} />

      <ambientLight intensity={0.75} />
      <directionalLight position={[5, 9, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 4, -5]} intensity={0.45} color="#7c9cff" />

      <Grid
        position={[0, 0, 0]}
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#1e1e2e"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#2f2f4a"
        fadeDistance={26}
        fadeStrength={1.2}
        infiniteGrid
      />

      {actors.map((a, i) => (
        <Mannequin
          key={a.id}
          actor={a}
          label={String.fromCharCode(65 + i)}
          selected={selectedId === a.id}
          onSelect={() => onSelect(a.id)}
          onDragStart={() => setDragId(a.id)}
        />
      ))}

      {view === 'orbit' && (
        <>
          <mesh position={camPos}>
            <boxGeometry args={[0.16, 0.12, 0.22]} />
            <meshBasicMaterial color="#22d3ee" />
          </mesh>
          <Line points={[camPos.toArray(), target.toArray()]} color="#22d3ee" lineWidth={1} dashed dashSize={0.12} gapSize={0.1} transparent opacity={0.55} />
          <mesh position={target}>
            <sphereGeometry args={[0.05, 12, 10]} />
            <meshBasicMaterial color="#22d3ee" />
          </mesh>
        </>
      )}

      <Dragger
        dragId={dragId}
        onMove={onMoveActor}
        onEnd={() => {
          setDragId(null)
          onDragEnd()
        }}
      />
      <Rig cam={cam} view={view} />
      <CaptureBridge camRef={camRef} onReady={onReadyCapture} />

      <OrbitControls
        enabled={!dragId && view === 'orbit'}
        makeDefault
        target={target}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={1.2}
        maxDistance={18}
        enableDamping
        dampingFactor={0.12}
      />
    </Canvas>
  )
}
