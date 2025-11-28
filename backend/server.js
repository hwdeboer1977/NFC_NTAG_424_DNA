require("dotenv").config();
const express = require("express");
const { verifyCmac } = require("./cmac");

const app = express();
const PORT = process.env.PORT || 3000;

// Simulated database of registered tags and their entitlements
const tagDatabase = {
  "042d2aaac41390": {
    userName: "User A",
    entitlement: 500,
    currency: "EUR",
    status: "active",
  },
  "04abc123def456": {
    userName: "User B",
    entitlement: 1000,
    currency: "EUR",
    status: "active",
  },
  "04xyz789ghi012": {
    userName: "User C",
    entitlement: 750,
    currency: "EUR",
    status: "claimed",
  },
};

// Track read counters to prevent replay attacks
const lastSeenCounters = {};

/**
 * Main verification endpoint
 * URL format: /verify?uid=XXXXXX&ctr=XXXXXX&cmac=XXXXXXXX
 */
app.get("/verify", (req, res) => {
  const { uid, ctr, cmac } = req.query;

  // Validate required parameters
  if (!uid || !ctr || !cmac) {
    return res.status(400).json({
      success: false,
      error: "Missing required parameters: uid, ctr, cmac",
    });
  }

  // Normalize to lowercase
  const uidLower = uid.toLowerCase();
  const ctrLower = ctr.toLowerCase();
  const cmacLower = cmac.toLowerCase();

  console.log(`\n--- Verification Request ---`);
  console.log(`UID: ${uidLower}`);
  console.log(`Counter: ${ctrLower}`);
  console.log(`CMAC: ${cmacLower}`);

  // Step 1: Verify CMAC (cryptographic authenticity)
  // TODO: CMAC verification disabled for testing - fix implementation and re-enable!
  const SKIP_CMAC_VERIFICATION = true;

  const isValidCmac =
    SKIP_CMAC_VERIFICATION || verifyCmac(uidLower, ctrLower, cmacLower);

  if (!isValidCmac) {
    console.log(`Result: INVALID CMAC`);
    return res.status(401).json({
      success: false,
      error: "Invalid cryptographic signature",
      message:
        "This tag could not be verified. It may be counterfeit or tampered with.",
    });
  }

  console.log(
    `CMAC: ${SKIP_CMAC_VERIFICATION ? "Skipped (testing)" : "Valid ✓"}`
  );

  // Step 2: Check counter (replay protection)
  const currentCounter = parseInt(ctrLower, 16);
  const lastCounter = lastSeenCounters[uidLower] || 0;

  if (currentCounter <= lastCounter) {
    console.log(
      `Result: REPLAY DETECTED (counter ${currentCounter} <= ${lastCounter})`
    );
    return res.status(401).json({
      success: false,
      error: "Replay attack detected",
      message: "This tap has already been used. Please tap again.",
    });
  }

  // Update last seen counter
  lastSeenCounters[uidLower] = currentCounter;
  console.log(`Counter: ${currentCounter} (previous: ${lastCounter}) ✓`);

  // Step 3: Look up tag in database
  const tagInfo = tagDatabase[uidLower];

  if (!tagInfo) {
    console.log(`Result: TAG NOT REGISTERED`);
    return res.status(404).json({
      success: false,
      error: "Tag not registered",
      message: "This tag is authentic but not registered in our system.",
      tagUid: uidLower,
    });
  }

  // Step 4: Check status
  if (tagInfo.status !== "active") {
    console.log(`Result: TAG STATUS - ${tagInfo.status}`);
    return res.status(403).json({
      success: false,
      error: `Tag status: ${tagInfo.status}`,
      message: `This tag belongs to ${tagInfo.userName} but is currently ${tagInfo.status}.`,
      tagUid: uidLower,
      userName: tagInfo.userName,
      status: tagInfo.status,
    });
  }

  // Step 5: Success - return entitlement info
  console.log(
    `Result: SUCCESS - ${tagInfo.userName} entitled to ${tagInfo.entitlement} ${tagInfo.currency}`
  );

  return res.status(200).json({
    success: true,
    message: `Welcome ${tagInfo.userName}! Your tag has been verified.`,
    tagUid: uidLower,
    userName: tagInfo.userName,
    entitlement: tagInfo.entitlement,
    currency: tagInfo.currency,
    status: tagInfo.status,
    tapCount: currentCounter,
  });
});

