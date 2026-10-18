import type { WebComponentFramework, WebComponentProject } from '@continuum/contracts';

const THREE_SCENE = `import * as THREE from 'three';
export default async function createScene(ctx) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#10131a');
  const camera = new THREE.PerspectiveCamera(42, ctx.width / ctx.height, 0.1, 100); camera.position.set(0, 0.35, 5);
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(ctx.pixelRatio); renderer.setSize(ctx.width, ctx.height, false); ctx.container.appendChild(renderer.domElement);
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(2, 3, 4); scene.add(key); scene.add(new THREE.AmbientLight('#8b9bc5', 1.1));
  const geometry = new THREE.IcosahedronGeometry(1, 1); const material = new THREE.MeshStandardMaterial({ color: '#8b7bff', roughness: 0.34, metalness: 0.12 }); const orb = new THREE.Mesh(geometry, material); scene.add(orb);
  return {
    ready: Promise.resolve(),
    update(t) { orb.rotation.y = t * 0.42; orb.rotation.x = Math.sin(t * 0.4) * 0.13; },
    render() { renderer.render(scene, camera); },
    resize(w, h, dpr) { camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); },
    describeScene() { return [
      { id: 'main-light', name: 'Key light', kind: 'light', parentId: null, properties: [
        { key: 'intensity', label: 'Intensity', type: 'number', value: key.intensity, min: 0, max: 5, step: 0.1 },
        { key: 'position.x', label: 'X position', type: 'number', value: key.position.x, min: -5, max: 5, step: 0.1 },
      ] },
      { id: 'hero-orb', name: 'Hero orb', kind: 'mesh', parentId: null, properties: [
        { key: 'position.x', label: 'X position', type: 'number', value: orb.position.x, min: -3, max: 3, step: 0.05 },
        { key: 'position.y', label: 'Y position', type: 'number', value: orb.position.y, min: -3, max: 3, step: 0.05 },
        { key: 'position.z', label: 'Z position', type: 'number', value: orb.position.z, min: -3, max: 3, step: 0.05 },
        { key: 'rotation.x', label: 'Rotation X (radians)', type: 'number', value: orb.rotation.x, min: -6.28, max: 6.28, step: 0.01 },
        { key: 'rotation.y', label: 'Rotation Y (radians)', type: 'number', value: orb.rotation.y, min: -6.28, max: 6.28, step: 0.01 },
        { key: 'rotation.z', label: 'Rotation Z (radians)', type: 'number', value: orb.rotation.z, min: -6.28, max: 6.28, step: 0.01 },
        { key: 'scale.x', label: 'Scale X', type: 'number', value: orb.scale.x, min: 0.01, max: 4, step: 0.01 },
        { key: 'scale.y', label: 'Scale Y', type: 'number', value: orb.scale.y, min: 0.01, max: 4, step: 0.01 },
        { key: 'scale.z', label: 'Scale Z', type: 'number', value: orb.scale.z, min: 0.01, max: 4, step: 0.01 },
        { key: 'visible', label: 'Visible', type: 'boolean', value: orb.visible },
        { key: 'material.color', label: 'Color', type: 'color', value: '#' + material.color.getHexString() },
        { key: 'material.roughness', label: 'Roughness', type: 'number', value: material.roughness, min: 0, max: 1, step: 0.01 },
        { key: 'material.metalness', label: 'Metalness', type: 'number', value: material.metalness, min: 0, max: 1, step: 0.01 },
      ] },
      { id: 'main-camera', name: 'Camera', kind: 'camera', parentId: null, properties: [
        { key: 'position.z', label: 'Z position', type: 'number', value: camera.position.z, min: 1, max: 20, step: 0.1 },
        { key: 'fov', label: 'Field of view', type: 'number', value: camera.fov, min: 15, max: 90, step: 1 },
      ] },
    ]; },
    applyProperty(id, keyName, value) {
      const object = id === 'hero-orb' ? orb : id === 'main-light' ? key : id === 'main-camera' ? camera : null;
      if (!object) throw new Error('Unknown editable object: ' + id);
      if (keyName.startsWith('position.')) object.position[keyName.slice(9)] = Number(value);
      else if (id === 'hero-orb' && keyName.startsWith('rotation.')) orb.rotation[keyName.slice(9)] = Number(value);
      else if (id === 'hero-orb' && keyName.startsWith('scale.')) orb.scale[keyName.slice(6)] = Number(value);
      else if (id === 'hero-orb' && keyName === 'visible') orb.visible = Boolean(value);
      else if (id === 'hero-orb' && keyName === 'material.color') material.color.set(String(value));
      else if (id === 'hero-orb' && keyName.startsWith('material.')) material[keyName.slice(9)] = Number(value);
      else if (id === 'main-light' && keyName === 'intensity') key.intensity = Number(value);
      else if (id === 'main-camera' && keyName === 'fov') { camera.fov = Number(value); camera.updateProjectionMatrix(); }
      else throw new Error('Unsupported property: ' + keyName);
    },
    dispose() { geometry.dispose(); material.dispose(); renderer.dispose(); renderer.domElement.remove(); },
  };
}`;

