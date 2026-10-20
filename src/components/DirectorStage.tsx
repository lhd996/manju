import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { DirectorScene, camPosition, type Actor, type CamState } from './DirectorScene'
import { useStore } from '../store'
import { api } from '../api'
import { DEFAULT_DIRECTOR_CAM, DIRECTOR_PALETTE, defaultDirectorActors, fitDistance } from '../lib/director'
import { sanitizeName } from '../lib/media'
import type { DirectorNodeData, Ratio } from '../types'
import { Segmented, Icon } from './ui'

function describeShot(actors: Actor[], cam: CamState, ratio: string): string {
  const aspect = ratio === '9:16' ? 9 / 16 : ratio === '16:9' ? 16 / 9 : 1
  const camPos = camPosition(cam)
  const target = new THREE.Vector3(0, cam.targetY, 0)
  const forward = target.clone().sub(camPos).normalize()
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
  const tanHalf = Math.tan(((cam.fov * Math.PI) / 180) / 2)
  const horiz = Math.hypot(camPos.x, camPos.z)
  const tilt = (Math.atan2(cam.height - cam.targetY, horiz) * 180) / Math.PI

  const lines: string[] = []
  lines.push(
    `镜头：机位高 ${cam.height.toFixed(2)}m，距主体 ${horiz.toFixed(1)}m，${
      tilt > 8 ? `俯拍约 ${tilt.toFixed(0)}°` : tilt < -8 ? `仰拍约 ${(-tilt).toFixed(0)}°` : '平视'
    }，${cam.fov}° 视场，${ratio === '9:16' ? '竖屏' : ratio === '16:9' ? '横屏' : '方形'}画幅。`,
  )

  actors.forEach((a, i) => {
    const head = new THREE.Vector3(a.x, 1.5 * a.scale, a.z)
    const v = head.clone().sub(camPos)
    const depth = v.dot(forward)
    const lateral = v.dot(right)
    const angle = (Math.atan2(lateral, depth) * 180) / Math.PI
    const screen = lateral / (Math.max(0.001, depth) * tanHalf * aspect)
    const frac = (1.7 * a.scale) / (2 * Math.max(0.001, depth) * tanHalf)
    const toCam = new THREE.Vector3(camPos.x - a.x, 0, camPos.z - a.z).normalize()
    const rad = (a.rotY * Math.PI) / 180 // rotY 存的是角度
    const face = new THREE.Vector3(Math.sin(rad), 0, Math.cos(rad))
    const dot = face.dot(toCam)
    const facing = dot > 0.55 ? '正面朝向镜头' : dot < -0.55 ? '背对镜头' : '侧身'
    const pos = screen < -0.33 ? '画面左侧' : screen > 0.33 ? '画面右侧' : '画面中央'
    const shot = frac > 0.85 ? '特写' : frac > 0.5 ? '近景' : frac > 0.28 ? '中景' : frac > 0.12 ? '全景' : '远景'
    lines.push(
      `角色${String.fromCharCode(65 + i)}：位于${pos}（偏离中轴 ${Math.abs(angle).toFixed(0)}°），距镜头 ${v.length().toFixed(1)}m，${facing}，${shot}。`,
    )
  })

  return lines.join('\n')
}

export function DirectorStage() {
  const nodeId = useStore((s) => s.director.nodeId)
  if (!nodeId) return null
  return <DirectorModal key={nodeId} nodeId={nodeId} />
}

