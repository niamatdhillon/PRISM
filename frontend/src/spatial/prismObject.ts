// The PRISM hologram: an iridescent glass prism with an incoming white beam that fans into spectral rays. Shared by the landing hero and the Explore stage.
import * as THREE from "three";

const SPECTRUM = [0xff4d6d, 0xffb347, 0xffe66d, 0x4be3a5, 0x22e5ff, 0x4a7dff, 0x9b6bff];

export interface PrismObject { group: THREE.Group; update: (t: number) => void; dispose: () => void }

export function buildPrism(scale = 1): PrismObject {
  const group = new THREE.Group();
  const tri = new THREE.Shape(); const r = 0.62;
  for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + (i * 2 * Math.PI) / 3; const x = Math.cos(a) * r, y = Math.sin(a) * r; i === 0 ? tri.moveTo(x, y) : tri.lineTo(x, y); }
  tri.closePath();
  const geo = new THREE.ExtrudeGeometry(tri, { depth: 0.8, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }); geo.translate(0, 0, -0.4);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x7aa2ff, metalness: 0.15, roughness: 0.04, transparent: true, opacity: 0.72, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [200, 600], side: THREE.DoubleSide });
  const prism = new THREE.Mesh(geo, mat); group.add(prism);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: 0xe8f4ff })); group.add(edges);
  const l1 = new THREE.PointLight(0x22e5ff, 14, 8); l1.position.set(-1.5, 1.2, 1.5); const l2 = new THREE.PointLight(0x9b6bff, 14, 8); l2.position.set(1.5, -0.6, 1.5); const amb = new THREE.AmbientLight(0x8aa8ff, 0.9);
  group.add(l1, l2, amb);
  // beams
  const beams = new THREE.Group(); const mk = (color: number, from: THREE.Vector3, to: THREE.Vector3, w: number, o: number) => {
    const d = to.clone().sub(from), len = d.length(); const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(from.clone().add(to).multiplyScalar(0.5)); m.rotation.z = Math.atan2(d.y, d.x); return m;
  };
  beams.add(mk(0xffffff, new THREE.Vector3(-2.6, -0.05, 0.42), new THREE.Vector3(-0.28, -0.05, 0.42), 0.05, 0.95));
  SPECTRUM.forEach((c, i) => beams.add(mk(c, new THREE.Vector3(0.3, -0.05, 0.42), new THREE.Vector3(2.6, -0.95 + i * 0.3, 0.42), 0.07, 0.8)));
  group.add(beams); group.scale.setScalar(scale);
  return {
    group,
    update: (t) => { prism.rotation.y = Math.sin(t * 0.0004) * 0.5; edges.rotation.y = prism.rotation.y; beams.rotation.y = prism.rotation.y * 0.6; },
    dispose: () => { geo.dispose(); mat.dispose(); edges.geometry.dispose(); (edges.material as THREE.Material).dispose(); beams.children.forEach((m) => { (m as THREE.Mesh).geometry.dispose(); ((m as THREE.Mesh).material as THREE.Material).dispose(); }); },
  };
}
