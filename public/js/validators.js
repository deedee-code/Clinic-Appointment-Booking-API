const emailPattern = /^(?!\.)(?!.*\.\.)([a-z0-9_'+\-.]*)[a-z0-9_+-]@([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}$/i;

/** @param {{ name: string, email: string }} values @returns {Record<string, string>} */
export function validateBooking(values) {
  const errors = {};
  const name = values.name.trim();
  const email = values.email.trim();
  if (!name) errors.name = "Enter your full name.";
  else if (name.length > 200) errors.name = "Your name must be 200 characters or fewer.";
  if (!email) errors.email = "Enter your email address.";
  else if (email.length > 254 || !emailPattern.test(email)) errors.email = "Enter a valid email address.";
  return errors;
}

/** @param {string} value */
export function normalizeEmail(value) {
  return value.trim().toLowerCase();
}
