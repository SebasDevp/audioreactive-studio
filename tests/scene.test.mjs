import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArcaneLivingTree } from '../src/arcane-living-tree.js';
import { AudioEngine } from '../src/audio-engine.js';
import { approach, spinRadiansPerSecond } from '../src/motion.js';

function fixture() {
  const uniforms = Object.fromEntries(['uIntensity','uZoom','uDensity'].map(k => [k,{value:1}]));
  Object.assign(uniforms,{uColorA:{value:new THREE.Color('#6c4cff')},uColorB:{value:new THREE.Color('#00d9ff')},uTreeTexture:{value:null},uTreePresence:{value:0}});
  const renderer = { extensions:{has:()=>true},capabilities:{maxSamples:4},getRenderTarget:()=>null,
    getClearColor:c=>c.set(0),getClearAlpha:()=>1,setRenderTarget(){},setClearColor(){},clear(){},render(){} };
  const tree = new ArcaneLivingTree(renderer,uniforms);
  const engine = {flow:0.58,displaySpeed:0.88,spinAngle:0,audioZoom:0.62,viewAngle:0,viewTilt:0,perspective:0};
  const drive=(bright)=>{for(const name of ['uSubAtt','uBassAtt','uMidAtt','uTrebleAtt','uTreblePulse','uFlux'])uniforms[name]={value:bright};};
  const step=(seconds,bright,fps=60)=>{drive(bright);for(let i=0;i<seconds*fps;i++)tree.update(1/fps,engine);};
  return {tree,uniforms,engine,step};
}

test('musical extension releases gently and never destroys the static anatomy',()=>{
  const f=fixture(),t=f.tree;
  const original=t.lineGeometry.attributes.position.array.slice();
  f.step(2,0);const quiet=t.u.uExtension.value;
  f.step(3,1);const bright=t.u.uExtension.value;
  assert.ok(bright>quiet+0.025);
  assert.ok(bright<=0.18001&&quiet>=-0.03001);
  assert.ok(t.particles.some(p=>p.active),'high frequencies release particles');
  f.step(8,0);
  assert.ok(t.u.uExtension.value<quiet+0.001);
  assert.equal(t.particles.filter(p=>p.active).length,0,'particles fade in silence');
  assert.deepEqual(t.lineGeometry.attributes.position.array,original);
  for(const attr of Object.values(t.lineGeometry.attributes))assert.ok(attr.array.every(Number.isFinite));
  t.dispose();
});

test('zero density suppresses births and released particles live outside the spinning tree',()=>{
  const f=fixture(),t=f.tree;f.uniforms.uDensity.value=0;f.step(3,1);
  assert.equal(t.particles.filter(p=>p.active).length,0);
  assert.equal(t.particlePoints.parent,t.scene);
  f.uniforms.uDensity.value=1;f.engine.spinAngle=Math.PI/2;f.step(1,1);
  const particle=t.particles.find(p=>p.active);assert.ok(particle);
  const snapshot=particle.pos.clone();f.engine.spinAngle=Math.PI;f.tree.update(0,f.engine);
  assert.ok(particle.pos.distanceTo(snapshot)<1e-9,'root rotation does not drag released particles');
  assert.equal(t.particleGeometry.attributes.position.array,t.particlePositions);
  assert.ok(t.particles.filter(p=>p.active).length<=288);t.dispose();
});

test('camera frames portrait and landscape at bounded perspective extremes',()=>{
  const f=fixture(),t=f.tree;
  for(const [w,h] of [[1920,1080],[1080,1920],[2560,720]])for(const sign of [-1,1]){
    t.resize(w,h,1,'ultra');f.engine.viewAngle=45*sign;f.engine.viewTilt=35*sign;f.engine.perspective=1;
    for(let i=0;i<240;i++){t.update(1/60,f.engine);t.render(f.engine);}
    assert.ok(t.camera.position.toArray().every(Number.isFinite));
    assert.ok(t.camera.fov<=60.01&&t.camera.near>0);
    assert.ok(t.target.width<=2400&&t.target.height<=2400);
    assert.equal(t.target.samples,4);
  }
  t.dispose();
});

test('envelopes and pulse release are consistent across 30/60/120 FPS',()=>{
  const outputs=[];
  for(const fps of [30,60,120]){
    let v=0;for(let i=0;i<fps;i++)v=approach(v,1,1/fps,7,2.3);
    for(let i=0;i<fps;i++)v=approach(v,0,1/fps,7,2.3);
    const audio=new AudioEngine();audio.pulses.treble=1;
    for(let i=0;i<fps;i++)audio.updateBandPulse('treble',0,{dt:1/fps,decay:0.8});
    outputs.push([v,audio.pulses.treble]);
  }
  for(const o of outputs)for(let i=0;i<2;i++)assert.ok(Math.abs(o[i]-outputs[0][i])<1e-10);
});

test('rotation cannot exceed one revolution per minute',()=>{
  assert.equal(spinRadiansPerSecond(-1),0);
  assert.equal(spinRadiansPerSecond(99),Math.PI*2/60);
  assert.equal(spinRadiansPerSecond(NaN),0);
});

test('growth control and intensity change actual branch coordinates, within restrained limits',()=>{
  const f=fixture(),t=f.tree;
  f.uniforms.uBranchGrowth={value:0};f.step(4,1);const low=t.u.uExtension.value;
  f.uniforms.uBranchGrowth.value=1;f.step(4,1);const high=t.u.uExtension.value;
  assert.ok(high-low>.07);
  const offsets=t.lineGeometry.attributes.aGrowthOffset.array;
  const maxOffset=Math.max(...Array.from({length:offsets.length/3},(_,i)=>Math.hypot(...offsets.slice(i*3,i*3+3))));
  assert.ok(maxOffset*(high-low)>.45,'visible geometric displacement, not only alpha changes');
  assert.ok(maxOffset*high<2,'the crown retains its anatomy');
  f.uniforms.uIntensity.value=.2;f.step(4,1);const dim=t.u.uExtension.value;
  f.uniforms.uIntensity.value=1.5;f.step(4,1);assert.ok(t.u.uExtension.value>dim+.04);
  t.dispose();
});

test('branched roots carry negative travel and successive low-frequency signals coexist',()=>{
  const f=fixture(),t=f.tree;
  assert.equal(t.metrics.rootPaths,56);
  const travels=t.lineGeometry.attributes.aTravel.array;
  assert.ok(Math.min(...travels)<-3&&Math.max(...travels)>12);
  assert.ok(t.u.uRootSpan.value>3);
  f.uniforms.uBeat={value:1};t.update(1/60,f.engine);const first=t.signals[0];
  f.uniforms.uBeat.value=0;for(let i=0;i<30;i++)t.update(1/60,f.engine);
  f.uniforms.uBeat.value=1;t.update(1/60,f.engine);
  assert.ok(first.x>.4,'a new beat does not reset an existing pulse');
  assert.ok(t.signals.filter(v=>v.y>0&&v.x<3).length>=2);
  assert.ok(first.x*first.z-t.rootTravelSpan>=-.25,'energy reaches the trunk from the roots');
  t.dispose();
});
