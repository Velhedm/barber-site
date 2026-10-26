/* Public settings only. Never place bot tokens or private API keys here. */
window.BARBER_CONFIG = {
  phone: '994513513955',
  // Confirmed appointments only, Baku timezone. No names or phone numbers here.
  // Example format (not actual bookings): '2099-01-15': ['10:00', '11:00'].
  // For a multi-hour appointment block every affected hour separately.
  busySlots: {},
  // Confirmed service prices in Azerbaijani manat (AZN).
  prices: { haircut: 40, kids: 35, beard: 25, combo: 50, peeling: 30, styling: 20 },
  // Optional EmailJS REST integration. Public key, service and template IDs only.
  // Template fields: client_name, client_phone, service, date, time, timezone,
  // note, language, booking_id. Fix the recipient in the EmailJS dashboard.
  emailjs: { publicKey: '', serviceId: '', templateId: '' }
};
