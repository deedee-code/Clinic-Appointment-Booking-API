import { request } from "../api.js";
import { formatDateTime } from "../format.js";
import { normalizeEmail } from "../validators.js";

export function createMyBookingsComponent() {
  const form = document.querySelector("#my-bookings-form");
  const emailField = document.querySelector("#history-email");
  const list = document.querySelector("#my-bookings-list");
  const more = document.querySelector("#load-more-button");
  let email = "";
  let cursor = null;
  let slots = [];
  let onStatus = () => {};

  function renderBooking(booking) {
    const item = document.createElement("article");
    item.className = "history-item";
    const title = document.createElement("h3");
    title.textContent = booking.name;
    const meta = document.createElement("p");
    const slot = slots.find((candidate) => candidate.id === booking.slot_id);
    meta.textContent = slot
      ? `${formatDateTime(slot.start)} · ${booking.status}`
      : `Booking ${booking.status}`;
    const id = document.createElement("p");
    id.textContent = `Booking ID: ${booking.id}`;
    item.append(title, meta, id);
    return item;
  }

  async function loadPage(append) {
    more.disabled = true;
    list.setAttribute("aria-busy", "true");
    if (!append) {
      list.replaceChildren();
      const loading = document.createElement("p");
      loading.textContent = "Loading your bookings…";
      list.append(loading);
    }
    try {
      const query = new URLSearchParams({ email, limit: "10" });
      if (append && cursor) query.set("cursor", cursor);
      const data = await request(`/bookings?${query}`);
      try {
        const slotData = await request("/slots");
        slots = slotData.slots;
      } catch {
        slots = [];
        onStatus("Bookings loaded, but appointment time details are temporarily unavailable.", true);
      }
      if (!append) list.replaceChildren();
      if (data.bookings.length === 0 && !append) {
        const empty = document.createElement("p");
        empty.textContent = "No bookings found for that email address.";
        list.append(empty);
        onStatus(empty.textContent);
      } else {
        for (const booking of data.bookings) list.append(renderBooking(booking));
        onStatus(append ? "More bookings loaded." : `${data.bookings.length} bookings loaded.`);
      }
      cursor = data.next_cursor;
      more.hidden = !cursor;
    } catch (error) {
      if (!append) list.replaceChildren();
      const message = document.createElement("p");
      message.className = "form-error";
      message.textContent = error.message || "We couldn't load your bookings.";
      list.append(message);
      onStatus(message.textContent, true);
      more.hidden = true;
    } finally {
      list.setAttribute("aria-busy", "false");
      more.disabled = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    email = normalizeEmail(emailField.value);
    cursor = null;
    onStatus("Loading your bookings.");
    void loadPage(false);
  });
  more.addEventListener("click", () => { void loadPage(true); });

  return {
    form,
    setStatusHandler(handler) {
      onStatus = handler;
    },
  };
}
