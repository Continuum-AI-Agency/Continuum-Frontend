'use client';

// The Library's 3D turntable (Frame.io parity): drag to orbit, wheel or pinch to zoom,
// right-drag or two fingers to pan, and an auto-rotate that stops at the first touch.
// Commenting freezes the current frame into a still and reviews it on the image
// annotation layer; the pin keeps the camera it was placed from (`annotation.orbit`), so
// selecting it flies back there and draws it where it was dropped. Camera state is
// mirrored onto the root's data attributes, not React state, for tests and benches.

import type { ModelViewerSource, OrbitAnchor } from '@continuum/contracts';
import {
  Loader2,
  MessageSquarePlus,
  Pause,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OverlayPin } from '../detail/AnnotationOverlay';
import { ImageAnnotationLayer } from '../detail/ImageAnnotationLayer';
import type { ViewerAnchor, ViewerReview } from './index';
import {
  cameraPositionFromOrbit,
  interpolateOrbit,
  type Orbit,
  orbitFromCamera,
  orbitsMatch,
} from './orbit';

type Poster = { blob: Blob; width: number; height: number };

export type ModelViewerProps = {
  source: ModelViewerSource;
  label: string;
  /** When true, render one poster after the first successful frame and hand it over. */
  capturePoster: boolean;
  onPoster?: (poster: Poster) => void;
  review?: ViewerReview;
  onAnchor?: (anchor: ViewerAnchor) => void;
};

type Flight = { from: Orbit; to: Orbit; startedAt: number; onLanded: () => void };

type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  flight: Flight | null;
  /** The user let go; the anchor is sent once the damped glide stops. */
  settling: boolean;
};

type Frozen = { src: string; orbit: Orbit; restoredPinId: string | null };

const FLIGHT_MS = 600;
const POSTER_MAX_PX = 1024;
const ATTRIBUTE_INTERVAL_MS = 100;
const SETTLED_DEG = 0.05;

// ponytail: Draco/meshopt/KTX2-compressed glTF needs decoder wasm the app does not host, and a
// .gltf's external .bin/textures resolve beside the signed URL unsigned; both land in the error
// state. Wire DRACOLoader/KTX2Loader, or sign sidecars, when such files show up.
// A 1×1 white PNG. OBJ/DAE/FBX name their textures as files beside the model, which a signed
// URL cannot reach; three samples a texture that never loaded as black, so a missing one is
// swapped for white and the surface keeps its own colour. Embedded (data:/blob:) ones load.
const MISSING_TEXTURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';

function sidecarFreeManager(modelUrl: string): THREE.LoadingManager {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((requested) =>
    requested === modelUrl || /^(data|blob):/.test(requested) ? requested : MISSING_TEXTURE,
  );
  return manager;
}

async function loadModel(
  url: string,
  format: ModelViewerSource['format'],
): Promise<THREE.Object3D> {
  const manager = sidecarFreeManager(url);
  switch (format) {
    case 'glb':
    case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      return (await new GLTFLoader(manager).loadAsync(url)).scene;
    }
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      return new OBJLoader(manager).loadAsync(url);
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      return new FBXLoader(manager).loadAsync(url);
    }
    case 'dae': {
      const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
      return (await new ColladaLoader(manager).loadAsync(url)).scene;
    }
    case '3ds': {
      const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js');
      return new TDSLoader(manager).loadAsync(url);
    }
    case 'usdz': {
      // USDZLoader is a deprecated alias of USDLoader since r179; USDLoader reads .usdz itself.
      const { USDLoader } = await import('three/examples/jsm/loaders/USDLoader.js');
      return new USDLoader(manager).loadAsync(url);
    }
    case 'stl': {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      return bareGeometry(await new STLLoader(manager).loadAsync(url), false);
    }
    case 'ply': {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
      // PLYLoader indexes every file that has faces; without any it is a scan's point cloud.
      const geometry = await new PLYLoader(manager).loadAsync(url);
      return bareGeometry(geometry, geometry.index === null);
    }
  }
}

// STL and PLY carry geometry only: a neutral satin surface, or the file's own vertex colours.
function bareGeometry(geometry: THREE.BufferGeometry, pointCloud: boolean): THREE.Object3D {
  const coloured = geometry.hasAttribute('color');
  const color = coloured ? 0xffffff : 0xb4b8bf;
  if (pointCloud) {
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color, vertexColors: coloured, size: 2, sizeAttenuation: false }),
    );
  }
  if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      vertexColors: coloured,
      roughness: 0.55,
      metalness: 0.05,
    }),
  );
}

function placeCamera(camera: THREE.PerspectiveCamera, target: THREE.Vector3, orbit: Orbit) {
  const { x, y, z } = cameraPositionFromOrbit(orbit, target);
  camera.position.set(x, y, z);
  camera.lookAt(target);
}

