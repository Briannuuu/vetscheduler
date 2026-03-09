const firebaseConfig = {
  apiKey: "AIzaSyDYSo475xHUxTuiHatK7_5sjRYjEBDEl3g",
  authDomain: "vetscheduler-sbsi.firebaseapp.com",
  projectId: "vetscheduler-sbsi",
  storageBucket: "vetscheduler-sbsi.firebasestorage.app",
  messagingSenderId: "366267339544",
  appId: "1:366267339544:web:2d662885a9b920d50e046d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth();
