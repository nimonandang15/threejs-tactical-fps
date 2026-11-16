// Keyboard + mouse + pointer lock. main.js polls state.keys and drains takeLook() each frame;
// the buy menu and overlays release the lock, so clicks there never fire the weapon.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = { keys, firing: false, lookX: 0, lookY: 0, locked: false };

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }
  function onKeyUp(event) { keys.delete(event.code); }
  function onMouseMove(event) {
    if (!state.locked) return;
    state.lookX += event.movementX || 0;
    state.lookY += event.movementY || 0;
  }
  function onMouseDown(event) {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
  }
  function onLock() {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) state.firing = false;
    onLockChange(state.locked);
  }
  function onBlur() {
    keys.clear();
    state.firing = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('pointerlockchange', onLock);

  return {
    state,
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
    requestLock() { canvas.requestPointerLock(); },
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    consume(code) {
      if (!keys.has(code)) return false;
      keys.delete(code);
      return true;
    },
  };
}