// Centres the model on the origin and backs the camera off until its bounding sphere fits the
// narrower field of view, from a three-quarter angle slightly above.
function frameModel(
  model: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
) {
  const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
  const radius = Number.isFinite(sphere.radius) && sphere.radius > 0 ? sphere.radius : 1;
  model.position.sub(sphere.center);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const distance = (radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * 1.1;
  camera.near = radius / 100;
  camera.far = radius * 100;
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  controls.minDistance = radius * 0.3;
  controls.maxDistance = radius * 10;
  placeCamera(camera, controls.target, { azimuthDeg: 35, polarDeg: 70, distance });
  controls.update();
  controls.saveState();
}

// Damping keeps turning the camera for a second after a release or an auto-rotate stop.
// Applying that remainder at once keeps a frozen frame and a flight's end where they are.
function settleNow(controls: OrbitControls) {
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = true;
}

function currentOrbit(stage: Stage): Orbit {
  return orbitFromCamera(stage.camera.position, stage.controls.target);
}

function writeCameraAttributes(root: HTMLElement, orbit: Orbit) {
  root.dataset.azimuth = orbit.azimuthDeg.toFixed(1);
  root.dataset.polar = orbit.polarDeg.toFixed(1);
  root.dataset.distance = orbit.distance.toFixed(3);
}

function pinOrbit(pin: OverlayPin): OrbitAnchor | undefined {
  return pin.annotation.kind === 'point' ? pin.annotation.orbit : undefined;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((node) => {
    if (
      !(node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.Line)
    ) {
      return;
    }
    node.geometry.dispose();
    const materials: THREE.Material[] = Array.isArray(node.material)
      ? node.material
      : [node.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

// The card poster, up to 1024 px on the long side, drawn by the live renderer at poster size:
// a second renderer could not reuse this one's PMREM environment.
function capturePosterFrame(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): Promise<Poster | null> {
  const stageSize = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();
  const scale = POSTER_MAX_PX / Math.max(stageSize.x, stageSize.y);
  const width = Math.max(1, Math.round(stageSize.x * scale));
  const height = Math.max(1, Math.round(stageSize.y * scale));
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.render(scene, camera);
  const still = document.createElement('canvas');
  still.width = width;
  still.height = height;
  still.getContext('2d')?.drawImage(renderer.domElement, 0, 0);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(stageSize.x, stageSize.y, false);
  renderer.render(scene, camera);
  return new Promise((resolve) => {
    still.toBlob(
      (webp) => {
        if (webp) return resolve({ blob: webp, width, height });
        still.toBlob((png) => resolve(png ? { blob: png, width, height } : null), 'image/png');
      },
      'image/webp',
      0.86,
    );
  });
}

// The live canvas is transparent so the stage's theme shows through; the frozen still is an
// image of its own, so it is painted onto the first opaque background behind the viewer and
// reads exactly like the live view.
function opaqueStill(canvas: HTMLCanvasElement, root: HTMLElement | null): string {
  let background = '#ffffff';
  for (let node: HTMLElement | null = root; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    const alpha = color.match(/rgba?\([^)]*,\s*([\d.]+)\)/)?.[1];
    if (color.startsWith('rgb(') || (alpha !== undefined && Number(alpha) === 1)) {
      background = color;
      break;
    }
  }
  const still = document.createElement('canvas');
  still.width = canvas.width;
  still.height = canvas.height;
  const context = still.getContext('2d');
  if (!context) return canvas.toDataURL('image/png');
  context.fillStyle = background;
  context.fillRect(0, 0, still.width, still.height);
  context.drawImage(canvas, 0, 0);
  return still.toDataURL('image/png');
}

function PillButton({
  label,
  testId,
  pressed,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      data-testid={testId}
      onClick={onClick}
      className="rounded-full aria-pressed:bg-muted aria-pressed:text-foreground"
    >
      {children}
    </Button>
  );
}

export function ModelViewer({
  source,
  label,
  capturePoster,
  onPoster,
  review,
  onAnchor,
}: ModelViewerProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  // Refs, not effect state: StrictMode's second effect pass must not post a second poster.
  const posterSentRef = useRef(false);
  const restoredPinRef = useRef<string | null>(null);
  const latest = useRef({ capturePoster, onPoster, onAnchor, onSelectPin: review?.onSelectPin });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [autoRotate, setAutoRotate] = useState(true);
  const [frozen, setFrozen] = useState<Frozen | null>(null);
  const { url, format } = source;

  useEffect(() => {
    latest.current = { capturePoster, onPoster, onAnchor, onSelectPin: review?.onSelectPin };
  });

  // Turning away from a restored pin (or leaving comment mode) lets go of its thread, so
  // selecting that thread again flies back to it.
  const releasePin = () => {
    if (restoredPinRef.current === null) return;
    restoredPinRef.current = null;
    latest.current.onSelectPin?.(null);
  };
  const leaveComment = () => {
    setFrozen(null);
    releasePin();
  };

  useEffect(() => {
    const root = rootRef.current;
    const host = hostRef.current;
    if (!root || !host) return;
    let disposed = false;
    let frame = 0;
    setStatus('loading');
    setFrozen(null);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
    } catch (error: unknown) {
      // No WebGL (disabled, or the browser's context cap): say so instead of crashing the stage.
      console.warn('[ModelViewer] WebGL unavailable', error);
      setStatus('error');
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = renderer.domElement;
    canvas.dataset.testid = 'model-viewer-canvas';
    canvas.className = 'block size-full touch-none';
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    // The room lights PBR materials only; OBJ's Phong and other legacy materials need lamps.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.autoRotateSpeed = 1.5;
    const stage: Stage = { renderer, scene, camera, controls, flight: null, settling: false };
    stageRef.current = stage;

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    const publish = (orbit: Orbit) => {
      writeCameraAttributes(root, orbit);
      latest.current.onAnchor?.({ orbit });
    };
    let lastWrite = 0;
    controls.addEventListener('change', () => {
      const now = performance.now();
      if (now - lastWrite < ATTRIBUTE_INTERVAL_MS) return;
      lastWrite = now;
      writeCameraAttributes(root, currentOrbit(stage));
    });
    controls.addEventListener('start', () => {
      stage.flight = null;
      setAutoRotate(false);
      releasePin();
    });
    controls.addEventListener('end', () => {
      stage.settling = true;
    });

    let previous: Orbit | null = null;
    let lastFrame: number | null = null;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Seconds since the last frame, so auto-rotate turns at the same speed on a slow GPU.
      const elapsed = lastFrame === null ? null : (now - lastFrame) / 1000;
      lastFrame = now;
      const flight = stage.flight;
      if (flight) {
        const t = Math.min(1, Math.max(0, (now - flight.startedAt) / FLIGHT_MS));
        const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
        placeCamera(camera, controls.target, interpolateOrbit(flight.from, flight.to, eased));
        if (t === 1) {
          stage.flight = null;
          controls.update();
          publish(currentOrbit(stage));
          flight.onLanded();
        }
      } else {
        controls.update(elapsed);
        if (stage.settling) {
          const orbit = currentOrbit(stage);
          const still =
            previous !== null &&
            orbitsMatch(previous, orbit, SETTLED_DEG) &&
            Math.abs(previous.distance - orbit.distance) < orbit.distance * 1e-3;
          previous = still ? null : orbit;
          if (still) {
            stage.settling = false;
            publish(orbit);
          }
        }
      }
      renderer.render(scene, camera);
    };

    loadModel(url, format)
      .then((model) => {
        if (disposed) {
          disposeObject(model);
          return;
        }
        scene.add(model);
        frameModel(model, camera, controls);
        renderer.render(scene, camera);
        const { capturePoster: wantsPoster, onPoster: takePoster } = latest.current;
        if (wantsPoster && takePoster && !posterSentRef.current) {
          posterSentRef.current = true;
          try {
            void capturePosterFrame(renderer, scene, camera).then((poster) => {
              if (poster) takePoster(poster);
            });
          } catch (error: unknown) {
            console.warn('[ModelViewer] poster capture failed', error);
          }
        }
        writeCameraAttributes(root, currentOrbit(stage));
        setStatus('ready');
        frame = requestAnimationFrame(tick);
      })
      .catch((error: unknown) => {
        if (disposed) return;
        console.warn('[ModelViewer] could not load the model', error);
        setStatus('error');
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposeObject(scene);
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      // Browsers cap live WebGL contexts; paging through models must not exhaust them.
      renderer.forceContextLoss();
      canvas.remove();
      if (stageRef.current === stage) stageRef.current = null;
    };
  }, [url, format]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || status !== 'ready') return;
    const turning = autoRotate && !frozen;
    stage.controls.autoRotate = turning;
    // Stopping means stopping: no damped glide past the frame the reviewer paused on.
    if (!turning) settleNow(stage.controls);
  }, [autoRotate, frozen, status]);

  useEffect(() => {
    if (!frozen) return;
    // Capture phase, so Escape leaves comment mode instead of closing the detail dialog.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      leaveComment();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [frozen]);

  const freeze = (restoredPinId: string | null) => {
    const stage = stageRef.current;
    if (!stage) return;
    setAutoRotate(false);
    stage.flight = null;
    stage.controls.autoRotate = false;
    settleNow(stage.controls);
    stage.renderer.render(stage.scene, stage.camera);
    const orbit = currentOrbit(stage);
    if (rootRef.current) writeCameraAttributes(rootRef.current, orbit);
    setFrozen({
      src: opaqueStill(stage.renderer.domElement, rootRef.current),
      orbit,
      restoredPinId,
    });
  };

  const flyTo = (anchor: OrbitAnchor, pinId: string) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (frozen && orbitsMatch(frozen.orbit, anchor)) {
      setFrozen({ ...frozen, restoredPinId: pinId });
      return;
    }
    setFrozen(null);
    setAutoRotate(false);
    const { controls } = stage;
    controls.autoRotate = false;
    settleNow(controls);
    const from = currentOrbit(stage);
    stage.flight = {
      from,
      to: {
        azimuthDeg: anchor.azimuthDeg,
        // Exactly on a pole the look-at has no up direction.
        polarDeg: THREE.MathUtils.clamp(anchor.polarDeg, 0.1, 179.9),
        distance: THREE.MathUtils.clamp(
          anchor.distance ?? from.distance,
          controls.minDistance,
          controls.maxDistance,
        ),
      },
      startedAt: performance.now(),
      onLanded: () => freeze(pinId),
    };
  };

  const selectedPin = review?.pins.find((pin) => pin.selected && pinOrbit(pin));
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a newly selected pin flies the camera
  useEffect(() => {
    if (!selectedPin) {
      restoredPinRef.current = null;
      return;
    }
    const orbit = pinOrbit(selectedPin);
    if (status !== 'ready' || !orbit || restoredPinRef.current === selectedPin.id) return;
    restoredPinRef.current = selectedPin.id;
    flyTo(orbit, selectedPin.id);
  }, [selectedPin?.id, status]);

  const dolly = (factor: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const { camera, controls } = stage;
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(
      THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance),
    );
    camera.position.copy(controls.target).add(offset);
    stage.flight = null;
    stage.settling = true;
  };

  const resetView = () => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.flight = null;
    settleNow(stage.controls);
    stage.controls.reset();
    stage.settling = true;
  };

  const pinsInView =
    frozen && review
      ? review.pins.filter((pin) => {
          const orbit = pinOrbit(pin);
          return orbit !== undefined && orbitsMatch(orbit, frozen.orbit);
        })
      : [];

  return (
    <div
      ref={rootRef}
      data-testid="model-viewer"
      data-state={status}
      data-format={format}
      data-restored-pin={frozen?.restoredPinId ?? undefined}
      data-selected-pin={selectedPin?.id}
      className="relative size-full overflow-hidden"
    >
      <div
        ref={hostRef}
        role="img"
        aria-label={label}
        className={cn('absolute inset-0', frozen && 'invisible')}
      />

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p data-testid="model-viewer-error" className="text-xs text-muted-foreground">
            Could not open this 3D model.
          </p>
        </div>
      )}

      {frozen && review && (
        <div className="absolute inset-0 z-10">
          <ImageAnnotationLayer
            src={frozen.src}
            alt={`${label}, frozen view`}
            pins={pinsInView}
            onSelectPin={review.onSelectPin}
            posting={review.posting}
            brandId={review.brandId}
            onPostAnnotated={(body, annotation, extras) =>
              review.onPostAnnotated(
                body,
                annotation.kind === 'point' ? { ...annotation, orbit: frozen.orbit } : annotation,
                extras,
              )
            }
          />
        </div>
      )}

      {status === 'ready' && (
        <div
          className={cn(
            // Top: the detail stage keeps its own toolbar along the bottom edge.
            'absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/90 p-1 shadow-sm backdrop-blur',
          )}
        >
          {!frozen && (
            <>
              <PillButton
                label={autoRotate ? 'Pause auto-rotate' : 'Auto-rotate'}
                testId="model-viewer-autorotate"
                pressed={autoRotate}
                onClick={() => setAutoRotate((on) => !on)}
              >
                {autoRotate ? <Pause className="size-3.5" /> : <RotateCw className="size-3.5" />}
              </PillButton>
              <PillButton
                label="Zoom out"
                testId="model-viewer-zoom-out"
                onClick={() => dolly(1.25)}
              >
                <ZoomOut className="size-3.5" />
              </PillButton>
              <PillButton label="Zoom in" testId="model-viewer-zoom-in" onClick={() => dolly(0.8)}>
                <ZoomIn className="size-3.5" />
              </PillButton>
              <PillButton label="Reset view" testId="model-viewer-reset" onClick={resetView}>
                <RotateCcw className="size-3.5" />
              </PillButton>
            </>
          )}
          {review && (
            <PillButton
              label={frozen ? 'Back to the 3D view' : 'Comment on this view'}
              testId="model-viewer-comment"
              pressed={frozen !== null}
              onClick={() => (frozen ? leaveComment() : freeze(null))}
            >
              <MessageSquarePlus className="size-3.5" />
            </PillButton>
          )}
        </div>
      )}
    </div>
  );
}