const R3F_SCENE = `import { createElement, createRef } from 'react';
import * as THREE from 'three';
import { advance, createRoot, extend } from '@react-three/fiber';
extend(THREE);
export default async function createScene(ctx) {
  const canvas = document.createElement('canvas'); ctx.container.appendChild(canvas); const root = createRoot(canvas);
  const mesh = createRef(); const mat = createRef(); const light = createRef();
  await root.configure({ frameloop: 'never', dpr: ctx.pixelRatio, camera: { position: [0, 0, 5], fov: 42 }, gl: { antialias: true } });
  const store = root.render(createElement('group', null,
    createElement('directionalLight', { ref: light, position: [2, 3, 4], intensity: 2.2 }),
    createElement('ambientLight', { color: '#8b9bc5', intensity: 1.1 }),
    createElement('mesh', { ref: mesh }, createElement('icosahedronGeometry', { args: [1, 1] }), createElement('meshStandardMaterial', { ref: mat, color: '#8b7bff', roughness: 0.34, metalness: 0.12 })),
  ));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  let timestampSeconds = 0;
  return {
    ready: Promise.resolve(),
    update(t) { timestampSeconds = t; if (mesh.current) { mesh.current.rotation.y = t * 0.42; mesh.current.rotation.x = Math.sin(t * 0.4) * 0.13; } },
    render() { advance(timestampSeconds, true, store.getState()); },
    async resize(w, h, dpr) { await root.configure({ size: { width: w, height: h, top: 0, left: 0 }, dpr }); },
    describeScene() { return [
      { id: 'main-light', name: 'Key light', kind: 'light', parentId: null, properties: [
        { key: 'intensity', label: 'Intensity', type: 'number', value: light.current?.intensity ?? 2.2, min: 0, max: 5, step: 0.1 },
        { key: 'position.x', label: 'X position', type: 'number', value: light.current?.position.x ?? 2, min: -5, max: 5, step: 0.1 },
      ] },
      { id: 'hero-orb', name: 'Hero orb', kind: 'mesh', parentId: null, properties: [
        { key: 'position.x', label: 'X position', type: 'number', value: mesh.current?.position.x ?? 0, min: -3, max: 3, step: 0.05 },
        { key: 'position.y', label: 'Y position', type: 'number', value: mesh.current?.position.y ?? 0, min: -3, max: 3, step: 0.05 },
        { key: 'position.z', label: 'Z position', type: 'number', value: mesh.current?.position.z ?? 0, min: -3, max: 3, step: 0.05 },
        { key: 'rotation.x', label: 'Rotation X (radians)', type: 'number', value: mesh.current?.rotation.x ?? 0, min: -6.28, max: 6.28, step: 0.01 },
        { key: 'rotation.y', label: 'Rotation Y (radians)', type: 'number', value: mesh.current?.rotation.y ?? 0, min: -6.28, max: 6.28, step: 0.01 },
        { key: 'rotation.z', label: 'Rotation Z (radians)', type: 'number', value: mesh.current?.rotation.z ?? 0, min: -6.28, max: 6.28, step: 0.01 },
        { key: 'scale.x', label: 'Scale X', type: 'number', value: mesh.current?.scale.x ?? 1, min: 0.01, max: 4, step: 0.01 },
        { key: 'scale.y', label: 'Scale Y', type: 'number', value: mesh.current?.scale.y ?? 1, min: 0.01, max: 4, step: 0.01 },
        { key: 'scale.z', label: 'Scale Z', type: 'number', value: mesh.current?.scale.z ?? 1, min: 0.01, max: 4, step: 0.01 },
        { key: 'visible', label: 'Visible', type: 'boolean', value: mesh.current?.visible ?? true },
        { key: 'material.color', label: 'Color', type: 'color', value: '#' + (mat.current?.color.getHexString() ?? '8b7bff') },
        { key: 'material.roughness', label: 'Roughness', type: 'number', value: mat.current?.roughness ?? 0.34, min: 0, max: 1, step: 0.01 },
      ] },
      { id: 'main-camera', name: 'Camera', kind: 'camera', parentId: null, properties: [
        { key: 'position.z', label: 'Z position', type: 'number', value: store.getState().camera.position.z, min: 1, max: 20, step: 0.1 },
        { key: 'fov', label: 'Field of view', type: 'number', value: store.getState().camera.fov, min: 15, max: 90, step: 1 },
      ] },
    ]; },
    applyProperty(id, key, value) {
      const object = id === 'hero-orb' ? mesh.current : id === 'main-light' ? light.current : id === 'main-camera' ? store.getState().camera : null;
      if (!object) throw new Error('Unknown editable object: ' + id);
      if (key.startsWith('position.')) object.position[key.slice(9)] = Number(value);
      else if (id === 'hero-orb' && key.startsWith('rotation.')) object.rotation[key.slice(9)] = Number(value);
      else if (id === 'hero-orb' && key.startsWith('scale.')) object.scale[key.slice(6)] = Number(value);
      else if (id === 'hero-orb' && key === 'visible') object.visible = Boolean(value);
      else if (id === 'hero-orb' && key === 'material.color') mat.current.color.set(String(value));
      else if (id === 'hero-orb' && key === 'material.roughness') mat.current.roughness = Number(value);
      else if (id === 'main-light' && key === 'intensity') light.current.intensity = Number(value);
      else if (id === 'main-camera' && key === 'fov') { object.fov = Number(value); object.updateProjectionMatrix(); }
      else throw new Error('Unsupported property: ' + key);
    },
    dispose() { root.unmount(); canvas.remove(); },
  };
}`;

