# True Talkie — Setup Guide

## Step 1: Supabase Setup (5 minutes)

1. Go to [supabase.com](https://supabase.com) → create a free account → New Project
2. Open **SQL Editor** → paste the contents of `supabase/schema.sql` → **Run**
3. Go to **Project Settings → API** → copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon public key**
4. Open `src/lib/supabase.ts` and replace:
   ```ts
   const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
   ```
5. In Supabase Dashboard → **Database → Replication** → enable Realtime for the `signaling` table

---

## Step 2: EAS Account + Build (10 minutes)

```bash
# Login to Expo (free account)
eas login

# Configure project (run once)
eas build:configure

# Build development APK (runs in the cloud, free)
eas build --platform android --profile development
```

- EAS will give you a QR code or download link for the APK
- Install it on **both Android phones**

---

## Step 3: Test

1. Open True Talkie on **Phone 1** → enter name → enter `CH-7` → Join
2. Open True Talkie on **Phone 2** → enter name → enter `CH-7` → Join
3. Hold the big yellow button on Phone 1 → speak → Phone 2 should hear it
4. Lock Phone 2 screen → Phone 1 talks again → Phone 2 still hears it ✅

---

## Project Structure

```
TrueTalkie/
├── App.tsx                          ← Root, screen navigation
├── app.json                         ← Expo config + plugins + permissions
├── eas.json                         ← EAS build profiles
├── src/
│   ├── lib/
│   │   └── supabase.ts              ← Supabase client (add your keys here)
│   ├── store/
│   │   └── channelStore.ts          ← Zustand global state
│   ├── services/
│   │   ├── SignalingService.ts      ← WebRTC signaling via Supabase
│   │   ├── WebRTCService.ts         ← P2P audio + PTT mute/unmute
│   │   ├── ChannelService.ts        ← Main orchestrator
│   │   └── ForegroundService.ts    ← Android locked-screen audio
│   └── screens/
│       ├── HomeScreen.tsx           ← Name + channel code entry
│       └── ChannelScreen.tsx        ← PTT interface
└── supabase/
    └── schema.sql                   ← Run this in Supabase SQL Editor
```

---

## How It Works

```
Phone A joins CH-7
  → Supabase creates/finds room
  → WebRTC mic initialized (muted)
  → Presence subscription started
  → Foreground service started (keeps audio alive when locked)

Phone B joins CH-7
  → Supabase Presence detects Phone A
  → Phone B sends WebRTC OFFER to Phone A (via signaling table)
  → Phone A sends ANSWER back
  → ICE candidates exchanged via Supabase
  → STUN resolves direct path between phones
  → P2P audio connected ✅

PTT pressed on Phone A:
  → Local audio track enabled
  → Presence broadcasts: { transmitting: true }
  → Phone B sees "🎙️ Worker A is speaking"
  → Voice flows directly A → B (no server in the middle)

PTT released:
  → Audio track muted
  → Presence broadcasts: { transmitting: false }
```
