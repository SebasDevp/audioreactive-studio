import { approach, clamp, finite } from './motion.js';

export const AUTO_VISUAL_KEYS = Object.freeze([
  'preset','intensity','contrast','speed','spinEnabled','spinSpeed','viewAngle','viewTilt','perspective',
  'zoom','density','treeGrowth','bloom','randomness','flow','audioZoom','feedback','memoryWarp','echoZoom',
  'waveformMode','waveformGain','colorA','colorB','colorMix','transitionMode','transitionSpeed','transitionZoom','transitionSync'
]);
export const AUTO_LOGO_KEYS = Object.freeze([
  'logoSize','logoOpacity','logoCopies','logoSpread','logoPosX','logoPosY','logoRotation','logoGlow',
  'logoMode','logoColorMode','logoBlendMode','logoFxBlink','logoFxPulse','logoFxSpin','logoFxColor'
]);
const PALETTES = [
  ['#7258df','#43c9dc'],['#246bb7','#4ad7b4'],['#ae4fb8','#5e9adf'],['#ca8c54','#80bec5'],
  ['#586acc','#c878af'],['#3b9b8c','#92c85c'],['#aa659e','#d9a666'],['#487aa9','#c4a8df']
];
const copyKeys = (source, keys) => Object.fromEntries(keys.filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));
const median = a => [...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const colorStep = (a,b,k) => {
  if(!/^#[0-9a-f]{6}$/i.test(a||'')) return b;
  return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)+(parseInt(b.slice(i,i+2),16)-parseInt(a.slice(i,i+2),16))*k).toString(16).padStart(2,'0')).join('');
};

