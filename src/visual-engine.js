import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const vegvisirUrl = new URL('./assets/vegvisir.webp', import.meta.url).href;

const vertexShader = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const GLSL_COMMON = String.raw`
  precision highp float;
  varying vec2 vUv;

  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uSub;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uLevel;
  uniform float uBeat;
  uniform float uIntensity;
  uniform float uContrast;
  uniform float uZoom;
  uniform float uSpeed;
  uniform float uDensity;
  uniform float uPreset;
  uniform float uGrowth;
  uniform float uSubPulse;
  uniform float uBassPulse;
  uniform float uMidPulse;
  uniform float uTreblePulse;
  uniform float uLevelPulse;
  uniform float uColorMix;
  uniform float uPatternShift;
  uniform float uPresetFrom;
  uniform float uPresetTo;
  uniform float uTransitionMix;
  uniform float uTransitionMode;
  uniform float uTransitionSeed;
  uniform float uTransitionActive;
  uniform float uRandomness;
  uniform float uFlow;
  uniform float uAudioZoom;
  uniform float uTransitionZoom;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  #define PI 3.14159265359
  #define TAU 6.28318530718
  #define GOLDEN_ANGLE 2.39996322973

  float sat(float x){ return clamp(x, 0.0, 1.0); }

  float hash11(float p){ return fract(sin(p*127.1)*43758.5453123); }
  float hash21(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  vec2 hash22(vec2 p){
    float n = hash21(p);
    return vec2(n, hash21(p + n + 17.13));
  }

  float noise21(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0,0.0));
    float c = hash21(i + vec2(0.0,1.0));
    float d = hash21(i + vec2(1.0,1.0));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }

  float fbm(vec2 p){
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(0.80,-0.60,0.60,0.80);
    for(int i=0;i<5;i++){
      v += a * noise21(p);
      p = m * p * 2.03 + 7.13;
      a *= 0.5;
    }
    return v;
  }

  mat2 rot(float a){
    float c = cos(a), s = sin(a);
    return mat2(c,-s,s,c);
  }

  vec3 palette(float t){
    // Smooth continuous A/B fusion. uColorMix biases the palette without creating hard bands.
    float phase = t*2.35 + uTime*0.035 + uPatternShift*0.14 + uMidPulse*0.16;
    float wave = 0.5 + 0.5*sin(phase + 0.18*sin(phase*0.47));
    float bias = (uColorMix - 0.5) * 0.92;
    float blend = smoothstep(0.02, 0.98, clamp(wave*0.78 + 0.11 + bias, 0.0, 1.0));
    vec3 base = mix(uColorA, uColorB, blend);
    vec3 bandTint = vec3(0.0);
    bandTint += vec3(0.055,0.018,0.010) * uBassPulse;
    bandTint += vec3(0.010,0.035,0.055) * uMidPulse;
    bandTint += vec3(0.035,0.050,0.075) * uTreblePulse;
    float whiteLift = 0.012 + 0.035*uTreble + 0.018*uBeat + 0.012*uLevelPulse;
    return mix(base + bandTint, vec3(1.0), whiteLift);
  }

  float seamlessAngle(vec2 p){
    float a = atan(p.y,p.x);
    // A periodic angular field: identical value at -PI and +PI, eliminating radial color seams.
    return 0.5 + 0.22*sin(a) + 0.16*cos(a*2.0) + 0.08*sin(a*3.0 + 0.7);
  }

  float glowLine(float x, float width){
    float core = exp(-abs(x) / max(width, 0.0005));
    float haze = exp(-abs(x) / max(width*5.0, 0.001)) * 0.22;
    return core + haze;
  }

  float circleLine(vec2 p, float radius, float width){
    return glowLine(abs(length(p) - radius), width);
  }

  float sdSegment(vec2 p, vec2 a, vec2 b){
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
    return length(pa - ba*h);
  }

  float sdBox(vec2 p, vec2 b){
    vec2 d = abs(p) - b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
  }

  float boxLine(vec2 p, vec2 b, float width){
    return glowLine(sdBox(p,b), width);
  }

  float hexOutline(vec2 p, float radius, float width){
    p = abs(p);
    float d = max(dot(p, normalize(vec2(1.0, 1.7320508))*0.5), p.x) - radius;
    return glowLine(d, width);
  }

  float triOutline(vec2 p, float radius, float width){
    const float k = 1.7320508;
    p.x = abs(p.x);
    p -= vec2(radius, 0.0);
    if(p.x + k*p.y > 0.0) p = vec2(p.x - k*p.y, -k*p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0*radius, 0.0);
    float d = -length(p) * sign(p.y);
    return glowLine(d, width);
  }

  float particleLayer(vec2 p, float scale, float seed, float t, float drift){
    vec2 q = p * scale;
    q += vec2(t * drift, -t * drift * 0.63);
    vec2 id = floor(q);
    vec2 gv = fract(q) - 0.5;
    vec2 rnd = hash22(id + seed*17.7) - 0.5;
    rnd += 0.12*sin(vec2(1.7,2.3)*t + seed + hash22(id)*6.2831);
    float d = length(gv - rnd*0.72);
    float size = mix(0.018,0.055,hash21(id + seed*4.1));
    float point = exp(-(d*d)/(size*size));
    float twinkle = 0.45 + 0.55*sin(t*(1.3+hash21(id)*2.4) + hash21(id+5.2)*20.0);
    return point * (0.55 + 0.45*twinkle);
  }

  float dust(vec2 p, float t, float density){
    float d = 0.0;
    d += particleLayer(p, 7.0 + density*2.0, 1.0, t, 0.045) * 0.50;
    d += particleLayer(p, 13.0 + density*4.0, 4.0, -t*0.75, 0.025) * 0.40;
    d += particleLayer(p, 24.0 + density*6.0, 9.0, t*0.55, 0.014) * 0.32;
    return d;
  }

  float crescent(vec2 p, float outerR, float innerR, vec2 offset, float width){
    float outer = circleLine(p, outerR, width);
    float inner = circleLine(p + offset, innerR, width);
    return max(outer - inner*0.85, 0.0);
  }

  float flowerOfLife(vec2 p, float scale, float width){
    float s = 0.0;
    float r = scale;
    s += circleLine(p, r, width);
    for(int i=0;i<6;i++){
      float a = float(i)/6.0 * TAU;
      vec2 c = vec2(cos(a), sin(a)) * r;
      s += circleLine(p - c, r, width);
    }
    return s;
  }

  float runeGlyph(vec2 p, float idx){
    float d = 0.0;
    idx = mod(floor(idx), 7.0);
    if(idx < 0.5){
      d += glowLine(sdSegment(p, vec2(0.0,-0.42), vec2(0.0,0.42)), 0.015);
      d += glowLine(sdSegment(p, vec2(-0.18,0.18), vec2(0.18,0.36)), 0.015);
      d += glowLine(sdSegment(p, vec2(-0.18,-0.08), vec2(0.18,0.10)), 0.015);
    } else if(idx < 1.5){
      d += glowLine(sdSegment(p, vec2(-0.25,-0.42), vec2(0.0,0.42)), 0.015);
      d += glowLine(sdSegment(p, vec2(0.25,-0.42), vec2(0.0,0.42)), 0.015);
      d += glowLine(sdSegment(p, vec2(-0.15,0.00), vec2(0.15,0.00)), 0.015);
    } else if(idx < 2.5){
      d += glowLine(sdSegment(p, vec2(0.0,-0.42), vec2(0.0,0.42)), 0.015);
      d += glowLine(sdSegment(p, vec2(0.0,0.42), vec2(0.22,0.12)), 0.015);
      d += glowLine(sdSegment(p, vec2(0.0,0.0), vec2(0.20,-0.24)), 0.015);
    } else if(idx < 3.5){
      d += glowLine(sdSegment(p, vec2(-0.22,-0.42), vec2(-0.22,0.42)), 0.015);
      d += glowLine(sdSegment(p, vec2(-0.22,0.42), vec2(0.18,0.12)), 0.015);
      d += glowLine(sdSegment(p, vec2(-0.22,0.0), vec2(0.14,-0.28)), 0.015);
    } else if(idx < 4.5){
      d += glowLine(sdSegment(p, vec2(-0.26,0.36), vec2(0.26,0.36)), 0.015);
      d += glowLine(sdSegment(p, vec2(-0.26,0.36), vec2(0.0,-0.42)), 0.015);
      d += glowLine(sdSegment(p, vec2(0.26,0.36), vec2(0.0,-0.42)), 0.015);
    } else if(idx < 5.5){
      d += glowLine(sdSegment(p, vec2(0.0,-0.42), vec2(0.0,0.42)), 0.015);
      d += glowLine(sdSegment(p, vec2(-0.24,0.30), vec2(0.24,0.30)), 0.015);
      d += glowLine(sdSegment(p, vec2(-0.24,-0.10), vec2(0.24,-0.10)), 0.015);
    } else {
      d += glowLine(sdSegment(p, vec2(-0.24,-0.36), vec2(0.24,0.36)), 0.015);
      d += glowLine(sdSegment(p, vec2(-0.24,0.36), vec2(0.24,-0.36)), 0.015);
      d += glowLine(sdSegment(p, vec2(0.0,-0.42), vec2(0.0,0.42)), 0.013);
    }
    return d;
  }

  float digitalGlyph(vec2 p, float seed){
    // Procedural segmented glyph: readable as code without relying on a texture atlas.
    p.x *= 1.18;
    float hTop = glowLine(sdSegment(p, vec2(-0.16, 0.29), vec2(0.16, 0.29)), 0.018) * step(0.36, hash11(seed+1.0));
    float hMid = glowLine(sdSegment(p, vec2(-0.15, 0.00), vec2(0.15, 0.00)), 0.018) * step(0.42, hash11(seed+2.0));
    float hBot = glowLine(sdSegment(p, vec2(-0.16,-0.29), vec2(0.16,-0.29)), 0.018) * step(0.38, hash11(seed+3.0));
    float vLT  = glowLine(sdSegment(p, vec2(-0.17, 0.27), vec2(-0.17, 0.03)), 0.016) * step(0.44, hash11(seed+4.0));
    float vLB  = glowLine(sdSegment(p, vec2(-0.17,-0.03), vec2(-0.17,-0.27)), 0.016) * step(0.46, hash11(seed+5.0));
    float vRT  = glowLine(sdSegment(p, vec2( 0.17, 0.27), vec2( 0.17, 0.03)), 0.016) * step(0.43, hash11(seed+6.0));
    float vRB  = glowLine(sdSegment(p, vec2( 0.17,-0.03), vec2( 0.17,-0.27)), 0.016) * step(0.45, hash11(seed+7.0));
    float diagA = glowLine(sdSegment(p, vec2(-0.13,0.24), vec2(0.13,-0.24)),0.014) * step(0.72,hash11(seed+8.0));
    float diagB = glowLine(sdSegment(p, vec2(0.13,0.24), vec2(-0.13,-0.24)),0.014) * step(0.76,hash11(seed+9.0));
    float dot = exp(-dot(p-vec2(0.0,-0.36),p-vec2(0.0,-0.36))*900.0) * step(0.72,hash11(seed+10.0));
    return min(1.65, hTop+hMid+hBot+vLT+vLB+vRT+vRB+diagA+diagB+dot);
  }

  float treeField(vec2 p, float t){
    // Folded binary tree. Five iterations produce a deep tree with only five SDF evaluations.
    vec2 q = p;
    q.y += 0.92;
    float d = 10.0;
    float len = 0.42;
    float width = 0.016;
    float growth = 0.18 + uGrowth*0.82;
    float branchAngle = 0.50 + 0.10*sin(uPatternShift*0.23) + 0.12*uMidPulse + 0.06*uRandomness;
    for(int i=0;i<5;i++){
      float fi = float(i);
      float levelMask = smoothstep(fi*0.19-0.12, fi*0.19+0.12, growth);
      float seg = sdSegment(q, vec2(0.0,0.0), vec2(0.0,len));
      d = min(d, seg + (1.0-levelMask)*2.0);
      q.y -= len;
      q.x = abs(q.x);
      q = rot(-(branchAngle + 0.025*sin(t*0.45 + fi + uPatternShift*0.08))) * q;
      q *= 1.38;
      len *= 0.78;
      width *= 0.78;
    }
    return glowLine(d, 0.010 + 0.004*uBassPulse);
  }


`;