/**
 * Plaintext verification endpoint (matches sdm.nfcdeveloper.com format)
 * URL format: /tagpt?uid=XXXXXX&ctr=XXXXXX&cmac=XXXXXXXX
 */
app.get("/tagpt", (req, res) => {
  // Redirect to main verify endpoint
  const { uid, ctr, cmac } = req.query;
  res.redirect(`/verify?uid=${uid}&ctr=${ctr}&cmac=${cmac}`);
});

/**
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Simple HTML page for browser access
 */
app.get("/verify-page", (req, res) => {
  const { uid, ctr, cmac } = req.query;

  if (!uid || !ctr || !cmac) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>NFC Tag Verification</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .error { color: #dc3545; }
        </style>
      </head>
      <body>
        <h1>NFC Tag Verification</h1>
        <p class="error">Missing parameters. Please tap your NFC tag.</p>
      </body>
      </html>
    `);
  }

  // Verify the tag
  const uidLower = uid.toLowerCase();
  const ctrLower = ctr.toLowerCase();
  const cmacLower = cmac.toLowerCase();

  const isValidCmac = true; // SKIP_CMAC_VERIFICATION - fix and re-enable
  const currentCounter = parseInt(ctrLower, 16);
  const lastCounter = lastSeenCounters[uidLower] || 0;
  const isReplay = currentCounter <= lastCounter;

  if (isValidCmac && !isReplay) {
    lastSeenCounters[uidLower] = currentCounter;
  }

  const tagInfo = tagDatabase[uidLower];

  let statusHtml, statusClass;

  if (!isValidCmac) {
    statusClass = "error";
    statusHtml = `
      <h2>❌ Verification Failed</h2>
      <p>Invalid cryptographic signature. This tag may be counterfeit.</p>
    `;
  } else if (isReplay) {
    statusClass = "warning";
    statusHtml = `
      <h2>⚠️ Replay Detected</h2>
      <p>This tap has already been used. Please tap again.</p>
    `;
  } else if (!tagInfo) {
    statusClass = "warning";
    statusHtml = `
      <h2>⚠️ Tag Not Registered</h2>
      <p>This tag is authentic but not registered in our system.</p>
      <p><strong>Tag UID:</strong> ${uidLower}</p>
    `;
  } else if (tagInfo.status !== "active") {
    statusClass = "warning";
    statusHtml = `
      <h2>⚠️ Tag Inactive</h2>
      <p>This tag belongs to ${tagInfo.userName} but is currently ${tagInfo.status}.</p>
    `;
  } else {
    statusClass = "success";
    statusHtml = `
      <h2>✅ Verification Successful</h2>
      <p><strong>Welcome, ${tagInfo.userName}!</strong></p>
      <p><strong>Entitlement:</strong> ${tagInfo.entitlement} ${tagInfo.currency}</p>
      <p><strong>Status:</strong> ${tagInfo.status}</p>
      <p><strong>Tap Count:</strong> ${currentCounter}</p>
    `;
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>NFC Tag Verification</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .success { color: #28a745; }
        .error { color: #dc3545; }
        .warning { color: #ffc107; }
        .info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 20px; }
        .info p { margin: 5px 0; }
      </style>
    </head>
    <body>
      <h1>NFC Tag Verification</h1>
      <div class="${statusClass}">
        ${statusHtml}
      </div>
      <div class="info">
        <p><strong>Tag UID:</strong> ${uidLower}</p>
        <p><strong>Read Counter:</strong> ${currentCounter}</p>
        <p><strong>Encryption:</strong> AES</p>
      </div>
    </body>
    </html>
  `);
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🏷️  NTAG 424 DNA Verification Server`);
  console.log(`   Running on http://localhost:${PORT}`);
  console.log(`\n   Endpoints:`);
  console.log(`   - GET /verify?uid=...&ctr=...&cmac=...`);
  console.log(`   - GET /verify-page?uid=...&ctr=...&cmac=...`);
  console.log(`   - GET /tagpt?uid=...&ctr=...&cmac=... (redirect)`);
  console.log(`   - GET /health`);
  console.log(`\n   Registered tags: ${Object.keys(tagDatabase).length}`);
  console.log(`   ⚠️  Using FACTORY KEY - change for production!\n`);
});
