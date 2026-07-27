# Accounts & cross-device sync — setup

The app now has a first-run screen offering **Create account** or **Continue as guest**, and an
**Account** section in Settings.

Right now `manifest.json` has `"firebase": null`, so **accounts are switched off and everyone is a
guest** — every study feature works exactly as before, progress saved on the device. Nothing breaks
by leaving it this way.

To switch accounts on, do the five steps below (about 10 minutes). I can't do them for you because
they involve creating an account and agreeing to terms.

---

## Why Firebase and not Supabase

You picked "proper accounts" on the condition it's free with no problems. I checked both, and
**Supabase's free tier has two problems for this app**:

| | Supabase free | Firebase Spark (free) |
|---|---|---|
| Inactivity | **Project pauses after 7 days idle** — sync would break every holiday until manually resumed | No inactivity pausing |
| Signup emails | **2 auth emails/hour** on the default SMTP — a batch of students signing up the same evening would mostly fail | 1,000 verification emails/day |
| Database | 500 MB | 1 GiB Firestore |
| Users | 50,000 MAU | 3,000 daily active users |
| Reads/writes | unlimited API | 50,000 reads + 20,000 writes/day |

For a batch of a few hundred students, Firebase's quotas are comfortable and neither problem exists.
Supabase would have needed a keep-alive cron *and* a separate SMTP provider to work properly.

**Sizing check for ~300 students:** progress docs are roughly 50–200 KB each → well under 1 GiB;
syncing a few times a day each is a few thousand writes → well under 20,000/day.

---

## Setup

### 1. Create the Firebase project
Go to <https://console.firebase.google.com> → **Add project**. Name it anything (e.g. `medcall`).
You can turn Google Analytics **off** — it isn't needed.

### 2. Turn on Email/Password sign-in
**Build → Authentication → Get started → Email/Password → Enable → Save.**

Leave "Email link (passwordless sign-in)" off.

### 3. Create the Firestore database
**Build → Firestore Database → Create database → Start in production mode.**
Pick the region closest to your users (e.g. `europe-west1`).

### 4. Set the security rules
In **Firestore → Rules**, replace everything with this and press **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Each signed-in user can read and write ONLY their own progress document.
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

This matters: without it, one student could read another's data.

### 5. Paste the config into `manifest.json`
**Project settings (gear icon) → Your apps → Web (`</>`) → register app** → copy the `firebaseConfig`
object. Then in `manifest.json` replace `"firebase": null` with it:

```json
"firebase": {
  "apiKey": "AIza…",
  "authDomain": "medcall-xxxx.firebaseapp.com",
  "projectId": "medcall-xxxx",
  "appId": "1:123…:web:abc…"
},
```

Also bump `"manifestVersion"` by 1 so devices pick up the change.

> These keys are **public by design** — they identify the project, they don't grant access.
> Your security comes from the rules in step 4. It is safe to commit them.

Commit, push, and the next time anyone opens the app they'll be offered an account.

---

## How it behaves

- **Guest** — everything on-device, exactly as before. No Firebase code is ever downloaded.
- **Create account** — existing on-device progress is **merged into** the new account, not replaced.
- **Sign in on a second device** — that device's progress merges with the account's. Nothing is lost
  on either side.
- **Sync timing** — on opening the app, and ~6 seconds after finishing answering (debounced), plus a
  manual **Sync now** button. Toggleable in Settings → Account.
- **Offline** — sync is skipped silently and retried next time; studying is unaffected.
- **Sign out** — progress stays on the device, syncing stops.

### Merge rules (the important part)

Answer history is the source of truth. Two devices used offline get **unioned**, then counters are
recalculated from the union — so no attempt is lost and re-syncing the same data never inflates
anything. Per-day XP and study time take the **max** for that day rather than summing, so repeated
syncs can't double-count. SRS scheduling state comes from the most recent review.

Device-local preferences (theme, wallpaper, maintainer mode, GitHub token) deliberately **do not**
travel between devices. Only study preferences do.

Uploaded answer history is trimmed to the **20 most recent attempts per question** to stay well under
Firestore's 1 MiB per-document limit — counters and SRS state are unaffected, and full history stays
on the device.

---

## Tests

`tests/sync.test.js` covers the merge logic — union without duplication, idempotency, no XP
double-counting, history trimming, and that device-local settings don't sync. Run with `npm test`.