function DirectorModal({ nodeId }: { nodeId: string }) {
  const close = useStore((s) => s.closeDirector)
  const toast = useStore((s) => s.toast)
  const node = useStore.getState().nodes.find((n) => n.id === nodeId)
  const initial = node?.data as unknown as DirectorNodeData | undefined

  const [ratio, setRatio] = useState<Ratio>(initial?.ratio ?? '9:16')
  const [actors, setActors] = useState<Actor[]>(() =>
    initial?.actors?.length ? initial.actors : defaultDirectorActors(),
  )
  const [cam, setCam] = useState<CamState>(initial?.cam ?? DEFAULT_DIRECTOR_CAM)
  const [view, setView] = useState<'orbit' | 'shot'>('orbit')
  const [selectedId, setSelectedId] = useState<string | null>(initial?.actors?.[0]?.id ?? null)
  const [busy, setBusy] = useState(false)
  const captureRef = useRef<((longEdge?: number) => string) | null>(null)

  const handleReady = useCallback((fn: (longEdge?: number) => string) => {
    captureRef.current = fn
  }, [])

  const brief = useMemo(() => describeShot(actors, cam, ratio), [actors, cam, ratio])
  const selected = actors.find((a) => a.id === selectedId) ?? null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const setCamField = (patch: Partial<CamState>) => setCam((c) => ({ ...c, ...patch }))

  const moveActor = useCallback((id: string, x: number, z: number) => {
    setActors((list) => list.map((a) => (a.id === id ? { ...a, x, z } : a)))
  }, [])

  const dragEnd = useCallback(() => {}, [])

  const addActor = () => {
    if (actors.length >= 5) {
      toast('最多 5 个角色', 'error')
      return
    }
    const i = actors.length
    setActors((list) => [
      ...list,
      {
        id: `a${Date.now().toString(36)}`,
        x: i % 2 === 0 ? -1.6 : 1.6,
        z: -0.8 - i * 0.2,
        rotY: 0,
        scale: 1,
        color: DIRECTOR_PALETTE[i % DIRECTOR_PALETTE.length],
      },
    ])
  }

  const save = async () => {
    const fn = captureRef.current
    if (!fn) return
    setBusy(true)
    try {
      const dataUrl = fn(1024)
      const aspect = ratio === '9:16' ? 9 / 16 : ratio === '16:9' ? 16 / 9 : 1
      const long = 1024
      const width = aspect < 1 ? Math.round(long * aspect) : long
      const height = aspect < 1 ? long : Math.round(long / aspect)
      const res = await api.upload(dataUrl, {
        // 和图片/视频节点一致：素材名跟节点标题走，@ 引用时才对得上
        name: sanitizeName(String(initial?.title ?? '')) || '导演台',
        kind: 'image',
        width,
        height,
      })
      useStore.getState().updateDirectorNode(nodeId, { actors, cam, ratio, output: res.asset })
      useStore.getState().closeDirector()
      toast('参考图已更新', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal director" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="director__card">
        <header className="director__head">
          <div className="director__title">
            <Icon name="director" />
            <strong>3D 导演台</strong>
            <span>{initial?.title ?? '导演台'} · 摆好人和机位，渲染成参考图</span>
          </div>
          <div className="director__head-right">
            <Segmented
              value={ratio}
              onChange={(v) => {
                setRatio(v)
                setCam((c) => ({ ...c, dist: fitDistance(v, c.fov) }))
              }}
              options={[
                { value: '1:1', label: '1:1' },
                { value: '16:9', label: '16:9' },
                { value: '9:16', label: '9:16' },
              ]}
            />
            <button type="button" className="btn btn--icon" onClick={close}>
              <Icon name="close" />
            </button>
          </div>
        </header>

        <div className="director__body">
          <div className="director__left">
            <div
              className="director__stage"
              style={{
                aspectRatio: String(ratio === '9:16' ? 9 / 16 : ratio === '16:9' ? 16 / 9 : 1),
                width: `min(100%, calc(${ratio === '9:16' ? 9 / 16 : ratio === '16:9' ? 16 / 9 : 1} * (min(820px, 90vh) - 160px)))`,
              }}
            >
              <DirectorScene
                actors={actors}
                cam={cam}
                view={view}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(id || null)}
                onMoveActor={moveActor}
                onDragEnd={dragEnd}
                onReadyCapture={handleReady}
              />
              <div className="director__stagebar">
                <Segmented
                  size="xs"
                  value={view}
                  onChange={(v) => setView(v)}
                  options={[
                    { value: 'orbit', label: '自由视角' },
                    { value: 'shot', label: '镜头视角' },
                  ]}
                />
                <button type="button" className="btn btn--xs" onClick={addActor}>
                  <Icon name="plus" size={12} /> 角色
                </button>
              </div>
              {view === 'orbit' && <span className="director__tip">拖动人物摆位 · 拖拽空白旋转 · 青色方块是机位</span>}
            </div>
          </div>

          <div className="director__right">
            <section className="dsec">
              <h5>机位</h5>
              <Slider label="方位" value={cam.az} min={-180} max={180} step={1} unit="°" onChange={(v) => setCamField({ az: v })} />
              <Slider label="距离" value={cam.dist} min={1} max={12} step={0.1} unit="m" onChange={(v) => setCamField({ dist: v })} />
              <Slider label="高度" value={cam.height} min={0.3} max={4} step={0.05} unit="m" onChange={(v) => setCamField({ height: v })} />
              <Slider label="视角" value={cam.fov} min={18} max={85} step={1} unit="°" onChange={(v) => setCamField({ fov: v })} />
              <div className="dsec__presets">
                <button
                  type="button"
                  className="mini"
                  onClick={() => setCam({ ...DEFAULT_DIRECTOR_CAM, dist: fitDistance(ratio, DEFAULT_DIRECTOR_CAM.fov) })}
                >
                  正面中景
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setCam({ az: 28, dist: 3.2, height: 1.5, fov: 34, targetY: 1.25 })}
                >
                  过肩
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setCam({ az: -30, dist: 6.5, height: 3.4, fov: 50, targetY: 1 })}
                >
                  俯视全景
                </button>
                <button
                  type="button"
                  className="mini"
                  onClick={() => setCam({ az: 0, dist: 1.6, height: 1.55, fov: 30, targetY: 1.45 })}
                >
                  特写
                </button>
              </div>
            </section>

            <section className="dsec">
              <h5>角色</h5>
              <div className="actors">
                {actors.map((a, i) => (
                  <button
                    type="button"
                    key={a.id}
                    className={`actor-row ${selectedId === a.id ? 'is-on' : ''}`}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <i style={{ background: a.color }} />
                    <span>角色 {String.fromCharCode(65 + i)}</span>
                    <span className="mono actor-row__pos">
                      {a.x.toFixed(1)}, {a.z.toFixed(1)}
                    </span>
                    <span
                      className="actor-row__del"
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation()
                        setActors((list) => list.filter((x) => x.id !== a.id))
                      }}
                    >
                      ×
                    </span>
                  </button>
                ))}
              </div>
              {selected && (
                <>
                  <Slider
                    label="朝向"
                    value={selected.rotY}
                    min={-180}
                    max={180}
                    step={1}
                    unit="°"
                    onChange={(v) =>
                      setActors((list) => list.map((a) => (a.id === selected.id ? { ...a, rotY: v } : a)))
                    }
                  />
                  <div className="dsec__presets">
                    <button
                      type="button"
                      className="mini"
                      onClick={() =>
                        setActors((list) =>
                          list.map((a) =>
                            a.id === selected.id
                              ? {
                                  ...a,
                                  rotY:
                                    (Math.atan2(camPosition(cam).x - a.x, camPosition(cam).z - a.z) * 180) /
                                    Math.PI,
                                }
                              : a,
                          ),
                        )
                      }
                    >
                      面向镜头
                    </button>
                    <button
                      type="button"
                      className="mini"
                      onClick={() =>
                        setActors((list) => list.map((a) => (a.id === selected.id ? { ...a, x: 0, z: 0 } : a)))
                      }
                    >
                      移到中心
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="dsec dsec--grow">
              <h5>
                镜头描述 <span className="dsec__hint">会随摆位自动生成</span>
              </h5>
              <pre className="brief">{brief}</pre>
              <button type="button" className="mini" onClick={() => navigator.clipboard?.writeText(brief)}>
                复制描述
              </button>
            </section>
          </div>
        </div>

        <footer className="director__foot">
          <span className="director__foot-hint">
            保存后会渲染成一张 PNG，作为这个导演台节点的输出，连到下游当参考图。
          </span>
          <div className="director__foot-actions">
            <button type="button" className="btn" onClick={close}>
              取消
            </button>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={save}>
              {busy ? '渲染中…' : '保存并更新参考图'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <label className="slider">
      <span className="slider__label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider__value mono">
        {value.toFixed(step < 1 ? 2 : 0)}
        {unit}
      </span>
    </label>
  )
}
