import { useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const COLS = 28;
const ROWS = 18;
const COUNT = COLS * ROWS;

/** Deterministic pseudo-random so the "scattered" layout is stable between renders. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

interface Layout { pos: Float32Array; scale: Float32Array; rot: Float32Array }

function buildLayouts(): Layout[] {
  const r = rng(7);
  const scattered: Layout = { pos: new Float32Array(COUNT * 3), scale: new Float32Array(COUNT * 3), rot: new Float32Array(COUNT * 3) };
  const grid: Layout = { pos: new Float32Array(COUNT * 3), scale: new Float32Array(COUNT * 3), rot: new Float32Array(COUNT * 3) };
  const wave: Layout = { pos: new Float32Array(COUNT * 3), scale: new Float32Array(COUNT * 3), rot: new Float32Array(COUNT * 3) };
  for (let i = 0; i < COUNT; i++) {
    const c = i % COLS;
    const row = Math.floor(i / COLS);
    const x = (c - COLS / 2) * 0.36;
    const z = (row - ROWS / 2) * 0.36;
    // 1. Disconnected tools: fragments drifting in every direction.
    scattered.pos.set([(r() - 0.5) * 16, (r() - 0.5) * 8, (r() - 0.5) * 10], i * 3);
    scattered.scale.set([0.12 + r() * 0.2, 0.12 + r() * 0.2, 0.12 + r() * 0.2], i * 3);
    scattered.rot.set([r() * Math.PI, r() * Math.PI, r() * Math.PI], i * 3);
    // 2. One workspace: every record in its place, a calm flat grid.
    grid.pos.set([x, 0, z], i * 3);
    grid.scale.set([0.28, 0.06, 0.28], i * 3);
    // 3. The pulse: the grid rises into a heartbeat traced across the floor.
    // An ECG-style trace (P wave, sharp QRS spike, T wave) running along a narrow band of the grid.
    const d = Math.abs(z);
    const beat = Math.exp(-((x + 3.4) ** 2) * 2.5) * 0.55 - Math.exp(-((x + 0.7) ** 2) * 9) * 0.5 + Math.exp(-(x ** 2) * 7) * 3.8 - Math.exp(-((x - 0.7) ** 2) * 9) * 0.6 + Math.exp(-((x - 3) ** 2) * 1.6) * 0.9;
    const h = Math.max(0.06, (Math.max(beat, 0) + 0.25) * Math.exp(-d * d * 1.6) + 0.06);
    wave.pos.set([x, h / 2, z], i * 3);
    wave.scale.set([0.24, h, 0.24], i * 3);
  }
  return [scattered, grid, wave];
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function Field({ progress }: { progress: MutableRefObject<number> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const layouts = useMemo(buildLayouts, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const shown = useRef(0);
  const colors = useMemo(() => {
    const brass = new THREE.Color('#DDA94B');
    const slate = new THREE.Color('#4B5468');
    const arr = new Float32Array(COUNT * 3);
    const r = rng(3);
    for (let i = 0; i < COUNT; i++) (r() < 0.14 ? brass : slate).toArray(arr, i * 3);
    return arr;
  }, []);

  useFrame((state, delta) => {
    const m = mesh.current;
    if (!m) return;
    // Ease toward the scroll target so fast scrolling still reads as one smooth motion.
    shown.current += (progress.current - shown.current) * Math.min(1, delta * 4);
    const p = Math.min(2, Math.max(0, shown.current));
    const seg = p < 1 ? 0 : 1;
    const t = smooth(p - seg);
    const a = layouts[seg]!;
    const b = layouts[seg + 1]!;
    const time = state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      const k = i * 3;
      const drift = (1 - Math.min(1, p)) * Math.sin(time * 0.4 + i) * 0.15;
      dummy.position.set(a.pos[k]! + (b.pos[k]! - a.pos[k]!) * t, a.pos[k + 1]! + (b.pos[k + 1]! - a.pos[k + 1]!) * t + drift, a.pos[k + 2]! + (b.pos[k + 2]! - a.pos[k + 2]!) * t);
      dummy.scale.set(a.scale[k]! + (b.scale[k]! - a.scale[k]!) * t, a.scale[k + 1]! + (b.scale[k + 1]! - a.scale[k + 1]!) * t, a.scale[k + 2]! + (b.scale[k + 2]! - a.scale[k + 2]!) * t);
      dummy.rotation.set(a.rot[k]! * (1 - t) + b.rot[k]! * t, a.rot[k + 1]! * (1 - t) + b.rot[k + 1]! * t, a.rot[k + 2]! * (1 - t) + b.rot[k + 2]! * t);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    // The camera settles from a wide drifting view to a low, three-quarter view of the pulse.
    const cam = state.camera;
    const camT = p / 2;
    cam.position.set(Math.sin(time * 0.05) * (1 - camT) * 1.5 + 6.5 * camT, 3 + camT * 2.2, 11 - camT * 2.5);
    cam.lookAt(0, camT * 0.8, 0);
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]}>
      <boxGeometry args={[1, 1, 1]}>
        <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
      </boxGeometry>
      <meshStandardMaterial vertexColors roughness={0.45} metalness={0.35} />
    </instancedMesh>
  );
}

export default function PulseScene({ progress }: { progress: MutableRefObject<number> }) {
  return (
    <Canvas camera={{ position: [0, 3, 11], fov: 42 }} dpr={[1, 1.75]} gl={{ antialias: true, powerPreference: 'high-performance' }} aria-hidden>
      <color attach="background" args={['#15171C']} />
      <fog attach="fog" args={['#15171C', 10, 22]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 4]} intensity={1.6} color="#FFE7C2" />
      <pointLight position={[-6, 3, -4]} intensity={18} color="#7F95C9" distance={18} />
      <Field progress={progress} />
    </Canvas>
  );
}
