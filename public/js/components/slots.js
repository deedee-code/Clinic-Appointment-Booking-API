import { dayKey, formatDay, formatTime, formatTimeRange } from "../format.js";

export function createSlotsComponent() {
  const selector = document.querySelector("#day-selector");
  const list = document.querySelector("#slot-list");
  const state = document.querySelector("#slot-state");
  let selectedSlotId = null;
  let activeDayKey = null;
  let groupedSlots = new Map();
  let retryHandler = () => {};
  let selectHandler = () => {};

  function showState(message, actionLabel = "") {
    state.replaceChildren();
    state.hidden = false;
    if (message) {
      const text = document.createElement("p");
      text.textContent = message;
      state.append(text);
    }
    if (actionLabel) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "button-secondary";
      retry.textContent = actionLabel;
      retry.addEventListener("click", retryHandler);
      state.append(retry);
    }
  }

  return {
    setHandlers({ onRetry, onSelect }) {
      retryHandler = onRetry;
      selectHandler = onSelect;
    },
    loading() {
      selector.replaceChildren();
      list.replaceChildren();
      groupedSlots = new Map();
      activeDayKey = null;
      state.hidden = true;
      const skeletons = document.createDocumentFragment();
      for (let index = 0; index < 3; index += 1) {
        const skeleton = document.createElement("div");
        skeleton.className = "skeleton";
        skeleton.setAttribute("aria-hidden", "true");
        skeletons.append(skeleton);
      }
      list.append(skeletons);
    },
    empty() {
      selector.replaceChildren();
      list.replaceChildren();
      showState("No appointments available right now");
    },
    error() {
      selector.replaceChildren();
      list.replaceChildren();
      showState("", "Retry");
    },
    render(slots) {
      selector.replaceChildren();
      list.replaceChildren();
      state.hidden = true;
      groupedSlots = new Map();
      for (const slot of slots) {
        const key = dayKey(slot.start);
        if (!groupedSlots.has(key)) groupedSlots.set(key, []);
        groupedSlots.get(key).push(slot);
      }
      if (!groupedSlots.has(activeDayKey)) activeDayKey = groupedSlots.keys().next().value ?? null;

      for (const [key, daySlots] of groupedSlots) {
        const dayButton = document.createElement("button");
        dayButton.type = "button";
        dayButton.className = "day-choice";
        dayButton.setAttribute("aria-pressed", String(key === activeDayKey));
        dayButton.setAttribute("aria-label", `${formatDay(daySlots[0].start)}, ${daySlots.length} available times`);
        dayButton.textContent = `${formatDay(daySlots[0].start)} (${daySlots.length})`;
        dayButton.addEventListener("click", () => {
          activeDayKey = key;
          this.render(slots);
        });
        selector.append(dayButton);
      }

      const daySlots = groupedSlots.get(activeDayKey) ?? [];
      const section = document.createElement("section");
      section.className = "slot-day";
      section.setAttribute("aria-labelledby", "selected-day-heading");
      const heading = document.createElement("h3");
      heading.id = "selected-day-heading";
      heading.textContent = daySlots.length ? formatDay(daySlots[0].start) : "";
      const options = document.createElement("div");
      options.className = "slot-day-options";

      for (const slot of daySlots) {
        const button = document.createElement("button");
        button.className = "slot-option";
        button.type = "button";
        button.setAttribute("aria-pressed", String(selectedSlotId === slot.id));
        button.setAttribute("aria-label", `${formatTimeRange(slot.start, slot.end)}, ${slot.provider}`);
        const time = document.createElement("span");
        time.className = "slot-time";
        time.textContent = formatTime(slot.start);
        const provider = document.createElement("span");
        provider.className = "slot-provider";
        provider.textContent = `Until ${formatTime(slot.end)} · ${slot.provider}`;
        button.append(time, provider);
        button.addEventListener("click", () => {
          selectedSlotId = slot.id;
          this.render(slots);
          selectHandler(slot);
        });
        options.append(button);
      }
      section.append(heading, options);
      list.append(section);
    },
    setSelectedSlot(id) {
      selectedSlotId = id;
    },
    focus() {
      list.querySelector(".slot-option")?.focus();
    },
  };
}