const PRESET_DEFINITIONS = [
  { name: 'cosmicParticles', glsl: String.raw`  vec3 cosmicParticles(vec2 uv, float t){
    vec2 p = uv;
    float r = length(p);
    float ang = atan(p.y,p.x);
    float warp = fbm(p*2.1 + vec2(t*0.035,-t*0.025));
    p *= rot((warp-0.5)*0.45 + t*0.025);
    p += 0.055*vec2(sin(p.y*2.5+t*0.3), cos(p.x*2.2-t*0.27));
    float nebula = fbm(p*2.7 + warp*2.0 + vec2(t*0.035,0.0));
    nebula = pow(sat((nebula-0.37)*1.8), 1.55);
    float stars = dust(p*(1.0 + uBass*0.06), t*(0.55+uSpeed*0.1), uDensity);
    float orbit = glowLine(sin(r*(15.0+uDensity*4.0) - t*1.3 - warp*3.0), 0.05 + uBass*0.035) * 0.14;
    float spiral = glowLine(sin(ang*4.0 + r*14.0 - t*0.9), 0.035 + uTreble*0.025) * 0.10;
    float core = 0.035 / max(r*r + 0.018,0.018);
    vec3 col = palette(nebula + r*0.55 + t*0.03) * (nebula*0.50 + orbit + spiral);
    col += mix(vec3(0.65,0.78,1.0), palette(0.85), 0.55) * stars * (0.75 + uTreble*1.7);
    col += palette(t*0.06) * core * (0.11 + uBeat*0.12 + uSub*0.10);
    return col;
  }` },
  { name: 'neonFlow', glsl: String.raw`  vec3 neonFlow(vec2 uv, float t){
    vec2 p = uv;
    float n = fbm(p*1.7 + vec2(t*0.13,0.0));
    p.y += (n-0.5)*0.30;
    float ribbons = 0.0;
    for(int i=0;i<5;i++){
      float fi = float(i);
      float y = (fi-2.0)*0.25;
      y += 0.16*sin(p.x*(2.2+fi*0.35) + t*(1.1+fi*0.14) + fi*2.1);
      y += 0.045*sin(p.x*8.0 - t*2.0 + fi);
      ribbons += glowLine(p.y-y, 0.018 + 0.013*uTreble) * (0.34 + fi*0.045);
    }
    float sparks = dust(p*vec2(1.0,0.82) + vec2(t*0.035,0.0), t*1.35, uDensity) * (0.35+uTreble);
    float scan = glowLine(fract((p.y - t*0.18)*3.0)-0.5, 0.025) * 0.08;
    vec3 col = palette(p.x*0.36 + p.y*0.25 + t*0.06) * (ribbons + scan);
    col += palette(0.6 + t*0.1) * sparks;
    return col;
  }` },
  { name: 'sacredDust', glsl: String.raw`  vec3 sacredDust(vec2 uv, float t){
    vec2 p = uv * rot(t*0.055 + uMid*0.10);
    float r = length(p);
    float a = atan(p.y,p.x);
    float petals = glowLine(sin(a*6.0 + sin(r*5.0-t*0.7)*1.4), 0.045+uTreble*0.02) * (1.0-smoothstep(0.10,1.35,r));
    float rings = glowLine(sin(r*(18.0+uDensity*5.0)-t*1.15-uBass*3.0),0.045+uBeat*0.02);
    float flower = circleLine(p, 0.27 + 0.03*sin(t), 0.018) + circleLine(p-vec2(0.18,0.0), 0.18, 0.014) + circleLine(p+vec2(0.18,0.0), 0.18, 0.014);
    float hex = hexOutline(p, 0.62, 0.016);
    vec2 orbitP = p * rot(-t*0.10);
    float particles = dust(orbitP*1.18,t*0.7,uDensity) * (1.0-smoothstep(0.15,1.3,r));
    float center = exp(-r*r*5.0)*(0.32+uBeat*0.75);
    vec3 col = palette(seamlessAngle(p) + r*0.4 + t*0.025) * (petals*0.22 + rings*0.18 + flower*0.22 + hex*0.15 + center);
    col += mix(vec3(1.0),palette(0.4),0.45)*particles*(0.55+uTreble*1.1);
    return col;
  }` },
  { name: 'angelicParticles', glsl: String.raw`  vec3 angelicParticles(vec2 uv, float t){
    vec2 p = uv;
    float r = length(p);
    float leftCurve = abs(length(vec2((p.x+0.30)*0.72,p.y*0.86))-0.48 - 0.07*sin(p.y*6.0-t));
    float rightCurve = abs(length(vec2((p.x-0.30)*0.72,p.y*0.86))-0.48 - 0.07*sin(p.y*6.0+t));
    float wings = glowLine(min(leftCurve,rightCurve),0.026+uTreble*0.014)*(1.0-smoothstep(0.15,1.25,r));
    float halo = glowLine(abs(length(p-vec2(0.0,0.34))-(0.24+uBeat*0.025)),0.022+uBass*0.01);
    float rays = pow(abs(cos(atan(p.y,p.x)*(7.0+uDensity*2.0))),28.0)/(0.55+r*2.2);
    float particles = dust(p + vec2(0.0,-t*0.02),t*0.55,uDensity)*(0.5+uTreble);
    float aura = pow(sat(1.0-r*0.75),3.0)*fbm(p*2.0+vec2(0.0,-t*0.05));
    vec3 warm = mix(palette(0.2),vec3(1.0,0.92,0.76),0.34);
    return warm*(wings*0.24+halo*0.62+rays*0.10+aura*0.20) + palette(r+t*0.03)*particles*0.78;
  }` },
  { name: 'technoParticles', glsl: String.raw`  vec3 technoParticles(vec2 uv, float t){
    vec2 p = uv;
    float r = length(p);
    float a = atan(p.y,p.x);
    float invR = 1.0/max(r,0.055);
    float z = invR*0.18;
    float rings = glowLine(fract(z*(3.0+uDensity*0.8)-t*0.32-uBass*0.12)-0.5,0.055+uBeat*0.025);
    float sectors = glowLine(sin(a*(7.0+floor(uDensity*3.0))+z*7.0),0.06+uTreble*0.025);
    vec2 tunnelUV = vec2(a/PI*2.0,z*0.48-t*0.15);
    float particles = particleLayer(tunnelUV,12.0+uDensity*3.0,5.0,t*1.2,0.02);
    particles += particleLayer(tunnelUV,20.0+uDensity*4.0,11.0,-t,0.015)*0.65;
    float center = exp(-r*r*40.0)*(0.6+uBeat*2.2);
    vec3 col = palette(z*0.34+t*0.08)*(rings*0.44+sectors*0.15+center);
    col += palette(seamlessAngle(p)+t*0.1)*particles*(0.75+uTreble*1.4)*smoothstep(0.03,0.26,r);
    return col;
  }` },
  { name: 'quantumDust', glsl: String.raw`  vec3 quantumDust(vec2 uv, float t){
    vec2 p = uv;
    float field = fbm(p*1.25 + vec2(t*0.08,-t*0.04));
    float angle = (field-0.5)*PI*1.6 + 0.2*sin(t*0.3);
    p *= rot(angle*0.18);
    p += vec2(cos(angle),sin(angle))*0.13*(field-0.5);
    float particles = dust(p,t*1.05,uDensity*1.2);
    float particles2 = dust(p*rot(1.57)+vec2(t*0.03,0.0),-t*0.75,uDensity*0.8);
    float wave = glowLine(sin((p.x+p.y)*8.0 + field*5.0 - t*1.2),0.055+uMid*0.025)*0.10;
    float pulse = exp(-length(p)*2.4)*(0.08+uBeat*0.24);
    return palette(field+t*0.06)*(particles*0.75+particles2*0.46+wave+pulse)*(0.8+uTreble*0.55);
  }` },
  { name: 'fibonacciBloom', glsl: String.raw`  vec3 fibonacciBloom(vec2 uv, float t){
    vec2 p = uv * rot(t*0.05);
    float bloom = 0.0;
    float sparks = 0.0;
    for(int i=0;i<56;i++){
      float fi = float(i) / 55.0;
      float growthMask = step(fi, max(0.02, uGrowth));
      float radius = 0.08 + 0.95 * sqrt(fi) * max(uGrowth, 0.001);
      float ang = float(i) * GOLDEN_ANGLE + t*(0.09 + fi*0.16) + uBeat*0.7;
      vec2 pos = vec2(cos(ang), sin(ang)) * radius;
      float d = length(p - pos);
      float sz = mix(0.008, 0.026, fi) * (1.0 + uTreble*0.18);
      bloom += growthMask * exp(-(d*d)/(sz*sz)) * (0.55 + fi*0.65);
      sparks += growthMask * glowLine(d - sz*3.5, 0.005 + fi*0.003) * 0.07;
    }
    float spiral = glowLine(sin(atan(p.y,p.x)*13.0 + length(p)*18.0 - t*1.4), 0.04 + uBass*0.015) * 0.11;
    float core = circleLine(p, 0.11 + 0.04*sin(t*0.7 + uBeat*2.0), 0.015) + exp(-dot(p,p)*10.0)*0.22;
    vec3 col = palette(length(p)*0.4 + t*0.02) * (bloom*0.42 + spiral + core);
    col += mix(vec3(1.0), palette(0.8), 0.4) * sparks;
    return col;
  }` },
  { name: 'runePulse', glsl: String.raw`  vec3 runePulse(vec2 uv, float t){
    vec2 p = uv * rot(t*0.06);
    float ring = circleLine(p, 0.75, 0.012) + circleLine(p, 0.46, 0.012);
    float rays = 0.0;
    float glyphs = 0.0;
    for(int i=0;i<8;i++){
      float fi = float(i);
      float ang = fi/8.0 * TAU + t*0.07;
      vec2 center = vec2(cos(ang), sin(ang)) * (0.56 + 0.03*sin(t+fi));
      vec2 q = (p - center) * rot(-ang + PI*0.5) * 2.2;
      glyphs += runeGlyph(q, fi + floor(t*0.5));
      rays += glowLine(sdSegment(p, center*0.25, center), 0.008) * 0.24;
    }
    vec2 centerQ = p * rot(t*0.16) * 2.0;
    float centerGlyph = runeGlyph(centerQ, floor(t*1.5)) * 1.2;
    float dustField = dust(p * (1.1 + uDensity*0.12), t*0.55, uDensity) * 0.65;
    vec3 col = palette(0.2 + seamlessAngle(p) + t*0.05) * (ring*0.18 + glyphs*0.22 + rays + centerGlyph*0.38);
    col += palette(0.75) * dustField * (0.4 + uTreble*0.9);
    return col;
  }` },
  { name: 'symbolForge', glsl: String.raw`  vec3 symbolForge(vec2 uv, float t){
    vec2 p = uv * rot(t*0.03);
    float r = length(p);
    float a = atan(p.y,p.x);
    float mandala = 0.0;
    mandala += circleLine(p, 0.84, 0.01);
    mandala += circleLine(p, 0.58, 0.012);
    mandala += circleLine(p, 0.32, 0.014);
    mandala += hexOutline(p, 0.42, 0.012) * 0.8;
    mandala += glowLine(sdSegment(p, vec2(-0.84,0.0), vec2(0.84,0.0)), 0.006) * 0.5;
    mandala += glowLine(sdSegment(p, vec2(0.0,-0.84), vec2(0.0,0.84)), 0.006) * 0.5;
    for(int i=0;i<6;i++){
      float fi = float(i);
      float ang = fi/6.0 * TAU + t*0.02;
      vec2 c = vec2(cos(ang), sin(ang))*0.68;
      mandala += crescent(p - c, 0.085, 0.085, vec2(0.04,0.0), 0.010) * 0.6;
      mandala += circleLine(p - c, 0.045, 0.009) * 0.4;
    }
    float lattice = glowLine(sin(a*12.0 + r*11.0 - t), 0.045 + uTreble*0.015) * 0.10;
    float particles = dust(p*0.96, t*0.68, uDensity);
    float center = exp(-r*r*22.0)*(0.32 + uBeat*0.55);
    vec3 col = mix(vec3(0.96), palette(r+t*0.03), 0.65) * (mandala*0.2 + lattice + center);
    col += palette(0.45 + seamlessAngle(p)) * particles * 0.62;
    return col;
  }` },
  { name: 'seedWorld', glsl: String.raw`  vec3 seedWorld(vec2 uv, float t){
    vec2 p = uv;
    float r = length(p);
    float n = fbm(p*2.0 + vec2(t*0.06, -t*0.04));
    float flow = fbm(p*3.0*rot(t*0.02) + vec2(n*2.0));
    float shell = glowLine(abs(r - (0.2 + uGrowth*0.65 + 0.05*sin(t*0.4))) + (flow-0.5)*0.08, 0.025);
    float membrane = pow(sat(1.0 - abs(r - (0.1 + uGrowth*0.75))*1.8), 3.0) * 0.14;
    float tendrils = 0.0;
    for(int i=0;i<6;i++){
      float fi = float(i);
      float ang = fi/6.0 * TAU + (n-0.5)*1.2 + t*0.04;
      vec2 dir = vec2(cos(ang), sin(ang));
      float wave = sin(dot(p, dir.yx*vec2(2.0,-2.0))*8.0 + t*1.4 + fi*1.7);
      float line = glowLine(dot(p, dir.yx) - wave*0.05, 0.018) * smoothstep(0.15, 0.95*uGrowth + 0.2, dot(p,dir)+0.8);
      tendrils += line * 0.08;
    }
    float spores = dust(p*(1.2 + uGrowth*0.8), t*0.8, uDensity) * (0.45 + uTreble*0.7);
    float branches = glowLine(sin((p.x+p.y)*10.0 + flow*4.0 - t*1.1), 0.032) * membrane;
    vec3 organic = mix(vec3(0.7,0.47,0.25), palette(0.35+n*0.4), 0.55);
    vec3 col = organic * (shell*0.85 + membrane + branches*1.5 + tendrils);
    col += mix(vec3(1.0,0.82,0.56), palette(0.8), 0.35) * spores;
    return col;
  }` },
  { name: 'flowerLifeNexus', glsl: String.raw`  vec3 flowerLifeNexus(vec2 uv, float t){
    vec2 p = uv * rot(t*0.03 + uBeat*0.08);
    float r = length(p);
    float geometry = 0.0;
    geometry += flowerOfLife(p, 0.22, 0.010);
    geometry += flowerOfLife(p*rot(PI/6.0), 0.44, 0.008) * 0.75;
    geometry += circleLine(p, 0.82, 0.008);
    geometry += circleLine(p, 0.58, 0.010);
    geometry += hexOutline(p, 0.72, 0.009) * 0.7;
    for(int i=0;i<12;i++){
      float fi = float(i);
      float a = fi/12.0 * TAU + t*0.06;
      vec2 c = vec2(cos(a), sin(a)) * 0.82;
      geometry += circleLine(p - c, 0.045 + 0.012*sin(t+fi), 0.008) * 0.75;
    }
    float orbiters = 0.0;
    for(int i=0;i<8;i++){
      float fi = float(i);
      float a = fi/8.0 * TAU - t*(0.22 + fi*0.01);
      vec2 pos = vec2(cos(a), sin(a)) * (0.35 + 0.18*sin(t*0.3 + fi));
      orbiters += exp(-pow(length(p-pos),2.0)/0.0012) * 0.85;
    }
    float dustField = dust(p*1.18 + vec2(0.0, t*0.02), t*0.52, uDensity) * 0.75;
    float aura = pow(sat(1.0 - r*0.85), 2.0) * 0.18;
    vec3 col = palette(r*0.55 + t*0.02) * (geometry*0.25 + orbiters*0.36 + aura);
    col += mix(vec3(1.0), palette(0.7), 0.45) * dustField;
    return col;
  }` },
  { name: 'artifactShrine', glsl: String.raw`  vec3 artifactShrine(vec2 uv, float t){
    vec2 p = uv;
    p.y += 0.06;
    float audioBreath = 1.0 + uBassPulse*0.10 + uSubPulse*0.055;
    p /= audioBreath;
    float softX = sqrt(p.x*p.x + 0.0009);
    vec2 q = vec2(softX, p.y);
    float n = fbm(q*3.0 + vec2(uPatternShift*0.07, -t*0.07));
    float twist = (n-0.5)*(0.11 + uMidPulse*0.10);
    q = rot(twist) * q;
    float bodyRadius = 0.34 + 0.055*uBassPulse + 0.09*sin(q.y*3.0 + n*2.0 + uPatternShift*0.13);
    float shell = abs(length(vec2(q.x*0.76 + 0.035*sin(q.y*7.0+t*0.15), q.y*0.76)) - bodyRadius);
    float pillar = glowLine(shell - 0.034 + n*0.014, 0.015 + uTreblePulse*0.004) * smoothstep(-0.88, 0.15, q.y) * (1.0-smoothstep(0.18, 1.13, q.y));
    float cavityR = 0.17 + uBassPulse*0.035;
    float innerCavity = glowLine(abs(length(vec2(q.x*0.60, q.y*0.76 + 0.04*sin(t*0.7+q.y*6.0))) - cavityR), 0.018) * 0.82;
    float ribs = 0.0;
    for(int i=0;i<7;i++){
      float fi=float(i);
      float yy=-0.50 + fi*0.16;
      float span=(0.16 + 0.025*fi)*(1.0+uBassPulse*0.16);
      ribs += glowLine(sdSegment(p, vec2(-span,yy), vec2(span,yy+0.025*sin(t+fi))), 0.006+uTreblePulse*0.003)*0.18;
    }
    float veins = glowLine(sin(q.y*(17.0+uTreblePulse*3.0) + n*6.0 - t*0.85 - uPatternShift*0.3), 0.038) * (0.08+uTreblePulse*0.09);
    float roots = 0.0;
    for(int i=0;i<6;i++){
      float fi = float(i);
      float phase = fi*1.1 + uPatternShift*0.17;
      float x = 0.12 + fi*0.042 + 0.03*sin(t*0.42 + phase);
      roots += glowLine(sdSegment(q, vec2(x,0.08), vec2(0.04 + fi*0.021, 0.86 + 0.05*uMidPulse)), 0.009) * (0.20+uMidPulse*0.08);
    }
    float nodes = 0.0;
    for(int i=0;i<5;i++){
      float fi=float(i);
      vec2 c=vec2(0.0,-0.42+fi*0.21);
      nodes += circleLine(p-c,0.025+0.018*uBassPulse,0.007)*0.32;
    }
    float spores = dust(p*(1.45 + uTreblePulse*0.16) + vec2(0.0,t*0.035), t*0.62, uDensity) * (0.25 + uTreble*0.42 + uTreblePulse*0.34);
    float portal = exp(-pow(length(p-vec2(0.0,0.02))*1.65, 2.0)) * (0.08 + uBeat*0.20 + uBassPulse*0.12);
    vec3 bark = mix(vec3(0.18,0.15,0.16), palette(0.18+n*0.36), 0.48);
    vec3 col = bark * (pillar*1.05 + veins + roots + ribs);
    col += mix(vec3(0.88,0.56,0.28), palette(0.15), 0.38) * (innerCavity*0.72 + portal + nodes);
    col += mix(vec3(0.85,0.72,0.46), palette(0.82), 0.42) * spores;
    return col;
  }` },
  { name: 'entityGate', glsl: String.raw`  vec3 entityGate(vec2 uv, float t){
    vec2 p = uv;
    float r = length(p);
    float breath = 1.0 + uBassPulse*0.07 + uBeat*0.025;
    p /= breath;
    vec2 s = vec2(sqrt(p.x*p.x + 0.0007), p.y);
    float morph = fbm(p*1.7 + vec2(uPatternShift*0.08,t*0.025));
    float gateR = 0.57 + 0.035*uBassPulse + (morph-0.5)*0.035;
    float gate = glowLine(abs(length(vec2(s.x*0.75, s.y*0.91)) - (gateR + 0.035*sin(s.y*8.0 - t*0.65))) - 0.052, 0.014 + uTreblePulse*0.004);
    float eyeY = -0.04 + uMidPulse*0.018;
    float eyeSep = 0.21 + uBassPulse*0.018;
    float eye1 = exp(-pow(length(p - vec2(eyeSep, eyeY))*8.5, 2.0));
    float eye2 = exp(-pow(length(p - vec2(-eyeSep, eyeY))*8.5, 2.0));
    float irisR = 0.055 + 0.012*uTreblePulse;
    float iris = circleLine(p-vec2(eyeSep,eyeY), irisR, 0.007) + circleLine(p-vec2(-eyeSep,eyeY), irisR, 0.007);
    float crown = 0.0;
    for(int i=0;i<9;i++){
      float fi = float(i);
      float a = mix(-1.0, 1.0, fi/8.0);
      vec2 a0 = vec2(a*0.40, -0.26);
      vec2 a1 = vec2(a*0.16, -0.79 - 0.055*sin(t*0.55 + fi + uPatternShift*0.1));
      crown += glowLine(sdSegment(p, a0, a1), 0.008 + uTreblePulse*0.003) * (0.28+uTreblePulse*0.12);
    }
    float body = flowerOfLife(rot(uMidPulse*0.05)*p*0.92, 0.18+uBassPulse*0.015, 0.008) * 0.52;
    body += circleLine(p, 0.31 + uBassPulse*0.025, 0.010) + circleLine(p, 0.70 + uSubPulse*0.035, 0.007);
    float spine = glowLine(sdSegment(p, vec2(0.0,-0.66), vec2(0.0,0.67)),0.005+uTreblePulse*0.002)*0.26;
    float wings = glowLine(abs(length(vec2((s.x-0.34)*0.88, s.y*0.80)) - (0.31+uMidPulse*0.025)), 0.012) * (1.0 - smoothstep(0.2,1.1,r));
    float sigils = 0.0;
    for(int i=0;i<6;i++){
      float fi=float(i);
      float a=fi/6.0*TAU+t*0.035+uPatternShift*0.045;
      vec2 c=vec2(cos(a),sin(a))*(0.50+0.025*sin(t+fi));
      sigils += circleLine(p-c,0.038+0.018*uTreblePulse,0.006)*0.30;
    }
    float particles = dust(p*(1.15+uTreblePulse*0.1), t*0.48, uDensity) * (0.36 + uTreble*0.38 + uTreblePulse*0.32);
    vec3 col = palette(0.35 + seamlessAngle(p) + t*0.025) * (gate*0.38 + body*0.20 + crown + wings*0.48 + spine + sigils);
    col += mix(vec3(0.95), palette(0.9), 0.45) * (eye1*0.30 + eye2*0.30 + iris*0.40 + particles*0.34);
    return col;
  }` },
  { name: 'dynamicPanels', glsl: String.raw`  vec3 dynamicPanels(vec2 uv, float t){
    vec2 p = uv;
    vec2 grid = p * (2.8 + uDensity*0.3);
    vec2 gv = fract(grid) - 0.5;
    vec2 id = floor(grid);
    float frame = boxLine(gv, vec2(0.42, 0.22 + 0.1*hash21(id)), 0.012);
    float inset = boxLine(gv, vec2(0.28, 0.12 + 0.05*hash21(id+2.1)), 0.009) * 0.6;
    float bar = glowLine(gv.y - (0.18*sin(t + hash21(id)*TAU)), 0.012) * step(abs(gv.x), 0.34);
    float dot = exp(-pow(length(gv - (hash22(id)-0.5)*0.3), 2.0)/0.002);
    float network = 0.0;
    for(int i=0;i<4;i++){
      float fi = float(i);
      vec2 a = vec2(-0.46 + fi*0.30, -0.42 + 0.15*sin(t*0.6 + fi + id.x));
      vec2 b = vec2(-0.36 + fi*0.28, 0.42 - 0.12*cos(t*0.5 + fi + id.y));
      network += glowLine(sdSegment(gv, a, b), 0.006) * 0.25;
    }
    float sweep = glowLine(fract((p.x + p.y - t*0.45) * 2.0)-0.5, 0.04) * 0.08;
    float panels = frame + inset + bar*0.5 + dot*0.4 + network;
    float backDust = dust(p*0.9, t*0.75, uDensity*0.9) * 0.25;
    vec3 col = palette(id.x*0.08 + id.y*0.05 + t*0.05) * (panels*0.32 + sweep);
    col += mix(vec3(0.8,0.95,1.0), palette(0.7), 0.45) * backDust;
    return col;
  }` },
  { name: 'matrixLattice', glsl: String.raw`  vec3 matrixLattice(vec2 p, float t){
    // Matrix rain: falling columns, bright heads and evolving procedural glyphs.
    float columns = 15.0 + floor(uDensity*4.0);
    float rows = 15.0 + floor(uDensity*3.0);
    float xCell = (p.x + 1.55) * columns;
    float colId = floor(xCell);
    float gx = fract(xCell) - 0.5;
    float colSeed = hash11(colId*3.71 + floor(uPatternShift*0.35)*9.17);
    float speed = 0.24 + colSeed*0.52 + uTreble*0.16 + uFlow*0.08;
    float headY = 1.35 - mod(t*speed + colSeed*5.8 + uPatternShift*0.07, 2.75);
    float trailDistance = mod(headY - p.y + 2.75, 2.75);
    float trail = exp(-trailDistance*(1.55 + uDensity*0.16));
    float head = exp(-abs(trailDistance)*18.0);

    float yFlow = (p.y + t*speed + colSeed*1.7) * rows;
    float rowId = floor(yFlow);
    float gy = fract(yFlow) - 0.5;
    vec2 gp = vec2(gx*0.78, gy*0.74);
    float glyphSeed = colId*31.7 + rowId*7.13 + floor(uPatternShift*(0.55+uRandomness));
    float glyph = digitalGlyph(gp, glyphSeed);
    float flicker = 0.64 + 0.36*hash11(glyphSeed + floor(t*(3.0+uTreble*4.0)));
    float rain = glyph * flicker * (0.12 + trail*1.05 + head*1.30);

    // Fine vertical phosphor and occasional code sparks.
    float phosphor = glowLine(gx,0.018) * trail * 0.08;
    float spark = exp(-dot(gp,gp)*95.0) * step(0.87,hash11(glyphSeed+44.0)) * (0.2+uTreblePulse*0.65);
    float scan = glowLine(fract((p.y-t*0.08)*14.0)-0.5,0.025)*0.022;

    vec3 matrixGreen = vec3(0.04,0.93,0.27);
    vec3 headGreen = vec3(0.74,1.0,0.82);
    vec3 tinted = mix(matrixGreen, palette(0.16+p.y*0.045+t*0.012), 0.08 + uColorMix*0.22);
    vec3 col = tinted * (rain + phosphor + scan);
    col += headGreen * glyph * head * (0.18 + uBeat*0.18);
    col += headGreen * spark;
    return col;
  }` },
  { name: 'merkabaPrism', glsl: String.raw`  vec3 merkabaPrism(vec2 p, float t){
    vec2 q = rot(t*0.045 + uMidPulse*0.10 + uPatternShift*0.02) * p;
    float outer = 0.76 + uBassPulse*0.055;
    float triA = triOutline(q, outer, 0.011 + uTreblePulse*0.004);
    float triB = triOutline(rot(PI)*q, outer, 0.011 + uTreblePulse*0.004);
    float star = triA + triB;
    float innerA = triOutline(rot(t*0.11)*q, 0.46 + uMidPulse*0.025, 0.009);
    float innerB = triOutline(rot(PI+t*0.11)*q, 0.46 + uMidPulse*0.025, 0.009);
    float orbit = 0.0;
    for(int i=0;i<6;i++){
      float fi = float(i);
      float a = fi/6.0*TAU + t*0.16 + uPatternShift*0.05;
      vec2 c = vec2(cos(a), sin(a)) * (0.58 + 0.035*sin(t*0.7 + fi));
      orbit += circleLine(q-c, 0.075 + 0.025*uBassPulse, 0.009);
    }
    float shell = circleLine(q, 0.92 + uSubPulse*0.045, 0.010) * 0.48;
    float depthA = triOutline(rot(0.34 + uMidPulse*0.09)*q, 0.61 + uBassPulse*0.03, 0.006) * 0.26;
    float depthB = triOutline(rot(PI+0.34 + uMidPulse*0.09)*q, 0.61 + uBassPulse*0.03, 0.006) * 0.26;
    float rays = 0.0;
    for(int i=0;i<12;i++){
      float fi = float(i);
      vec2 dir = vec2(cos(fi/12.0*TAU), sin(fi/12.0*TAU));
      rays += glowLine(dot(q, dir.yx), 0.006 + 0.003*uTreblePulse) * smoothstep(0.24, 1.05, dot(q, dir)+1.0) * 0.10;
    }
    float core = circleLine(q, 0.18 + 0.03*uBassPulse, 0.012) + exp(-dot(q,q)*18.0)*(0.22+uBeat*0.24);
    float dustField = dust(q*1.35, t*0.72, uDensity*0.74) * 0.18;
    vec3 col = palette(0.50 + q.x*0.12 + uPatternShift*0.025) * (star*0.34 + depthA + depthB + orbit*0.10 + shell*0.16 + rays + core*0.26);
    col += mix(vec3(1.0), palette(0.88), 0.45) * dustField;
    col += palette(0.10) * (innerA + innerB) * 0.20;
    return col;
  }` },
  { name: 'liquidResonance', glsl: String.raw`  vec3 liquidResonance(vec2 uv, float t){
    vec2 p = uv;
    float n1 = fbm(p*2.1 + vec2(t*0.09,-t*0.055));
    float n2 = fbm(rot(0.78)*p*3.4 + vec2(-t*0.07,t*0.045));
    vec2 flow = vec2(n1-0.5,n2-0.5) * (0.12 + uFlow*0.18 + uMidPulse*0.08);
    vec2 q = p + flow;
    float waveA = sin(q.x*(6.0+uDensity) + q.y*2.4 - t*(1.0+uMid*0.8));
    float waveB = sin(q.y*(7.5+uDensity*0.8) - q.x*2.2 + t*(0.85+uTreble*0.55));
    float waveC = sin((q.x+q.y)*5.2 + t*0.62 + uPatternShift*0.20);
    float surface = (waveA + waveB + waveC) / 3.0;
    float caustic = pow(sat(1.0-abs(surface)), 7.0) * (0.34+uTreble*0.58+uTreblePulse*0.42);

    float ripple = 0.0;
    for(int i=0;i<4;i++){
      float fi=float(i);
      vec2 c=(hash22(vec2(fi+floor(uPatternShift*0.3),fi*7.1))-0.5)*1.35;
      float phase=fract(t*(0.15+fi*0.018)+hash11(fi*9.4+uPatternShift*0.1));
      float rr=phase*(0.35+0.55*uGrowth);
      ripple += circleLine(q-c,rr,0.012+phase*0.018)*(1.0-phase)*(0.12+uBassPulse*0.20+uBeat*0.10);
    }
    float foam = dust(q*1.12 + flow*0.6,t*0.32,uDensity*0.65)*(0.10+uTreblePulse*0.24);
    float depth = smoothstep(1.4,0.0,length(q))*0.10 + (n1*n2)*0.10;
    vec3 waterA=mix(vec3(0.015,0.10,0.16),palette(0.48+n1*0.25),0.48);
    vec3 waterB=mix(vec3(0.20,0.90,1.0),palette(0.76+n2*0.18),0.30);
    vec3 col=waterA*(depth+caustic*0.34+ripple*0.36);
    col+=waterB*(caustic*0.34+ripple*0.22+foam);
    return col;
  }` },
  { name: 'galacticBloom', glsl: String.raw`  vec3 galacticBloom(vec2 uv, float t){
    vec2 p=uv;
    float r=length(p)+0.0005;
    float a=atan(p.y,p.x);
    float spin=t*(0.055+uMid*0.055)+uPatternShift*0.022;
    float spiralPhase=a*3.0-log(r+0.09)*5.2-spin;
    float arm=pow(0.5+0.5*cos(spiralPhase),7.0);
    float arm2=pow(0.5+0.5*cos(spiralPhase+PI),9.0);
    float falloff=exp(-r*1.55);
    float neb=fbm(rot(spin*0.18)*p*2.45+vec2(t*0.025,-t*0.018));
    neb=pow(sat((neb-0.28)*1.55),1.45);
    float lanes=pow(sat(0.55-fbm(p*5.4+vec2(-t*0.018,t*0.014))),2.0)*0.22;
    float stars=dust(p*(0.86+uDensity*0.08),t*0.22,uDensity*1.1)*(0.42+uTreble*0.82+uTreblePulse*0.45);
    float core=0.028/max(r*r+0.010,0.010)*(0.11+uBassPulse*0.08+uBeat*0.08);
    float halo=circleLine(p,0.22+uBassPulse*0.035,0.045)*0.08;
    vec3 col=palette(seamlessAngle(p)*0.58+r*0.30+t*0.014)*(falloff*(arm*0.36+arm2*0.25+neb*0.27-lanes)+halo);
    col+=mix(vec3(0.88,0.94,1.0),palette(0.92),0.34)*stars;
    col+=mix(vec3(1.0,0.74,0.42),palette(0.18),0.25)*core;
    return max(col,vec3(0.0));
  }` },
  { name: 'frequencyTree', glsl: String.raw`  vec3 frequencyTree(vec2 uv, float t){
    vec2 p=uv;
    float sway=(0.025+uFlow*0.035)*sin(t*0.58+p.y*2.3+uPatternShift*0.10)*(0.4+uMid+uMidPulse);
    p.x+=sway*smoothstep(-0.95,0.75,p.y);
    float branches=treeField(p,t);
    float trunkGlow=glowLine(sdSegment(p,vec2(0.0,-0.90),vec2(0.0,-0.48)),0.022+uBassPulse*0.008)*0.28;

    // Canopy points appear only near branch tips and react strongly to highs.
    float canopyMask=smoothstep(-0.25,0.92,p.y)*(1.0-smoothstep(0.55,1.38,abs(p.x)));
    float leaves=dust(p*vec2(1.10,0.92)+vec2(0.0,-t*0.025),t*0.42,uDensity*0.88)*canopyMask*(0.18+uTreble*0.55+uTreblePulse*0.55);
    float rootMask=(1.0-smoothstep(-0.94,-0.48,p.y));
    float roots=0.0;
    for(int i=0;i<5;i++){
      float fi=float(i);
      float x=(fi-2.0)*0.17;
      roots+=glowLine(sdSegment(p,vec2(0.0,-0.78),vec2(x,-1.05+0.035*sin(t+fi))),0.009)*rootMask*0.16;
    }
    float pulse=circleLine(p-vec2(0.0,-0.56),0.12+uBassPulse*0.05,0.018)*0.12;
    vec3 bark=mix(vec3(0.26,0.12,0.07),palette(0.14+uPatternShift*0.012),0.42);
    vec3 leafColor=mix(vec3(0.24,0.88,0.54),palette(0.72+t*0.012),0.44);
    vec3 col=bark*(branches*0.50+trunkGlow+roots+pulse);
    col+=leafColor*leaves;
    return col;
  }` }
];


