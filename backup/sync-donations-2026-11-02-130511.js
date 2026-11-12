const Stripe = require("stripe");
const admin = require("firebase-admin");

const PAYMENT_LINK_ID = "plink_1UXIbNG4LUahiyOMyENl9TEu";
const AD_FREE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value;
}

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"));
const serviceAccount = JSON.parse(
  requireEnv("FIREBASE_SERVICE_ACCOUNT_JSON")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function grantAdFreeMonth(session) {
  const uid = session.client_reference_id;
  const userRef = db.collection("users").doc(uid);
  const donationRef = db.collection("stripeDonations").doc(session.id);
  let granted = false;

  await db.runTransaction(async (transaction) => {
    const donationDoc = await transaction.get(donationRef);

    if (donationDoc.exists) {
      return;
    }

    const userDoc = await transaction.get(userRef);
    const now = admin.firestore.Timestamp.now();
    const currentEnd = userDoc.get("adFreeUntil");

    const base = currentEnd &&
      typeof currentEnd.toMillis === "function" &&
      currentEnd.toMillis() > now.toMillis()
      ? currentEnd
      : now;

    const newEnd = admin.firestore.Timestamp.fromMillis(
      base.toMillis() + AD_FREE_MONTH_MS
    );

    transaction.set(userRef, {
      adFreeUntil: newEnd,
      lastDonationAt: now,
      lastStripeSessionId: session.id,
    }, {merge: true});

    transaction.set(donationRef, {
      uid: uid,
      sessionId: session.id,
      amountTotal: session.amount_total,
      currency: session.currency,
      paidAt: now,
      adFreeUntil: newEnd,
    });

    granted = true;
  });

  return granted;
}
