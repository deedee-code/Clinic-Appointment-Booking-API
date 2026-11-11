import { request } from "../api.js";
import { renderBookingDetails } from "./confirmation.js";

export function createManageComponent() {
  const form = document.querySelector("#lookup-form");
  const idField = document.querySelector("#lookup-id");
  const result = document.querySelector("#manage-result");
  let onSlotsRefresh = () => {};
  let onStatus = () => {};

  function showMessage(message, isError = false) {
    result.replaceChildren();
    result.hidden = false;
    const paragraph = document.createElement("p");
    paragraph.className = isError ? "form-error" : "muted";
    paragraph.textContent = message;
    result.append(paragraph);
  }

  function render(booking, slot) {
    result.replaceChildren();
    result.hidden = false;
    const heading = document.createElement("h3");
    heading.textContent = booking.status === "cancelled" ? "This appointment was cancelled." : "Booking details";
    const details = document.createElement("dl");
    details.className = "details-list";
    renderBookingDetails(details, booking, slot);
    result.append(heading, details);

    if (booking.status !== "cancelled") {
      const actions = document.createElement("div");
      actions.className = "manage-actions";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "button-secondary button-danger";
      cancel.textContent = "Cancel this appointment";
      const confirm = document.createElement("div");
      confirm.className = "cancel-confirm";
      confirm.hidden = true;
      const prompt = document.createElement("span");
      prompt.textContent = "Cancel appointment?";
      const yes = document.createElement("button");
      yes.type = "button";
      yes.className = "button-danger";
      yes.textContent = "Yes, cancel";
      const no = document.createElement("button");
      no.type = "button";
      no.className = "button-secondary";
      no.textContent = "Keep it";
      cancel.addEventListener("click", () => { confirm.hidden = false; });
      no.addEventListener("click", () => { confirm.hidden = true; });
      yes.addEventListener("click", async () => {
        yes.disabled = true;
        try {
          const cancelled = await request(`/bookings/${encodeURIComponent(booking.id)}`, { method: "DELETE" });
          render(cancelled, slot);
          await onSlotsRefresh();
          onStatus("Appointment cancelled.");
        } catch (error) {
          const message = error.status === 409
            ? "This appointment has already been cancelled."
            : error.status === 404
              ? "We couldn't find that booking."
              : (error.message || "We couldn't cancel this appointment.");
          showMessage(message, true);
          onStatus(message, true);
        }
      });
      confirm.append(prompt, yes, no);
      actions.append(cancel, confirm);
      result.append(actions);
    }
  }

  return {
    setHandlers({ refreshSlots, reportStatus }) {
      onSlotsRefresh = refreshSlots;
      onStatus = reportStatus;
    },
    form,
    async lookup(id = idField.value.trim()) {
      if (!id) {
        showMessage("Enter your booking ID to find an appointment.", true);
        onStatus("Enter your booking ID to find an appointment.", true);
        idField.focus();
        return null;
      }
      showMessage("Looking up your booking…");
      onStatus("Looking up your booking.");
      try {
        const booking = await request(`/bookings/${encodeURIComponent(id)}`);
        let slot = null;
        try {
          const slots = await request("/slots");
          slot = slots.slots.find((item) => item.id === booking.slot_id) ?? null;
        } catch {
          onStatus("Booking found, but appointment time details are temporarily unavailable.", true);
        }
        render(booking, slot);
        if (slot) onStatus("Booking details loaded.");
        return booking;
      } catch (error) {
        const message = error.status === 404
          ? "We couldn't find a booking with that ID."
          : (error.message || "We couldn't load that booking.");
        showMessage(message, true);
        onStatus(message, true);
        return null;
      }
    },
  };
}
