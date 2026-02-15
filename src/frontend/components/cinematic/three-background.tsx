"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Line, OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function WireShape({ glowIntensity }: { glowIntensity: number }) {
  const groupRef = useRef<THREE.Group>(null);

  const points = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-3, 0, 0),
        new THREE.Vector3(-1, 1.5, -1),
        new THREE.Vector3(1, -1.5, 1),
        new THREE.Vector3(3, 0, 0)
      ],
      true
    );
    return curve.getPoints(220);
  }, []);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.18;
    groupRef.current.rotation.x += delta * 0.05;
  });

  return (
    <group ref={groupRef}>
      <Float speed={1} rotationIntensity={0.3} floatIntensity={0.5}>
        <Line
          points={points}
          color={new THREE.Color("#4fd8ff").lerp(new THREE.Color("#61ffca"), glowIntensity).getStyle()}
          lineWidth={1}
          transparent
          opacity={0.35 + glowIntensity * 0.6}
        />
      </Float>
    </group>
  );
}

export function ThreeBackground({ glowIntensity }: { glowIntensity: number }) {
  return (
    <Canvas camera={{ position: [0, 0, 8], fov: 55 }} dpr={[1, 1.5]}>
      <color attach="background" args={["#050a10"]} />
      <ambientLight intensity={0.35 + glowIntensity * 0.7} />
      <directionalLight position={[3, 2, 2]} intensity={0.25 + glowIntensity * 1.2} color="#8de7ff" />
      <WireShape glowIntensity={glowIntensity} />
      <OrbitControls enableZoom={false} enablePan={false} enableRotate={false} />
    </Canvas>
  );
}
