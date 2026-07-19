/**
 * input.ts — steering controller for EL ENREDO (VIEW-ONLY).
 *
 * MOBILE: a DYNAMIC (re-centering) floating joystick — the scheme polished slither-likes use.
 * On pointer-down the origin is the touch point; as the thumb drags, the origin TRAILS it so it
 * always stays R_MAX behind the finger (infinite drag room, no dead corner — the failure mode of
 * a frozen origin). Steering is DIRECTION-ONLY: the lever's angle is the absolute desired heading
 * (Input.angle, brads); magnitude is ignored past a small dead-zone. Boost is DECOUPLED from
 * steering (a second finger, a dedicated boost pad bottom-right, or Space/Shift on desktop) so you
 * can carve hard without dashing. Pointer Events are { passive:false }. Desktop also steers toward
 * the mouse / WASD. Draft taps surface to the engine as discrete deterministic sim inputs.
 */

import { FULL_CIRCLE } from "@/game/sim/constants.ts";
import type { Rect, Insets } from "./render.ts";

const MASK = FULL_CIRCLE - 1;
const R_MAX = 40; // px: lever length; origin trails the thumb to stay this far behind
const R_DEAD = 6; // px: below this, hold the last heading (no jitter)
const TAP_SLOP_PX = 14; // pointer travel under this on a draft = a tap, not a drag

// Directed-emitter tuning (fixes "sometimes turns the wrong way"): the emitted heading is kept
// close to the REAL heading and the turn SIGN is committed with hysteresis, so the sim's internal
// shortest-path resolver never sits at the ambiguous ~180° coin-flip. All VIEW-side, determinism-safe.
const VIEW_CAP = 2600; // brads/tick the emitted heading may lead the real heading (> sim turn rate)
const HYST_LOCK = 24000; // |Δ| below this (~132°): commit the turn sign; above: hold the committed side

/** Shortest signed difference a-b, in [-32768, 32768). */
function angDiff(a: number, b: number): number {
  let d = (a - b) & MASK;
  if (d >= FULL_CIRCLE / 2) d -= FULL_CIRCLE;
  return d;
}

/**
 * Ability button geometry — SINGLE SOURCE OF TRUTH shared by hit-test (here) and drawing
 * (render.ts imports this). Bottom-right, thumb-reachable, safe-area aware. Structured so more
 * ability slots can be added later; today only the primary (BOOST) exists. Keeping one function
 * means the visible pad and the touch target can never drift apart.
 */
export type AbilitySlot = { x: number; y: number; r: number; hit: number };
export function abilityLayout(vw: number, vh: number, insets: Insets): AbilitySlot {
  return { x: vw - insets.right - 62, y: vh - insets.bottom - 92, r: 46, hit: 66 };
}

export type SteerController = {
  readAngle(): number;
  readBoost(): boolean;
  setAngle(brads: number): void;
  setHeading(brads: number): void;
  setInsets(insets: Insets): void;
  setDraft(
    active: boolean,
    cards: Rect[],
    reroll: Rect | null,
    locks?: Rect[],
    banishes?: Rect[],
  ): void;
  consumeDraftPick(): number;
  consumeReroll(): 0 | 1;
  consumeLockPick(): number;
  consumeBanishPick(): number;
  /** Current joystick geometry for the HUD ring (null when not steering by touch). */
  getSteer(): { ox: number; oy: number; x: number; y: number } | null;
  destroy(): void;
};

type Ptr = { ox: number; oy: number; x: number; y: number; moved: number };

function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** Angle of a screen-space vector (y-down, matching the sim/render mapping) in brads. */
function vecAngle(dx: number, dy: number): number | null {
  if (dx === 0 && dy === 0) return null;
  let a = Math.atan2(dy, dx) / (2 * Math.PI);
  a -= Math.floor(a);
  return Math.round(a * FULL_CIRCLE) & MASK;
}

