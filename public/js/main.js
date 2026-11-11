import { request } from "./api.js";
import { createBookingForm } from "./components/bookingForm.js";
import { createConfirmation } from "./components/confirmation.js";
import { createManageComponent } from "./components/manage.js";
import { createMyBookingsComponent } from "./components/myBookings.js";
import { createSlotsComponent } from "./components/slots.js";
import { createStatus } from "./components/status.js";
import { getState, setState } from "./state.js";
import { getTimeZoneName } from "./format.js";

const refreshButton = document.querySelector("#refresh-button");
const slotList = document.querySelector("#slot-list");
const slotsView = createSlotsComponent();
const bookingForm = createBookingForm();
const confirmation = createConfirmation();
const status = createStatus();
const manage = createManageComponent();
const myBookings = createMyBookingsComponent();
myBookings.setStatusHandler((message, isError = false) => {
  if (isError) status.reportError(message);
  else status.announce(message);
});

let idempotencyFingerprint = "";
let idempotencyKey = "";
let rateLimitTimer = 0;
const timeZoneLabel = document.querySelector("#time-zone-label");
timeZoneLabel.textContent = getTimeZoneName();

function scrollBehavior() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

async function loadSlots() {
  setState({ status: "loading" });
  refreshButton.disabled = true;
  slotsView.loading();
  status.announce("Loading available appointments.");
  try {
    const data = await request("/slots");
    const allSlots = Array.isArray(data?.slots) ? data.slots : [];
    const slots = allSlots
      .filter((slot) => slot.available && Date.parse(slot.start) > Date.now())
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    setState({ slots: allSlots, status: "ready" });
    if (slots.length === 0) {
      slotsView.empty();
      status.announce("No appointments available right now.");
    } else {
      slotsView.render(slots);
      status.clear();
    }
    return true;
  } catch (error) {
    setState({ status: "error" });
    slotsView.error();
    status.reportError(error.message || "We couldn't load appointment times.");
    return false;
  } finally {
    refreshButton.disabled = false;
  }
}

function resetAttempt() {
  idempotencyFingerprint = "";
  idempotencyKey = "";
}

slotsView.setHandlers({
  onRetry: () => { void loadSlots(); },
  onSelect: (slot) => {
    resetAttempt();
    setState({ selectedSlot: slot });
    confirmation.hide();
    bookingForm.show(slot);
  },
});

refreshButton.addEventListener("click", () => { void loadSlots(); });
bookingForm.changeTime.addEventListener("click", () => {
  bookingForm.hide();
  slotsView.focus();
});
document.querySelector("#name").addEventListener("input", resetAttempt);
document.querySelector("#email").addEventListener("input", resetAttempt);

async function cancelBooking(booking) {
  const confirmButton = document.querySelector("#confirm-cancel-button");
  confirmButton.disabled = true;
  try {
    const cancelled = await request(`/bookings/${encodeURIComponent(booking.id)}`, { method: "DELETE" });
    setState({ booking: cancelled });
    sessionStorage.setItem("lastBookingId", cancelled.id);
    document.querySelector("#appointments").hidden = true;
    confirmation.show(cancelled, getState().slots.find((slot) => slot.id === cancelled.slot_id) ?? null, cancelBooking);
    await loadSlots();
    status.announce("Appointment cancelled.");
  } catch (error) {
    const message = error.status === 409
      ? "This appointment has already been cancelled."
      : error.status === 404
        ? "We couldn't find that booking."
        : (error.message || "We couldn't cancel this appointment.");
    status.reportError(message);
  } finally {
    confirmButton.disabled = false;
  }
}

