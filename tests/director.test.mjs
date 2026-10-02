import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicalDirector, AUTO_VISUAL_KEYS, AUTO_LOGO_KEYS } from '../src/musical-director.js';

const manual=()=>({autoVisual:false,autoLogo:false,preset:18,intensity:1.06,contrast:1.08,speed:.88,
  spinEnabled:false,spinSpeed:.2,viewAngle:0,viewTilt:0,perspective:0,zoom:1,density:1.28,treeGrowth:.55,
  bloom:.82,randomness:.48,flow:.58,audioZoom:.62,feedback:.18,memoryWarp:.2,echoZoom:.16,
  waveformMode:'off',waveformGain:.72,colorA:'#6c4cff',colorB:'#00d9ff',colorMix:.5,
  transitionMode:'ecosystem',transitionSpeed:0,transitionZoom:.55,transitionSync:true,
  logoDataUrl:'data:image/png;base64,AA==',logoEnabled:true,logoSize:.28,logoOpacity:.85,logoCopies:1,
  logoSpread:.18,logoPosX:0,logoPosY:0,logoRotation:.35,logoGlow:.22,logoMode:'single',logoColorMode:'original',
  logoBlendMode:'normal',logoFxBlink:false,logoFxPulse:false,logoFxSpin:false,logoFxColor:false,beat:0,level:0,bass:0});

function drive(d,m,count,start=0,period=500,onBeat=()=>{}) {
  let now=start;
  for(let i=0;i<count;i++){
    m.beat=1;m.level=.60;m.bass=.50;d.tick(now,m);onBeat(d.compose(m),now);
    m.beat=0;
    for(let j=1;j<=20;j++)d.tick(now+j*period/21,m);
    now+=period;
  }
  return now;
}

test('scene cues only occur on real beats, at phrase boundaries; silence never invents one',()=>{
  const m=manual(),d=new MusicalDirector(93);d.setEnabled(true,false,m);
  for(let now=0;now<20000;now+=20)d.tick(now,m);
  assert.equal(d.compose(m).visualCue,null);
  let last=0;const switches=[];
  const now=drive(d,m,180,21000,500,(out,t)=>{if(out.visualCue?.id!==last&&out.visualCue){last=out.visualCue.id;switches.push([out.visualCue,t]);assert.equal(out.visualCue.startBeat,out.autoBeatSerial);assert.ok([2,4].includes(out.visualCue.beats));}});
  assert.ok(switches.length>=5);assert.ok(new Set(switches.map(x=>x[0].preset)).size>=5);
  for(let i=1;i<switches.length;i++)assert.ok(switches[i][1]-switches[i-1][1]>=8000);
  const cue=d.compose(m).visualCue;
  m.level=0;m.bass=0;m.beat=1;
  for(let t=now;t<now+60000;t+=100)d.tick(t,m);
  assert.deepEqual(d.compose(m).visualCue,cue);
});

test('visual automation leaves every logo setting untouched and restores every manual visual value',()=>{
  const m=manual(),original=structuredClone(m),d=new MusicalDirector(1);d.setEnabled(true,false,m);drive(d,m,70);
  const active=d.compose(m);
  for(const key of AUTO_LOGO_KEYS)assert.equal(active[key],original[key]);
  assert.equal(active.logoDataUrl,original.logoDataUrl);assert.equal(active.logoEnabled,true);
  for(const key of AUTO_VISUAL_KEYS)assert.equal(m[key],original[key],'manual state is never overwritten');
  d.setEnabled(false,false,m);const restored=d.compose(m);
  for(const key of AUTO_VISUAL_KEYS)assert.equal(restored[key],original[key]);
  assert.equal(restored.visualCue,null);
});

test('logo automation is independent, bounded and restores its manual settings',()=>{
  const m=manual(),d=new MusicalDirector(4);const original=structuredClone(m);d.setEnabled(false,true,m);
  drive(d,m,70,0,500,out=>{
    for(const key of AUTO_VISUAL_KEYS)assert.equal(out[key],original[key]);
    assert.ok(out.logoCopies<=4&&out.logoCopies>=1);
    assert.ok(out.logoSize<=.4&&out.logoOpacity>=.66&&out.logoGlow<=.30);
  });
  assert.ok(d.logoEventSerial>5);assert.notEqual(d.logoAngle,0);
  d.setEnabled(false,false,m);const out=d.compose(m);
  for(const key of AUTO_LOGO_KEYS)assert.equal(out[key],original[key]);
  assert.equal(out.logoAutoAngle,0);
});

test('long sessions explore all 24 scenes without consecutive repeats or unsafe exposure',()=>{
  const m=manual(),d=new MusicalDirector(23),seen=new Set([m.preset]);d.setEnabled(true,true,m);
  let lastCue=0,lastScene=m.preset;
  drive(d,m,1400,0,500,out=>{
    assert.ok(out.intensity<=1.12&&out.bloom<=.52&&out.intensity*out.bloom<=.57);
    assert.ok(out.spinSpeed<=.32&&out.feedback<=.24&&out.density<=1.45);
    assert.ok(out.zoom<=1.16&&Math.abs(out.viewAngle)<=24&&Math.abs(out.viewTilt)<=16);
    if(out.visualCue&&out.visualCue.id!==lastCue){assert.notEqual(out.preset,lastScene);lastScene=out.preset;lastCue=out.visualCue.id;seen.add(out.preset);}
  });
  assert.equal(seen.size,24);
});

test('both layers detect the same tempo and remain independent when either is disabled',()=>{
  const m=manual(),d=new MusicalDirector(5);d.setEnabled(true,true,m);drive(d,m,40,0,400);
  assert.ok(Math.abs(d.status().bpm-150)<=1);
  const scene=d.compose(m).preset;d.setEnabled(true,false,m);drive(d,m,8,16000,400);
  assert.equal(d.compose(m).logoAutoAngle,0);assert.equal(d.compose(m).logoSize,m.logoSize);
  assert.ok(Number.isInteger(scene));d.setEnabled(false,true,m);drive(d,m,8,19200,400);
  assert.equal(d.compose(m).preset,m.preset);
});

test('enabling AUTO bounds an extreme manual setup before the first beat without overwriting it',()=>{
  const m={...manual(),intensity:2.6,bloom:1.65,contrast:2,speed:3,spinSpeed:1,density:3,
    feedback:1,memoryWarp:1.5,viewAngle:45,viewTilt:-35,zoom:2.5,logoFxSpin:true};
  const original=structuredClone(m),d=new MusicalDirector(72);d.setEnabled(true,true,m);
  const out=d.compose(m);
  assert.ok(out.intensity<=1.12&&out.bloom<=.5&&out.contrast<=1.1);
  assert.ok(out.feedback<=.24&&out.spinSpeed<=.32&&out.density<=1.45);
  assert.ok(out.viewAngle<=24&&out.viewTilt>=-16&&out.zoom<=1.16);
  assert.equal(out.logoFxSpin,false);assert.equal(out.logoAutoAngle,0);
  assert.deepEqual(m,original);d.setEnabled(false,false,m);assert.equal(d.compose(m).logoFxSpin,true);
});
