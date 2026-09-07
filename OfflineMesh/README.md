# 🚨 Offline Mesh — Peer-to-Peer Disaster Alert System

A React Native app that broadcasts flood alerts across 5 Android phones using
Bluetooth Low Energy (BLE) — **no WiFi, no internet, no cloud backend required**.

Built for disaster-prone regions (Himalayan GLOFs, Teesta basin floods) where
cellular infrastructure fails exactly when it's needed most.

---

## How It Works

```
[Authority Phone] ──BLE──> [Phone 2] ──BLE──> [Phone 3]
                                 └──BLE──> [Phone 4] ──BLE──> [Phone 5]
```

1. Authority taps **SEND FLOOD ALERT**
2. Message broadcasts via BLE to all directly-connected peers
3. Each peer relays the message (TTL=5 hops, dedup via UUID)
4. Every phone shows a full-screen red alert within ~5 seconds
5. No duplicates — each `message_id` is only displayed once

---

## Setup

### Prerequisites

- Node.js 18+
- React Native CLI: `npm install -g react-native@0.73.6`
- Android SDK (API 26+, Build Tools 33+)
- 5 Android phones with Bluetooth ON, BLE 4.2+

### Install

```bash
git clone https://github.com/<your-repo>/OfflineMesh.git
cd OfflineMesh
npm install
```

### Android setup

```bash
# Connect one phone via USB, enable USB debugging
npx react-native run-android
```

Repeat for all 5 phones. They can also all pull from the same APK after the
first build:

```bash
# Build release APK
cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

---

## Demo Walkthrough (< 5 minutes)

1. **Start all 5 phones** with the app open
2. Wait ~10 seconds for BLE peer discovery (status bar shows "N peers connected")
3. On the **authority phone**: switch to the 🚨 Authority tab
4. On the **other 4 phones**: leave on the 📡 Receiver tab
5. On authority phone: tap the big red **SEND FLOOD ALERT** button
6. Watch the other 4 phones light up with the red alert screen
7. Note the delivery time shown on the authority phone

**Target: all 4 phones alert within 5 seconds.**

---

## Testing Checklist (Saturday 4 PM)

- [ ] 5 phones auto-pair (run 10 times, should connect within 15 sec)
- [ ] Alert: phone 1 → 5 in < 5 seconds
- [ ] No duplicates: send 3 times, each phone shows alert once per send
- [ ] No loops: wait 30 sec after send, no extra alerts appear
- [ ] Offline mode: airplane mode ON on all phones → demo works
- [ ] Battery: all phones ≥ 80%
- [ ] Full demo < 5 min
- [ ] Backup video recorded (2–3 min MP4)

---

## Project Structure

```
OfflineMesh/
├── src/
│   ├── screens/
│   │   ├── SenderScreen.js      # Big red button, delivery stats
│   │   └── ReceiverScreen.js    # Full-screen alert overlay
│   ├── services/
│   │   ├── BleService.js        # BLE scan, connect, broadcast, listen
│   │   └── MessageService.js    # Dedup, TTL, relay logic
│   ├── context/
│   │   └── MessageContext.js    # Global state + BLE lifecycle
│   └── App.js                   # Root + tab navigation
├── android/
│   └── app/src/main/
│       └── AndroidManifest.xml  # BLE permissions (API 26–34)
├── index.js
├── app.json
└── package.json
```

---

## Message Schema

```json
{
  "sender_id":  "uuid-of-originating-device",
  "message":    "FLOOD ALERT",
  "timestamp":  1693000000000,
  "ttl":        5,
  "message_id": "unique-uuid-per-alert"
}
```

| Field        | Purpose                                      |
|--------------|----------------------------------------------|
| `sender_id`  | Identifies the authority phone               |
| `message`    | Alert text                                   |
| `timestamp`  | Unix ms — used to compute latency            |
| `ttl`        | Hop limit. Decremented each relay. Stop at 0 |
| `message_id` | Dedup key — each alert processed once only   |

---

## BLE Architecture

- **Service UUID**: `12345678-1234-1234-1234-123456789abc`
- **Characteristic UUID**: `87654321-4321-4321-4321-cba987654321`
- Each phone acts as both **central** (scans for peers) and **peripheral** (advertises the service)
- Messages are JSON-encoded, base64-wrapped GATT characteristic writes

---

## Key Dependencies

| Package                  | Version | Purpose                    |
|--------------------------|---------|----------------------------|
| `react-native`           | 0.73.6  | Framework                  |
| `react-native-ble-plx`   | 3.2.1   | BLE central + peripheral   |
| `react-native-paper`     | 5.12.3  | UI components              |
| `react-native-uuid`      | 2.0.2   | Unique message IDs         |

---

## Backup Plan

If live demo fails:
1. Play pre-recorded 2–3 min video (record Saturday evening)
2. Show GitHub: code + commit history + this README
3. Demo script: *"We tested 10+ times. Video proves it works."*

---

## Demo Script

> "We have 5 phones arranged here. No WiFi. No internet. Just Bluetooth.
> I'm triggering a flood alert from this authority phone. [Tap button]
> Watch the other phones… they're all receiving the alert.
> Alert reached all 4 phones in 3.2 seconds. No cloud. No infrastructure.
> Just peer-to-peer Bluetooth. In Teesta basin, when cell towers fail —
> this is how people survive."

---

## Team

| Role              | Responsibilities                                  |
|-------------------|---------------------------------------------------|
| React Native lead | Architecture, BleService.js                      |
| UI/Frontend       | SenderScreen, ReceiverScreen, MessageContext      |
| QA/Tester         | Phone testing, backup video, test matrix          |
| Product/Pitch     | README, demo script, slides, pitch rehearsal      |
