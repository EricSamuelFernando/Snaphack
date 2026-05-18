"use client";

import { useEffect, useRef } from "react";

interface PanoViewerProps {
  imageUrl: string;
}

export default function PanoViewer({ imageUrl }: PanoViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    let cancelled = false;
    let animId = 0;

    import("three").then((THREE) => {
      if (cancelled) return;

      const w = el.offsetWidth || 800;
      const h = el.offsetHeight || 520;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, w / h, 1, 1100);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      el.appendChild(renderer.domElement);

      // Equirectangular sphere — flipped inside out so the texture faces inward
      const geo = new THREE.SphereGeometry(500, 60, 40);
      geo.scale(-1, 1, 1);

      const loader = new THREE.TextureLoader();
      loader.crossOrigin = "anonymous";
      const texture = loader.load(imageUrl);
      scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture })));

      // Pointer-based look-around
      let lon = 0, lat = 0;
      let targetLon = 0, targetLat = 0;
      let isDown = false;
      let prevX = 0, prevY = 0;

      const onDown = (e: PointerEvent) => {
        isDown = true;
        prevX = e.clientX;
        prevY = e.clientY;
        renderer.domElement.setPointerCapture(e.pointerId);
      };
      const onUp = () => { isDown = false; };
      const onMove = (e: PointerEvent) => {
        if (!isDown) return;
        targetLon -= (e.clientX - prevX) * 0.2;
        targetLat += (e.clientY - prevY) * 0.2;
        prevX = e.clientX;
        prevY = e.clientY;
      };

      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointerup", onUp);
      renderer.domElement.addEventListener("pointermove", onMove);

      const animate = () => {
        if (cancelled) return;
        animId = requestAnimationFrame(animate);

        // Auto-rotate gently when the user isn't dragging
        if (!isDown) targetLon -= 0.04;
        lon += (targetLon - lon) * 0.06;
        lat += (targetLat - lat) * 0.06;
        lat = Math.max(-85, Math.min(85, lat));

        const phi = THREE.MathUtils.degToRad(90 - lat);
        const theta = THREE.MathUtils.degToRad(lon);
        camera.lookAt(
          500 * Math.sin(phi) * Math.cos(theta),
          500 * Math.cos(phi),
          500 * Math.sin(phi) * Math.sin(theta)
        );
        renderer.render(scene, camera);
      };
      animate();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      el.querySelector("canvas")?.remove();
    };
  }, [imageUrl]);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100%", cursor: "grab" }}
    />
  );
}
