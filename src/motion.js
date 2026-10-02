// Time-based envelopes: musical phrasing remains consistent at different FPS.
export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export function approach(current, target, dt, attack = 8, release = attack) {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dt) * (target > current ? attack : release)));
}
export const spinRadiansPerSecond = (rpm) => clamp(finite(rpm), 0, 1) * Math.PI * 2 / 60;

// Mirrors the filament vertex shader. Released particles start at the animated
// branch surface, then continue in world space instead of orbiting with the tree.
export function deformTreePoint(point, offset, u, out) {
  out.copy(point).addScaledVector(offset, u.uExtension.value);
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const time = u.uTime.value;
  const sway = (0.018 + u.uFlow.value * 0.033 + u.uMid.value * 0.22) * smooth(0.35, 9.5, out.y);
  out.x += sway * (Math.sin(time * 0.43 + out.y * 0.39 + out.z * 0.19)
    + 0.40 * Math.sin(time * 0.26 - out.y * 0.71 + out.x * 0.33));
  out.z += sway * (Math.cos(time * 0.34 + out.y * 0.33 + out.x * 0.24)
    + 0.31 * Math.sin(time * 0.52 + out.y * 0.63));
  const breathe = 1 + u.uSub.value * 0.025 + u.uBass.value * 0.033 * (0.4 + 0.6 * Math.sin(time * 1.65 - out.y * 0.36));
  out.x *= breathe; out.z *= breathe;
  return out;
}
