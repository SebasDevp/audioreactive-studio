import * as THREE from 'three';
import { approach, deformTreePoint } from './motion.js';

// Arcane Living Tree 3.1. This scene belongs exclusively to preset 18.
// Static, deterministic hierarchy + GPU-deformed energy filaments; no per-frame
// rebuilding of the canopy. An audio transient propagates from trunk to tips.
const PI2 = Math.PI * 2;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return v - Math.floor(v); };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const MAX_PARTICLES = 288;

const filamentVertex = /* glsl */`
  precision highp float;
  attribute float aBand;
  attribute float aTravel;
  attribute float aFiber;
  attribute float aBirth;
  attribute vec3 aGrowthOffset;
  uniform float uTime, uSub, uBass, uMid, uHigh, uFlow;
  uniform float uShockAge, uShockPower, uGrowth, uExtension, uRootSpan;
  uniform vec3 uSignals[8];
  varying float vBand, vTravel, vFiber, vBirth, vPulse;
  void main() {
    vec3 p = position + aGrowthOffset * uExtension;
    float height = smoothstep(0.35, 9.5, p.y);
    // Spatially coherent deformation: touching branches receive the same sway.
    float sway = (0.018 + uFlow * 0.033 + uMid * 0.22) * height;
    p.x += sway * (sin(uTime * 0.43 + p.y * 0.39 + p.z * 0.19)
           + 0.40 * sin(uTime * 0.26 - p.y * 0.71 + p.x * 0.33));
    p.z += sway * (cos(uTime * 0.34 + p.y * 0.33 + p.x * 0.24)
           + 0.31 * sin(uTime * 0.52 + p.y * 0.63));
    float breathe = 1.0 + uSub * 0.025 + uBass * 0.033 * (0.4 + 0.6 * sin(uTime * 1.65 - p.y * 0.36));
    p.xz *= breathe;
    // Music is transported along cumulative branch travel, not flashed globally.
    vPulse = 0.0;
    for(int i=0;i<8;i++){
      float age=uSignals[i].x;
      float front=age*uSignals[i].z-uRootSpan;
      float distanceToFront=aTravel-front;
      float envelope=1.0-smoothstep(1.5,3.7,age);
      vPulse=max(vPulse,exp(-distanceToFront*distanceToFront*0.85)*uSignals[i].y*envelope);
    }
    vBand = aBand;
    vTravel = aTravel;
    vFiber = aFiber;
    vBirth = aBirth;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const filamentFragment = /* glsl */`
  precision highp float;
  uniform vec3 uColorA, uColorB;
  uniform float uTime, uSub, uBass, uMid, uHigh, uTransient, uGrowth, uIntensity;
  varying float vBand, vTravel, vFiber, vBirth, vPulse;
  void main() {
    float appear = 1.0 - smoothstep(uGrowth - 0.09, uGrowth + 0.045, vBirth);
    if (appear < 0.005) discard;
    float spectral = clamp(vBand + uMid * 0.085 + uHigh * 0.05, 0.0, 1.0);
    vec3 a = mix(uColorA, vec3(0.84, 0.87, 0.98), 0.24);
    vec3 b = mix(uColorB, vec3(0.70, 0.92, 1.00), 0.22);
    vec3 hue = mix(a, b, spectral);
    vec3 inner = mix(hue, vec3(0.94, 0.95, 1.0), 0.21);
    float core = smoothstep(0.58, 0.99, vFiber);
    float slow = sin(uTime * 0.71 - vTravel * 0.48 + vBand * 5.0);
    float packet = pow(0.5 + 0.5 * sin(vTravel * 2.25 - uTime * 2.1 + vBand * 6.0), 10.0);
    float flow = 0.85 + 0.11 * slow + packet * (0.06 + uHigh * 0.18);
    float audio = 1.0 + uSub * 0.055 + uBass * 0.10 + uMid * 0.09 + uHigh * 0.07;
    float light = (0.39 + core * 0.37) * flow * audio + vPulse * 0.78;
    // A capped, sparse transient; geometry must remain readable without glow.
    light += uTransient * 0.055 * max(0.0, sin(vTravel * 1.8 - uTime * 2.2));
    light *= clamp(0.60 + uIntensity * 0.34, 0.48, 1.27);
    vec3 color = mix(hue, inner, core) * min(light, 1.32);
    float alpha = appear * mix(0.35, 0.82, core);
    gl_FragColor = vec4(color, alpha);
  }