const PIXI_SCENE = `import { Application, Graphics } from 'pixi.js';
import 'pixi.js/unsafe-eval';
export default async function createScene(ctx) {
  const app = new Application(); await app.init({ width: ctx.width, height: ctx.height, resolution: ctx.pixelRatio, autoDensity: true, background: '#10131a', antialias: true });
  app.stop(); ctx.container.appendChild(app.canvas);
  const orb = new Graphics().roundRect(-70, -70, 140, 140, 22).fill('#8b7bff'); orb.position.set(ctx.width / 2, ctx.height / 2); app.stage.addChild(orb);
  const rule = new Graphics().roundRect(-112, 103, 224, 2, 1).fill('#c7c0ff'); rule.position.set(ctx.width / 2, ctx.height / 2); app.stage.addChild(rule);
  return {
    ready: Promise.resolve(), update(t) { orb.rotation = t * 0.42; }, render() { app.render(); },
    resize(w, h, dpr) { app.renderer.resize(w, h, dpr); orb.position.set(w / 2, h / 2); rule.position.set(w / 2, h / 2); },
    describeScene() { return [{ id: 'hero-orb', name: 'Hero orb', kind: 'graphics', parentId: null, properties: [
      { key: 'position.x', label: 'X position', type: 'number', value: orb.x, min: 0, max: ctx.width, step: 1 },
      { key: 'position.y', label: 'Y position', type: 'number', value: orb.y, min: 0, max: ctx.height, step: 1 },
      { key: 'rotation', label: 'Rotation (radians)', type: 'number', value: orb.rotation, min: -6.28, max: 6.28, step: 0.01 },
      { key: 'scale.x', label: 'Scale X', type: 'number', value: orb.scale.x, min: 0.01, max: 4, step: 0.01 },
      { key: 'scale.y', label: 'Scale Y', type: 'number', value: orb.scale.y, min: 0.01, max: 4, step: 0.01 },
      { key: 'opacity', label: 'Opacity', type: 'number', value: orb.alpha, min: 0, max: 1, step: 0.01 },
      { key: 'visible', label: 'Visible', type: 'boolean', value: orb.visible },
      { key: 'tint', label: 'Tint', type: 'color', value: '#' + Number(orb.tint).toString(16).padStart(6, '0') },
    ] }]; },
    applyProperty(id, key, value) {
      if (id !== 'hero-orb') throw new Error('Unknown editable object: ' + id);
      if (key === 'position.x') orb.x = Number(value); else if (key === 'position.y') orb.y = Number(value);
      else if (key === 'rotation') orb.rotation = Number(value);
      else if (key === 'scale.x') orb.scale.x = Number(value); else if (key === 'scale.y') orb.scale.y = Number(value);
      else if (key === 'opacity') orb.alpha = Number(value); else if (key === 'visible') orb.visible = Boolean(value);
      else if (key === 'tint') orb.tint = String(value);
      else throw new Error('Unsupported property: ' + key);
    },
    dispose() { app.destroy(true, { children: true, texture: true, textureSource: true, context: true }); },
  };
}`;

