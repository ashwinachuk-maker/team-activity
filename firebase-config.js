// ─── FIREBASE CONFIG ─────────────────────────────────────────────────────────
// Get these values from:
// Firebase Console → Project Settings → Your apps → Web app → SDK setup
try {
  const firebaseConfig = {
    apiKey:            "YOUR_API_KEY",
    authDomain:        "team-activity-83722.firebaseapp.com",
    databaseURL:       "https://team-activity-83722-default-rtdb.firebaseio.com",
    projectId:         "team-activity-83722",
    storageBucket:     "team-activity-83722.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId:             "YOUR_APP_ID",
  };
  firebase.initializeApp(firebaseConfig);
  window.db = firebase.database();
  console.log('✅ Firebase connected');
} catch (e) {
  console.warn('⚠️  Firebase not configured — using localStorage fallback', e);
  window.db = null;
}
