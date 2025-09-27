// dashboard.js
import { auth, db } from "./firebase.js";
import {
  ref,
  get,
  child
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

export async function initializeDashboard() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      alert("⚠️ Not signed in. Redirecting...");
      window.location.href = "login.html";
      return;
    }

    try {
      console.log("✅ Logged-in UID:", user.uid);

      const userRef = ref(db);
      const snapshot = await get(child(userRef, `users/${user.uid}`));

      if (!snapshot.exists()) {
        console.error("❌ No user found in DB");
        alert("User not found in database.");
        await auth.signOut();
        window.location.href = "login.html";
        return;
      }

      const userData = snapshot.val();
      console.log("✅ User Data:", userData);

      if (!userData.approved) {
        alert("⏳ Your account is pending approval by the admin.");
        await auth.signOut();
        window.location.href = "login.html";
        return;
      }

      const role = userData.role;
      console.log("✅ User Role:", role);

      switch (role) {
        case "customer":
          window.location.href = "sms.html";
          break;
        case "driver":
          window.location.href = "driver.html";
          break;
        case "parent":
          window.location.href = "parents-dash-navixera.html";
          break;
        case "school-transport":
          window.location.href = "school-tran-dash.html";
          break;
        case "company":
          window.location.href = "comadmin.html";
          break;
        case "super-admin":
          window.location.href = "superadmin.html";
          break;
        default:
          alert("⚠️ Unknown role. Redirecting.");
          await auth.signOut();
          window.location.href = "login.html";
      }

    } catch (error) {
      console.error("🔥 Dashboard error:", error);
      alert("❌ Something went wrong. Check console.");
      await auth.signOut();
      window.location.href = "login.html";
    }
  });
}