const DOM_SCENE = `import { gsap } from 'gsap';
export default async function createScene(ctx) {
  const card = document.createElement('div'); card.textContent = 'Scene / 01';
  card.style.cssText = 'display:grid;place-items:center;position:absolute;left:50%;top:50%;width:220px;height:140px;margin:-70px 0 0 -110px;border:1px solid #7770df;border-radius:8px;background:linear-gradient(140deg,#29244f,#121520);color:#f7f5ff;font:600 18px system-ui;letter-spacing:.04em;transform-origin:center';
  ctx.container.style.position = 'relative'; ctx.container.appendChild(card);
  gsap.set(card, { x: 0, y: 0, rotation: 0, scale: 1, force3D: false });
  const durationSec = Number.isFinite(ctx.durationSec) ? ctx.durationSec : 8;
  const motion = gsap.timeline({ paused: true }).to(card, { rotation: 8, scale: 1.04, duration: Math.max(1, durationSec / 2), ease: 'sine.inOut', yoyo: true, repeat: 1 });
  let textColor = '#f7f5ff';
  return {
    ready: Promise.resolve(document.fonts?.ready).then(() => undefined), update(t) { motion.totalTime(t, true); }, render() {}, resize() {},
    describeScene() { return [{ id: 'hero-card', name: 'Hero card', kind: 'dom', parentId: null, properties: [
      { key: 'text', label: 'Text', type: 'string', value: card.textContent ?? '' },
      { key: 'color', label: 'Text color', type: 'color', value: textColor },
      { key: 'opacity', label: 'Opacity', type: 'number', value: Number(card.style.opacity || 1), min: 0, max: 1, step: 0.01 },
    ] }]; },
    applyProperty(id, key, value) {
      if (id !== 'hero-card') throw new Error('Unknown editable object: ' + id);
      if (key === 'text') card.textContent = String(value);
      else if (key === 'color') { textColor = String(value); card.style.color = textColor; }
      else if (key === 'opacity') card.style.opacity = String(value);
      else throw new Error('Unsupported property: ' + key);
    },
    dispose() { motion.kill(); card.remove(); },
  };
}`;

export function createStarterProject(framework: WebComponentFramework): WebComponentProject {
  const source =
    framework === 'three'
      ? THREE_SCENE
      : framework === 'r3f'
        ? R3F_SCENE
        : framework === 'pixi'
          ? PIXI_SCENE
          : DOM_SCENE;
  return {
    schemaVersion: 1,
    framework,
    name: framework === 'three' ? 'Three.js scene' : `${framework} scene`,
    entry: 'src/main.js',
    files: { 'src/main.js': `import './style.css';\n${source}`, 'src/style.css': '' },
    assets: [],
    width: 1280,
    height: 720,
    durationSec: 8,
    fps: 30,
    overrides: [],
  };
}