function makePresetFragmentShader(index) {
  const preset = PRESET_DEFINITIONS[index] || PRESET_DEFINITIONS[0];
  return `${GLSL_COMMON}\n${preset.glsl}\n
  void main(){
    vec2 uv = (vUv - 0.5) * 2.0;
    uv.x *= uResolution.x / max(uResolution.y,1.0);
    uv /= max(uZoom,0.05);
    float t = uTime;
    float sceneIndex = SCENE_INDEX_PLACEHOLDER;
    float patternCell = floor(uPatternShift + 0.5);
    float patternRnd = hash11(patternCell*13.17 + sceneIndex*7.31);
    float patternRnd2 = hash11(patternCell*4.91 + sceneIndex*11.73 + 8.2);
    uv = rot((patternRnd-0.5) * (0.045 + 0.18*uMidPulse)) * uv;
    float globalWarp = (0.006 + uFlow*0.010) * (uMidPulse*0.55 + uTreblePulse*0.78) * (0.72 + patternRnd2*0.56);
    globalWarp *= (0.45 + uRandomness*0.95);
    uv += vec2(
      sin(uv.y*(3.6+patternRnd2*2.2) + t*(0.52+uFlow*0.20) + patternRnd*TAU),
      cos(uv.x*(4.0+patternRnd*2.0) - t*(0.46+uFlow*0.20) - patternRnd2*TAU)
    ) * globalWarp;
    float reactiveZoom = 1.0 + uAudioZoom*(uBassPulse*0.075 + uSubPulse*0.045 + uBeat*0.025);
    uv /= reactiveZoom;
    uv *= 1.0 + uBassPulse * (0.010 + patternRnd*0.014) + uSubPulse*0.006;

    vec3 col = PRESET_CALL_PLACEHOLDER(uv, t);

    float gate = smoothstep(0.026, 0.115, uLevel + uBeat*0.18 + uBass*0.07 + uLevelPulse*0.05);
    float birth = smoothstep(0.0, 0.82, uGrowth);
    float audioLift = mix(0.0, 0.58 + uLevel*0.42 + uBass*0.14 + uBeat*0.18 + uLevelPulse*0.10, gate);
    vec3 bandAccent = vec3(0.0);
    bandAccent += palette(0.18 + uTime*0.02) * uBassPulse * 0.042;
    bandAccent += palette(0.46 + uTime*0.02) * uMidPulse * 0.036;
    bandAccent += palette(0.78 + uTime*0.02) * uTreblePulse * 0.032;
    col = col * (uIntensity * audioLift * birth) + bandAccent;

    col = max(col, vec3(0.0));
    col = vec3(1.0) - exp(-col * 0.86);
    float safeContrast = clamp(0.95 + (uContrast-1.0)*0.54, 0.74, 1.36);
    col = (col - 0.42) * safeContrast + 0.42;
    col = clamp(col, vec3(0.0), vec3(1.0));
    col = pow(col, vec3(0.98));
    float dither = (hash21(gl_FragCoord.xy + fract(uTime)*91.7)-0.5) / 255.0;
    col += dither;
    gl_FragColor = vec4(col,1.0);
  }
  `
    .replace('SCENE_INDEX_PLACEHOLDER', Number(index).toFixed(1))
    .replace('PRESET_CALL_PLACEHOLDER', preset.name);
}

const fallbackFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uLevel;
  uniform float uBeat;
  uniform float uIntensity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  void main(){
    vec2 p=(vUv-0.5)*2.0;
    float r=length(p);
    float a=atan(p.y,p.x);
    float ring=exp(-abs(r-(0.38+0.08*sin(uTime*0.8+a*3.0)))/(0.025+uBass*0.025));
    float rays=pow(0.5+0.5*sin(a*8.0-uTime*(0.7+uMid)),8.0)*exp(-r*1.5);
    float core=exp(-r*r*(7.0-uBass*2.0));
    float pulse=0.35+uLevel*0.75+uBeat*0.35;
    vec3 col=mix(uColorA,uColorB,0.5+0.5*sin(a*2.0+uTime*0.2+uTreble*2.0));
    col*= (ring*0.7+rays*0.35+core*0.28)*pulse*uIntensity;
    col=vec3(1.0)-exp(-max(col,vec3(0.0))*0.9);
    gl_FragColor=vec4(col,1.0);
  }
`;

const transitionFragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uFromTexture;
  uniform sampler2D uToTexture;
  uniform float uTime;
  uniform float uTransitionMix;
  uniform float uTransitionMode;
  uniform float uTransitionSeed;
  uniform float uTransitionActive;
  uniform float uTransitionZoom;
  uniform float uBassPulse;
  uniform float uMidPulse;
  uniform float uTreblePulse;
  uniform float uBeat;
  #define PI 3.14159265359
  float hash21(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise21(vec2 p){
    vec2 i=floor(p), f=fract(p);
    f=f*f*(3.0-2.0*f);
    float a=hash21(i), b=hash21(i+vec2(1.0,0.0));
    float c=hash21(i+vec2(0.0,1.0)), d=hash21(i+vec2(1.0,1.0));
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
  }
  float fbm(vec2 p){
    float v=0.0, a=0.5;
    mat2 m=mat2(0.80,-0.60,0.60,0.80);
    for(int i=0;i<4;i++){ v+=a*noise21(p); p=m*p*2.03+7.13; a*=0.5; }
    return v;
  }
  mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
  float transitionField(vec2 p,float progress,float mode,float t){
    float e=smoothstep(0.0,1.0,progress);
    float musical=uBassPulse*0.28+uMidPulse*0.20+uTreblePulse*0.18+uBeat*0.22;
    float seed=uTransitionSeed*1.731;
    float n=fbm(p*(2.15+uTreblePulse*0.75)+vec2(seed,-seed*0.63)+vec2(t*0.045,-t*0.035));
    if(mode<0.5) return e;
    if(mode<1.5){
      float threshold=e*1.34-0.17;
      return 1.0-smoothstep(threshold-0.12-musical*0.05,threshold+0.12+musical*0.04,n);
    }
    if(mode<2.5){
      float radius=length(p);
      float edge=e*1.75-0.08+0.045*sin(radius*16.0-t*2.0-uBassPulse*4.0);
      return 1.0-smoothstep(edge-0.12-musical*0.04,edge+0.12,radius);
    }
    if(mode<3.5){
      float a=atan(p.y,p.x);
      float prism=0.5+0.5*sin(a*6.0+length(p)*7.0-t*0.65+seed+uMidPulse*2.5);
      return smoothstep(0.0,0.16,e)*smoothstep(0.64-e*0.90,0.78-e*0.56,prism+e*0.55+n*0.14);
    }
    float spiral=0.5+0.5*sin(atan(p.y,p.x)*4.0+length(p)*11.0-t*0.9-seed+uBeat*2.2);
    float field=mix(n,spiral,0.52+uMidPulse*0.18);
    return smoothstep(0.0,0.16,e)*smoothstep(0.73-e*0.98-musical*0.06,0.86-e*0.70+musical*0.04,field+e*0.48);
  }
  void main(){
    vec2 p=(vUv-0.5)*2.0;
    float progress=clamp(uTransitionMix,0.0,1.0);
    float arc=sin(progress*PI);
    float z=uTransitionZoom*arc;
    vec2 aUv=0.5+rot(-0.018*z*(0.5+uMidPulse))*(vUv-0.5)*(1.0-0.10*z);
    vec2 bUv=0.5+rot( 0.014*z*(0.5+uTreblePulse))*(vUv-0.5)*(1.0+0.13*z);
    aUv=clamp(aUv,vec2(0.0),vec2(1.0));
    bUv=clamp(bUv,vec2(0.0),vec2(1.0));
    vec3 a=texture2D(uFromTexture,aUv).rgb;
    vec3 b=texture2D(uToTexture,bUv).rgb;
    float m=uTransitionActive>0.5 ? clamp(transitionField(p,progress,uTransitionMode,uTime),0.0,1.0) : 0.0;
    vec3 col=uTransitionActive>0.5 ? mix(a,b,m) : a;
    gl_FragColor=vec4(col,1.0);
  }
`;

