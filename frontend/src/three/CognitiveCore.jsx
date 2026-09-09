import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useAnimStore } from '../animation/animStore'
import { getDpr, getReducedMotion, getPerfTier } from '../animation/device'

/**
 * The "Cognitive Core" — a floating cluster of connected glowing nodes.
 * Slow rotation, subtle reactivity to the global energy level.
 * Used as the immersive hero on the patient home screen.
 */

function Core() {
  const groupRef = useRef()
  const energy = useAnimStore((s) => s.energy)
  const reduced = getReducedMotion()

  const nodes = useMemo(() => {
    const list = []
    const count = 22
    for (let i = 0; i < count; i++) {
      const theta = Math.acos(2 * Math.random() - 1)
      const phi = Math.random() * Math.PI * 2
      const r = 0.6 + Math.random() * 0.8
      list.push({
        position: [
          r * Math.sin(theta) * Math.cos(phi),
          r * Math.sin(theta) * Math.sin(phi),
          r * Math.cos(theta),
        ],
        size: 0.05 + Math.random() * 0.05,
        speed: 0.1 + Math.random() * 0.3,
      })
    }
    return list
  }, [])

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime
    const rotSpeed = reduced ? 0 : 0.15 + energy * 0.2
    groupRef.current.rotation.y = t * rotSpeed
    groupRef.current.rotation.x = Math.sin(t * 0.1) * 0.1
    const scale = 1 + (energy - 0.5) * 0.15
    groupRef.current.scale.setScalar(1 + (energy - 0.5) * 0.2)
  })

  return (
    <group ref={groupRef}>
      {/* Central glowing core */}
      <mesh>
        <sphereGeometry args={[0.55, 24, 24]} />
        <meshStandardMaterial
          color="#2bb3a3"
          emissive="#0f766e"
          emissiveIntensity={0.4 + energy * 0.5}
          transparent
          opacity={0.85}
          roughness={0.25}
          metalness={0.4}
        />
      </mesh>
      {/* Clearer outer shell */}
      <mesh scale={1.4}>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshStandardMaterial
          color="#5b8def"
          wireframe
          transparent
          opacity={0.18 + energy * 0.1}
        />
      </mesh>
      {/* Orbiting nodes */}
      {nodes.map((n, i) => (
        <mesh key={i} position={n.position}>
          <sphereGeometry args={[n.size, 10, 10]} />
          <meshStandardMaterial
            color={i % 4 === 0 ? '#2bb3a3' : '#7fd6c9'}
            emissive={i % 4 === 0 ? '#2bb3a3' : '#4fd1c5'}
            emissiveIntensity={0.6 + energy * 0.5}
          />
        </mesh>
      ))}
    </group>
  )
}

export default function CognitiveCore({ height = 260 }) {
  const reduced = getReducedMotion()
  const tier = getPerfTier()

  if (typeof window === 'undefined') return null

  return (
    <div
      aria-hidden="true"
      style={{ height, position: 'relative' }}
    >
      <Canvas
        camera={{ position: [0, 0, 3.4], fov: 45 }}
        dpr={getDpr()}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.8} />
        <pointLight position={[3, 3, 4]} intensity={1.2} color="#5b8def" />
        <pointLight position={[-3, -3, 2]} intensity={0.8} color="#2bb3a3" />
        <Core />
      </Canvas>
    </div>
  )
}
