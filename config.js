// config.js
window.RR_CONFIG = {
  OWNER_EMAIL: "fairfieldg2016@gmail.com",

  // Admins (simple + works without backend custom claims)
  // Put your brother's email here (and yours if you want).
  ADMIN_EMAILS: [
    "fairfieldg2016@gmail.com"
  ],

  // Firebase web app config (paste from Firebase console)
  FIREBASE: {
    apiKey: "AIzaSyBZ9BX4bRJA_BCgmtrrHnjX2L1aBpnr2QE",
    authDomain: "ripple-21297.firebaseapp.com",
    projectId: "ripple-21297",
    storageBucket: "ripple-21297.firebasestorage.app",
    messagingSenderId: "785096023018",
    appId: "1:785096023018:web:891dd676aa4b40f66b7093",
   measurementId: "G-TWB5KR1CZH"
},

  // EmailJS (optional). If left blank, app still works; no email sent.
EMAILJS: {
  ENABLED: true,
  PUBLIC_KEY: "nlqS67-oDZI6VMHPw",      // e.g. "xYz123..."
  SERVICE_ID: "service_vmsj1ah",      // e.g. "service_abcd12"
  TEMPLATE_ID: "template_5sm4cpc",

  SLOTS: {
    START_HOUR: 7,
    END_HOUR: 21,
    STEP_MIN: 30
  }
  }
};
