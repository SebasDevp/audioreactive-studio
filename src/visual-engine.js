import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

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
  uniform float uSubAtt;
  uniform float uBassAtt;
  uniform float uMidAtt;
  uniform float uTrebleAtt;
  uniform float uLevelAtt;
  uniform float uFlux;
  uniform float uCentroid;
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
  uniform float uSceneSeed;
  uniform float uFrameRandom;
  uniform float uTreeGrowth;
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
    float phase = t*2.35 + uTime*0.035 + uPatternShift*0.14 + uMidPulse*0.16 + uMidAtt*0.20 + uSceneSeed*0.11;
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
  { name: 'matrixLattice', glsl: String.raw`
  float digitalGlyph(vec2 p, float seed){
    p.x *= 1.18;
    float hTop = glowLine(sdSegment(p, vec2(-0.16, 0.29), vec2(0.16, 0.29)), 0.018) * step(0.36, hash11(seed+1.0));
    float hMid = glowLine(sdSegment(p, vec2(-0.15, 0.00), vec2(0.15, 0.00)), 0.018) * step(0.42, hash11(seed+2.0));
    float hBot = glowLine(sdSegment(p, vec2(-0.16,-0.29), vec2(0.16,-0.29)), 0.018) * step(0.38, hash11(seed+3.0));
    float vLT  = glowLine(sdSegment(p, vec2(-0.17, 0.27), vec2(-0.17, 0.03)), 0.016) * step(0.44, hash11(seed+4.0));
    float vLB  = glowLine(sdSegment(p, vec2(-0.17,-0.03), vec2(-0.17,-0.27)), 0.016) * step(0.46, hash11(seed+5.0));
    float vRT  = glowLine(sdSegment(p, vec2( 0.17, 0.27), vec2(0.17, 0.03)), 0.016) * step(0.43, hash11(seed+6.0));
    float vRB  = glowLine(sdSegment(p, vec2( 0.17,-0.03), vec2(0.17,-0.27)), 0.016) * step(0.45, hash11(seed+7.0));
    float diagA = glowLine(sdSegment(p, vec2(-0.13,0.24), vec2(0.13,-0.24)),0.014) * step(0.72,hash11(seed+8.0));
    float diagB = glowLine(sdSegment(p, vec2(0.13,0.24), vec2(-0.13,-0.24)),0.014) * step(0.76,hash11(seed+9.0));
    float dot = exp(-dot(p-vec2(0.0,-0.36),p-vec2(0.0,-0.36))*900.0) * step(0.72,hash11(seed+10.0));
    return min(1.65, hTop+hMid+hBot+vLT+vLB+vRT+vRB+diagA+diagB+dot);
  }

  vec3 matrixLattice(vec2 p, float t){
    float speedRatio = max(0.01, uSpeed / 0.88);
    float matrixTempo = clamp(pow(speedRatio, 1.62), 0.022, 2.65);
    float mt = t * matrixTempo;

    float columns = 15.0 + floor(uDensity*4.0);
    float rows = 16.0 + floor(uDensity*3.0);
    float xCell = (p.x + 1.55) * columns;
    float colId = floor(xCell);
    float gx = fract(xCell) - 0.5;

    float mutationBand = floor(uPatternShift*(0.30 + uRandomness*1.10));
    float colSeed = hash11(colId*3.71 + mutationBand*9.17);
    float dropRate = 0.095 + colSeed*0.23 + uTrebleAtt*0.045 + uFlow*0.018;

    float headY = 1.36 - mod(mt*dropRate + colSeed*5.8, 2.78);
    float trailDistance = mod(headY - p.y + 2.78, 2.78);
    float trail = exp(-trailDistance*(1.65 + uDensity*0.18));
    float head = exp(-trailDistance*23.0);

    float yFlow = (p.y + mt*dropRate + colSeed*1.7) * rows;
    float rowId = floor(yFlow);
    float gy = fract(yFlow) - 0.5;
    vec2 gp = vec2(gx*0.78, gy*0.74);
    float glyphSeed = colId*31.7 + rowId*7.13 + mutationBand*(0.72+uRandomness*1.25);
    float glyph = digitalGlyph(gp, glyphSeed);

    float flickerStep = floor(mt*(0.55 + uTrebleAtt*0.85) + uPatternShift*0.08);
    float flicker = 0.78 + 0.22*hash11(glyphSeed + flickerStep);
    float rain = glyph * flicker * (0.08 + trail*1.02 + head*1.42);

    float phosphor = glowLine(gx,0.017) * trail * 0.065;
    float spark = exp(-dot(gp,gp)*110.0)
      * step(0.92-uRandomness*0.05,hash11(glyphSeed+44.0))
      * (0.10+uTreblePulse*0.58+uFlux*0.35);
    float scan = glowLine(fract((p.y-mt*0.018)*14.0)-0.5,0.022)*0.013;

    vec3 matrixGreen = vec3(0.035,0.92,0.24);
    vec3 headGreen = vec3(0.76,1.0,0.84);
    vec3 tinted = mix(matrixGreen, palette(0.16+p.y*0.045+mt*0.006), 0.06 + uColorMix*0.18);
    vec3 col = tinted * (rain + phosphor + scan);
    col += headGreen * glyph * head * (0.20 + uBeat*0.18);
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
  { name: 'frequencyTree', glsl: String.raw`
  float treeTrunkField(vec2 p, float t){
    float body = 0.0;
    vec2 prev = vec2(0.0,-1.08);
    for(int i=0;i<8;i++){
      float fi=float(i);
      float k=(fi+1.0)/8.0;
      float sway=sin(t*0.16+fi*0.58+uPatternShift*0.018)*(0.004+uMidAtt*0.018+uFlow*0.010);
      vec2 next=vec2(sway*k*k, mix(-1.08,0.27,k));
      float width=mix(0.078,0.022,k)*(0.94+uBassAtt*0.24+uSubAtt*0.10);
      body += glowLine(sdSegment(p,prev,next),width)*(1.08-k*0.20);
      prev=next;
    }
    float core=glowLine(sdSegment(p,vec2(0.0,-1.02),vec2(0.0,0.18)),0.024)*(0.24+uBassPulse*0.16);
    return body+core;
  }

  float treeBranchField(vec2 p, float t){
    float field=0.0;
    float crownEnergy=clamp(uBassAtt*0.34+uMidAtt*0.58+uTrebleAtt*0.90+uFlux*0.48,0.0,1.65);
    float livingGrow=max(0.0,uTreeGrowth);
    for(int b=0;b<12;b++){
      float fb=float(b);
      float side=-1.0;
      if(b>=6) side=1.0;
      float local=mod(fb,6.0);
      float seed=hash11(fb*17.71+uSceneSeed*41.3+floor(uPatternShift*(0.08+uRandomness*0.42))*5.73);
      float seed2=hash11(fb*29.17+uSceneSeed*13.9+3.17);
      float originY=-0.18+local*0.085+seed2*0.055;
      vec2 prev=vec2(0.0,originY);
      float baseAngle=side*(0.46+local*0.075+seed*0.18);
      float lane=mod(fb,3.0);
      float bandDrive=uBassAtt*0.55+uBassPulse*0.36;
      if(lane>0.5) bandDrive=uMidAtt*0.68+uMidPulse*0.44;
      if(lane>1.5) bandDrive=uTrebleAtt*0.82+uTreblePulse*0.58+uFlux*0.28;
      float branchGrow=livingGrow*(0.62+seed*0.34)+bandDrive*(0.72+seed2*0.40)+crownEnergy*0.22;
      float segmentBase=(0.105+seed*0.032)*(1.0+min(livingGrow,10.0)*0.055);
      float angle=baseAngle;
      vec2 endpoint=prev;
      float endpointVis=0.0;
      for(int j=0;j<8;j++){
        float fj=float(j);
        float stage=fj*0.42+local*0.055;
        float visible=smoothstep(stage-0.20,stage+0.12,branchGrow);
        float audioTurn=(uMidPulse*(seed-0.5)*0.10+uTreblePulse*(seed2-0.5)*0.14+uFlux*(seed-0.5)*0.10);
        float wave=sin(t*(0.12+seed*0.09)+fj*0.72+fb*0.61)*(0.010+uFlow*0.030+crownEnergy*0.012);
        angle += side*(0.018+seed2*0.010)+audioTurn+wave;
        vec2 dir=vec2(sin(angle),cos(angle));
        vec2 next=prev+dir*segmentBase*(0.93+fj*0.045);
        float taper=mix(0.017,0.0042,fj/7.0);
        field += glowLine(sdSegment(p,prev,next),taper)*visible*(0.96-fj*0.045);

        if(j==2 || j==5){
          float twigVis=visible*smoothstep(stage+0.05,stage+0.42,branchGrow);
          float twigSide=-side;
          if(mod(fj+fb,2.0)>0.5) twigSide=side;
          float twigAngle=angle+twigSide*(0.46+seed2*0.24);
          vec2 twigEnd=next+vec2(sin(twigAngle),cos(twigAngle))*segmentBase*(0.72+seed*0.28);
          field += glowLine(sdSegment(p,next,twigEnd),taper*0.58)*twigVis*0.62;
        }
        prev=next;
        endpoint=next;
        endpointVis=visible;
      }
      float bud=exp(-dot(p-endpoint,p-endpoint)/(0.0012+uTrebleAtt*0.0014));
      field += bud*endpointVis*(0.020+uTreblePulse*0.050+uFlux*0.025);
    }
    return field;
  }

  float treeRootField(vec2 p, float t){
    float roots=0.0;
    for(int i=0;i<7;i++){
      float fi=float(i);
      float seed=hash11(fi*19.3+uSceneSeed*7.1);
      float side=-1.0;
      if(i>=4) side=1.0;
      float angle=side*(0.32+seed*0.62);
      vec2 prev=vec2((seed-0.5)*0.018,-0.98);
      float len=0.30+uSubAtt*0.28+uBassAtt*0.14;
      for(int j=0;j<4;j++){
        float fj=float(j);
        angle += side*(seed-0.5)*0.055+sin(t*0.12+fi+fj)*0.010;
        vec2 next=prev+vec2(sin(angle),-abs(cos(angle)))*(len/4.0)*(0.92+fj*0.06);
        roots += glowLine(sdSegment(p,prev,next),mix(0.016,0.005,fj/3.0))*(0.34+uSubPulse*0.28);
        prev=next;
      }
    }
    return roots;
  }

  vec3 frequencyTree(vec2 uv, float t){
    vec2 p=uv;
    float body=treeTrunkField(p,t);
    float branches=treeBranchField(p,t);
    float roots=treeRootField(p,t);

    float crownMask=smoothstep(-0.30,0.55,p.y)*(1.0-smoothstep(0.78,1.72,abs(p.x)));
    float leaves=dust(p*vec2(0.92,0.86)+vec2(uPatternShift*0.0018,-t*0.006),t*0.12,uDensity*(0.54+uRandomness*0.22));
    leaves*=crownMask*(0.035+uTrebleAtt*0.19+uTreblePulse*0.34+uFlux*0.16);

    float crownHalo=circleLine(p-vec2(0.0,0.08),0.72+uBassAtt*0.035,0.006)*0.030;
    crownHalo+=circleLine(p-vec2(0.0,0.08),0.50+uMidAtt*0.025,0.005)*0.022;
    float heart=exp(-dot(p-vec2(0.0,-0.28),p-vec2(0.0,-0.28))*(58.0-uBassPulse*9.0))*(0.06+uBassPulse*0.18+uBeat*0.08);

    vec3 wood=mix(vec3(0.30,0.115,0.055),palette(0.10+uPatternShift*0.004),0.40);
    vec3 living=mix(vec3(0.24,0.84,0.54),palette(0.60+uCentroid*0.22),0.44);
    vec3 aura=mix(vec3(0.55,0.82,1.0),palette(0.90),0.34);
    vec3 col=wood*(body*0.82+roots*0.68+heart);
    col+=living*(branches*0.72+leaves);
    col+=aura*crownHalo*(0.36+uTrebleAtt*0.24+uFlux*0.14);
    return col;
  }
` },
  { name: 'auroraVeil', glsl: String.raw`  vec3 auroraVeil(vec2 p, float t){
    vec2 q=p;
    float drift=t*(0.13+uFlow*0.06);
    float n=fbm(q*1.25+vec2(drift*0.35,-drift*0.12));
    q.x += (n-0.5)*(0.08+uMidAtt*0.13);
    float ribbons=0.0;
    for(int i=0;i<7;i++){
      float fi=float(i);
      float seed=hash11(fi*13.17+floor(uPatternShift*0.18)*7.31);
      float y=-0.68+fi*0.22
        + sin(q.x*(1.18+fi*0.10)+drift*(0.65+seed*0.45)+fi*1.31)*(0.12+uFlow*0.055)
        + sin(q.x*3.1-drift*0.42+seed*TAU)*0.035;
      float width=0.028+uTrebleAtt*0.018+uFlux*0.012;
      ribbons += glowLine(q.y-y,width)*(0.36+seed*0.46);
    }
    float curtain=pow(sat(0.56-fbm(q*vec2(1.4,3.4)+vec2(-drift*0.08,drift*0.22))),1.7);
    float stars=dust(p*0.82,t*0.16,uDensity*0.78)*(0.16+uTreblePulse*0.46+uFlux*0.30);
    float horizon=exp(-abs(p.y+0.72)/(0.05+uBassAtt*0.04))*0.05;
    vec3 col=palette(0.22+p.y*0.22+n*0.30+t*0.008)*(ribbons*0.34+curtain*0.18+horizon);
    col+=mix(vec3(0.82,0.95,1.0),palette(0.82),0.38)*stars;
    return col;
  }` },
  { name: 'feedbackCathedral', glsl: String.raw`  vec3 feedbackCathedral(vec2 p, float t){
    vec2 q=p;
    q.y+=0.12;
    float hall=0.0;
    float clock=t*(0.055+uBassAtt*0.020);
    for(int i=0;i<10;i++){
      float fi=float(i);
      float z=fract(fi/10.0 + clock*0.10 + uPatternShift*0.004);
      float scale=mix(0.34,1.75,z);
      vec2 h=q/scale;
      float archR=0.70;
      float arch=circleLine(vec2(h.x,h.y+0.10),archR,0.010+0.006*(1.0-z))
        * smoothstep(-0.05,0.34,h.y);
      float columns=glowLine(abs(h.x)-0.70,0.010+0.004*(1.0-z))*smoothstep(-1.0,0.20,-h.y);
      float floorLine=glowLine(h.y+0.70,0.009)*smoothstep(0.0,0.7,abs(h.x));
      hall += (arch+columns+floorLine)*(1.0-z)*0.22;
    }
    float rose=0.0;
    vec2 r=rot(t*0.018+uMidAtt*0.05)*p;
    for(int i=0;i<12;i++){
      float fi=float(i);
      vec2 dir=vec2(cos(fi/12.0*TAU),sin(fi/12.0*TAU));
      rose += glowLine(sdSegment(r,vec2(0.0),dir*(0.18+uTrebleAtt*0.08)),0.006)*0.10;
    }
    float center=circleLine(p,0.20+uBassPulse*0.035,0.010)*0.20+rose;
    float haze=fbm(p*2.2+vec2(t*0.012,-t*0.010))*0.05;
    vec3 col=palette(0.12+length(p)*0.30+t*0.008)*(hall+center+haze);
    return col;
  }` },
  { name: 'myceliumNetwork', glsl: String.raw`
  float myceliumLink(vec2 f, vec2 c, vec2 id, vec2 off, float mutation){
    vec2 mutationVec=vec2(mutation*2.7);
    vec2 n=(hash22(id+off+mutationVec)-0.5)*0.62+off;
    float d=sdSegment(f,c,n);
    float seed=hash21(id+off*7.3+vec2(mutation));
    float threshold=max(0.42,0.74-uRandomness*0.22-uMidAtt*0.10);
    float active=1.0-smoothstep(0.28,threshold,seed);
    return glowLine(d,0.010+uTreblePulse*0.004)*active*(0.10+uMidAtt*0.16+uFlux*0.10);
  }

  vec3 myceliumNetwork(vec2 p, float t){
    float scale=3.0+uDensity*0.92;
    vec2 g=p*scale;
    vec2 id=floor(g);
    vec2 f=fract(g)-0.5;
    float mutation=floor(uPatternShift*(0.16+uRandomness*0.72));
    vec2 mutationVec=vec2(mutation*2.7);
    vec2 c=(hash22(id+mutationVec)-0.5)*0.60;
    float nodePhase=hash21(id+vec2(4.2))*TAU;
    c += vec2(sin(t*0.09+nodePhase),cos(t*0.08+nodePhase*0.83))*(0.018+uFlow*0.026);

    float net=exp(-dot(f-c,f-c)*118.0)*(0.18+uTrebleAtt*0.40+uBassPulse*0.05);
    net += myceliumLink(f,c,id,vec2( 1.0, 0.0),mutation);
    net += myceliumLink(f,c,id,vec2( 0.0, 1.0),mutation);
    net += myceliumLink(f,c,id,vec2( 1.0, 1.0),mutation);
    net += myceliumLink(f,c,id,vec2(-1.0, 1.0),mutation);

    float spores=dust(p*1.04,t*0.14,uDensity*0.84)*(0.08+uTreblePulse*0.34+uFlux*0.28);
    float breath=0.58+0.42*sin(t*0.16+fbm(p*1.6)*3.6+uBassAtt*1.4);
    float pulseHalo=exp(-dot(f-c,f-c)*(34.0-uBassPulse*8.0))*(0.025+uBeat*0.05);
    vec3 col=palette(hash21(id)*0.62+uCentroid*0.22+t*0.005)*(net*(0.64+breath*0.24)+pulseHalo);
    col+=mix(vec3(0.72,1.0,0.86),palette(0.84),0.34)*spores;
    return col;
  }
` },
  { name: 'luminousVortex', glsl: String.raw`  vec3 luminousVortex(vec2 p, float t){
    float r=length(p);
    float a=atan(p.y,p.x);
    float spin=t*(0.20+uMidAtt*0.08)+uPatternShift*0.030;
    float spiral=0.0;
    for(int i=0;i<5;i++){
      float fi=float(i);
      float phase=a*(3.0+fi*0.65)+r*(10.0+fi*2.4)-spin*(1.0+fi*0.10)+fi*1.27;
      spiral += glowLine(sin(phase),0.035+uTrebleAtt*0.020)*(0.12+fi*0.025);
    }
    float rings=glowLine(sin(r*(18.0+uDensity*3.0)-spin*2.0),0.045+uBassAtt*0.030)*0.13;
    vec2 q=rot(-spin*0.22)*p;
    float particles=dust(q*(0.78+r*0.30),t*0.30,uDensity)*(0.20+uTreblePulse*0.58+uFlux*0.30);
    float core=0.024/max(r*r+0.012,0.012)*(0.10+uBassPulse*0.14+uBeat*0.10);
    vec3 col=palette(seamlessAngle(p)*0.58+r*0.34+t*0.012)*(spiral*exp(-r*0.55)+rings);
    col+=mix(vec3(0.88,0.96,1.0),palette(0.90),0.45)*particles;
    col+=palette(0.18+uCentroid*0.42)*core;
    return col;
  }` },
  { name: 'spectralSpirograph', glsl: String.raw`  vec3 spectralSpirograph(vec2 p, float t){
    float r=length(p);
    float a=atan(p.y,p.x);
    float petals=5.0+floor(uCentroid*7.0+uDensity*0.6);
    float field=0.0;
    for(int i=0;i<4;i++){
      float fi=float(i);
      float target=0.42+fi*0.105
        + sin(a*(petals+fi*2.0)+t*(0.14+fi*0.025)+uPatternShift*0.028)*(0.08+uMidAtt*0.07)
        + sin(a*(2.0+fi)+t*0.08+fi*2.1)*(0.035+uTrebleAtt*0.045);
      field += glowLine(r-target,0.009+uTreblePulse*0.004)*(0.38-fi*0.055);
    }
    float radial=pow(0.5+0.5*sin(a*(petals*2.0)-t*0.23+uFrameRandom*TAU),8.0)
      *exp(-abs(r-0.56)/(0.22+uBassAtt*0.08))*0.14;
    float center=circleLine(p,0.14+uBassPulse*0.035,0.010)*0.16;
    float sparks=dust(p*1.2,t*0.19,uDensity*0.66)*(0.08+uFlux*0.40+uTreblePulse*0.26);
    vec3 col=palette(seamlessAngle(p)+t*0.010+uCentroid*0.28)*(field+radial+center);
    col+=mix(vec3(0.9,0.96,1.0),palette(0.76),0.42)*sparks;
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
    float randomPhase = uPatternShift * (0.32 + uRandomness*2.35);
    float patternCell = floor(randomPhase);
    float patternBlend = smoothstep(0.0,1.0,fract(randomPhase));
    float patternRndA = hash11(patternCell*13.17 + sceneIndex*7.31 + uSceneSeed*5.19);
    float patternRndB = hash11((patternCell+1.0)*13.17 + sceneIndex*7.31 + uSceneSeed*5.19);
    float patternRnd2A = hash11(patternCell*4.91 + sceneIndex*11.73 + 8.2 + uSceneSeed*2.71);
    float patternRnd2B = hash11((patternCell+1.0)*4.91 + sceneIndex*11.73 + 8.2 + uSceneSeed*2.71);
    float patternRnd = mix(patternRndA,patternRndB,patternBlend);
    float patternRnd2 = mix(patternRnd2A,patternRnd2B,patternBlend);
    float randomRotation = (patternRnd-0.5) * uRandomness * (0.08 + 0.26*uMidPulse);
    uv = rot(randomRotation) * uv;
    float randomScale = 1.0 + (patternRnd2-0.5)*uRandomness*0.055;
    uv *= randomScale;
    float globalWarp = (0.0035 + uFlow*0.010) * (uMidPulse*0.50 + uTreblePulse*0.72 + uBeat*0.10 + uMidAtt*0.22 + uTrebleAtt*0.16 + uFlux*0.24) * (0.72 + patternRnd2*0.56);
    globalWarp *= (0.16 + uRandomness*1.32);
    uv += vec2(
      sin(uv.y*(3.6+patternRnd2*2.2) + t*(0.42+uFlow*0.18) + patternRnd*TAU),
      cos(uv.x*(4.0+patternRnd*2.0) - t*(0.38+uFlow*0.18) - patternRnd2*TAU)
    ) * globalWarp * (0.88 + uFrameRandom*0.24);
    float reactiveZoom = 1.0 + uAudioZoom*(uBassPulse*0.075 + uSubPulse*0.045 + uBeat*0.025 + uBassAtt*0.028 + uSubAtt*0.018 + uFlux*0.020);
    uv /= reactiveZoom;
    uv *= 1.0 + uBassPulse * (0.010 + patternRnd*0.014) + uSubPulse*0.006;

    vec3 col = PRESET_CALL_PLACEHOLDER(uv, t);

    float gate = smoothstep(0.026, 0.115, uLevel + uBeat*0.18 + uBass*0.07 + uLevelPulse*0.05 + uLevelAtt*0.11);
    float birth = smoothstep(0.0, 0.82, uGrowth);
    float audioLift = mix(0.0, 0.55 + uLevel*0.38 + uBass*0.13 + uBeat*0.18 + uLevelPulse*0.10 + uLevelAtt*0.10, gate);
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
  uniform float uPreset;
  uniform float uPatternShift;
  uniform float uRandomness;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  #define TAU 6.28318530718
  float hash21(vec2 p){
    p=fract(p*vec2(123.34,456.21));
    p+=dot(p,p+45.32);
    return fract(p.x*p.y);
  }
  mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
  void main(){
    vec2 p=(vUv-0.5)*2.0;
    float phase=fract(uPreset*0.173+uPatternShift*0.017);
    p=rot((phase-0.5)*0.72+uTime*(0.025+uMid*0.035))*p;
    float r=length(p);
    float a=atan(p.y,p.x);
    float spokes=5.0+mod(floor(uPreset),7.0);
    float ringRadius=0.34+0.10*sin(uTime*0.24+phase*TAU)+uBass*0.08;
    float ring=exp(-abs(r-ringRadius)/(0.020+uBass*0.018));
    float rays=pow(0.5+0.5*sin(a*spokes+r*(5.0+phase*6.0)-uTime*(0.20+uMid*0.25)),7.0)*exp(-r*1.25);
    float orbit=exp(-abs(sin(r*(11.0+phase*7.0)-uTime*(0.36+uTreble*0.30)))/(0.065+uTreble*0.04))*0.13;
    float grain=step(0.988-uRandomness*0.010,hash21(floor((p+1.0)*vec2(120.0,68.0))+uPreset))*0.45;
    float core=exp(-r*r*(8.0-uBass*2.2));
    float pulse=0.32+uLevel*0.95+uBeat*0.42;
    float blend=0.5+0.5*sin(a*2.0+uTime*0.10+phase*TAU);
    vec3 col=mix(uColorA,uColorB,blend);
    col*= (ring*0.62+rays*0.34+orbit+core*0.22+grain)*pulse*uIntensity;
    col=vec3(1.0)-exp(-max(col,vec3(0.0))*0.88);
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
  uniform float uSceneSeed;
  uniform float uFrameRandom;
  uniform float uBassPulse;
  uniform float uMidPulse;
  uniform float uTreblePulse;
  uniform float uBeat;
  uniform float uFlux;
  uniform float uCentroid;
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
    float musical=uBassPulse*0.26+uMidPulse*0.18+uTreblePulse*0.16+uBeat*0.20+uFlux*0.22;
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
    float spiral=0.5+0.5*sin(atan(p.y,p.x)*(3.0+uCentroid*3.0)+length(p)*(9.0+uCentroid*5.0)-t*0.9-seed+uBeat*2.2);
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


const motionEchoShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0.16 },
    uWarp: { value: 0.18 },
    uZoom: { value: 0.14 },
    uBassAtt: { value: 0 },
    uMidAtt: { value: 0 },
    uTrebleAtt: { value: 0 },
    uFlux: { value: 0 },
    uCentroid: { value: 0.5 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    uniform float uWarp;
    uniform float uZoom;
    uniform float uBassAtt;
    uniform float uMidAtt;
    uniform float uTrebleAtt;
    uniform float uFlux;
    uniform float uCentroid;

    mat2 rot2(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

    void main(){
      vec2 p=vUv-0.5;
      float r=length(p);
      float musical=uBassAtt*0.42+uMidAtt*0.38+uTrebleAtt*0.34+uFlux*0.28;
      float twist=uWarp*(0.018+uMidAtt*0.026+uFlux*0.012)
        *sin(r*(7.0+uCentroid*4.0)-uTime*0.23);
      vec2 warped=rot2(twist)*p;
      warped += vec2(
        sin((p.y+uTime*0.035)*(8.0+uCentroid*3.0)),
        cos((p.x-uTime*0.031)*(7.0+uCentroid*2.0))
      ) * uWarp * (0.0015+musical*0.0028);

      vec2 uv0=clamp(0.5+warped,vec2(0.001),vec2(0.999));
      vec3 base=texture2D(tDiffuse,uv0).rgb;

      float z1=1.0+uZoom*(0.020+uBassAtt*0.050+uFlux*0.022);
      float z2=1.0+uZoom*(0.048+uTrebleAtt*0.030);
      vec2 uv1=clamp(0.5+rot2(-twist*0.72)*p/z1,vec2(0.001),vec2(0.999));
      vec2 uv2=clamp(0.5+rot2( twist*0.46)*p/z2,vec2(0.001),vec2(0.999));
      vec3 echo1=texture2D(tDiffuse,uv1).rgb;
      vec3 echo2=texture2D(tDiffuse,uv2).rgb;

      float a=clamp(uAmount,0.0,1.0);
      vec3 col=mix(base,max(base,echo1*0.90),a*0.52);
      col+=echo2*(a*0.075)*(0.65+musical*0.45);
      gl_FragColor=vec4(col,1.0);
    }
  `
};


const QUALITY_SCALE = {
  performance: 0.72,
  high: 0.96,
  ultra: 1.18
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hashNumber = (x) => {
  const v = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

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
    this.lastFluxFrame = 0;
    this.lastFluxMutationAt = 0;
    this.logoSpinAngle = 0;
    this.lastLogoResetSpin = 0;
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
    this.feedback = 0.18;
    this.memoryWarp = 0.20;
    this.echoZoom = 0.16;
    this.waveformMode = 'off';
    this.waveformGain = 0.72;
    this.waveformVisible = false;
    this.sceneSeed = 0.314159;
    this.frameRandom = 0.5;
    this.frameRandomTarget = 0.5;
    this.treeGrowth = 0.28;
    this.treeGrowthVelocity = 0;
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
      if (Number.isInteger(this.activeRenderingPreset)) {
        this.failedPresets.add(this.activeRenderingPreset);
        console.warn(`Preset ${this.activeRenderingPreset + 1} switched to compatibility renderer.`);
      }
      // A live-performance app must never cover the output with an error panel.
      // Shader diagnostics remain available in DevTools while a lightweight compatibility
      // material takes over automatically on the next frame.
      this.errorOverlay.style.display = 'none';
      this.errorOverlay.textContent = '';
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
      uSubAtt: { value: 0 },
      uBassAtt: { value: 0 },
      uMidAtt: { value: 0 },
      uTrebleAtt: { value: 0 },
      uLevelAtt: { value: 0 },
      uFlux: { value: 0 },
      uCentroid: { value: 0.5 },
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
      uSceneSeed: { value: 0.314159 },
      uFrameRandom: { value: 0.5 },
      uTreeGrowth: { value: 0.28 },
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
      uBeat: this.uniforms.uBeat,
      uFlux: this.uniforms.uFlux,
      uCentroid: this.uniforms.uCentroid
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
    this.afterimagePass = null;
    this.motionEchoPass = null;

    // Lightweight audio waveform overlay with multiple procedural drawing modes.
    this.waveformCanvas = document.createElement('canvas');
    this.waveformCanvas.className = 'visual-waveform-layer';
    this.waveformCtx = this.waveformCanvas.getContext('2d', { alpha: true });
    this.container.appendChild(this.waveformCanvas);

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
    this.uniforms.uSceneSeed.value = hashNumber((key + 1) * 19.73);
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
    this.motionEchoPass = new ShaderPass(motionEchoShader);
    this.motionEchoPass.enabled = this.quality !== 'performance' && (this.memoryWarp > 0.001 || this.echoZoom > 0.001);
    this.afterimagePass = new AfterimagePass(0.90);
    this.afterimagePass.enabled = this.feedback > 0.001 && this.quality !== 'performance';
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.motionEchoPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.afterimagePass);
    this.updateFeedbackSettings();
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
      this.activeRenderingPreset = null;
      // Warm the post stack once without associating compiler diagnostics with a preset.
      // This keeps later preset switching deterministic and avoids false compatibility fallbacks.
      if (this.composer) {
        const originalScene = this.renderPass?.scene;
        if (this.renderPass) this.renderPass.scene = this.blendScene;
        try { this.composer.render(0); } catch (error) { console.warn('Post stack warmup skipped:', error); }
        if (this.renderPass && originalScene) this.renderPass.scene = originalScene;
      }
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

  updateFeedbackSettings() {
    const perf = this.quality === 'performance';
    if (this.afterimagePass) {
      const enabled = this.feedback > 0.001 && !perf;
      this.afterimagePass.enabled = enabled;
      if (enabled) {
        const macro = this.uniforms?.uLevelAtt?.value ?? 0;
        const damp = clamp(0.70 + this.feedback * 0.27 + macro * this.feedback * 0.015, 0.70, 0.985);
        if (this.afterimagePass.uniforms?.damp) this.afterimagePass.uniforms.damp.value = damp;
      }
    }
    if (this.motionEchoPass) {
      const enabled = !perf && (this.memoryWarp > 0.001 || this.echoZoom > 0.001);
      this.motionEchoPass.enabled = enabled;
      if (enabled) {
        const u = this.motionEchoPass.uniforms;
        if (u.uAmount) u.uAmount.value = clamp(this.feedback * 0.76 + this.memoryWarp * 0.16, 0, 1);
        if (u.uWarp) u.uWarp.value = this.memoryWarp;
        if (u.uZoom) u.uZoom.value = this.echoZoom;
        if (u.uTime) u.uTime.value = this.timePhase;
        if (u.uBassAtt) u.uBassAtt.value = this.uniforms.uBassAtt.value;
        if (u.uMidAtt) u.uMidAtt.value = this.uniforms.uMidAtt.value;
        if (u.uTrebleAtt) u.uTrebleAtt.value = this.uniforms.uTrebleAtt.value;
        if (u.uFlux) u.uFlux.value = this.uniforms.uFlux.value;
        if (u.uCentroid) u.uCentroid.value = this.uniforms.uCentroid.value;
      }
    }
  }

  resizeWaveformCanvas() {
    if (!this.waveformCanvas) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    const maxW = this.isOutput ? 1600 : 1200;
    const scale = Math.min(1.25, window.devicePixelRatio || 1, maxW / w);
    const rw = Math.max(1, Math.round(w * scale));
    const rh = Math.max(1, Math.round(h * scale));
    if (this.waveformCanvas.width !== rw || this.waveformCanvas.height !== rh) {
      this.waveformCanvas.width = rw;
      this.waveformCanvas.height = rh;
    }
  }

  updateWaveform() {
    const ctx = this.waveformCtx;
    const canvas = this.waveformCanvas;
    if (!ctx || !canvas) return;
    const data = this.lastState?.waveform;
    const level = this.uniforms.uLevel.value;
    const shouldDraw = this.waveformMode !== 'off' && Array.isArray(data) && data.length >= 4 && level >= 0.012;
    if (!shouldDraw) {
      if (this.waveformVisible) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.waveformVisible = false;
      }
      return;
    }
    this.waveformVisible = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = canvas.width, h = canvas.height;
    const a = this.lastState?.colorA || '#6c4cff';
    const b = this.lastState?.colorB || '#00d9ff';
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, a);
    gradient.addColorStop(1, b);
    ctx.strokeStyle = gradient;
    ctx.globalAlpha = clamp(0.22 + level * 0.85, 0, 0.88);
    ctx.lineWidth = Math.max(1.0, Math.min(w, h) * 0.0022);
    ctx.shadowBlur = Math.max(3, Math.min(w, h) * 0.016);
    ctx.shadowColor = b;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const wMin = Math.min(w, h);
    const cx = w * 0.5, cy = h * 0.5;
    const bass = this.uniforms.uBassAtt.value;
    const mid = this.uniforms.uMidAtt.value;
    const treble = this.uniforms.uTrebleAtt.value;
    const flux = this.uniforms.uFlux.value;
    const centroid = this.uniforms.uCentroid.value;

    const strokePath = (builder, alphaScale = 1) => {
      ctx.save();
      ctx.globalAlpha *= alphaScale;
      ctx.beginPath();
      builder();
      ctx.stroke();
      ctx.restore();
    };

    if (this.waveformMode === 'radial' || this.waveformMode === 'flower') {
      const baseR = wMin * (0.18 + bass * 0.05);
      const petals = 5 + Math.round(centroid * 6);
      strokePath(() => {
        for (let i = 0; i <= data.length; i++) {
          const idx = i % data.length;
          const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2;
          const petal = this.waveformMode === 'flower'
            ? Math.sin(angle * petals + this.timePhase * 0.45) * baseR * (0.08 + mid * 0.08)
            : 0;
          const amp = data[idx] * baseR * (0.38 + treble * 0.10) * this.waveformGain;
          const r = baseR + amp + petal;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      });
    } else if (this.waveformMode === 'lasso' || this.waveformMode === 'spiro') {
      const scale = wMin * (0.20 + bass * 0.045);
      const turns = this.waveformMode === 'spiro' ? 3.0 + centroid * 4.0 : 1.55 + centroid * 1.6;
      strokePath(() => {
        data.forEach((v, i) => {
          const u = i / Math.max(1, data.length - 1);
          const phase = u * Math.PI * 2;
          const wobble = v * this.waveformGain;
          const x = cx + Math.sin(phase * turns + wobble * 0.7) * scale * (0.78 + wobble * 0.18);
          const y = cy + Math.sin(phase * (turns + 1.0) + this.timePhase * 0.16) * scale * (0.70 + Math.abs(wobble) * 0.24);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
      });
    } else if (this.waveformMode === 'double') {
      const amp = h * 0.16 * this.waveformGain;
      [-1, 1].forEach((sign, pass) => {
        strokePath(() => {
          const midY = h * (pass === 0 ? 0.43 : 0.57);
          data.forEach((v, i) => {
            const x = (i / (data.length - 1)) * w;
            const y = midY + v * amp * sign;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
        }, 0.72);
      });
    } else {
      const midY = h * 0.5;
      const amp = h * 0.22 * this.waveformGain;
      strokePath(() => {
        data.forEach((v, i) => {
          const x = (i / (data.length - 1)) * w;
          const y = midY + v * amp;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
      });
    }

    if (flux > 0.18) {
      ctx.save();
      ctx.globalAlpha = clamp(flux * 0.25, 0, 0.18);
      ctx.beginPath();
      ctx.arc(cx, cy, wMin * (0.10 + flux * 0.08), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  setQuality(quality) {
    if (!QUALITY_SCALE[quality] || quality === this.quality) return;
    this.quality = quality;
    this.adaptiveScale = Math.min(1, this.adaptiveScale);
    this.applyPixelRatio();
    this.updateBloomSettings();
    this.updateFeedbackSettings();
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
    if (state.subAtt != null) u.uSubAtt.value += (state.subAtt - u.uSubAtt.value) * 0.22;
    if (state.bassAtt != null) u.uBassAtt.value += (state.bassAtt - u.uBassAtt.value) * 0.22;
    if (state.midAtt != null) u.uMidAtt.value += (state.midAtt - u.uMidAtt.value) * 0.20;
    if (state.trebleAtt != null) u.uTrebleAtt.value += (state.trebleAtt - u.uTrebleAtt.value) * 0.20;
    if (state.levelAtt != null) u.uLevelAtt.value += (state.levelAtt - u.uLevelAtt.value) * 0.22;
    if (state.flux != null) u.uFlux.value += (state.flux - u.uFlux.value) * 0.30;
    if (state.centroid != null) u.uCentroid.value += (state.centroid - u.uCentroid.value) * 0.18;

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
    if (state.feedback != null) { this.feedback = clamp(Number(state.feedback), 0, 1); this.updateFeedbackSettings(); }
    if (state.memoryWarp != null) { this.memoryWarp = clamp(Number(state.memoryWarp), 0, 1.5); this.updateFeedbackSettings(); }
    if (state.echoZoom != null) { this.echoZoom = clamp(Number(state.echoZoom), 0, 1.5); this.updateFeedbackSettings(); }
    if (state.waveformMode != null) this.waveformMode = String(state.waveformMode);
    if (state.waveformGain != null) this.waveformGain = clamp(Number(state.waveformGain), 0, 1.5);
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
    if (state.logoResetSpin != null && Number(state.logoResetSpin) !== this.lastLogoResetSpin) {
      this.lastLogoResetSpin = Number(state.logoResetSpin);
      this.logoSpinAngle = 0;
    }
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
    const next = clamp(Math.round(nextPreset), 0, PRESET_DEFINITIONS.length - 1);
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
    const next = clamp(Math.round(nextPreset), 0, PRESET_DEFINITIONS.length - 1);
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
    this.resizeWaveformCanvas();
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
    // Expressive temporal curve around the 0.88 neutral point. Very low values now
    // genuinely approach slow motion while the phase remains continuous (no jumps).
    const neutralSpeed = 0.88;
    const normalizedSpeed = Math.max(0.01, this.displaySpeed / neutralSpeed);
    const speedCurve = clamp(neutralSpeed * Math.pow(normalizedSpeed, 1.42), 0.0035, 3.85);
    this.timePhase += dt * speedCurve;
    this.uniforms.uTime.value = this.timePhase;
    this.uniforms.uSpeed.value = this.displaySpeed;

    // Tree growth integrates musical energy over time instead of merely scaling a static shape.
    // Sustained spectral energy grows the crown; quiet passages pull the branches back to the trunk.
    const treeVisible = this.currentPreset === 18 || this.targetPreset === 18 ||
      (this.transitionActive && (Math.round(this.uniforms.uPresetFrom.value) === 18 || Math.round(this.uniforms.uPresetTo.value) === 18));
    const treeDrive = clamp(
      this.uniforms.uBassAtt.value * 0.34 +
      this.uniforms.uMidAtt.value * 0.56 +
      this.uniforms.uTrebleAtt.value * 0.94 +
      this.uniforms.uFlux.value * 0.40 +
      this.uniforms.uTreblePulse.value * 0.20,
      0, 1.8
    );
    if (treeVisible) {
      const grow = Math.max(0, treeDrive - 0.16);
      const retract = Math.max(0, 0.20 - treeDrive);
      const targetVelocity = grow > 0
        ? 0.16 + grow * (0.52 + this.randomness * 0.18)
        : -(0.22 + retract * 1.35);
      this.treeGrowthVelocity += (targetVelocity - this.treeGrowthVelocity) * Math.min(1, dt * 3.2);
      this.treeGrowth = clamp(this.treeGrowth + this.treeGrowthVelocity * dt, 0.0, 10.0);
    } else {
      // Reset off-screen so every return to the tree begins from a recognisable trunk/crown base.
      this.treeGrowthVelocity *= Math.max(0, 1 - dt * 4.0);
      this.treeGrowth += (0.26 - this.treeGrowth) * Math.min(1, dt * 1.8);
    }
    this.uniforms.uTreeGrowth.value = this.treeGrowth;

    this.updateTransition(now);

    const beatNow = this.uniforms.uBeat.value > 0.88 && this.lastBeatFrame <= 0.88;
    if (beatNow) {
      this.frameRandomTarget = hashNumber(this.patternShift + this.currentPreset * 17.13 + now * 0.0001);
      // Randomness controls coherent scene mutations; transients can also create
      // smaller secondary decisions without turning the image into white noise.
      this.patternShift += (0.045 + this.randomness*1.34) * (0.58 + this.uniforms.uBassPulse.value * 0.92 + this.uniforms.uMidPulse.value * 0.58 + this.uniforms.uTreblePulse.value * 0.72);
    }
    this.lastBeatFrame = this.uniforms.uBeat.value;
    const fluxNow = this.uniforms.uFlux.value;
    const fluxHit = fluxNow > 0.42 && this.lastFluxFrame <= 0.42 && now - this.lastFluxMutationAt > 140;
    if (fluxHit) {
      this.lastFluxMutationAt = now;
      this.patternShift += (0.018 + this.randomness * 0.30) * (0.55 + fluxNow);
      this.frameRandomTarget = hashNumber(this.patternShift * 1.7 + this.currentPreset * 9.31 + now * 0.00017);
    }
    this.lastFluxFrame = fluxNow;
    this.frameRandom += (this.frameRandomTarget - this.frameRandom) * Math.min(1, dt * (0.8 + this.randomness * 4.2));
    this.uniforms.uFrameRandom.value = this.frameRandom;
    this.uniforms.uSceneSeed.value = this.sceneSeed;
    const signalFlow = clamp((this.uniforms.uLevel.value - 0.025) * 7.0, 0, 1);
    this.patternShift += dt * signalFlow * (0.0025 + this.randomness*0.082 + this.uniforms.uMidPulse.value * (0.025+this.randomness*0.070) + this.uniforms.uTreblePulse.value * (0.012+this.randomness*0.040) + this.uniforms.uFlux.value*(0.012+this.randomness*0.036));
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
    const macroDecay = this.uniforms.uLevel.value < 0.015 ? 0.965 : 0.9995;
    this.uniforms.uSubAtt.value *= macroDecay;
    this.uniforms.uBassAtt.value *= macroDecay;
    this.uniforms.uMidAtt.value *= macroDecay;
    this.uniforms.uTrebleAtt.value *= macroDecay;
    this.uniforms.uLevelAtt.value *= macroDecay;

    this.updateLogos(this.timePhase);
    this.updateRunes(this.timePhase, dt);
    this.updateFeedbackSettings();
    this.updateWaveform();

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
      this.sceneSeed = hashNumber((key + 1) * 19.73);
      this.uniforms.uSceneSeed.value = this.sceneSeed;
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
