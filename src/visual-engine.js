import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const vegvisirUrl = new URL('./assets/vegvisir.png', import.meta.url).href;

const vertexShader = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
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
    float phase = t*PI*(0.8 + uColorMix*1.2) + uTime*0.04 + uPatternShift*0.35;
    float blend = 0.5 + 0.5*sin(phase + uBassPulse*0.48 - uTreblePulse*0.30 + uMidPulse*0.18);
    blend = mix(blend, smoothstep(0.0, 1.0, blend), uColorMix*0.55);
    vec3 base = mix(uColorA, uColorB, blend);
    vec3 bandTint = vec3(0.0);
    bandTint += vec3(0.10,0.04,0.02) * uBassPulse;
    bandTint += vec3(0.02,0.08,0.11) * uMidPulse;
    bandTint += vec3(0.09,0.11,0.15) * uTreblePulse;
    float whiteLift = 0.02 + 0.06*uTreble + 0.03*uBeat + 0.02*uLevelPulse;
    return mix(base + bandTint, vec3(1.0), whiteLift);
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

  vec3 cosmicParticles(vec2 uv, float t){
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
  }

  vec3 neonFlow(vec2 uv, float t){
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
  }

  vec3 sacredDust(vec2 uv, float t){
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
    vec3 col = palette(a/PI + r*0.4 + t*0.025) * (petals*0.22 + rings*0.18 + flower*0.22 + hex*0.15 + center);
    col += mix(vec3(1.0),palette(0.4),0.45)*particles*(0.55+uTreble*1.1);
    return col;
  }

  vec3 angelicParticles(vec2 uv, float t){
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
  }

  vec3 technoParticles(vec2 uv, float t){
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
    col += palette(a/PI+t*0.1)*particles*(0.75+uTreble*1.4)*smoothstep(0.03,0.26,r);
    return col;
  }

  vec3 quantumDust(vec2 uv, float t){
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
  }

  vec3 fibonacciBloom(vec2 uv, float t){
    vec2 p = uv * rot(t*0.05);
    float bloom = 0.0;
    float sparks = 0.0;
    for(int i=0;i<72;i++){
      float fi = float(i) / 71.0;
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
  }

  vec3 runePulse(vec2 uv, float t){
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
    vec3 col = palette(0.2 + atan(p.y,p.x)/PI + t*0.05) * (ring*0.18 + glyphs*0.22 + rays + centerGlyph*0.38);
    col += palette(0.75) * dustField * (0.4 + uTreble*0.9);
    return col;
  }

  vec3 symbolForge(vec2 uv, float t){
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
    col += palette(0.45 + a/TAU) * particles * 0.62;
    return col;
  }

  vec3 seedWorld(vec2 uv, float t){
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
  }

  vec3 flowerLifeNexus(vec2 uv, float t){
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
  }

  vec3 artifactShrine(vec2 uv, float t){
    vec2 p = uv;
    p.y += 0.08;
    vec2 q = p;
    q.x = abs(q.x);
    float n = fbm(q*3.1 + vec2(0.0, -t*0.08));
    float shell = abs(length(vec2(q.x*0.78 + 0.04*sin(q.y*7.0), q.y*0.76)) - (0.34 + 0.11*sin(q.y*3.0 + n*2.0)));
    float pillar = glowLine(shell - 0.035 + n*0.018, 0.020) * smoothstep(-0.85, 0.2, q.y) * (1.0-smoothstep(0.2, 1.15, q.y));
    float innerCavity = glowLine(abs(length(vec2(q.x*0.62, q.y*0.75 + 0.05*sin(t+q.y*6.0))) - 0.18), 0.024) * 0.9;
    float veins = glowLine(sin(q.y*18.0 + n*6.0 - t*1.1), 0.045) * 0.12;
    float roots = 0.0;
    for(int i=0;i<5;i++){
      float fi = float(i);
      float phase = fi*1.1;
      float x = 0.16 + fi*0.045 + 0.04*sin(t*0.5 + phase);
      roots += glowLine(sdSegment(q, vec2(x,0.1), vec2(0.05 + fi*0.02, 0.85)), 0.012) * 0.28;
    }
    float spores = dust(p*1.5 + vec2(0.0,t*0.04), t*0.68, uDensity) * (0.35 + uTreble);
    float portal = exp(-pow(length(p-vec2(0.0,0.02))*1.6, 2.0)) * (0.12 + uBeat*0.22);
    vec3 bark = mix(vec3(0.28,0.22,0.18), vec3(0.64,0.43,0.22), sat(n*1.2));
    vec3 col = bark * (pillar*1.1 + veins + roots);
    col += mix(vec3(1.0,0.65,0.25), palette(0.15), 0.25) * (innerCavity*0.9 + portal);
    col += mix(vec3(0.92,0.74,0.42), palette(0.82), 0.3) * spores;
    return col;
  }

  vec3 entityGate(vec2 uv, float t){
    vec2 p = uv;
    float r = length(p);
    vec2 s = p; s.x = abs(s.x);
    float gate = glowLine(abs(length(vec2(s.x*0.76, s.y*0.92)) - (0.58 + 0.05*sin(s.y*8.0 - t))) - 0.06, 0.018);
    float eye1 = exp(-pow(length(p - vec2(0.22, -0.05))*8.0, 2.0));
    float eye2 = exp(-pow(length(p - vec2(-0.22, -0.05))*8.0, 2.0));
    float iris = circleLine(p-vec2(0.22,-0.05), 0.06 + 0.02*sin(t*1.8), 0.009) + circleLine(p-vec2(-0.22,-0.05), 0.06 + 0.02*sin(t*1.8), 0.009);
    float crown = 0.0;
    for(int i=0;i<7;i++){
      float fi = float(i);
      float a = mix(-0.9, 0.9, fi/6.0);
      vec2 a0 = vec2(a*0.42, -0.25);
      vec2 a1 = vec2(a*0.18, -0.84 - 0.06*sin(t + fi));
      crown += glowLine(sdSegment(p, a0, a1), 0.012) * 0.42;
    }
    float body = flowerOfLife(p*0.9, 0.18, 0.010) * 0.65 + circleLine(p, 0.32, 0.013) + circleLine(p, 0.72, 0.008);
    float wings = glowLine(abs(length(vec2((s.x-0.34)*0.9, s.y*0.8)) - 0.32), 0.016) * (1.0 - smoothstep(0.2,1.1,r));
    float particles = dust(p*1.2, t*0.55, uDensity) * (0.55 + uTreble);
    vec3 col = palette(0.35 + atan(p.y,p.x)/TAU + t*0.04) * (gate*0.48 + body*0.22 + crown + wings*0.65);
    col += mix(vec3(1.0), palette(0.9), 0.35) * (eye1*0.42 + eye2*0.42 + iris*0.55 + particles*0.45);
    return col;
  }

  vec3 dynamicPanels(vec2 uv, float t){
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
  }

  vec3 matrixLattice(vec2 p, float t){
    p *= 1.18;
    p.x += 0.10*sin(t*0.34 + p.y*1.5 + uPatternShift*0.12);
    vec2 cell = vec2(11.0 + uDensity*1.8, 17.0 + uDensity*2.2);
    vec2 flow = vec2(0.0, t*(1.15 + uTreblePulse*0.35));
    vec2 gv = fract(p*cell + flow) - 0.5;
    vec2 id = floor(p*cell + flow);
    float glyphSeed = hash21(id + floor(uPatternShift));
    float column = glowLine(gv.x, 0.014 + 0.010*uTreblePulse);
    float row = glowLine(gv.y + 0.18*sin(id.x*1.7 + t*1.2), 0.012);
    float boxGlyph = boxLine(gv, vec2(0.07 + 0.05*glyphSeed, 0.18 + 0.08*hash21(id+4.1)), 0.009);
    float dotGlyph = circleLine(gv + (hash22(id+7.0)-0.5)*0.18, 0.045 + 0.03*glyphSeed, 0.009);
    float streak = exp(-abs(gv.y + 0.38 - fract(t*0.75 + glyphSeed))*12.0) * step(0.36, glyphSeed);
    float rain = column*0.22 + row*0.10 + boxGlyph*0.30 + dotGlyph*0.18 + streak*0.42;
    rain *= (0.34 + uTreble*0.60 + uMidPulse*0.46 + uLevelPulse*0.20);
    float mist = dust(p*1.15 + vec2(0.0, -t*0.20), t*0.6, uDensity*0.75) * 0.11;
    vec3 matrixGreen = vec3(0.06,0.75,0.24);
    vec3 col = mix(matrixGreen*0.62, palette(0.18+p.y*0.06+t*0.02), 0.26 + uColorMix*0.35) * rain;
    col += matrixGreen * mist;
    return col;
  }

  vec3 merkabaPrism(vec2 p, float t){
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
    float rays = 0.0;
    for(int i=0;i<12;i++){
      float fi = float(i);
      vec2 dir = vec2(cos(fi/12.0*TAU), sin(fi/12.0*TAU));
      rays += glowLine(dot(q, dir.yx), 0.006 + 0.003*uTreblePulse) * smoothstep(0.24, 1.05, dot(q, dir)+1.0) * 0.10;
    }
    float core = circleLine(q, 0.18 + 0.03*uBassPulse, 0.012) + exp(-dot(q,q)*18.0)*(0.22+uBeat*0.24);
    float dustField = dust(q*1.35, t*0.72, uDensity*0.74) * 0.18;
    vec3 col = palette(0.50 + q.x*0.12 + uPatternShift*0.025) * (star*0.34 + orbit*0.10 + shell*0.16 + rays + core*0.26);
    col += mix(vec3(1.0), palette(0.88), 0.45) * dustField;
    col += palette(0.10) * (innerA + innerB) * 0.20;
    return col;
  }

  void main(){
    vec2 uv = (vUv - 0.5) * 2.0;
    uv.x *= uResolution.x / max(uResolution.y,1.0);
    uv /= max(uZoom,0.05);
    float t = uTime;
    float patternCell = floor(uPatternShift + 0.5);
    float patternRnd = hash11(patternCell*13.17 + uPreset*7.31);
    uv = rot((patternRnd-0.5) * (0.05 + 0.16*uMidPulse)) * uv;
    uv += vec2(sin(uv.y*4.0 + t*0.7 + patternRnd*TAU), cos(uv.x*4.6 - t*0.6 - patternRnd*TAU)) * (0.012*uMidPulse + 0.012*uTreblePulse);
    uv *= 1.0 + uBassPulse * (0.020 + patternRnd*0.018);

    vec3 col;
    if(uPreset < 0.5) col = cosmicParticles(uv,t);
    else if(uPreset < 1.5) col = neonFlow(uv,t);
    else if(uPreset < 2.5) col = sacredDust(uv,t);
    else if(uPreset < 3.5) col = angelicParticles(uv,t);
    else if(uPreset < 4.5) col = technoParticles(uv,t);
    else if(uPreset < 5.5) col = quantumDust(uv,t);
    else if(uPreset < 6.5) col = fibonacciBloom(uv,t);
    else if(uPreset < 7.5) col = runePulse(uv,t);
    else if(uPreset < 8.5) col = symbolForge(uv,t);
    else if(uPreset < 9.5) col = seedWorld(uv,t);
    else if(uPreset < 10.5) col = flowerLifeNexus(uv,t);
    else if(uPreset < 11.5) col = artifactShrine(uv,t);
    else if(uPreset < 12.5) col = entityGate(uv,t);
    else if(uPreset < 13.5) col = dynamicPanels(uv,t);
    else if(uPreset < 14.5) col = matrixLattice(uv,t);
    else col = merkabaPrism(uv,t);

    float gate = smoothstep(0.032, 0.14, uLevel + uBeat*0.15 + uBass*0.06 + uLevelPulse*0.04);
    float birth = smoothstep(0.0, 1.0, uGrowth);
    float audioLift = mix(0.0, 0.54 + uLevel*0.38 + uBass*0.12 + uBeat*0.16 + uLevelPulse*0.09, gate);
    vec3 bandAccent = vec3(0.0);
    bandAccent += palette(0.18 + uTime*0.02) * uBassPulse * 0.04;
    bandAccent += palette(0.46 + uTime*0.02) * uMidPulse * 0.035;
    bandAccent += palette(0.78 + uTime*0.02) * uTreblePulse * 0.03;
    col = col * (uIntensity * audioLift * birth) + bandAccent;

    col = max(col, vec3(0.0));
    col = vec3(1.0) - exp(-col * 0.92);
    float safeContrast = clamp(0.94 + (uContrast-1.0)*0.58, 0.72, 1.42);
    col = (col - 0.42) * safeContrast + 0.42;
    col = clamp(col, vec3(0.0), vec3(1.0));
    col = pow(col, vec3(0.98));

    float dither = (hash21(gl_FragCoord.xy + fract(uTime)*91.7)-0.5) / 255.0;
    col += dither;

    gl_FragColor = vec4(col,1.0);
  }
`;

const QUALITY_SCALE = {
  performance: 0.78,
  high: 1.0,
  ultra: 1.34
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
    this.runeAngle = 0;
    this.runeEchoAngle = 0;
    this.lastState = {};
    this.containerWidth = Math.max(1, container.clientWidth);
    this.containerHeight = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: false
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.debug.checkShaderErrors = true;
    this.renderer.setClearColor(0x000000, 1);
    this.applyPixelRatio();
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);
    container.appendChild(this.renderer.domElement);

    this.errorOverlay = document.createElement('div');
    this.errorOverlay.className = 'visual-error-overlay';
    this.errorOverlay.textContent = 'Visual engine error · revisá la consola';
    container.appendChild(this.errorOverlay);
    this.renderer.debug.onShaderError = (gl, program, vertexShaderObject, fragmentShaderObject) => {
      const vertexLog = gl.getShaderInfoLog(vertexShaderObject) || '';
      const fragmentLog = gl.getShaderInfoLog(fragmentShaderObject) || '';
      console.error('AudioReactive shader error', { vertexLog, fragmentLog });
      this.errorOverlay.style.display = 'flex';
      this.errorOverlay.title = `${vertexLog}
${fragmentLog}`;
    };

    this.scene = new THREE.Scene();
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
      uColorA: { value: new THREE.Color('#6c4cff') },
      uColorB: { value: new THREE.Color('#00d9ff') }
    };

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.88, 0.56, 0.22);
    this.bloomPass.strength = this.bloomStrength;
    this.bloomPass.radius = 0.60;
    this.bloomPass.threshold = 0.24;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);

    this.logoWrap = document.createElement('div');
    this.logoWrap.className = 'visual-logo-layer';
    this.container.appendChild(this.logoWrap);
    this.logoNodes = [];

    this.runeWrap = document.createElement('div');
    this.runeWrap.className = 'visual-rune-layer';
    this.runeEcho = document.createElement('img');
    this.runeEcho.className = 'visual-rune visual-rune-echo';
    this.runeEcho.alt = 'Vegvísir aura';
    this.runeEcho.src = vegvisirUrl;
    this.runeNode = document.createElement('img');
    this.runeNode.className = 'visual-rune visual-rune-core';
    this.runeNode.alt = 'Vegvísir';
    this.runeNode.src = vegvisirUrl;
    this.runeWrap.appendChild(this.runeEcho);
    this.runeWrap.appendChild(this.runeNode);
    this.container.appendChild(this.runeWrap);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.clockStart = performance.now();
    this.running = true;
    this.resize();
    this.render();
  }

  applyPixelRatio() {
    const nativeDpr = window.devicePixelRatio || 1;
    const scale = QUALITY_SCALE[this.quality] ?? 1;
    const maxRatio = this.isOutput ? 3.0 : 2.4;
    this.renderer.setPixelRatio(Math.min(maxRatio, nativeDpr * scale));
  }

  setQuality(quality) {
    if (!QUALITY_SCALE[quality] || quality === this.quality) return;
    this.quality = quality;
    this.applyPixelRatio();
    this.resize();
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
    if (state.preset != null) u.uPreset.value = Number(state.preset);
    if (state.colorA) u.uColorA.value.set(state.colorA);
    if (state.colorB) u.uColorB.value.set(state.colorB);
    if (state.colorMix != null) { this.colorMix = Number(state.colorMix); u.uColorMix.value = this.colorMix; }
    if (state.quality) this.setQuality(state.quality);
    if (state.bloom != null) {
      this.bloomStrength = clamp(Number(state.bloom), 0, 1.8);
      this.bloomPass.strength = this.bloomStrength;
    }

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
    else this.ensureLogoNodes();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.containerWidth = width;
    this.containerHeight = height;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
    const ratio = this.renderer.getPixelRatio();
    this.uniforms.uResolution.value.set(width * ratio, height * ratio);
  }

  updateLogos(time) {
    this.ensureLogoNodes();

    const active = this.logoEnabled && this.logoDataUrl;
    if (!active) {
      this.logoWrap.style.opacity = '0';
      return;
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
    const preset = Number(this.uniforms.uPreset.value);
    const active = preset === 7;
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
    const opacity = clamp(gate * 0.88, 0, 0.90);
    const echoOpacity = clamp(gate * (0.20 + treblePulse*0.34 + beat*0.14), 0, 0.55);
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

    this.displaySpeed += (this.targetSpeed - this.displaySpeed) * Math.min(1, dt * 8.0);
    const speedCurve = Math.pow(Math.max(0.01, this.displaySpeed), 0.92);
    this.timePhase += dt * speedCurve;
    this.uniforms.uTime.value = this.timePhase;
    this.uniforms.uSpeed.value = this.displaySpeed;

    const beatNow = this.uniforms.uBeat.value > 0.88 && this.lastBeatFrame <= 0.88;
    if (beatNow) {
      this.patternShift += 0.55 + this.uniforms.uBassPulse.value * 0.8 + this.uniforms.uTreblePulse.value * 0.4;
    }
    this.lastBeatFrame = this.uniforms.uBeat.value;
    const signalFlow = clamp((this.uniforms.uLevel.value - 0.025) * 7.0, 0, 1);
    this.patternShift += dt * signalFlow * (0.025 + this.uniforms.uMidPulse.value * 0.10 + this.uniforms.uTreblePulse.value * 0.04);
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
    this.composer.render();
    requestAnimationFrame(this.render);
  };
}
