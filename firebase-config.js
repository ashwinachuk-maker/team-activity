try {
  const firebaseConfig = {
    apiKey:            "AIzaSyD3AADJHswpp2h7f2s1i8WAanc_0twvQ3U",
    authDomain:        "team-activity-83722.firebaseapp.com",
    databaseURL:       "https://team-activity-83722-default-rtdb.firebaseio.com",
    projectId:         "team-activity-83722",
    storageBucket:     "team-activity-83722.firebasestorage.app",
    messagingSenderId: "891464752556",
    appId:             "1:891464752556:web:1a1d0db206be69af2f2e09",
    measurementId:     "G-SF8YK1G0V6",
  };
  firebase.initializeApp(firebaseConfig);
  window.db = firebase.database();
  console.log('✅ Firebase connected');
} catch (e) {
  console.warn('⚠️  Firebase not available — using localStorage fallback', e);
  window.db = null;
}
