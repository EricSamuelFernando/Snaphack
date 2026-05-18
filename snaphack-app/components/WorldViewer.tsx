"use client";

import { useEffect, useRef, useMemo } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  splatUrl: string;
  metricScaleFactor?: number;
  groundPlaneOffset?: number;
}

function FlyController() {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const pointerDown = useRef(false);

  const _euler = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);
  const _fwd = useMemo(() => new THREE.Vector3(), []);
  const _right = useMemo(() => new THREE.Vector3(), []);
  const _up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const _move = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    camera.position.set(0, 1.6, 3);

    const onKey = (e: KeyboardEvent) => {
      if (e.type === "keydown") keys.current.add(e.code);
      else keys.current.delete(e.code);
    };
    const onDown = () => { pointerDown.current = true; };
    const onUp = () => { pointerDown.current = false; };
    const onMove = (e: PointerEvent) => {
      if (!pointerDown.current) return;
      yaw.current -= e.movementX * 0.003;
      pitch.current = Math.max(-1.4, Math.min(1.4, pitch.current - e.movementY * 0.003));
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    gl.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    gl.domElement.addEventListener("pointermove", onMove);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      gl.domElement.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      gl.domElement.removeEventListener("pointermove", onMove);
    };
  }, [camera, gl]);

  useFrame((_, dt) => {
    _euler.set(pitch.current, yaw.current, 0);
    camera.quaternion.setFromEuler(_euler);

    const k = keys.current;
    let f = 0, s = 0, v = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) f += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) f -= 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) s -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) s += 1;
    if (k.has("KeyE")) v += 1;
    if (k.has("KeyQ")) v -= 1;

    _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _move.set(0, 0, 0)
      .addScaledVector(_fwd, f)
      .addScaledVector(_right, s)
      .addScaledVector(_up, v);
    if (_move.lengthSq() > 1) _move.normalize();

    const spd = 4 * dt * (k.has("ShiftLeft") || k.has("ShiftRight") ? 3 : 1);
    camera.position.addScaledVector(_move, spd);
  });

  return null;
}

function SplatScene({ splatUrl, metricScaleFactor = 1, groundPlaneOffset = 0 }: Props) {
  const { gl, scene } = useThree();

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sparkRenderer: any = null;
    let cancelled = false;

    import("@sparkjsdev/spark").then(({ SplatMesh, SparkRenderer }: any) => {
      if (cancelled) return;

      sparkRenderer = new SparkRenderer({ renderer: gl, enableLod: true });
      const splat = new SplatMesh({ url: splatUrl });

      const group = new THREE.Group();
      group.rotation.x = Math.PI; // World Labs splats are Y-flipped
      group.position.y = groundPlaneOffset;
      group.scale.setScalar(metricScaleFactor);
      group.add(splat);

      (sparkRenderer as any).add(group);
      scene.add(sparkRenderer);
    }).catch(console.error);

    return () => {
      cancelled = true;
      if (sparkRenderer) scene.remove(sparkRenderer);
    };
  }, [splatUrl, gl, scene, metricScaleFactor, groundPlaneOffset]);

  return null;
}

export default function WorldViewer({ splatUrl, metricScaleFactor = 1, groundPlaneOffset = 0 }: Props) {
  return (
    <div className="relative w-full h-full" style={{ minHeight: "520px" }}>
      <Canvas
        camera={{ fov: 60, near: 0.01, far: 2000, position: [0, 1.6, 3] }}
        style={{ background: "#0a0a0f", cursor: "grab" }}
      >
        <SplatScene
          splatUrl={splatUrl}
          metricScaleFactor={metricScaleFactor}
          groundPlaneOffset={groundPlaneOffset}
        />
        <FlyController />
      </Canvas>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-2 text-xs text-white/70 backdrop-blur-sm">
        <span className="font-medium text-white">WASD</span> move ·{" "}
        <span className="font-medium text-white">E / Q</span> up/down ·{" "}
        <span className="font-medium text-white">Shift</span> fast ·{" "}
        <span className="font-medium text-white">drag</span> look
      </div>
    </div>
  );
}