// One conductor in CONTROL; every renderer receives the same decisions and beat
// serials. Manual state is never mutated, so disabling either layer restores it.
export class MusicalDirector {
  constructor(seed = Math.floor(Math.random()*0xffffffff)) {
    this.seed=seed>>>0;this.visual=false;this.logo=false;this.beatSerial=0;
    this.lastBeatAt=-Infinity;this.previousBeat=0;this.lastTick=null;this.intervals=[];
    this.period=0.5;this.visualBeat=0;this.logoBeat=0;this.cueSerial=0;
    this.visualCurrent={};this.visualTarget={};this.logoCurrent={};this.logoTarget={};
    this.sceneBag=[];this.recent=[];this.cue=null;this.logoAngle=0;this.logoAngleTarget=0;
    this.logoMorph=0;this.logoMorphTarget=0;this.logoEventSerial=0;
  }
  random() {
    this.seed=(this.seed+0x6D2B79F5)>>>0;let t=this.seed;
    t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  }
  range(a,b) { return a+(b-a)*this.random(); }
  choose(a) { return a[Math.floor(this.random()*a.length)]; }
  scene(current) {
    if(!this.sceneBag.length) {
      this.sceneBag=Array.from({length:24},(_,i)=>i);
      for(let i=23;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.sceneBag[i],this.sceneBag[j]]=[this.sceneBag[j],this.sceneBag[i]];}
    }
    let i=this.sceneBag.findIndex(n=>n!==current&&!this.recent.slice(-3).includes(n));
    if(i<0)i=this.sceneBag.findIndex(n=>n!==current);
    if(i<0){this.sceneBag=[];return this.scene(current);}
    return this.sceneBag.splice(i,1)[0];
  }
  setEnabled(visual,logo,manual) {
    if(visual&&!this.visual) {
      this.visualCurrent=copyKeys(manual,AUTO_VISUAL_KEYS);
      this.visualCurrent.intensity=clamp(finite(manual.intensity,1),0.64,1.12);
      this.visualCurrent.bloom=clamp(finite(manual.bloom,.5),0,.5);
      const safe={contrast:[.96,1.10],speed:[.48,1.37],spinSpeed:[.06,.32],viewAngle:[-24,24],
        viewTilt:[-16,16],perspective:[0,.72],zoom:[.84,1.16],density:[.55,1.45],treeGrowth:[.35,.76],
        randomness:[.20,.62],flow:[.30,.86],audioZoom:[.18,.52],feedback:[.06,.24],
        memoryWarp:[.08,.38],echoZoom:[.04,.24],waveformGain:[.22,.46],transitionZoom:[.12,.38]};
      for(const [key,[min,max]] of Object.entries(safe))this.visualCurrent[key]=clamp(finite(manual[key],min),min,max);
      this.visualTarget={...this.visualCurrent};this.visualBeat=0;this.sceneAt=this.choose([16,24,32]);
      this.nextScene=this.scene(finite(manual.preset,18));this.cue=null;
    }
    if(logo&&!this.logo) {
      this.logoCurrent=copyKeys(manual,AUTO_LOGO_KEYS);this.logoTarget={...this.logoCurrent};
      // Movement begins with the first detected beat, including a manually spinning logo.
      this.logoCurrent.logoFxSpin=false;this.logoCurrent.logoFxBlink=false;
      this.logoTarget.logoFxSpin=false;this.logoTarget.logoFxBlink=false;
      this.logoBeat=0;this.logoAngle=0;this.logoAngleTarget=0;this.logoMorph=0;this.logoMorphTarget=0;
    }
    this.visual=Boolean(visual);this.logo=Boolean(logo);
    if(!this.visual)this.cue=null;
  }
  visualProfile(manual, energy) {
    const tree=this.visualCurrent.preset===18;
    const matrix=this.visualCurrent.preset===14;
    const density=this.range(.55,tree?1.25:1.45);
    const intensity=this.range(.72,1.04)*(1-energy*.07);
    const bloom=Math.min(this.range(.20,tree?.44:.52),.50/intensity);
    const waves=this.choose(['off','off','off','line','double','radial','flower','lasso','spiro']);
    // Independent bounded knobs: avoid high bloom + high exposure + long memory.
    this.visualTarget={...this.visualTarget,
      intensity,contrast:this.range(.96,1.10),bloom,density,
      speed:this.range(.48,1.25)+energy*.12,zoom:this.range(.84,tree?1.08:1.16),
      spinEnabled:this.random()>.30,spinSpeed:this.range(.06,.32),
      viewAngle:this.range(-24,24),viewTilt:this.range(-16,16),perspective:this.range(.12,.72),
      treeGrowth:this.range(.35,.76),randomness:this.range(.20,.62),flow:this.range(.30,.86),
      audioZoom:this.range(.18,.52),feedback:this.range(.06,.24)*(1-bloom*.35),
      memoryWarp:this.range(.08,.38),echoZoom:this.range(.04,.24),
      waveformMode:tree||matrix?'off':waves,waveformGain:this.range(.22,.46),
      colorMix:this.range(.28,.70),transitionZoom:this.range(.12,.38),transitionSync:true
    };
    if(this.visualBeat===1||this.visualBeat%8===0) {
      const pair=this.choose(PALETTES);this.visualTarget.colorA=pair[0];this.visualTarget.colorB=pair[1];
    }
    // All categorical changes happen on a detected beat; continuous values ease.
    for(const key of ['spinEnabled','waveformMode','transitionSync'])this.visualCurrent[key]=this.visualTarget[key];
  }
  logoProfile() {
    if(this.logoBeat===1||this.logoBeat%8===0) {
      const copies=this.choose([1,1,2,3,4]);
      const mode=copies===1?'single':this.choose(['ring','line','mirror','stack']);
      Object.assign(this.logoTarget,{
        logoCopies:copies,logoMode:mode,logoColorMode:this.choose(['original','original','white','reactive']),
        logoBlendMode:this.choose(['normal','screen']),logoFxBlink:false,logoFxPulse:true,
        logoFxSpin:false,logoFxColor:this.random()>.72,
        logoSize:this.range(.18,copies>1?.30:.40),logoOpacity:this.range(.66,.90),
        logoSpread:this.range(.10,.34),logoGlow:this.range(.08,.30),logoRotation:this.range(.10,.32)
      });
      for(const key of ['logoCopies','logoMode','logoColorMode','logoBlendMode','logoFxBlink','logoFxPulse','logoFxSpin','logoFxColor'])this.logoCurrent[key]=this.logoTarget[key];
    }
    if(this.logoBeat===1||this.logoBeat%4===0) {
      this.logoTarget.logoPosX=this.range(-.16,.16);this.logoTarget.logoPosY=this.range(-.13,.13);
      this.logoAngleTarget+=this.choose([-30,-15,15,30]);
      this.logoMorphTarget=this.range(-14,14);this.logoEventSerial++;
    }
  }
  tick(now, manual) {
    const dt=this.lastTick===null?0:clamp((now-this.lastTick)/1000,0,.12);this.lastTick=now;
    if(!this.visual&&!this.logo)return false;
    const beat=finite(manual.beat);const level=Math.max(finite(manual.level),finite(manual.bass)*.55);
    const hit=level>.045&&beat>.78&&this.previousBeat<.78&&now-this.lastBeatAt>190;
    this.previousBeat=beat;
    if(hit) {
      const interval=(now-this.lastBeatAt)/1000;
      if(interval>=.25&&interval<=1.5){this.intervals.push(interval);if(this.intervals.length>12)this.intervals.shift();this.period=clamp(median(this.intervals),.25,1.5);}
      this.lastBeatAt=now;this.beatSerial++;
      if(this.visual) {
        this.visualBeat++;
        if(this.visualBeat>=this.sceneAt) {
          this.visualCurrent.preset=this.nextScene;this.visualTarget.preset=this.nextScene;
          this.recent.push(this.nextScene);if(this.recent.length>6)this.recent.shift();
          const mode=this.choose(['morph','dissolve','radial','prism','ecosystem']);
          const beats=this.choose([2,4]);
          this.visualCurrent.transitionMode=mode;this.visualTarget.transitionMode=mode;
          this.cue={id:++this.cueSerial,preset:this.nextScene,mode,startBeat:this.beatSerial,beats,period:this.period};
          this.nextScene=this.scene(this.visualCurrent.preset);this.sceneAt+=this.choose([16,24,32]);
        }
        if(this.visualBeat===1||this.visualBeat%4===0)this.visualProfile(manual,clamp(level));
      }
      if(this.logo) {this.logoBeat++;this.logoProfile();}
    }
    // Freeze generative drift in silence; no fabricated beats or timeout changes.
    const active=level>.035;
    if(active) {
      const ease=1-Math.exp(-dt/Math.max(.20,this.period*1.4));
      if(this.visual)for(const [key,target] of Object.entries(this.visualTarget)) {
        if(typeof target==='number'&&!['preset','transitionSpeed'].includes(key))this.visualCurrent[key]=approach(finite(this.visualCurrent[key],target),target,dt,1/Math.max(.35,this.period*2.3));
        else if(key==='colorA'||key==='colorB')this.visualCurrent[key]=colorStep(this.visualCurrent[key],target,ease);
      }
      if(this.logo) {
        for(const [key,target] of Object.entries(this.logoTarget))if(typeof target==='number'&&key!=='logoCopies')this.logoCurrent[key]=approach(finite(this.logoCurrent[key],target),target,dt,1/Math.max(.20,this.period));
        this.logoAngle=approach(this.logoAngle,this.logoAngleTarget,dt,1/Math.max(.15,this.period*.5));
        this.logoMorph=approach(this.logoMorph,this.logoMorphTarget,dt,1/Math.max(.15,this.period*.5));
      }
    }
    return hit;
  }
  compose(manual) {
    return {...manual,...(this.visual?this.visualCurrent:{}),...(this.logo?this.logoCurrent:{}),
      autoVisual:this.visual,autoLogo:this.logo,visualCue:this.visual?this.cue:null,
      autoBeatSerial:this.beatSerial,autoBeatPeriod:this.period,
      autoPreparePreset:this.visual?this.nextScene:null,
      logoAutoAngle:this.logo?this.logoAngle:0,logoAutoHue:this.logo?this.logoMorph:0,
      logoPaletteMix:manual.colorMix
    };
  }
  status() { return {visual:this.visual,logo:this.logo,beats:this.beatSerial,bpm:Math.round(60/this.period),scene:this.visualCurrent.preset,waiting:this.lastBeatAt===-Infinity}; }
}