document.querySelector("#booking-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!bookingForm.validate()) {
    const message = document.querySelector("#name-error").textContent
      || document.querySelector("#email-error").textContent;
    status.reportError(message);
    return;
  }
  const selectedSlot = getState().selectedSlot;
  if (!selectedSlot) return;

  const values = bookingForm.values();
  const fingerprint = `${selectedSlot.id}\u0000${values.name}\u0000${values.email.toLowerCase()}`;
  if (fingerprint !== idempotencyFingerprint) {
    idempotencyFingerprint = fingerprint;
    idempotencyKey = crypto.randomUUID();
  }

  bookingForm.setSubmitting(true);
  bookingForm.setError("");
  status.clear();
  try {
    const booking = await request("/bookings", {
      method: "POST",
      body: { slot_id: selectedSlot.id, ...values },
      idempotencyKey,
    });
    setState({ booking });
    sessionStorage.setItem("lastBookingId", booking.id);
    document.querySelector("#appointments").hidden = true;
    confirmation.show(booking, selectedSlot, cancelBooking);
    bookingForm.hide();
    resetAttempt();
    await loadSlots();
    status.announce("Your appointment is confirmed.");
  } catch (error) {
    if (error.status === 409) {
      bookingForm.setError("That time was just taken. Choose another available time.");
      bookingForm.hide();
      setState({ selectedSlot: null });
      slotsView.setSelectedSlot(null);
      await loadSlots();
      status.reportError("That time was just taken. Choose another available time.");
      slotList.focus();
      return;
    }
    if (error.status === 404) {
      bookingForm.setError("That appointment is no longer available. Choose another time.");
      status.reportError("That appointment is no longer available.");
      bookingForm.hide();
      setState({ selectedSlot: null });
      slotsView.setSelectedSlot(null);
      await loadSlots();
      status.reportError("That appointment is no longer available.");
      slotList.focus();
      return;
    }
    if (error.status === 400 || error.status === 422) {
      const fieldErrors = error.fieldErrors ?? {};
      bookingForm.applyFieldErrors(fieldErrors);
      const message = Object.keys(fieldErrors).length
        ? "Please correct the highlighted details."
        : (error.message || "Please check your details and try again.");
      bookingForm.setError(message);
      status.reportError(message);
      return;
    }
    if (error.status === 429) {
      startRateLimit(error.retryAfter ?? 60);
      status.reportError("Too many booking attempts. Please wait before trying again.");
      return;
    }
    if (error.status === 401 || error.status === 403) {
      bookingForm.setError("Booking is temporarily unavailable.");
      status.reportError("Booking is temporarily unavailable.");
      return;
    }
    bookingForm.setError(error.message || "We couldn't reach the booking service. Your details are saved. Try again.");
    status.reportError(error.message || "We couldn't reach the booking service. Your details are saved. Try again.");
  } finally {
    if (!rateLimitTimer) bookingForm.setSubmitting(false);
  }
});

function startRateLimit(seconds) {
  window.clearInterval(rateLimitTimer);
  const endsAt = Date.now() + seconds * 1000;
  let previousRemaining = -1;
  const update = () => {
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    bookingForm.setRateLimit(remaining);
    if (remaining !== previousRemaining) {
      status.announce(remaining > 0
        ? `Please wait ${remaining} seconds before trying again.`
        : "You can try booking again.");
      previousRemaining = remaining;
    }
    if (remaining === 0) {
      window.clearInterval(rateLimitTimer);
      rateLimitTimer = 0;
    }
  };
  rateLimitTimer = window.setInterval(update, 1000);
  update();
}

const lookupForm = document.querySelector("#lookup-form");
lookupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.clear();
  await manage.lookup();
});
manage.setHandlers({
  refreshSlots: loadSlots,
  reportStatus: (message, isError = false) => isError ? status.reportError(message) : status.announce(message),
});

document.querySelector("#book-another-button").addEventListener("click", () => {
  confirmation.hide();
  document.querySelector("#appointments").hidden = false;
  sessionStorage.removeItem("lastBookingId");
  bookingForm.clear();
  setState({ booking: null, selectedSlot: null });
  slotsView.setSelectedSlot(null);
  const availableSlots = getState().slots.filter((slot) => slot.available && Date.parse(slot.start) > Date.now());
  if (availableSlots.length) slotsView.render(availableSlots);
  resetAttempt();
  slotList.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
});

async function restoreLastBooking() {
  const id = sessionStorage.getItem("lastBookingId");
  if (!id) return;
  try {
    const booking = await request(`/bookings/${encodeURIComponent(id)}`);
    const slot = getState().slots.find((candidate) => candidate.id === booking.slot_id) ?? null;
    setState({ booking });
    document.querySelector("#appointments").hidden = true;
    confirmation.show(booking, slot, cancelBooking);
  } catch (error) {
    if (error.status === 404) sessionStorage.removeItem("lastBookingId");
    else status.reportError(error.message || "We couldn't restore your booking details.");
  }
}

void loadSlots().then((loaded) => {
  if (loaded) return restoreLastBooking();
});
