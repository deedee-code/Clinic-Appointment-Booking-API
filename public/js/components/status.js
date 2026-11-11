export function createStatus() {
  const status = document.querySelector("#status-message");
  const error = document.querySelector("#error-message");

  return {
    /** @param {string} message */
    announce(message) {
      error.hidden = true;
      error.textContent = "";
      status.textContent = message;
    },
    /** @param {string} message */
    reportError(message) {
      status.textContent = "";
      error.textContent = message;
      error.hidden = false;
    },
    clear() {
      status.textContent = "";
      error.textContent = "";
      error.hidden = true;
    },
  };
}
