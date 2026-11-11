import { formatDay, formatTimeRange } from "../format.js";
import { validateBooking } from "../validators.js";

export function createBookingForm() {
  const section = document.querySelector("#booking-section");
  const heading = document.querySelector("#booking-heading");
  const form = document.querySelector("#booking-form");
  const selected = document.querySelector("#selected-slot");
  const submit = document.querySelector("#submit-button");
  const error = document.querySelector("#booking-error");
  const changeTime = document.querySelector("#change-time");
  const name = document.querySelector("#name");
  const email = document.querySelector("#email");
  const fields = { name, email };

  function setFieldErrors(errors) {
    for (const [key, input] of Object.entries(fields)) {
      const fieldError = document.getElementById(`${key}-error`);
      const message = errors[key] ?? "";
      input.setAttribute("aria-invalid", String(Boolean(message)));
      fieldError.textContent = message;
      fieldError.hidden = !message;
    }
  }

  return {
    form,
    changeTime,
    values() {
      return { name: name.value.trim(), email: email.value.trim() };
    },
    validate() {
      const errors = validateBooking(this.values());
      setFieldErrors(errors);
      const firstInvalid = Object.keys(errors)[0];
      if (firstInvalid) fields[firstInvalid].focus();
      return Object.keys(errors).length === 0;
    },
    applyFieldErrors(errors) {
      setFieldErrors(errors);
    },
    show(slot) {
      selected.textContent = `${formatDay(slot.start)} · ${formatTimeRange(slot.start, slot.end)} · ${slot.provider}`;
      section.hidden = false;
      error.hidden = true;
      error.textContent = "";
      setFieldErrors({});
      requestAnimationFrame(() => {
        heading.focus({ preventScroll: true });
        section.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "nearest",
        });
      });
    },
    hide() {
      section.hidden = true;
    },
    setError(message) {
      error.textContent = message;
      error.hidden = !message;
    },
    setSubmitting(isSubmitting) {
      submit.disabled = isSubmitting;
      submit.textContent = isSubmitting ? "Booking…" : "Confirm appointment";
    },
    setRateLimit(seconds) {
      submit.disabled = seconds > 0;
      submit.textContent = seconds > 0 ? `Try again in ${seconds}s` : "Confirm appointment";
    },
    clear() {
      form.reset();
      setFieldErrors({});
      this.setError("");
    },
    focusHeading() {
      heading.focus();
    },
  };
}
