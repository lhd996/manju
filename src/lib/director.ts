import type { DirectorActor, DirectorCam } from '../types'

export const DIRECTOR_PALETTE = ['#8b6cff', '#22d3ee', '#f472b6', '#facc15', '#34d399']

export const DEFAULT_DIRECTOR_CAM: DirectorCam = {
  az: 0,
  dist: 6.2,
  height: 1.55,
  fov: 40,
  targetY: 1.15,
}

export function defaultDirectorActors(): DirectorActor[] {
  return [
    { id: 'a1', x: -0.85, z: 0.35, rotY: 0, scale: 1, color: DIRECTOR_PALETTE[0] },
    { id: 'a2', x: 0.9, z: -0.35, rotY: 12, scale: 1, color: DIRECTOR_PALETTE[1] },
  ]
}

/** 按画幅自动计算机距，保证两三个人都能进画 */
export function fitDistance(ratio: string, fov: number) {
  const aspect = ratio === '9:16' ? 9 / 16 : ratio === '16:9' ? 16 / 9 : 1
  const tan = Math.tan((fov * Math.PI) / 360)
  const d = Math.max(1.15 / tan, 1.25 / (tan * aspect)) + 0.25
  return Math.round(d * 10) / 10
}
