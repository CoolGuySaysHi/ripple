// config.js
window.RR_CONFIG = {
  BROTHER_EMAIL: "fairfieldg2016@gmail.com",

  // Admin access code (people who enter this on signup become admin)
  ADMIN_CODE: "ripple-admin-1245",

  // EmailJS (auto-enabled)
  // Fill these from EmailJS dashboard:
  // Public Key, Service ID, Template ID
  EMAILJS: {
    ENABLED: true,
    PUBLIC_KEY: "nlqS67-oDZI6VMHPw",      // e.g. "xYz123..."
    SERVICE_ID: "service_vmsj1ah",      // e.g. "service_abcd12"
    TEMPLATE_ID: "template_5sm4cpc",     // e.g. "template_efgh34"
  },

  SLOTS: {
    START_HOUR: 7,
    END_HOUR: 21,
    STEP_MIN: 30,
  }
};
