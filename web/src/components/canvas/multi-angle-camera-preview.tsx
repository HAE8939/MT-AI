import { useEffect, useRef } from "react";

import type { MultiAngleParams } from "@/types/ai-workflow";

export function MultiAngleCameraPreview({ params, open }: { params: MultiAngleParams; open: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const updateRef = useRef<(params: MultiAngleParams) => void>(() => undefined);

    useEffect(() => {
        const container = containerRef.current;
        if (!open || !container) return;
        let disposed = false;
        let frame = 0;
        let resizeObserver: ResizeObserver | null = null;
        let renderer: import("three").WebGLRenderer | null = null;
        let geometries: import("three").BufferGeometry[] = [];
        let materials: import("three").Material[] = [];

        void (async () => {
            const THREE = await import("three");
            if (disposed) return;
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.domElement.className = "block size-full";
            container.replaceChildren(renderer.domElement);
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
            camera.position.set(9, 7, 11);
            camera.lookAt(0, 1, 0);
            scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2));
            const grid = new THREE.GridHelper(16, 16, 0x777777, 0x444444);
            scene.add(grid);
            const roomGeometry = new THREE.BoxGeometry(4.8, 2.8, 4.8);
            const roomMaterial = new THREE.MeshStandardMaterial({ color: 0x8b8b82, transparent: true, opacity: 0.32, wireframe: true });
            geometries.push(roomGeometry);
            materials.push(roomMaterial);
            const room = new THREE.Mesh(roomGeometry, roomMaterial);
            room.position.y = 1.4;
            scene.add(room);

            const cameraGeometry = new THREE.ConeGeometry(0.32, 0.9, 4);
            cameraGeometry.rotateX(Math.PI / 2);
            const material1 = new THREE.MeshStandardMaterial({ color: 0x22c55e });
            const material2 = new THREE.MeshStandardMaterial({ color: 0x38bdf8 });
            geometries.push(cameraGeometry);
            materials.push(material1, material2);
            const marker1 = new THREE.Mesh(cameraGeometry, material1);
            const marker2 = new THREE.Mesh(cameraGeometry, material2);
            scene.add(marker1, marker2);

            const placeMarker = (marker: import("three").Mesh, value: MultiAngleParams["camera1"]) => {
                const horizontal = THREE.MathUtils.degToRad(value.horizontal);
                const vertical = THREE.MathUtils.degToRad(value.vertical);
                const radius = 4 + value.zoom * 0.55;
                marker.position.set(radius * Math.cos(vertical) * Math.sin(horizontal), 1.4 + radius * Math.sin(vertical), radius * Math.cos(vertical) * Math.cos(horizontal));
                marker.lookAt(0, 1.4, 0);
            };
            updateRef.current = (next) => {
                placeMarker(marker1, next.camera1);
                placeMarker(marker2, next.camera2);
            };
            updateRef.current(params);

            const resize = () => {
                if (!renderer) return;
                const width = Math.max(1, container.clientWidth);
                const height = Math.max(1, container.clientHeight);
                renderer.setSize(width, height, false);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            };
            resizeObserver = new ResizeObserver(resize);
            resizeObserver.observe(container);
            resize();
            const animate = () => {
                if (disposed || !renderer) return;
                renderer.render(scene, camera);
                frame = requestAnimationFrame(animate);
            };
            animate();
        })();

        return () => {
            disposed = true;
            cancelAnimationFrame(frame);
            resizeObserver?.disconnect();
            updateRef.current = () => undefined;
            geometries.forEach((geometry) => geometry.dispose());
            materials.forEach((material) => material.dispose());
            renderer?.dispose();
            renderer?.forceContextLoss();
            container.replaceChildren();
        };
    }, [open]);

    useEffect(() => updateRef.current(params), [params]);

    return <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-lg bg-stone-950" />;
}