export function createSteer(canvas: HTMLCanvasElement): SteerController {
  const pointers = new Map<number, Ptr>();
  let primaryId = -1; // the steer pointer
  let boostPointerId = -1; // a pointer parked on the boost pad
  let currentAngle = 0; // last EMITTED absolute heading (what the sim receives)
  let curHeading = 0; // real sim heading, fed back each tick via setHeading()
  let touchTarget = 0; // raw absolute finger direction (before the directed emitter)
  let lastSign = 1; // committed turn direction for the hysteresis band

  let hoverX = 0;
  let hoverY = 0;
  let hasHover = false;

  const keys = { up: false, down: false, left: false, right: false, boost: false };

  let draftActive = false;
  let draftCards: Rect[] = [];
  let draftReroll: Rect | null = null;
  let draftLocks: Rect[] = [];
  let draftBanishes: Rect[] = [];
  let pendingPick = -1;
  let pendingReroll: 0 | 1 = 0;
  let pendingLock = -1;
  let pendingBanish = -1;
  let curInsets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

  const localXY = (e: PointerEvent | MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const inBoostPad = (x: number, y: number): boolean => {
    const a = abilityLayout(canvas.clientWidth, canvas.clientHeight, curInsets);
    return Math.hypot(x - a.x, y - a.y) <= a.hit;
  };

  // Re-center the origin so it stays exactly R_MAX behind the finger, and update the heading.
  const applySteer = (p: Ptr): void => {
    let dx = p.x - p.ox;
    let dy = p.y - p.oy;
    let d = Math.hypot(dx, dy);
    if (d > R_MAX) {
      const kk = (d - R_MAX) / d;
      p.ox += dx * kk;
      p.oy += dy * kk;
      dx = p.x - p.ox;
      dy = p.y - p.oy;
      d = R_MAX;
    }
    if (d > R_DEAD) {
      const a = vecAngle(dx, dy);
      if (a !== null) touchTarget = a; // raw finger direction; the emitter turns it into currentAngle
    }
  };

  // Directed emitter: emit an absolute heading that stays within VIEW_CAP of the REAL heading,
  // choosing the turn sign ONCE with hysteresis so a U-turn commits to a side instead of flipping.
  const emitToward = (target: number): number => {
    const d = angDiff(target, curHeading);
    const ad = d < 0 ? -d : d;
    let sign: number;
    if (ad < HYST_LOCK) {
      sign = d >= 0 ? 1 : -1;
      lastSign = sign; // finger clearly to one side -> commit it
    } else {
      sign = lastSign; // ambiguous ~180° band -> keep the committed side (no coin-flip)
    }
    const stepA = ad < VIEW_CAP ? ad : VIEW_CAP;
    currentAngle = (curHeading + sign * stepA) & MASK;
    return currentAngle;
  };

  const onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    const [x, y] = localXY(e);
    // A touch on the boost pad becomes the boost pointer, never the steer pointer.
    if (!draftActive && boostPointerId === -1 && inBoostPad(x, y)) {
      boostPointerId = e.pointerId;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* best effort */
      }
      // haptic tick on ability fire (guarded: iOS Safari lacks it, some Android throw)
      try {
        const nav = navigator as Navigator & { vibrate?: (p: number) => boolean };
        if (typeof nav.vibrate === "function") nav.vibrate(12);
      } catch {
        /* ignore */
      }
      return;
    }
    pointers.set(e.pointerId, { ox: x, oy: y, x, y, moved: 0 });
    if (primaryId === -1) {
      primaryId = e.pointerId;
      touchTarget = currentAngle; // a fresh touch that hasn't dragged yet = keep going straight
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* best effort */
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    const [x, y] = localXY(e);
    hoverX = x;
    hoverY = y;
    hasHover = e.pointerType === "mouse";
    const p = pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    p.moved += Math.abs(x - p.x) + Math.abs(y - p.y);
    p.x = x;
    p.y = y;
    if (e.pointerId === primaryId && !draftActive) applySteer(p);
  };

  const endPointer = (e: PointerEvent): void => {
    if (e.pointerId === boostPointerId) {
      boostPointerId = -1;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    const p = pointers.get(e.pointerId);
    if (p && draftActive && p.moved <= TAP_SLOP_PX) {
      let hit = false;
      // lock/banish buttons first (small targets; may sit inside the card footprint)
      for (let i = 0; i < draftLocks.length && !hit; i++) {
        if (pointInRect(p.x, p.y, draftLocks[i])) {
          pendingLock = i;
          hit = true;
        }
      }
      for (let i = 0; i < draftBanishes.length && !hit; i++) {
        if (pointInRect(p.x, p.y, draftBanishes[i])) {
          pendingBanish = i;
          hit = true;
        }
      }
      if (!hit && draftReroll && pointInRect(p.x, p.y, draftReroll)) {
        pendingReroll = 1;
        hit = true;
      }
      if (!hit) {
        for (let i = 0; i < draftCards.length; i++) {
          if (pointInRect(p.x, p.y, draftCards[i])) {
            pendingPick = i;
            break;
          }
        }
      }
    }
    pointers.delete(e.pointerId);
    if (e.pointerId === primaryId) {
      primaryId = pointers.size > 0 ? (pointers.keys().next().value ?? -1) : -1;
      if (primaryId !== -1) touchTarget = currentAngle; // handoff: don't inherit the old finger dir
    }
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    switch (e.code) {
      case "ArrowUp":
      case "KeyW":
        keys.up = true;
        break;
      case "ArrowDown":
      case "KeyS":
        keys.down = true;
        break;
      case "ArrowLeft":
      case "KeyA":
        keys.left = true;
        break;
      case "ArrowRight":
      case "KeyD":
        keys.right = true;
        break;
      case "Space":
      case "ShiftLeft":
      case "ShiftRight":
        keys.boost = true;
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    switch (e.code) {
      case "ArrowUp":
      case "KeyW":
        keys.up = false;
        break;
      case "ArrowDown":
      case "KeyS":
        keys.down = false;
        break;
      case "ArrowLeft":
      case "KeyA":
        keys.left = false;
        break;
      case "ArrowRight":
      case "KeyD":
        keys.right = false;
        break;
      case "Space":
      case "ShiftLeft":
      case "ShiftRight":
        keys.boost = false;
        break;
      default:
        break;
    }
  };

  const opts: AddEventListenerOptions = { passive: false };
  canvas.addEventListener("pointerdown", onPointerDown, opts);
  canvas.addEventListener("pointermove", onPointerMove, opts);
  canvas.addEventListener("pointerup", endPointer, opts);
  canvas.addEventListener("pointercancel", endPointer, opts);
  window.addEventListener("keydown", onKeyDown, opts);
  window.addEventListener("keyup", onKeyUp);

  return {
    readAngle(): number {
      // 1) raw desired ABSOLUTE heading from the active source (keys > touch > hover); else hold
      let target = currentAngle;
      let kx = 0;
      let ky = 0;
      if (keys.up) ky -= 1;
      if (keys.down) ky += 1;
      if (keys.left) kx -= 1;
      if (keys.right) kx += 1;
      if (kx !== 0 || ky !== 0) {
        const a = vecAngle(kx, ky);
        if (a !== null) target = a;
      } else {
        const p = primaryId !== -1 ? pointers.get(primaryId) : undefined;
        if (p) {
          applySteer(p); // keep steering even if the finger is held still between move events
          target = touchTarget;
        } else if (hasHover) {
          const a = vecAngle(hoverX - canvas.clientWidth / 2, hoverY - canvas.clientHeight / 2);
          if (a !== null) target = a;
        }
      }
      // 2) directed emitter -> determinism-safe heading near the real heading, sign committed
      return emitToward(target);
    },
    readBoost(): boolean {
      if (keys.boost) return true;
      if (boostPointerId !== -1) return true;
      if (pointers.size >= 2) return true;
      return false;
    },
    setAngle(brads: number): void {
      currentAngle = brads & MASK;
      curHeading = brads & MASK;
      touchTarget = brads & MASK;
    },
    setHeading(brads: number): void {
      curHeading = brads & MASK;
    },
    setInsets(insets: Insets): void {
      curInsets = insets;
    },
    setDraft(
      active: boolean,
      cards: Rect[],
      reroll: Rect | null,
      locks?: Rect[],
      banishes?: Rect[],
    ): void {
      draftActive = active;
      draftCards = cards;
      draftReroll = reroll;
      draftLocks = locks ?? [];
      draftBanishes = banishes ?? [];
      if (!active) {
        pendingPick = -1;
        pendingReroll = 0;
        pendingLock = -1;
        pendingBanish = -1;
      }
    },
    consumeDraftPick(): number {
      const v = pendingPick;
      pendingPick = -1;
      return v;
    },
    consumeReroll(): 0 | 1 {
      const v = pendingReroll;
      pendingReroll = 0;
      return v;
    },
    consumeLockPick(): number {
      const v = pendingLock;
      pendingLock = -1;
      return v;
    },
    consumeBanishPick(): number {
      const v = pendingBanish;
      pendingBanish = -1;
      return v;
    },
    getSteer(): { ox: number; oy: number; x: number; y: number } | null {
      const p = primaryId !== -1 ? pointers.get(primaryId) : undefined;
      return p ? { ox: p.ox, oy: p.oy, x: p.x, y: p.y } : null;
    },
    destroy(): void {
      canvas.removeEventListener("pointerdown", onPointerDown, opts);
      canvas.removeEventListener("pointermove", onPointerMove, opts);
      canvas.removeEventListener("pointerup", endPointer, opts);
      canvas.removeEventListener("pointercancel", endPointer, opts);
      window.removeEventListener("keydown", onKeyDown, opts);
      window.removeEventListener("keyup", onKeyUp);
      pointers.clear();
    },
  };
}
