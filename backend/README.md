# NTAG 424 DNA Verification Backend

A Node.js/Express server that verifies NTAG 424 DNA NFC tags using Secure Dynamic Messaging (SDM).

## Features

- ✅ CMAC verification (AES-128)
- ✅ Replay attack protection (counter tracking)
- ✅ User entitlement lookup
- ✅ JSON API and HTML page responses
- ✅ Compatible with factory default keys

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start

# Or with auto-reload for development
npm run dev
```

Server runs on `http://localhost:3000`

## Endpoints

### GET /verify

JSON API for tag verification.

```
GET /verify?uid=042d2aaac41390&ctr=000001&cmac=2446e527c37e073a
```

**Success Response:**

```json
{
  "success": true,
  "message": "Welcome User A! Your tag has been verified.",
  "tagUid": "042d2aaac41390",
  "userName": "User A",
  "entitlement": 500,
  "currency": "EUR",
  "status": "active",
  "tapCount": 1
}
```

**Error Response:**

```json
{
  "success": false,
  "error": "Invalid cryptographic signature",
  "message": "This tag could not be verified."
}
```

### GET /verify-page

HTML page for browser-based verification (when users tap tag and open URL).

### GET /tagpt

Redirect endpoint for compatibility with sdm.nfcdeveloper.com URL format.

### GET /health

Health check endpoint.

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

| Variable | Description       | Default             |
| -------- | ----------------- | ------------------- |
| PORT     | Server port       | 3000                |
| SDM_KEY  | AES-128 key (hex) | Factory key (zeros) |

## Adding Users

Edit the `tagDatabase` object in `server.js`:

```javascript
const tagDatabase = {
  "042d2aaac41390": {
    userName: "User A",
    entitlement: 500,
    currency: "EUR",
    status: "active",
  },
  // Add more tags...
};
```

For production, replace with a proper database (PostgreSQL, MongoDB, etc.)

## Security Notes

⚠️ **Before production:**

1. Change the SDM key from factory default
2. Use HTTPS (required for NFC URL handling on most phones)
3. Store keys securely (environment variables, secrets manager)
4. Replace in-memory storage with a database
5. Add rate limiting
6. Add authentication for admin endpoints

## How Verification Works

1. **Parse URL** - Extract UID, counter, and CMAC from query params
2. **Verify CMAC** - Recalculate using shared key, compare with received
3. **Check Counter** - Ensure counter is higher than last seen (prevents replay)
4. **Lookup User** - Find user associated with tag UID
5. **Return Result** - Entitlement info or error message

## CMAC Calculation

For plaintext UID + Counter mode, the CMAC is calculated as follows:

```
1. SV2 = 0x3CC300010080 || UID (7 bytes) || Counter (3 bytes, little-endian)
2. Session Key = AES-CMAC(MasterKey, SV2)
3. Full CMAC = AES-CMAC(SessionKey, "")  // empty message
4. Truncated CMAC = take bytes at indices 0, 2, 4, 6, 8, 10, 12, 14
```

Reference: [AN12196 - NTAG 424 DNA Features and Hints](https://www.nxp.com/docs/en/application-note/AN12196.pdf)

## Files

```
backend/
├── server.js       # Main Express server
├── cmac.js         # AES-CMAC implementation
├── package.json    # Dependencies
├── .env.example    # Environment template
├── .gitignore      # Git ignore rules
└── README.md       # This file
```

## Testing

1. Configure a tag using the Android app (see main project README)
2. Tap the tag on your phone
3. Copy the URL from browser
4. Replace `sdm.nfcdeveloper.com/tagpt` with `localhost:3000/verify-page`
5. Verify the response shows user info

Example:

```
# Original URL from tag
https://sdm.nfcdeveloper.com/tagpt?uid=042D2AAAC41390&ctr=000007&cmac=47F6E97894E46FF1

# Test with local backend
http://localhost:3000/verify-page?uid=042D2AAAC41390&ctr=000007&cmac=47F6E97894E46FF1
```

## License

MIT
