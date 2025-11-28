# NFC Sticker - NTAG 424 DNA Verification System

Cryptographic NFC tag verification using NXP NTAG 424 DNA with Secure Dynamic Messaging (SDM/SUN).

## Overview

This system enables secure, verifiable NFC tags that generate unique cryptographic signatures on each tap. No special app required for verification - any NFC-enabled smartphone can validate tags via URL.

### How It Works

1. **Tap** → Tag generates unique URL with UID, counter, and CMAC
2. **Open** → Phone automatically opens URL in browser
3. **Verify** → Backend validates CMAC using shared secret key
4. **Confirm** → User sees verification result

---

## Project Structure

```
NFC_sticker/
├── android/
│   └── Ntag424SdmFeature/    # Android app for tag provisioning
│       ├── app/
│       │   ├── src/main/java/    # Application code
│       │   └── libs/             # Contains ntag424 JAR
│       └── debug/                # Pre-built debug APK
├── backend/
│   └── (verification server)     # Your verification API
└── readme.md
```

---

## Prerequisites

### Hardware

- NTAG 424 DNA or NTAG 424 DNA TagTamper NFC tags
- Android phone with NFC capability
- USB cable for connecting phone to computer (for development)

### Software

- [Android Studio](https://developer.android.com/studio) (for building/modifying the app)
- Git

---

## Quick Start

### Step 1: Clone the Sample App

```bash
git clone https://github.com/AndroidCrypto/Ntag424SdmFeature.git
```

This is a ready-to-use Android app for configuring NTAG 424 DNA tags.

### Step 2: Open in Android Studio

1. Open Android Studio
2. **File → Open** → Select the `Ntag424SdmFeature` folder
3. Wait for Gradle to sync

### Step 3: Prepare Your Android Phone

1. Enable **Developer Options**:

   - Go to Settings → About Phone
   - Tap "Build Number" 7 times

2. Enable **USB Debugging**:

   - Settings → Developer Options → USB Debugging → On

3. Enable **NFC**:

   - Settings → Connections → NFC → On

4. Connect phone to computer via USB

### Step 4: Run the App

1. In Android Studio, select your phone from the device dropdown
2. Click the **Run** button (▶️) or press `Shift+F10`
3. App will install and launch on your phone

---

## Configuring a Tag

### Check Tag Status (Tag Overview)

Before configuring, check if the tag is factory fresh:

1. Open the app → scroll down → tap **"Tag Overview"**
2. Place tag on back of phone and hold steady
3. Check the output:

**Factory fresh tag shows:**

```
AES Authentication SUCCESS
Authentication with FACTORY ACCESS_KEY 0
App Key 1 is FACTORY key
App Key 2 is FACTORY key
App Key 3 is FACTORY key
App Key 4 is FACTORY key
isSdmEnabled: false
```

### Enable Plaintext SDM (Recommended First Test)

This is the simplest configuration - UID and counter are visible in plaintext, protected by CMAC.

1. From main menu, tap **"Setup Plaintext SUN Message"**
2. Select **"UID + Counter + CMAC"**
3. Place tag on phone and hold steady until complete

**Expected output:**

```
AES Authentication SUCCESS
File 02h Writing the NDEF URL Template SUCCESS
File 02h Change File Settings SUCCESS
== FINISHED ==
```

### Test the Configured Tag

1. Close the app (go to home screen)
2. Tap the tag on your phone
3. Phone will prompt to open a URL
4. Browser opens: `https://sdm.nfcdeveloper.com/tagpt?uid=...&ctr=...&cmac=...`
5. Page shows: **"Cryptographic signature validated"**

Each subsequent tap increments the read counter and generates a new CMAC.

---

## Configuration Options

The app supports multiple SDM configurations:

| Option                | UID       | Counter   | File Data | Use Case              |
| --------------------- | --------- | --------- | --------- | --------------------- |
| Plaintext SUN         | Visible   | Visible   | No        | Simple authentication |
| Encrypted SUN         | Encrypted | Encrypted | No        | Hide tag identity     |
| Encrypted File SUN    | Encrypted | Encrypted | Yes       | Store additional data |
| With Custom Keys      | -         | -         | -         | Production security   |
| With Diversified Keys | -         | -         | -         | Maximum security      |

### Plaintext vs Encrypted

- **Plaintext**: UID/counter visible in URL, CMAC proves authenticity
- **Encrypted**: UID/counter encrypted, only your backend can decrypt

### Key Management

| Key   | Default             | Purpose                              |
| ----- | ------------------- | ------------------------------------ |
| Key 0 | Factory (all zeros) | Master application key               |
| Key 1 | Factory             | Reserved                             |
| Key 2 | Factory             | SDM Meta Read (PICC encryption)      |
| Key 3 | Factory             | SDM File Read (file data encryption) |
| Key 4 | Factory             | SDM Read Counter                     |

**⚠️ For production: Always change keys from factory defaults!**

---

## URL Template Format

The tag stores a URL template with placeholders:

```
https://your-server.com/verify?uid={UID}&ctr={COUNTER}&cmac={MAC}
```

| Placeholder | Bytes    | Description                        |
| ----------- | -------- | ---------------------------------- |
| `{UID}`     | 7        | Tag unique identifier              |
| `{COUNTER}` | 3        | Read counter (increments each tap) |
| `{MAC}`     | 8        | Truncated CMAC signature           |
| `{PICC}`    | 16/24    | Encrypted UID + counter            |
| `{FILE}`    | Variable | Encrypted file data                |

---

## Backend Verification

### Demo Server

The app uses `sdm.nfcdeveloper.com` for testing. Source code:

- https://github.com/nfc-developer/sdm-backend

### Build Your Own Backend

Python/Flask example: https://github.com/lucashenning/ntag424-backend

```bash
git clone https://github.com/lucashenning/ntag424-backend.git
cd ntag424-backend
pip3 install -r requirements.txt
cp config.dist.py config.py
# Edit config.py with your keys
python3 app.py
```

### Verification Logic

```python
# Pseudocode for CMAC verification
def verify_tag(uid, counter, cmac):
    # Reconstruct the message that was signed
    message = uid + counter

    # Calculate expected CMAC using shared secret key
    expected_cmac = calculate_cmac(key, message)

    # Compare (first 8 bytes)
    if cmac == expected_cmac[:8]:
        return "Valid"
    else:
        return "Invalid"
```

---

## Resources

### Documentation

- [NTAG 424 DNA Datasheet](https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf)
- [AN12196 - Features and Hints](https://www.nxp.com/docs/en/application-note/AN12196.pdf)
- [AN10922 - Key Diversification](https://www.nxp.com/docs/en/application-note/AN10922.pdf)

### Source Repositories

- [ntag424-java](https://github.com/johnnyb/ntag424-java) - Core Java library
- [Ntag424SdmFeature](https://github.com/AndroidCrypto/Ntag424SdmFeature) - Android app (upstream)
- [ntag424-backend](https://github.com/lucashenning/ntag424-backend) - Python backend example

### Tutorials

- [Demystify SDM Part 1](https://medium.com/@androidcrypto/demystify-the-secure-dynamic-message-with-ntag-424-dna-nfc-tags-android-java-part-1-b947c482913c)
- [Demystify SDM Part 2](https://medium.com/@androidcrypto/demystify-the-secure-dynamic-message-with-ntag-424-dna-nfc-tags-android-java-part-2-1f8878faa928)

---

## Credits

- **[Jonathan Bartlett](https://github.com/johnnyb)** - Creator of [ntag424-java](https://github.com/johnnyb/ntag424-java) library
- **[AndroidCrypto](https://github.com/AndroidCrypto)** - Creator of [Ntag424SdmFeature](https://github.com/AndroidCrypto/Ntag424SdmFeature) Android app and excellent [tutorial series](https://medium.com/@androidcrypto)
- **[Arx Research, Inc.](https://arx.org)** - SDM backend demo server at sdm.nfcdeveloper.com

---

## License

- Android app: MIT License (from upstream)
- ntag424-java library: MIT License
