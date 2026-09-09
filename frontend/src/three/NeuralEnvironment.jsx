import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useAnimStore } from '../animation/animStore'
import {
  getPerfTier,
  getDpr,
  getParticleCount,
  getReducedMotion,
  shouldAnimateCamera,
} from '../animation/device'
const REDUCED = typeof window !== 'undefined' ? getReducedMotion() : false

/**
 * Reusable 3D "Neural Garden" background.
 * - Starfield of soft glowing particles with depth variation.
 * - A few large floating translucent nodes that drift.
 * - Connecting neural lines that appear/disappear.
 * - Subtle camera breathing.
 *
 * Reacts to the global energy level (higher energy = faster/brighter).
 * Designed to never distract from foreground content.
 */

function ParticleField({ count, energy }) {
  const pointsRef = useRef()
  const particles = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 22
      arr[i * 3 + 1] = (Math.random() - 0.5) * 14
      arr[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2
    }
    return arr
  }, [count])

  useFrame((state) => {
    if (REDUCED) return
    if (!pointsRef.current) return
    const time = state.clock.elapsedTime
    const pos = pointsRef.current.geometry.attributes.position
    const arr = pos.array
    const base = 0.02 + energy * 0.05
    for (let i = 0; i < count; i++) {
      const idx = i * 3
      arr[idx + 1] += Math.sin(time * base * 20 + i) * 0.001
      arr[idx] += Math.cos(time * base * 20 + i * 0.7) * 0.0008
    }
    pos.needsUpdate = true
    pointsRef.current.rotation.y = time * base * 0.15
    pointsRef.current.rotation.x = Math.sin(time * 0.1) * 0.03
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[particles, 3]} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.045}
        color="#7fd6c9"
        transparent
        opacity={0.6 + energy * 0.3}
        sizeAttenuation
        depthWrite={false}
        blending={2}
      />
    </points>
  )
}

function DriftingOrbs({ energy }) {
  const groupRef = useRef()
  const orbs = useMemo(() => {
    const list = []
    for (let i = 0; i < 8; i++) {
      list.push({
        position: [
          (Math.random() - 0.5) * 16,
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 6 - 3,
        ],
        scale: 0.3 + Math.random() * 0.8,
        speed: 0.1 + Math.random() * 0.2,
        hue: i % 3 === 0 ? '#2bb3a3' : i % 3 === 1 ? '#5b8def' : '#8b7fd6',
      })
    }
    return list
  }, [])

  useFrame((state) => {
    if (REDUCED) return
    if (!groupRef.current) return
    const t = state.clock.elapsedTime
    const children = groupRef.current.children
    const base = 0.3 + energy * 0.3
    children.forEach((child, i) => {
      const o = orbs[i]
      if (!o) return
      child.position.y = o.position[1] + Math.sin(t * base + i * 1.7) * 0.6
      child.position.x = o.position[0] + Math.cos(t * base * 0.8 + i * 2.3) * 0.5
      child.rotation.y += 0.003
    })
  })

  return (
    <group ref={groupRef}>
      {orbs.map((o, i) => (
        <mesh key={i} position={o.position} scale={o.scale}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color={o.hue}
            transparent
            opacity={0.12 + energy * 0.1}
            roughness={0.3}
            metalness={0.2}
            wireframe
          />
        </mesh>
      ))}
    </group>
  )
}


function BreathingCamera({ children }) {
  useFrame((state) => {
    if (!shouldAnimateCamera()) return
    const t = state.clock.elapsedTime
    state.camera.position.z = 8 + Math.sin(t * 0.15) * 0.35
    state.camera.position.x = Math.sin(t * 0.1) * 0.3
    state.camera.position.y = Math.sin(t * 0.12) * 0.2
    state.camera.lookAt(0, 0, 0)
  })
  return <group>{children}</group>
}

export default function NeuralEnvironment() {
  const energy = useAnimStore((s) => s.energy)
  const sceneMode = useAnimStore((s) => s.sceneMode)
  const reduced = getReducedMotion()
  const count = reduced ? Math.floor(getParticleCount() / 2) : getParticleCount()

  if (typeof window === 'undefined') return null

  // Environment subtly energizes inside games and analytics
  const boost = sceneMode.startsWith('game-') ? 0.15 : sceneMode === 'analytics' ? 0.08 : 0
  const sceneEnergy = Math.min(1, energy + boost)

  return (
    <div
      className="fixed inset-0 -z-10 pointer-events-none"
      aria-hidden="true"
      style={{ background: 'radial-gradient(circle at 50% 20%, #12233f 0%, #0a1628 60%, #071021 100%)' }}
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        dpr={getDpr()}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 6, 5]} intensity={0.8} color="#ffffff" />
        <pointLight position={[-6, -4, 4]} intensity={0.5} color="#2bb3a3" />
        <BreathingCamera>
          <ParticleField count={count} energy={sceneEnergy} />
          <DriftingOrbs energy={sceneEnergy} />
          <FloatingNodes energy={sceneEnergy} />
        </BreathingCamera>
      </Canvas>
      {/* Soft vignette overlay to keep cards readable */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: 'inset 0 0 120px rgba(4,10,20,0.6)' }}
      />
    </div>
  )
}


function FloatingNodes({ energy }) {
  const groupRef = useRef()
  const nodes = useMemo(() => {
    const list = []
    for (let i = 0; i < 14; i++) {
      list.push({
        position: [
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 8 - 4,
        ],
        speed: 0.05 + Math.random() * 0.15,
      })
    }
    return list
  }, [])

  useFrame((state) => {
    if (REDUCED) return
    if (!groupRef.current) return
    const t = state.clock.elapsedTime
    const children = groupRef.current.children
    children.forEach((child, i) => {
      const n = nodes[i]
      if (!n) return
      child.position.y = n.position[1] + Math.sin(t * n.speed + i) * 0.4
      child.rotation.z = t * n.speed * 0.3 + i
    })
  })

  return (
    <group ref={groupRef}>
      {nodes.map((n, i) => (
        <mesh key={i} position={n.position}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshStandardMaterial
            color={i % 4 === 0 ? '#2bb3a3' : '#9adfe0'}
            emissive={i % 4 === 0 ? '#2bb3a3' : '#4fd1c5'}
            emissiveIntensity={0.5 + energy * 0.6}
            roughness={0.2}
          />
        </mesh>
      ))}
    </group>
  )
}

