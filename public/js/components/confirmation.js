import { buildCalendarFile, formatDateTime, formatTime } from "../format.js";

/** @param {HTMLElement} container @param {Record<string, any>} booking @param {Record<string, any> | null} slot */
export function renderBookingDetails(container, booking, slot) {
  container.replaceChildren();
  const rows = [
    ["Booking ID", booking.id],
    ["Name", booking.name],
    ["Email", booking.email],
    ["Appointment", slot ? `${formatDateTime(slot.start)}–${formatTime(slot.end)}` : `Appointment slot ${booking.slot_id}`],
    ["Status", booking.status],
  ];
  for (const [label, value] of rows) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = String(value);
    container.append(term, description);
  }
}

export function createConfirmation() {
  const section = document.querySelector("#confirmation");
  const heading = document.querySelector("#confirmation-heading");
  const details = document.querySelector("#confirmation-details");
  const copyButton = document.querySelector("#copy-id-button");
  const calendarButton = document.querySelector("#calendar-button");
  const cancelButton = document.querySelector("#cancel-button");
  const cancelConfirm = document.querySelector("#cancel-confirm");
  const confirmCancelButton = document.querySelector("#confirm-cancel-button");
  const keepButton = document.querySelector("#keep-appointment-button");
  let booking = null;
  let slot = null;
  let onCancel = () => {};

  copyButton.addEventListener("click", async () => {
    if (!booking) return;
    try {
      await navigator.clipboard.writeText(booking.id);
      copyButton.textContent = "Booking ID copied";
    } catch {
      copyButton.textContent = "Copy unavailable";
    }
    window.setTimeout(() => { copyButton.textContent = "Copy booking ID"; }, 2500);
  });

  calendarButton.addEventListener("click", () => {
    if (!booking || !slot) return;
    const blob = buildCalendarFile(booking, slot);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `morrowfield-appointment-${booking.id}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  });

  cancelButton.addEventListener("click", () => { cancelConfirm.hidden = false; });
  keepButton.addEventListener("click", () => { cancelConfirm.hidden = true; });
  confirmCancelButton.addEventListener("click", () => onCancel(booking));

  return {
    /** @param {Record<string, any>} newBooking @param {Record<string, any> | null} newSlot @param {(booking: Record<string, any>) => void} cancelHandler */
    show(newBooking, newSlot, cancelHandler = () => {}) {
      booking = newBooking;
      slot = newSlot;
      onCancel = cancelHandler;
      heading.textContent = newBooking.status === "cancelled"
        ? "This appointment was cancelled."
        : "Your appointment is confirmed.";
      renderBookingDetails(details, newBooking, newSlot);
      cancelButton.hidden = newBooking.status === "cancelled";
      calendarButton.disabled = !newSlot;
      cancelConfirm.hidden = true;
      section.hidden = false;
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
      cancelConfirm.hidden = true;
    },
    update(bookingUpdate) {
      this.show(bookingUpdate, slot, onCancel);
    },
    getBooking() {
      return booking;
    },
  };
}
