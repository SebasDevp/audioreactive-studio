import { VisualEngine } from './visual-engine.js';

const engine = new VisualEngine(document.getElementById('output'), { isOutput: true, quality: 'high' });
window.studioAPI?.onVisualState((state) => engine.setState(state));
