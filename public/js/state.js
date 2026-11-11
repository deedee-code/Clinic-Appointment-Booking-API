const current = {
  slots: [],
  selectedSlot: null,
  booking: null,
  status: "idle",
};
const listeners = new Set();

/** @returns {Readonly<typeof current>} */
export function getState() {
  return current;
}

/** @param {Partial<typeof current>} patch */
export function setState(patch) {
  Object.assign(current, patch);
  for (const listener of listeners) listener(getState());
}

/** @param {(state: Readonly<typeof current>) => void} listener */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
