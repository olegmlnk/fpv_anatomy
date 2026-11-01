/* Курс по БПЛА · точка входу: стилі, ініціалізація інтерфейсу й 3D-сцени. */
import './styles/main.css';
import { S } from './engine/anim.js';
import { goMode, init } from './ui/ui.js';
import { FCS } from './sections/radio.js';
import { RLY, relSetSub } from './sections/relay.js';
import { LAB } from './sections/antlab.js';

init();

/* Хук для автотестів і налагодження з консолі: стан розділів і перемикачі режимів. */
window.__fpv = { S, FCS, RLY, LAB, goMode, relSetSub };