const QUALITY_SCALE = {
  performance: 0.72,
  high: 0.96,
  ultra: 1.18
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class VisualEngine {
  constructor(container, options = {}) {
    this.container = container;
    this.isOutput = Boolean(options.isOutput);
    this.quality = options.quality || 'high';
    this.growth = 0;
    this.logoEnabled = false;
    this.logoDataUrl = '';
    this.logoSize = 0.28;
    this.logoOpacity = 0.82;
    this.logoCopies = 1;
    this.logoSpread = 0.18;
    this.logoPosX = 0;
    this.logoPosY = 0;
    this.logoRotation = 0.35;
    this.logoMode = 'single';
    this.logoColorMode = 'original';
    this.logoBlendMode = 'normal';
    this.logoGlow = 0.22;
    this.logoFxBlink = false;
    this.logoFxPulse = false;
    this.logoFxSpin = false;
    this.logoFxColor = false;
    this.colorMix = 0.5;
    this.bloomStrength = 0.88;
    this.targetSpeed = 0.88;
    this.displaySpeed = 0.88;
    this.timePhase = 0;
    this.lastFrameTime = performance.now();
    this.patternShift = 0;
    this.lastBeatFrame = 0;
    this.logoSpinAngle = 0;
    this.currentPreset = 0;
    this.targetPreset = 0;
    this.presetInitialized = false;
    this.transitionMode = 'morph';
    this.transitionSpeed = 0;
    this.transitionSync = true;
    this.transitionZoom = 0.55;
    this.randomness = 0.48;
    this.flow = 0.58;
    this.audioZoom = 0.62;
    this.adaptiveQuality = true;
    this.adaptiveScale = 1.0;
    this.performanceFrames = 0;
    this.performanceTime = 0;
    this.lastPerformanceAdjust = performance.now();
    this.onPerformance = typeof options.onPerformance === 'function' ? options.onPerformance : null;
    this.transitionActive = false;
    this.transitionStart = 0;
    this.transitionDuration = 1.35;
    this.pendingPreset = null;
    this.pendingPresetDeadline = 0;
    this.transitionSeed = 1;
    this.runeAngle = 0;
    this.runeEchoAngle = 0;
    this.lastState = {};
    this.containerWidth = Math.max(1, container.clientWidth);
    this.containerHeight = Math.max(1, container.clientHeight);
    this.lastResizeWidth = 0;
    this.lastResizeHeight = 0;
    this.prepared = false;
    this.preparePromise = null;
    this.started = false;
    this.parallelCompileAvailable = false;
    this.failedPresets = new Set();
    this.activeRenderingPreset = null;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: false
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.debug.checkShaderErrors = true;
    this.renderer.setClearColor(0x000000, 1);
    // Boot at a conservative DPR. Full quality is applied only after the shader is compiled.
    const bootDpr = Math.max(0.60, Math.min(1.0, window.devicePixelRatio || 1));
    this.renderer.setPixelRatio(bootDpr);
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);
    container.appendChild(this.renderer.domElement);

    this.errorOverlay = document.createElement('div');
    this.errorOverlay.className = 'visual-error-overlay';
    this.errorOverlay.textContent = 'Visual engine error · revisá la consola';
    container.appendChild(this.errorOverlay);
    this.renderer.debug.onShaderError = (gl, program, vertexShaderObject, fragmentShaderObject) => {
      const vertexLog = gl.getShaderInfoLog(vertexShaderObject) || '';
      const fragmentLog = gl.getShaderInfoLog(fragmentShaderObject) || '';
      console.error('AudioReactive shader error', { preset: this.activeRenderingPreset, vertexLog, fragmentLog });
      if (Number.isInteger(this.activeRenderingPreset)) this.failedPresets.add(this.activeRenderingPreset);
      this.errorOverlay.style.display = 'flex';
      this.errorOverlay.textContent = Number.isInteger(this.activeRenderingPreset)
        ? `Preset ${this.activeRenderingPreset + 1} fallback activo · revisá consola`
        : 'Visual pipeline fallback activo · revisá consola';
      this.errorOverlay.title = `${vertexLog}
${fragmentLog}`;
    };

    this.camera = new THREE.Camera();
    this.uniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uSub: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uLevel: { value: 0 },
      uBeat: { value: 0 },
      uIntensity: { value: 1.08 },
      uContrast: { value: 1.1 },
      uZoom: { value: 1 },
      uSpeed: { value: 0.82 },
      uDensity: { value: 1.25 },
      uPreset: { value: 0 },
      uGrowth: { value: 0 },
      uSubPulse: { value: 0 },
      uBassPulse: { value: 0 },
      uMidPulse: { value: 0 },
      uTreblePulse: { value: 0 },
      uLevelPulse: { value: 0 },
      uColorMix: { value: 0.5 },
      uPatternShift: { value: 0 },
      uPresetFrom: { value: 0 },
      uPresetTo: { value: 0 },
      uTransitionMix: { value: 1 },
      uTransitionMode: { value: 0 },
      uTransitionSeed: { value: 1 },
      uTransitionActive: { value: 0 },
      uRandomness: { value: 0.48 },
      uFlow: { value: 0.58 },
      uAudioZoom: { value: 0.62 },
      uTransitionZoom: { value: 0.55 },
      uColorA: { value: new THREE.Color('#6c4cff') },
      uColorB: { value: new THREE.Color('#00d9ff') }
    };

    // Modular visual pipeline: one small shader per preset instead of one giant shader.
    // This avoids GPU compiler limits and makes startup reliable on a much wider range of GPUs.
    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.materialCache = new Map();
    this.presetScene = new THREE.Scene();
    this.fallbackMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: fallbackFragmentShader,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.presetMesh = new THREE.Mesh(this.geometry, this.getPresetMaterial(this.currentPreset));
    this.presetScene.add(this.presetMesh);

    const targetOptions = {
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    };
    this.fromTarget = new THREE.WebGLRenderTarget(16, 16, targetOptions);
    this.toTarget = new THREE.WebGLRenderTarget(16, 16, targetOptions);

    this.transitionUniforms = {
      uFromTexture: { value: this.fromTarget.texture },
      uToTexture: { value: this.toTarget.texture },
      uTime: this.uniforms.uTime,
      uTransitionMix: this.uniforms.uTransitionMix,
      uTransitionMode: this.uniforms.uTransitionMode,
      uTransitionSeed: this.uniforms.uTransitionSeed,
      uTransitionActive: this.uniforms.uTransitionActive,
      uTransitionZoom: this.uniforms.uTransitionZoom,
      uBassPulse: this.uniforms.uBassPulse,
      uMidPulse: this.uniforms.uMidPulse,
      uTreblePulse: this.uniforms.uTreblePulse,
      uBeat: this.uniforms.uBeat
    };
    this.transitionMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: transitionFragmentShader,
      uniforms: this.transitionUniforms,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.blendScene = new THREE.Scene();
    this.blendMesh = new THREE.Mesh(this.geometry, this.transitionMaterial);
    this.blendScene.add(this.blendMesh);

    // Post-processing stays lazy. The source/target render targets are cheap and ready immediately.
    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;

    this.logoWrap = document.createElement('div');
    this.logoWrap.className = 'visual-logo-layer';
    this.container.appendChild(this.logoWrap);
    this.logoNodes = [];

    this.runeWrap = document.createElement('div');
    this.runeWrap.className = 'visual-rune-layer';
    this.runeEcho = document.createElement('img');
    this.runeEcho.className = 'visual-rune visual-rune-echo';
    this.runeEcho.alt = 'Vegvísir aura';
    this.runeAssetsLoaded = false;
    this.runeNode = document.createElement('img');
    this.runeNode.className = 'visual-rune visual-rune-core';
    this.runeNode.alt = 'Vegvísir';
    this.runeWrap.appendChild(this.runeEcho);
    this.runeWrap.appendChild(this.runeNode);
    this.container.appendChild(this.runeWrap);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.clockStart = performance.now();
    this.running = false;
    this.resize();
  }

  getPresetMaterial(index) {
    const key = clamp(Math.round(index), 0, PRESET_DEFINITIONS.length - 1);
    if (this.materialCache.has(key)) return this.materialCache.get(key);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: makePresetFragmentShader(key),
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.materialCache.set(key, material);
    return material;
  }

  renderPresetToTarget(index, target) {
    const key = clamp(Math.round(index), 0, PRESET_DEFINITIONS.length - 1);
    this.activeRenderingPreset = key;
    this.presetMesh.material = this.failedPresets.has(key) ? this.fallbackMaterial : this.getPresetMaterial(key);
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.presetScene, this.camera);
    this.activeRenderingPreset = null;
  }

  setupPostProcessing() {
    if (this.composer) return;
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.blendScene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, this.container.clientWidth), Math.max(1, this.container.clientHeight)),
      0.82,
      0.55,
      0.25
    );
    this.updateBloomSettings();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
  }

  async prepare(options = {}) {
    if (this.prepared) return { ready: true, modular: true };
    if (this.preparePromise) return this.preparePromise;
    const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};

    this.preparePromise = (async () => {
      onStatus('STARTING MODULAR VISUAL ENGINE…');
      // Two frames let the UI paint first. No monolithic shader compile is performed here.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      this.presetMesh.material = this.getPresetMaterial(this.currentPreset);
      this.setupPostProcessing();
      this.applyPixelRatio();
      this.resize(true);
      this.prepared = true;
      this.start();
      onStatus('VISUAL ENGINE READY');
      return { ready: true, modular: true };
    })().catch((error) => {
      console.error('AudioReactive modular GPU prepare error:', error);
      this.errorOverlay.style.display = 'flex';
      this.errorOverlay.title = String(error?.stack || error?.message || error);
      throw error;
    }).finally(() => { this.preparePromise = null; });

    return this.preparePromise;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.running = true;
    this.lastFrameTime = performance.now();
    requestAnimationFrame(this.render);
  }

  applyPixelRatio() {
    const nativeDpr = window.devicePixelRatio || 1;
    const qualityScale = QUALITY_SCALE[this.quality] ?? 1;
    const maxRatio = this.isOutput ? 2.20 : 1.75;
    const ratio = Math.max(0.58, Math.min(maxRatio, nativeDpr * qualityScale * this.adaptiveScale));
    this.renderer.setPixelRatio(ratio);
    if (this.composer?.setPixelRatio) this.composer.setPixelRatio(ratio);
    return ratio;
  }

  updateBloomSettings() {
    if (!this.bloomPass) return;
    const qualityGain = this.quality === 'performance' ? 0.72 : this.quality === 'ultra' ? 1.05 : 0.92;
    this.bloomPass.strength = this.bloomStrength * qualityGain;
    this.bloomPass.radius = this.quality === 'performance' ? 0.46 : this.quality === 'ultra' ? 0.62 : 0.55;
    this.bloomPass.threshold = this.quality === 'performance' ? 0.29 : 0.25;
  }

  setQuality(quality) {
    if (!QUALITY_SCALE[quality] || quality === this.quality) return;
    this.quality = quality;
    this.adaptiveScale = Math.min(1, this.adaptiveScale);
    this.applyPixelRatio();
    this.updateBloomSettings();
    this.resize(true);
  }

  setAdaptiveQuality(enabled) {
    this.adaptiveQuality = Boolean(enabled);
    if (!this.adaptiveQuality && this.adaptiveScale !== 1) {
      this.adaptiveScale = 1;
      this.applyPixelRatio();
      this.resize(true);
    }
  }

  updatePerformance(dt, now) {
    this.performanceFrames += 1;
    this.performanceTime += dt;
    if (this.performanceTime < 1.0) return;
    const fps = this.performanceFrames / Math.max(0.001, this.performanceTime);
    let changed = false;
    if (this.adaptiveQuality && now - this.lastPerformanceAdjust > 1100) {
      if (fps < 48 && this.adaptiveScale > 0.62) {
        this.adaptiveScale = Math.max(0.62, this.adaptiveScale - 0.08);
        changed = true;
      } else if (fps > 58.5 && this.adaptiveScale < 1.0) {
        this.adaptiveScale = Math.min(1.0, this.adaptiveScale + 0.04);
        changed = true;
      }
      if (changed) {
        this.lastPerformanceAdjust = now;
        this.applyPixelRatio();
        this.resize(true);
      }
    }
    this.onPerformance?.({ fps, adaptiveScale: this.adaptiveScale, pixelRatio: this.renderer.getPixelRatio(), quality: this.quality });
    this.performanceFrames = 0;
    this.performanceTime = 0;
  }

  setLogo(dataUrl) {
    this.logoDataUrl = dataUrl || '';
    this.ensureLogoNodes();
  }

  ensureLogoNodes() {
    const count = Math.max(1, Math.min(12, Math.round(this.logoCopies || 1)));
    while (this.logoNodes.length < count) {
      const node = document.createElement('img');
      node.className = 'visual-logo';
      node.alt = 'Overlay visual';
      node.draggable = false;
      node.decoding = 'async';
      node.addEventListener('load', () => {
        const ratio = node.naturalWidth && node.naturalHeight ? node.naturalWidth / node.naturalHeight : 1;
        node.dataset.aspect = String(Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
      });
      this.logoWrap.appendChild(node);
      this.logoNodes.push(node);
    }
    while (this.logoNodes.length > count) {
      const node = this.logoNodes.pop();
      node.remove();
    }
    this.logoNodes.forEach((node) => {
      if (this.logoDataUrl) node.src = this.logoDataUrl;
      else node.removeAttribute('src');
    });
  }

  setState(state = {}) {
    this.lastState = { ...this.lastState, ...state };
    const u = this.uniforms;
    if (state.sub != null) u.uSub.value += (state.sub - u.uSub.value) * 0.32;
    if (state.bass != null) u.uBass.value += (state.bass - u.uBass.value) * 0.32;
    if (state.mid != null) u.uMid.value += (state.mid - u.uMid.value) * 0.26;
    if (state.treble != null) u.uTreble.value += (state.treble - u.uTreble.value) * 0.28;
    if (state.level != null) u.uLevel.value += (state.level - u.uLevel.value) * 0.30;
    if (state.beat != null) u.uBeat.value = Math.max(state.beat, u.uBeat.value * 0.84);
    if (state.subPulse != null) u.uSubPulse.value = Math.max(state.subPulse, u.uSubPulse.value * 0.87);
    if (state.bassPulse != null) u.uBassPulse.value = Math.max(state.bassPulse, u.uBassPulse.value * 0.88);
    if (state.midPulse != null) u.uMidPulse.value = Math.max(state.midPulse, u.uMidPulse.value * 0.86);
    if (state.treblePulse != null) u.uTreblePulse.value = Math.max(state.treblePulse, u.uTreblePulse.value * 0.84);
    if (state.levelPulse != null) u.uLevelPulse.value = Math.max(state.levelPulse, u.uLevelPulse.value * 0.87);

    const signal = Math.max(u.uLevel.value, u.uBeat.value * 0.7, u.uBass.value * 0.55);
    const targetGrowth = signal > 0.045 ? Math.min(1, signal * 1.78 + 0.10) : 0;
    this.growth += (targetGrowth - this.growth) * (signal > 0.045 ? 0.060 : 0.060);
    this.growth = clamp(this.growth, 0, 1);
    u.uGrowth.value = this.growth;

    if (state.intensity != null) u.uIntensity.value = Number(state.intensity);
    if (state.contrast != null) u.uContrast.value = Number(state.contrast);
    if (state.zoom != null) u.uZoom.value = Number(state.zoom);
    if (state.speed != null) this.targetSpeed = Number(state.speed);
    if (state.density != null) u.uDensity.value = Number(state.density);
    if (state.transitionMode != null) this.transitionMode = String(state.transitionMode);
    if (state.transitionSpeed != null) this.transitionSpeed = clamp(Number(state.transitionSpeed), -10, 10);
    if (state.transitionSync != null) this.transitionSync = Boolean(state.transitionSync);
    if (state.transitionZoom != null) { this.transitionZoom = clamp(Number(state.transitionZoom), 0, 1.5); u.uTransitionZoom.value = this.transitionZoom; }
    if (state.randomness != null) { this.randomness = clamp(Number(state.randomness), 0, 1); u.uRandomness.value = this.randomness; }
    if (state.flow != null) { this.flow = clamp(Number(state.flow), 0, 1.5); u.uFlow.value = this.flow; }
    if (state.audioZoom != null) { this.audioZoom = clamp(Number(state.audioZoom), 0, 1.5); u.uAudioZoom.value = this.audioZoom; }
    if (state.adaptiveQuality != null) this.setAdaptiveQuality(state.adaptiveQuality);
    if (state.preset != null) this.queuePreset(Number(state.preset));
    if (state.colorA) u.uColorA.value.set(state.colorA);
    if (state.colorB) u.uColorB.value.set(state.colorB);
    if (state.colorMix != null) { this.colorMix = Number(state.colorMix); u.uColorMix.value = this.colorMix; }
    if (state.quality) this.setQuality(state.quality);
    if (state.bloom != null) {
      this.bloomStrength = clamp(Number(state.bloom), 0, 1.65);
      this.updateBloomSettings();
    }

    const logoCopiesChanged = state.logoCopies != null && Number(state.logoCopies) !== this.logoCopies;
    if (state.logoEnabled != null) this.logoEnabled = Boolean(state.logoEnabled);
    if (state.logoSize != null) this.logoSize = Number(state.logoSize);
    if (state.logoOpacity != null) this.logoOpacity = Number(state.logoOpacity);
    if (state.logoCopies != null) this.logoCopies = Number(state.logoCopies);
    if (state.logoSpread != null) this.logoSpread = Number(state.logoSpread);
    if (state.logoPosX != null) this.logoPosX = Number(state.logoPosX);
    if (state.logoPosY != null) this.logoPosY = Number(state.logoPosY);
    if (state.logoRotation != null) this.logoRotation = Number(state.logoRotation);
    if (state.logoMode != null) this.logoMode = String(state.logoMode);
    if (state.logoColorMode != null) this.logoColorMode = String(state.logoColorMode);
    if (state.logoBlendMode != null) this.logoBlendMode = String(state.logoBlendMode);
    if (state.logoGlow != null) this.logoGlow = clamp(Number(state.logoGlow), 0, 1);
    if (state.logoFxBlink != null) this.logoFxBlink = Boolean(state.logoFxBlink);
    if (state.logoFxPulse != null) this.logoFxPulse = Boolean(state.logoFxPulse);
    if (state.logoFxSpin != null) this.logoFxSpin = Boolean(state.logoFxSpin);
    if (state.logoFxColor != null) this.logoFxColor = Boolean(state.logoFxColor);
    if (state.logoDataUrl !== undefined && state.logoDataUrl !== this.logoDataUrl) this.setLogo(state.logoDataUrl);
    else if (logoCopiesChanged) this.ensureLogoNodes();
  }

  transitionModeIndex() {
    const modes = { morph: 0, dissolve: 1, radial: 2, prism: 3, ecosystem: 4 };
    return modes[this.transitionMode] ?? 0;
  }

  transitionDurationFromSpeed() {
    // -10 ≈ 5.4 s · 0 ≈ 1.35 s · +10 ≈ 0.34 s
    return clamp(1.35 * Math.pow(2, -this.transitionSpeed / 5), 0.28, 5.8);
  }

  queuePreset(nextPreset) {
    const next = clamp(Math.round(nextPreset), 0, 18);
    if (!this.presetInitialized) {
      this.presetInitialized = true;
      this.currentPreset = next;
      this.targetPreset = next;
      this.uniforms.uPreset.value = next;
      this.uniforms.uPresetFrom.value = next;
      this.uniforms.uPresetTo.value = next;
      this.uniforms.uTransitionMix.value = 1;
      this.uniforms.uTransitionActive.value = 0;
      return;
    }
    if (next === this.targetPreset && (this.transitionActive || this.pendingPreset == null)) return;
    if (this.pendingPreset === next) return;
    this.pendingPreset = next;
    const hasSignal = this.uniforms.uLevel.value > 0.045;
    this.pendingPresetDeadline = performance.now() + (this.transitionSync && hasSignal ? 360 : 0);
  }

  startPresetTransition(nextPreset, now = performance.now()) {
    const next = clamp(Math.round(nextPreset), 0, 18);
    if (this.transitionActive && this.uniforms.uTransitionMix.value > 0.55) this.currentPreset = this.targetPreset;
    this.targetPreset = next;
    this.transitionActive = this.currentPreset !== this.targetPreset;
    this.transitionStart = now;
    this.transitionDuration = this.transitionDurationFromSpeed();
    this.transitionSeed = (this.currentPreset + 1) * 17.31 + (this.targetPreset + 1) * 29.73;
    this.uniforms.uPreset.value = next;
    this.uniforms.uPresetFrom.value = this.currentPreset;
    this.uniforms.uPresetTo.value = this.targetPreset;
    this.uniforms.uTransitionMode.value = this.transitionModeIndex();
    this.uniforms.uTransitionSeed.value = this.transitionSeed;
    this.uniforms.uTransitionMix.value = this.transitionActive ? 0 : 1;
    this.uniforms.uTransitionActive.value = this.transitionActive ? 1 : 0;
    this.pendingPreset = null;
  }

  updateTransition(now) {
    if (this.pendingPreset != null) {
      const strongBeat = this.uniforms.uBeat.value > 0.68;
      const quiet = this.uniforms.uLevel.value < 0.045;
      if (!this.transitionSync || strongBeat || quiet || now >= this.pendingPresetDeadline) {
        this.startPresetTransition(this.pendingPreset, now);
      }
    }
    if (!this.transitionActive) return;
    const elapsed = (now - this.transitionStart) / 1000;
    let p = clamp(elapsed / Math.max(0.001, this.transitionDuration), 0, 1);
    // Smoothstep timing. Audio changes the spatial transition field, not the timeline itself.
    p = p*p*(3-2*p);
    this.uniforms.uTransitionMix.value = p;
    this.uniforms.uTransitionMode.value = this.transitionModeIndex();
    if (p >= 0.999) {
      this.currentPreset = this.targetPreset;
      this.transitionActive = false;
      this.uniforms.uPresetFrom.value = this.currentPreset;
      this.uniforms.uPresetTo.value = this.currentPreset;
      this.uniforms.uTransitionMix.value = 1;
      this.uniforms.uTransitionActive.value = 0;
    }
  }

  resize(force = false) {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    if (!force && width === this.lastResizeWidth && height === this.lastResizeHeight) return;
    this.lastResizeWidth = width;
    this.lastResizeHeight = height;
    this.containerWidth = width;
    this.containerHeight = height;
    this.renderer.setSize(width, height, false);
    const ratio = this.renderer.getPixelRatio();
    const targetW = Math.max(1, Math.round(width * ratio));
    const targetH = Math.max(1, Math.round(height * ratio));
    this.fromTarget?.setSize(targetW, targetH);
    this.toTarget?.setSize(targetW, targetH);
    this.composer?.setSize(width, height);
    this.bloomPass?.setSize(width, height);
    this.uniforms.uResolution.value.set(width * ratio, height * ratio);
  }

  updateLogos(time) {
    const active = this.logoEnabled && this.logoDataUrl;
    if (!active) {
      this.logoWrap.style.opacity = '0';
      return;
    }
    if (!this.logoNodes.length || this.logoNodes.length !== Math.max(1, Math.min(12, Math.round(this.logoCopies || 1)))) {
      this.ensureLogoNodes();
    }

    const beat = this.uniforms.uBeat.value;
    const level = this.uniforms.uLevel.value;
    const bassPulse = this.uniforms.uBassPulse.value;
    const midPulse = this.uniforms.uMidPulse.value;
    const treblePulse = this.uniforms.uTreblePulse.value;

    // Opacity is now literal by default. Audio only modulates it when Titilar is enabled.
    let layerOpacity = clamp(this.logoOpacity, 0, 1);
    if (this.logoFxBlink) {
      const musicalBlink = clamp(0.48 + beat * 0.36 + treblePulse * 0.42 + level * 0.08, 0.32, 1);
      layerOpacity *= musicalBlink;
    }
    this.logoWrap.style.opacity = `${layerOpacity.toFixed(3)}`;
    this.logoWrap.style.mixBlendMode = this.logoBlendMode || 'normal';

    const baseX = 50 + this.logoPosX * 38;
    const baseY = 50 + this.logoPosY * 38;
    const spread = this.logoSpread * 38;
    const count = this.logoNodes.length;
    const maxDimension = Math.max(10, Math.min(this.containerWidth, this.containerHeight) * clamp(this.logoSize, 0.02, 1));
    const hueBase = (time * 14 + bassPulse * 160 + treblePulse * 240 + midPulse * 70) % 360;
    const glowPx = 2 + this.logoGlow * 24;
    const glowAlpha = 0.04 + this.logoGlow * 0.30;

    this.logoNodes.forEach((node, index) => {
      let dx = 0;
      let dy = 0;
      const progress = count <= 1 ? 0 : index / Math.max(1, count - 1);

      if (this.logoMode === 'ring') {
        const ang = (index / Math.max(1, count)) * Math.PI * 2.0;
        dx = Math.cos(ang) * spread;
        dy = Math.sin(ang) * spread;
      } else if (this.logoMode === 'line') {
        dx = (progress - 0.5) * spread * 2.25;
      } else if (this.logoMode === 'mirror') {
        const signs = [[-1,-1],[1,-1],[-1,1],[1,1]][index % 4] || [1,1];
        const shell = 0.44 + Math.floor(index / 4) * 0.25;
        dx = signs[0] * spread * shell;
        dy = signs[1] * spread * shell;
      } else if (this.logoMode === 'stack') {
        dy = (progress - 0.5) * spread * 2.25;
      }

      // Copies stay stable; subtle musical sway only when there is more than one copy.
      if (count > 1) {
        const sway = midPulse * 0.85 + treblePulse * 0.55;
        dx += Math.sin(time * 0.65 + index * 0.8) * sway;
        dy += Math.cos(time * 0.58 + index * 0.7) * sway * 0.72;
      }

      const scaleBoost = this.logoFxPulse ? (1 + bassPulse * 0.22 + beat * 0.13 + level * 0.05) : 1;
      const scale = scaleBoost;
      const rot = this.logoSpinAngle + (this.logoMode === 'single' ? 0 : index * 7);
      const hue = this.logoFxColor ? (hueBase + index * (360 / Math.max(1, count))) : 0;

      // Preserve the source aspect ratio. "Size" controls the largest dimension.
      const aspect = Math.max(0.05, Number(node.dataset.aspect) || (node.naturalWidth && node.naturalHeight ? node.naturalWidth / node.naturalHeight : 1));
      let widthPx;
      let heightPx;
      if (aspect >= 1) {
        widthPx = maxDimension;
        heightPx = maxDimension / aspect;
      } else {
        heightPx = maxDimension;
        widthPx = maxDimension * aspect;
      }

      node.style.left = `${baseX + dx}%`;
      node.style.top = `${baseY + dy}%`;
      node.style.width = `${Math.max(2, widthPx).toFixed(1)}px`;
      node.style.height = `${Math.max(2, heightPx).toFixed(1)}px`;
      node.style.opacity = '1';
      node.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;

      const shadow = `drop-shadow(0 0 ${glowPx.toFixed(1)}px rgba(255,255,255,${glowAlpha.toFixed(3)}))`;
      if (this.logoColorMode === 'white') {
        const colorShift = this.logoFxColor ? ` hue-rotate(${hue.toFixed(1)}deg)` : '';
        node.style.filter = `brightness(0) invert(1)${colorShift} brightness(${(1.0 + level*0.08).toFixed(2)}) ${shadow}`;
      } else if (this.logoColorMode === 'reactive') {
        const reactiveHue = this.logoFxColor ? hue : (205 + this.colorMix * 110);
        node.style.filter = `brightness(0) saturate(100%) invert(72%) sepia(82%) saturate(${(4.2 + treblePulse*2.4).toFixed(2)}) hue-rotate(${reactiveHue.toFixed(1)}deg) brightness(${(1.0 + level*0.10 + beat*0.08).toFixed(2)}) ${shadow}`;
      } else {
        // ORIGINAL: never flatten the RGB channels. Photos and arbitrary PNG/WebP stay intact.
        const hueShift = this.logoFxColor ? `hue-rotate(${hue.toFixed(1)}deg)` : 'hue-rotate(0deg)';
        node.style.filter = `${hueShift} saturate(${(1.0 + (this.logoFxColor ? treblePulse*0.22 : 0)).toFixed(2)}) brightness(${(1.0 + level*0.035).toFixed(2)}) ${shadow}`;
      }
    });
  }

  updateRunes(time, dt = 1/60) {
    if (!this.runeAssetsLoaded) {
      const fromPreset = Math.round(this.uniforms.uPresetFrom.value);
      const toPreset = Math.round(this.uniforms.uPresetTo.value);
      const mix = this.uniforms.uTransitionMix.value;
      const runeWeight = this.transitionActive
        ? ((fromPreset === 7 ? 1-mix : 0) + (toPreset === 7 ? mix : 0))
        : (this.currentPreset === 7 ? 1 : 0);
      if (runeWeight > 0.01) {
        this.runeEcho.src = vegvisirUrl;
        this.runeNode.src = vegvisirUrl;
        this.runeAssetsLoaded = true;
      }
    }
    const fromPreset = Math.round(this.uniforms.uPresetFrom.value);
    const toPreset = Math.round(this.uniforms.uPresetTo.value);
    const mix = this.uniforms.uTransitionMix.value;
    const runeWeight = this.transitionActive
      ? ((fromPreset === 7 ? 1-mix : 0) + (toPreset === 7 ? mix : 0))
      : (this.currentPreset === 7 ? 1 : 0);
    const active = runeWeight > 0.01;
    if (!active) {
      this.runeWrap.style.opacity = '0';
      return;
    }

    const bass = this.uniforms.uBass.value;
    const mid = this.uniforms.uMid.value;
    const treble = this.uniforms.uTreble.value;
    const bassPulse = this.uniforms.uBassPulse.value;
    const midPulse = this.uniforms.uMidPulse.value;
    const treblePulse = this.uniforms.uTreblePulse.value;
    const level = this.uniforms.uLevel.value;
    const beat = this.uniforms.uBeat.value;
    const gate = clamp((level - 0.028) * 5.5 + beat * 0.55 + bassPulse * 0.22, 0, 1) * this.growth;

    // Low frequencies make the symbol breathe, mids drive its rotation, highs excite the aura.
    const targetSpin = (0.9 + mid*1.8 + midPulse*2.6) * (0.55 + level*0.55);
    this.runeAngle += dt * targetSpin * 10.0;
    this.runeEchoAngle -= dt * (0.45 + treble*1.2 + treblePulse*2.0) * 8.0;

    const coreScale = 0.82 + bass*0.055 + bassPulse*0.13 + beat*0.055;
    const echoScale = coreScale * (1.04 + treblePulse*0.08 + beat*0.035);
    const opacity = clamp(gate * 0.88 * runeWeight, 0, 0.90);
    const echoOpacity = clamp(gate * (0.20 + treblePulse*0.34 + beat*0.14) * runeWeight, 0, 0.55);
    const hue = (time * 8 + bassPulse * 80 + midPulse * 120 + treblePulse * 210) % 360;
    const sat = 0.20 + treblePulse * 1.3;
    const bright = 1.05 + level*0.12 + beat*0.10;

    this.runeWrap.style.opacity = `${opacity.toFixed(3)}`;
    this.runeNode.style.opacity = '1';
    this.runeNode.style.transform = `translate(-50%, -50%) scale(${coreScale.toFixed(3)}) rotate(${this.runeAngle.toFixed(2)}deg)`;
    this.runeNode.style.filter = `brightness(0) saturate(100%) invert(78%) sepia(85%) saturate(${(4.2 + treblePulse*3.0).toFixed(2)}) hue-rotate(${hue.toFixed(1)}deg) brightness(${bright.toFixed(2)}) drop-shadow(0 0 18px rgba(255,255,255,0.18))`;

    this.runeEcho.style.opacity = `${echoOpacity.toFixed(3)}`;
    this.runeEcho.style.transform = `translate(-50%, -50%) scale(${echoScale.toFixed(3)}) rotate(${this.runeEchoAngle.toFixed(2)}deg)`;
    this.runeEcho.style.filter = `brightness(0) saturate(100%) invert(74%) sepia(90%) saturate(${(5.2 + treblePulse*3.5).toFixed(2)}) hue-rotate(${(hue+55).toFixed(1)}deg) brightness(${(bright+0.03).toFixed(2)}) blur(${(0.4 + treblePulse*1.2).toFixed(2)}px) drop-shadow(0 0 28px rgba(255,255,255,0.20))`;
  }

  render = () => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    this.updatePerformance(dt, now);

    this.displaySpeed += (this.targetSpeed - this.displaySpeed) * Math.min(1, dt * 8.0);
    const speedCurve = Math.pow(Math.max(0.01, this.displaySpeed), 0.92);
    this.timePhase += dt * speedCurve;
    this.uniforms.uTime.value = this.timePhase;
    this.uniforms.uSpeed.value = this.displaySpeed;
    this.updateTransition(now);

    const beatNow = this.uniforms.uBeat.value > 0.88 && this.lastBeatFrame <= 0.88;
    if (beatNow) {
      this.patternShift += (0.26 + this.randomness*0.72) * (0.62 + this.uniforms.uBassPulse.value * 0.95 + this.uniforms.uMidPulse.value * 0.48 + this.uniforms.uTreblePulse.value * 0.62);
    }
    this.lastBeatFrame = this.uniforms.uBeat.value;
    const signalFlow = clamp((this.uniforms.uLevel.value - 0.025) * 7.0, 0, 1);
    this.patternShift += dt * signalFlow * (0.012 + this.randomness*0.040 + this.uniforms.uMidPulse.value * 0.08 + this.uniforms.uTreblePulse.value * 0.035);
    this.uniforms.uPatternShift.value += (this.patternShift - this.uniforms.uPatternShift.value) * Math.min(1, dt * 3.2);

    if (this.logoFxSpin) {
      this.logoSpinAngle += dt * (8 + this.logoRotation * 22) * (0.65 + this.uniforms.uMidPulse.value * 0.5 + this.uniforms.uLevel.value * 0.2);
    }

    this.uniforms.uBeat.value *= 0.925;
    this.uniforms.uSubPulse.value *= 0.90;
    this.uniforms.uBassPulse.value *= 0.91;
    this.uniforms.uMidPulse.value *= 0.89;
    this.uniforms.uTreblePulse.value *= 0.87;
    this.uniforms.uLevelPulse.value *= 0.90;

    this.updateLogos(this.timePhase);
    this.updateRunes(this.timePhase, dt);

    if (this.transitionActive) {
      // Two compact preset shaders are evaluated only during the transition.
      this.renderPresetToTarget(this.currentPreset, this.fromTarget);
      this.renderPresetToTarget(this.targetPreset, this.toTarget);
      this.transitionUniforms.uFromTexture.value = this.fromTarget.texture;
      this.transitionUniforms.uToTexture.value = this.toTarget.texture;
      this.renderer.setRenderTarget(null);
      if (this.renderPass) this.renderPass.scene = this.blendScene;
      if (this.composer) this.composer.render();
      else this.renderer.render(this.blendScene, this.camera);
    } else {
      // Fast path: one preset shader + bloom. No extra render-target copy.
      const key = clamp(Math.round(this.currentPreset), 0, PRESET_DEFINITIONS.length - 1);
      this.activeRenderingPreset = key;
      this.presetMesh.material = this.failedPresets.has(key) ? this.fallbackMaterial : this.getPresetMaterial(key);
      this.renderer.setRenderTarget(null);
      if (this.renderPass) this.renderPass.scene = this.presetScene;
      if (this.composer) this.composer.render();
      else this.renderer.render(this.presetScene, this.camera);
      this.activeRenderingPreset = null;
    }
    requestAnimationFrame(this.render);
  };
}