`;

const particleVertex = /* glsl */`
  precision highp float;
  attribute float aLife;
  attribute float aSize;
  attribute float aBand;
  varying float vLife, vBand;
  void main() {
    vLife = aLife;
    vBand = aBand;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * 39.0 / max(1.0, -mv.z), 1.0, 8.0);
  }
`;
const particleFragment = /* glsl */`
  precision highp float;
  uniform vec3 uColorA, uColorB;
  varying float vLife, vBand;
  void main() {
    if(vLife <= 0.001) discard;
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float glowDot = 1.0 - smoothstep(0.02, 0.98, r);
    float pulse = smoothstep(0.0, 0.18, vLife) * (1.0 - smoothstep(0.66, 1.0, vLife));
    vec3 c = mix(uColorA, uColorB, vBand);
    gl_FragColor = vec4(mix(c, vec3(0.94,0.97,1.0),0.40) * 0.66, glowDot * pulse * 0.70);
  }
`;

function attribute(values, itemSize, dynamic = false) {
  // BufferAttribute must wrap (not copy) the dynamic Float32Array. Otherwise
  // updated CPU particle positions never reach the GPU (Float32BufferAttribute
  // allocates a new Float32Array from its input in Three.js r186).
  const a = ArrayBuffer.isView(values)
    ? new THREE.BufferAttribute(values, itemSize)
    : new THREE.Float32BufferAttribute(values, itemSize);
  if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
  return a;
}

export class ArcaneLivingTree {
  constructor(renderer, originalUniforms) {
    this.renderer = renderer;
    this.hostUniforms = originalUniforms;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010104);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.08, 320);
    this.camera.position.set(0, 7.5, 34);
    this.camera.lookAt(0, 7.0, 0);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.clock = 0;
    this.energy = 0;
    this.signals = Array.from({length:8},()=>new THREE.Vector3(10,0,10));
    this.nextSignal = 0;
    this.rootTravelSpan = 0;
    this.shockAge = 10;
    this.shockPower = 0;
    this.previousBeat = 0;
    this.previousKick = 0;
    this.shockCooldown = 0;
    this.zoomSmoothed = 1;
    this.viewAngleSmoothed = 0;
    this.viewTiltSmoothed = 0;
    this.perspectiveSmoothed = 0;
    this.dt = 1 / 60;
    this.particleAccumulator = 0;
    this.nextParticle = 0;
    this.anchors = [];
    this.bounds = { radius: 8, height: 15 };
    this.u = {
      uTime: { value: 0 }, uSub: { value: 0 }, uBass: { value: 0 },
      uMid: { value: 0 }, uHigh: { value: 0 }, uTransient: { value: 0 },
      uFlow: { value: 0.58 }, uGrowth: { value: 0.90 }, uExtension: { value: 0 },
      uShockAge: { value: 10 }, uShockPower: { value: 0 },
      uSignals: { value: this.signals }, uRootSpan: { value: 0 },
      uIntensity: originalUniforms.uIntensity,
      uColorA: originalUniforms.uColorA, uColorB: originalUniforms.uColorB
    };
    this.buildFilaments();
    this.buildParticles();
    this.target = new THREE.WebGLRenderTarget(16, 16, {
      depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType
    });
    originalUniforms.uTreeTexture.value = this.target.texture;
    originalUniforms.uTreePresence.value = 1;
  }

  buildFilaments() {
    const positions = [], bands = [], travels = [], fibers = [], births = [], offsets = [];
    const pushVertex = (p, band, travel, fiber, birth, offset) => {
      positions.push(p.x, p.y, p.z);
      bands.push(band); travels.push(travel); fibers.push(fiber); births.push(birth);
      offsets.push(offset.x, offset.y, offset.z);
    };
    const pushLine = (a, b, band, ta, tb, fiber, birth, oa, ob) => {
      pushVertex(a, band, ta, fiber, birth, oa);
      pushVertex(b, band, tb, fiber, birth, ob);
    };
    const trace = (points, depth, startTravel, band, radius, seed, growthOffsets = points.map(() => V()), travelSign = 1) => {
      if (!points || points.length < 2) return startTravel;
      const length = [0];
      for (let i = 1; i < points.length; i++) length.push(length[i - 1] + points[i].distanceTo(points[i - 1]));
      const endTravel = startTravel + travelSign * length[length.length - 1];
      const strandCount = depth < 0 ? 13 : depth === 0 ? 9 : depth === 1 ? 7 : depth === 2 ? 5 : 3;
      const radiusAt = (t) => Math.max(0.003, radius * Math.pow(0.30, t * (depth < 0 ? 0.48 : 1.0)));
      for (let f = 0; f <= strandCount; f++) {
        const core = f === 0;
        let previous = null;
        for (let j = 0; j < points.length; j++) {
          const t = j / (points.length - 1);
          const tangent = points[Math.min(j + 1, points.length - 1)].clone()
            .sub(points[Math.max(0, j - 1)]).normalize();
          let normal = V(0, 0, 1).cross(tangent).normalize();
          if (normal.lengthSq() < 0.01) normal = V(1, 0, 0);
          const binormal = tangent.clone().cross(normal).normalize();
          const theta = f * 2.39996 + seed * 0.71 + t * (4.0 + seed % 3);
          const r = core ? 0 : radiusAt(t) * (0.37 + 0.56 * hash(seed + f * 17.1));
          const p = points[j].clone().addScaledVector(normal, Math.cos(theta) * r)
            .addScaledVector(binormal, Math.sin(theta) * r);
          if (previous) {
            // Permanent luminous anatomy; musical expansion reveals the finest extremities.
            const birth = depth < 0 ? 0 : depth === 0 ? 0.03 : depth === 1 ? 0.22 :
              depth === 2 ? 0.42 : depth === 3 ? 0.64 : 0.79 + t * 0.12;
            pushLine(previous, p, clamp(band + (f / Math.max(1, strandCount) - 0.5) * 0.11),
              startTravel + travelSign * length[j - 1], startTravel + travelSign * length[j], core ? 1 : 0.34 + 0.30 * hash(f + seed), birth,
              growthOffsets[j - 1], growthOffsets[j]);
          }
          previous = p;
        }
      }
      this.bounds.height = Math.max(this.bounds.height, ...points.map(p => p.y));
      this.bounds.radius = Math.max(this.bounds.radius, ...points.map(p => Math.hypot(p.x, p.z)));
      return endTravel;
    };

    // A twisted, visibly branching trunk, stable across frames.
    const trunk = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      trunk.push(V(
        0.13 * t * Math.sin(t * 7.1) + 0.06 * Math.sin(t * 17),
        t * 9.4,
        0.11 * t * Math.cos(t * 5.7) + 0.05 * Math.sin(t * 13)
      ));
    }
    trace(trunk, -1, 0, 0.16, 0.37, 137);
    // Curved, asymmetric roots with inherited junctions and tapered bifurcations.
    // Their travel is negative: a low-frequency packet flows inward to the trunk
    // and then upward through the canopy without reversing the root direction.
    let rootPaths=0;
    const growRoot=(origin,direction,len,depth,travel,seed)=>{
      rootPaths++;
      const d=direction.clone().normalize();
      const side=V(-d.z,0,d.x).multiplyScalar((hash(seed+4)-.5)*len*.46);
      const end=origin.clone().addScaledVector(d,len);
      const curve=new THREE.CubicBezierCurve3(origin,
        origin.clone().addScaledVector(d,len*.30).add(side).add(V(0,.08,0)),
        end.clone().addScaledVector(d,-len*.25).addScaledVector(side,-.50),end);
      const points=curve.getPoints(depth===1?12:9);
      const endTravel=trace(points,depth,travel,.06+depth*.035,
        .105*Math.pow(.58,depth-1),seed,points.map(()=>V()),-1);
      this.rootTravelSpan=Math.max(this.rootTravelSpan,-endTravel);
      if(depth>=3)return;
      for(let child=0;child<2;child++){
        const t=child===0?.51:.83;
        const childOrigin=curve.getPoint(t);
        const childDir=curve.getTangent(t).applyAxisAngle(V(0,1,0),(child===0?-1:1)*(.32+hash(seed+child*7)*.34));
        childDir.y=-.06-hash(seed+child+6)*.07;childDir.normalize();
        growRoot(childOrigin,childDir,len*(.47+hash(seed+child+8)*.12),depth+1,
          travel+(endTravel-travel)*t,seed*1.31+child*17.7+9);
      }
    };
    for(let i=0;i<8;i++){
      const az=i*2.39996323+hash(i+7)*.24;
      growRoot(trunk[0].clone().add(V(0,.11,0)),V(Math.cos(az),-.10-hash(i+6)*.045,Math.sin(az)),
        2.35+hash(i*7.3+9)*1.05,1,0,71+i*13.9);
    }
    this.u.uRootSpan.value=this.rootTravelSpan;
    let branchCount = 0;
    const grow = (origin, dir, len, depth, travel, seed, band, parentOffset = V()) => {
      if (depth > 4 || branchCount >= 960) return;
      branchCount++;
      const d = dir.clone().normalize();
      const end = origin.clone().addScaledVector(d, len);
      const bend = V((hash(seed + 2) - 0.5) * 0.38, len * (0.06 + hash(seed + 3) * 0.08),
                     (hash(seed + 5) - 0.5) * 0.38);
      const p1 = origin.clone().addScaledVector(d, len * 0.34).addScaledVector(bend, 0.38);
      const p2 = end.clone().addScaledVector(d, -len * 0.29).add(bend);
      const curve = new THREE.CubicBezierCurve3(origin, p1, p2, end);
      const points = curve.getPoints(depth <= 1 ? 9 : 7);
      // Integrate extension through the hierarchy. Each child inherits the exact
      // displacement of its attachment point, so musical stretching opens no gaps.
      const weight = [0.32, 0.52, 0.76, 0.96, 1.10][depth];
      const growthOffsets = points.map(p => p.clone().sub(origin).multiplyScalar(weight).add(parentOffset));
      const travelEnd = trace(points, depth, travel, band,
        (depth === 0 ? 0.14 : 0.115) * Math.pow(0.68, depth), seed, growthOffsets);
      if (depth >= 2 && (depth >= 3 || hash(seed * 0.3) > 0.38)) {
        const anchorIndex = depth >= 3 ? points.length - 1 : Math.floor(points.length * 0.72);
        this.anchors.push({ pos: points[anchorIndex].clone(), offset: growthOffsets[anchorIndex].clone(),
          direction: curve.getTangent(anchorIndex / (points.length - 1)).normalize(),
          birth: depth === 4 ? 0.91 : depth === 3 ? 0.64 : 0.42, band, seed });
      }
      if (depth === 4) return;
      for (let child = 0; child < 2; child++) {
        const sign = child === 0 ? -1 : 1;
        const childSeed = seed * 1.37 + (child + 1) * 19.7 + depth * 3.31;
        const t = child === 0 ? 0.69 : 0.94;
        const childOrigin = curve.getPoint(t);
        const tangent = curve.getTangent(t).normalize();
        const turnAxis = V(0, 1, 0).cross(tangent).normalize();
        if (turnAxis.lengthSq() < 0.1) turnAxis.set(1, 0, 0);
        const childDir = tangent.clone()
          .applyAxisAngle(V(0, 1, 0), sign * (0.29 + hash(childSeed + 5) * 0.49))
          .applyAxisAngle(turnAxis, sign * (0.17 + hash(childSeed + 1) * 0.27))
          .add(V(0, 0.14 + hash(childSeed + 7) * 0.12, 0)).normalize();
        grow(childOrigin, childDir, len * (0.64 + hash(childSeed) * 0.12), depth + 1,
          travel + (travelEnd - travel) * t, childSeed, clamp(band + (child ? 0.17 : -0.065)),
          childOrigin.clone().sub(origin).multiplyScalar(weight).add(parentOffset));
      }
    };
    // Golden-angle distribution: asymmetrical, dimensional canopy rather than a flat fan.
    let arm = 0;
    for (const slot of [0.26, 0.35, 0.44, 0.54, 0.64, 0.73, 0.82, 0.90]) {
      const mainArms = slot < 0.43 ? 2 : 3;
      for (let j = 0; j < mainArms; j++) {
        arm++;
        const az = arm * 2.3999632297 + hash(arm * 4.7) * 0.22;
        const origin = trunk[Math.round(slot * 32)].clone();
        const elevation = 0.25 + (slot > 0.78 ? 0.17 : 0) + hash(arm + 12) * 0.16;
        const d = V(Math.cos(az), elevation, Math.sin(az)).normalize();
        const len = (slot < 0.42 ? 3.55 : slot > 0.78 ? 3.25 : 4.20) * (0.89 + hash(arm * 9) * 0.19);
        grow(origin, d, len, 0, slot * 9.4, 50 + arm * 7.31, clamp(0.14 + slot * 0.47 + j * 0.09));
      }
    }
    // Crown continues upward to preserve the silhouette and its central axis.
    for (let j = 0; j < 4; j++) {
      const az = j * PI2 / 4 + 0.33;
      grow(trunk[31], V(Math.cos(az) * 0.29, 0.96, Math.sin(az) * 0.29),
        2.6 + hash(j + 7) * 0.6, 0, 9.1, 417 + j * 23.1, 0.57 + j * 0.09);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', attribute(positions, 3));
    geo.setAttribute('aBand', attribute(bands, 1));
    geo.setAttribute('aTravel', attribute(travels, 1));
    geo.setAttribute('aFiber', attribute(fibers, 1));
    geo.setAttribute('aBirth', attribute(births, 1));
    geo.setAttribute('aGrowthOffset', attribute(offsets, 3));
    geo.computeBoundingSphere();
    this.lineGeometry = geo;
    this.filaments = new THREE.LineSegments(geo, new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: filamentVertex, fragmentShader: filamentFragment,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      depthTest: true, toneMapped: false
    }));
    this.filaments.frustumCulled = false; // GPU motion can exceed static bounds.
    this.root.add(this.filaments);
    this.metrics = { branchPaths: branchCount, rootPaths, rootTravelSpan: this.rootTravelSpan, filamentSegments: positions.length / 6,
      anchors: this.anchors.length, spinePieces: 0 };
  }

  buildParticles() {
    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false, pos: V(), vel: V(), life: 0, duration: 1, band: 0.5, size: 2
    }));
    this.particlePositions = new Float32Array(MAX_PARTICLES * 3);
    this.particleLives = new Float32Array(MAX_PARTICLES);
    this.particleSizes = new Float32Array(MAX_PARTICLES);
    this.particleBands = new Float32Array(MAX_PARTICLES);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', attribute(this.particlePositions, 3, true));
    geo.setAttribute('aLife', attribute(this.particleLives, 1, true));
    geo.setAttribute('aSize', attribute(this.particleSizes, 1, true));
    geo.setAttribute('aBand', attribute(this.particleBands, 1, true));
    this.particleGeometry = geo;
    this.particlePoints = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: particleVertex, fragmentShader: particleFragment,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      depthTest: true, toneMapped: false
    }));
    this.particlePoints.frustumCulled = false;
    this.scene.add(this.particlePoints);
  }

  spawnParticle(index) {
    if (!this.anchors.length) return;
    let a;
    for (let attempt = 0; attempt < 8; attempt++) {
      a = this.anchors[Math.floor(hash(index * 19.13 + this.clock * 0.73 + attempt * 7.31) * this.anchors.length)];
      if (a.birth < this.u.uGrowth.value - 0.035) break;
      a = null;
    }
    if (!a) return;
    const p = this.particles[this.nextParticle++ % MAX_PARTICLES];
    p.active = true;
    deformTreePoint(a.pos, a.offset, this.u, p.pos).applyMatrix4(this.root.matrixWorld);
    const angle = hash(index * 6.1 + a.seed) * PI2;
    const velocity = 0.18 + hash(index * 3.31) * 0.31;
    p.vel.copy(a.direction).multiplyScalar(velocity * 0.55)
      .add(V(Math.cos(angle) * velocity * 0.48, 0.17 + hash(index + 9) * 0.30, Math.sin(angle) * velocity * 0.48))
      .applyQuaternion(this.root.quaternion);
    p.duration = 1.30 + hash(index * 1.17) * 1.8;
    p.life = 0;
    p.band = a.band;
    p.size = 1.4 + hash(index * 4.13) * 2.0;
  }

  resize(width, height, pixelRatio, quality = 'high') {
    const factor = quality === 'performance' ? 0.66 : quality === 'cinematic' ? 0.78 : quality === 'ultra' ? 1.0 : 0.88;
    const w = Math.min(2400, Math.max(32, Math.round(width * pixelRatio * factor)));
    const h = Math.min(2400, Math.max(32, Math.round(height * pixelRatio * factor)));
    const samples = Math.min(this.renderer.capabilities.maxSamples || 0,
      quality === 'ultra' ? 4 : quality === 'high' ? 2 : 0);
    if (this.target.samples !== samples) {
      this.target.samples = samples;
      this.target.dispose();
    }
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    this.camera.aspect = Math.max(0.2, width / Math.max(1, height));
    this.camera.updateProjectionMatrix();
  }

  update(dt, engine) {
    this.dt = dt;
    const host = this.hostUniforms;
    const read = (name) => Math.max(0, host[name]?.value || 0);
    const response = (key, target, attack = 10, release = 3.2) => {
      const old = this.u[key].value;
      this.u[key].value += (target - old) * (1 - Math.exp(-dt * (target > old ? attack : release)));
    };
    // Attenuated envelopes provide musical phrasing; pulses add fast articulation.
    const sub = clamp(read('uSubAtt') * 0.9 + read('uSubPulse') * 0.40, 0, 1.7);
    const bass = clamp(read('uBassAtt') * 0.80 + read('uBassPulse') * 0.65, 0, 1.7);
    const mid = clamp(read('uMidAtt') * 0.88 + read('uMidPulse') * 0.35, 0, 1.7);
    const high = clamp(read('uTrebleAtt') * 0.82 + read('uTreblePulse') * 0.56, 0, 1.7);
    const transient = clamp(read('uFlux') * 0.82 + read('uTreblePulse') * 0.47, 0, 1.7);
    response('uSub', sub, 11, 2.4);
    response('uBass', bass, 14, 3.6);
    response('uMid', mid, 7, 2.4);
    response('uHigh', high, 15, 5.0);
    response('uTransient', transient, 18, 6.6);
    this.energy += (clamp(sub * 0.19 + bass * 0.27 + mid * 0.28 + high * 0.15 + transient * 0.16) - this.energy)
      * (1 - Math.exp(-dt * 2.8));
    const phrase = clamp(high * 0.55 + transient * 0.20 + this.energy * 0.25);
    const growthControl=host.uBranchGrowth?clamp(read('uBranchGrowth')):.55;
    const intensity=clamp(read('uIntensity')/1.06,0,1.5);
    const reveal=clamp(.80+growthControl*.09+phrase*.13*intensity,.79,1.02);
    const extension=clamp(-.030+growthControl*.11+phrase*(.035+growthControl*.070)*intensity,-.030,.18);
    this.u.uGrowth.value=approach(this.u.uGrowth.value,reveal,dt,4.0,1.8);
    this.u.uExtension.value=approach(this.u.uExtension.value,extension,dt,4.5,1.9);
    this.u.uFlow.value = clamp(engine.flow, 0, 1.5);
    this.clock += dt * clamp(engine.displaySpeed / 0.88, 0.04, 3.2);
    this.u.uTime.value = this.clock;
    this.root.rotation.y = engine.spinAngle + Math.sin(this.clock * 0.042) * 0.07 + this.u.uMid.value * 0.009;
    this.root.rotation.z = Math.sin(this.clock * 0.07) * 0.009 * (1 + this.u.uBass.value);
    this.root.updateMatrixWorld(true);
    const beat = read('uBeat'), kick = read('uBassPulse');
    for(const signal of this.signals)signal.x=Math.min(10,signal.x+dt);
    this.shockCooldown = Math.max(0, this.shockCooldown - dt);
    if (this.shockCooldown <= 0 && ((beat > 0.72 && this.previousBeat < 0.65) ||
        (kick > 0.82 && this.previousKick < 0.66))) {
      this.shockAge = 0;
      this.shockPower = clamp(0.40 + beat * 0.44 + kick * 0.32, 0, 1.2);
      this.signals[this.nextSignal++%this.signals.length].set(0,this.shockPower,10.0+bass*2.0);
      this.shockCooldown = 0.28;
    }
    this.previousBeat = beat;
    this.previousKick = kick;
    this.shockAge = Math.min(10, this.shockAge + dt);
    this.u.uShockAge.value = this.shockAge;
    this.u.uShockPower.value = this.shockPower;
    const density = clamp(read('uDensity'), 0, 3);
    const rate = density * (high * 11.0 + transient * 17.0 + this.energy * 1.4);
    this.particleAccumulator = Math.min(this.particleAccumulator + dt * rate, 5);
    const births = Math.min(5, Math.floor(this.particleAccumulator));
    this.particleAccumulator -= births;
    for (let n = 0; n < births; n++) this.spawnParticle(this.nextParticle + n + Math.floor(this.clock * 17));
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.active) {
        p.life += dt / p.duration;
        if (p.life >= 1) p.active = false;
        else {
          p.pos.addScaledVector(p.vel, dt * (1 + high * 0.23));
          p.pos.x += Math.sin(this.clock * 0.7 + i) * dt * 0.016;
        }
      }
      this.particlePositions[i * 3] = p.pos.x;
      this.particlePositions[i * 3 + 1] = p.pos.y;
      this.particlePositions[i * 3 + 2] = p.pos.z;
      this.particleLives[i] = p.active ? p.life : 0;
      this.particleSizes[i] = p.size;
      this.particleBands[i] = p.band;
    }
    for (const attr of Object.values(this.particleGeometry.attributes)) attr.needsUpdate = true;
  }

  render(engine) {
    const zoomTarget = clamp(this.hostUniforms.uZoom.value, 0.35, 2.5);
    // True perspective-camera dolly, not shader UV scaling.
    this.zoomSmoothed = approach(this.zoomSmoothed, zoomTarget, this.dt, 7);
    this.viewAngleSmoothed = approach(this.viewAngleSmoothed, engine.viewAngle, this.dt, 5);
    this.viewTiltSmoothed = approach(this.viewTiltSmoothed, engine.viewTilt, this.dt, 5);
    this.perspectiveSmoothed = approach(this.perspectiveSmoothed, engine.perspective, this.dt, 5);
    const fov = 46 + this.perspectiveSmoothed * 14;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const aspect = this.camera.aspect;
    const frameDistance = Math.max(29.2, this.bounds.height * 1.76,
      (this.bounds.radius + 0.8) / Math.max(0.12, Math.tan(THREE.MathUtils.degToRad(23)) * aspect) + this.bounds.radius * 0.82);
    const audioDolly = 1 + clamp(engine.audioZoom, 0, 1.5) *
      (this.u.uBass.value * 0.030 + this.u.uSub.value * 0.020);
    const fovFit = Math.tan(THREE.MathUtils.degToRad(23)) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const distance = clamp(frameDistance * fovFit / (this.zoomSmoothed * audioDolly), 8, 135);
    const focusY = clamp(this.bounds.height * 0.47, 6.4, 8.7);
    const orbit = this.clock * (0.009 + engine.flow * 0.008);
    const yaw = THREE.MathUtils.degToRad(this.viewAngleSmoothed) + Math.sin(orbit) * 0.032;
    const tilt = THREE.MathUtils.degToRad(this.viewTiltSmoothed);
    this.camera.position.set(Math.sin(yaw) * Math.cos(tilt) * distance,
      focusY + Math.sin(tilt) * distance + 0.48, Math.cos(yaw) * Math.cos(tilt) * distance);
    this.camera.lookAt(0, focusY, 0);
    const previousTarget = this.renderer.getRenderTarget();
    const previousColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const previousAlpha = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0x010104, 1);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.setClearColor(previousColor, previousAlpha);
  }

  dispose() {
    this.lineGeometry.dispose();
    this.filaments.material.dispose();
    this.particleGeometry.dispose();
    this.particlePoints.material.dispose();
    this.spine?.geometry.dispose();
    this.spine?.material.dispose();
    this.target.dispose();
  }
}
