// config.js
// IMPORTANT: This is still client-side. Don't put real secrets you care about here.

window.RR_CONFIG = {
  BROTHER_EMAIL: "fairfieldg2016@gmail.com",

  // Admin setup:
  // Pick a code and keep it private-ish. (Still not truly secure; it’s client-side.)
  ADMIN_CODE: "ripple-admin-1245",

  // EmailJS (optional)
  EMAILJS: {
    ENABLED: true,              // auto-enable
    PUBLIC_KEY: "",             // e.g. "abc123"
    SERVICE_ID: "",             // e.g. "service_xxx"
    TEMPLATE_ID: "",            // e.g. "template_yyy"
  },

  // Booking hours
  SLOTS: {
    START_HOUR: 7,
    END_HOUR: 21,
    STEP_MIN: 30,
  }
};
