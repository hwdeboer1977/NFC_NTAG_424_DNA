const crypto = require("crypto");

/**
 * NTAG 424 DNA SDM CMAC Verification
 *
 * For plaintext UID + Counter mode, the CMAC is calculated as:
 * 1. Generate SV2 = 0x3CC300010080 || UID || SDMReadCtr (little-endian)
 * 2. Derive session key: KSesSDMFileReadMAC = AES-CMAC(KSDMFileRead, SV2)
 * 3. Calculate CMAC over empty message: CMAC = AES-CMAC(KSesSDMFileReadMAC, "")
 * 4. Truncate: take even-indexed bytes (0, 2, 4, 6, 8, 10, 12, 14) from full 16-byte CMAC
 */

// Factory default key (all zeros) - CHANGE THIS IN PRODUCTION!
const DEFAULT_KEY = Buffer.alloc(16, 0x00);

/**
 * AES-CMAC implementation according to NIST SP 800-38B
 */
function aesCmac(key, message) {
  // Generate subkeys
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(false);
  const L = cipher.update(Buffer.alloc(16, 0x00));

  const K1 = generateSubkey(L);
  const K2 = generateSubkey(K1);

  const blockSize = 16;

  // Handle empty message case
  if (message.length === 0) {
    // For empty message, create one block with padding 0x80 00 00 ... XOR K2
    const paddedBlock = Buffer.alloc(16, 0x00);
    paddedBlock[0] = 0x80;
    for (let i = 0; i < 16; i++) {
      paddedBlock[i] ^= K2[i];
    }
    const cipher2 = crypto.createCipheriv("aes-128-ecb", key, null);
    cipher2.setAutoPadding(false);
    return cipher2.update(paddedBlock);
  }

  // For non-empty messages
  const numBlocks = Math.ceil(message.length / blockSize);
  const lastBlockComplete = message.length % blockSize === 0;

  let paddedMessage;
  if (lastBlockComplete) {
    paddedMessage = Buffer.from(message);
    // XOR last block with K1
    for (let i = 0; i < blockSize; i++) {
      paddedMessage[message.length - blockSize + i] ^= K1[i];
    }
  } else {
    // Pad with 0x80 followed by zeros
    const padLength = blockSize - (message.length % blockSize);
    const padding = Buffer.alloc(padLength, 0x00);
    padding[0] = 0x80;
    paddedMessage = Buffer.concat([message, padding]);
    // XOR last block with K2
    for (let i = 0; i < blockSize; i++) {
      paddedMessage[paddedMessage.length - blockSize + i] ^= K2[i];
    }
  }

  // CBC-MAC
  let X = Buffer.alloc(16, 0x00);
  for (let i = 0; i < paddedMessage.length; i += blockSize) {
    const block = paddedMessage.slice(i, i + blockSize);
    const Y = Buffer.alloc(16);
    for (let j = 0; j < blockSize; j++) {
      Y[j] = X[j] ^ block[j];
    }
    const cipherBlock = crypto.createCipheriv("aes-128-ecb", key, null);
    cipherBlock.setAutoPadding(false);
    X = cipherBlock.update(Y);
  }

  return X;
}

/**
 * Generate CMAC subkey (left shift and conditional XOR with Rb)
 */
function generateSubkey(input) {
  const output = Buffer.alloc(16);
  let carry = 0;

  for (let i = 15; i >= 0; i--) {
    const newCarry = input[i] & 0x80 ? 1 : 0;
    output[i] = ((input[i] << 1) | carry) & 0xff;
    carry = newCarry;
  }

  // If MSB was 1, XOR with Rb (0x87 for AES-128)
  if (input[0] & 0x80) {
    output[15] ^= 0x87;
  }

  return output;
}

/**
 * Truncate full CMAC to 8 bytes by taking even-indexed bytes
 * According to AN12196: "truncated by using only the 8 even-numbered bytes"
 */
function truncateCmac(fullCmac) {
  const truncated = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) {
    truncated[i] = fullCmac[i * 2]; // Take bytes at indices 0, 2, 4, 6, 8, 10, 12, 14
  }
  return truncated;
}

/**
 * Generate SV2 for session key derivation (plaintext UID + counter mode)
 * SV2 = 0x3CC300010080 || UID (7 bytes) || SDMReadCtr (3 bytes, little-endian)
 */
function generateSV2(uid, counter) {
  const sv2Header = Buffer.from([0x3c, 0xc3, 0x00, 0x01, 0x00, 0x80]);
  return Buffer.concat([sv2Header, uid, counter]);
}

/**
 * Verify NTAG 424 DNA plaintext SDM CMAC
 *
 * @param {string} uidHex - Tag UID as hex string (14 chars = 7 bytes)
 * @param {string} counterHex - Read counter as hex string (6 chars = 3 bytes)
 * @param {string} cmacHex - CMAC from tag as hex string (16 chars = 8 bytes)
 * @param {Buffer} key - AES-128 key (16 bytes), defaults to factory key
 * @returns {boolean} - True if CMAC is valid
 */
function verifyCmac(uidHex, counterHex, cmacHex, key = DEFAULT_KEY) {
  try {
    // Parse inputs
    const uid = Buffer.from(uidHex, "hex");

    // Counter comes as big-endian in URL, but needs to be little-endian for SV2
    const counterBE = Buffer.from(counterHex, "hex");
    const counter = Buffer.from([counterBE[2], counterBE[1], counterBE[0]]); // Reverse to LE

    const cmacReceived = Buffer.from(cmacHex, "hex");

    console.log(`  UID: ${uid.toString("hex")}`);
    console.log(`  Counter (LE): ${counter.toString("hex")}`);

    // Step 1: Generate SV2
    const sv2 = generateSV2(uid, counter);
    console.log(`  SV2: ${sv2.toString("hex")}`);

    // Step 2: Derive session MAC key
    const sessionKey = aesCmac(key, sv2);
    console.log(`  Session Key: ${sessionKey.toString("hex")}`);

    // Step 3: Calculate CMAC over empty message
    const fullCmac = aesCmac(sessionKey, Buffer.alloc(0));
    console.log(`  Full CMAC: ${fullCmac.toString("hex")}`);

    // Step 4: Truncate to 8 bytes (even-indexed bytes)
    const calculatedCmac = truncateCmac(fullCmac);
    console.log(`  Calculated CMAC: ${calculatedCmac.toString("hex")}`);
    console.log(`  Received CMAC:   ${cmacReceived.toString("hex")}`);

    // Compare
    return calculatedCmac.equals(cmacReceived);
  } catch (error) {
    console.error("CMAC verification error:", error);
    return false;
  }
}

module.exports = {
  verifyCmac,
  aesCmac,
  truncateCmac,
  DEFAULT_KEY,
};
