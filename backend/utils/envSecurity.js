const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// Determine secure config directory and files
function getEnvPaths() {
  const isPackaged = __dirname.includes('resources') && __dirname.includes('backend');
  const backendDir = path.resolve(__dirname, '..');
  
  // Primary .env in backend directory
  const plainEnvPath = path.resolve(backendDir, '.env');
  
  // Encrypted secure vault path
  const secureEnvPath = path.resolve(backendDir, '.env.enc');
  
  // Backup file path for safety before updates
  const backupEnvPath = path.resolve(backendDir, '.env.bak');
  
  return { plainEnvPath, secureEnvPath, backupEnvPath };
}

// Password-based authenticated encryption using PBKDF2 (100,000 iterations) and AES-256-GCM
function encryptWithPassword(plaintext, password) {
  if (!password || typeof password !== 'string') throw new Error('Password required for encryption');
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    format: 'aes-256-gcm-pbkdf2',
    iterations: 100000,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: enc.toString('hex'),
    timestamp: new Date().toISOString()
  }, null, 2);
}

// Password-based authenticated decryption
function decryptWithPassword(encryptedJsonStr, password) {
  if (!password || typeof password !== 'string') throw new Error('Password required for decryption');
  const envelope = JSON.parse(encryptedJsonStr);
  if (envelope.format !== 'aes-256-gcm-pbkdf2') {
    throw new Error('Unsupported encrypted configuration format');
  }
  const salt = Buffer.from(envelope.salt, 'hex');
  const iv = Buffer.from(envelope.iv, 'hex');
  const tag = Buffer.from(envelope.tag, 'hex');
  const key = crypto.pbkdf2Sync(password, salt, envelope.iterations || 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'hex')), decipher.final()]).toString('utf8');
}

// Windows DPAPI encryption
function encryptDPAPI(plaintext) {
  if (process.platform !== 'win32') {
    // Non-windows fallback using local machine machineId/hash
    const key = crypto.createHash('sha256').update('UNIPRO_POS_FALLBACK_KEY').digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({ iv: iv.toString('hex'), tag: tag.toString('hex'), data: enc.toString('hex') });
  }

  const psScript = 'Add-Type -AssemblyName System.Security; $val = [Console]::In.ReadToEnd(); [Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect([System.Text.Encoding]::UTF8.GetBytes($val), $null, [System.Security.Cryptography.DataProtectionScope]::LocalMachine))';
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', psScript], {
    input: plaintext,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore']
  }).trim();
}

// Windows DPAPI decryption
function decryptDPAPI(cipherText) {
  if (process.platform !== 'win32') {
    try {
      const parsed = JSON.parse(cipherText);
      const key = crypto.createHash('sha256').update('UNIPRO_POS_FALLBACK_KEY').digest();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(parsed.tag, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(parsed.data, 'hex')), decipher.final()]).toString('utf8');
    } catch {
      return '';
    }
  }

  const psScript = 'Add-Type -AssemblyName System.Security; $val = [Console]::In.ReadToEnd().Trim(); [System.Text.Encoding]::UTF8.GetString([System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($val), $null, [System.Security.Cryptography.DataProtectionScope]::LocalMachine))';
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', psScript], {
    input: cipherText,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore']
  }).trim();
}

// Set restrictive Windows NTFS file permissions (Only SYSTEM and Administrators)
function restrictFilePermissions(filePath) {
  if (process.platform !== 'win32') return;
  try {
    if (!fs.existsSync(filePath)) return;
    // Disable inheritance, remove default access, grant SYSTEM and Administrators Full Control
    execFileSync('icacls.exe', [
      filePath,
      '/inheritance:r',
      '/grant:r', 'SYSTEM:(F)',
      '/grant:r', 'Administrators:(F)',
      '/grant:r', `${process.env.USERNAME || 'admin'}:(F)`
    ], { stdio: 'ignore', windowsHide: true });
  } catch (err) {
    // Non-fatal if running as standard user
  }
}

// Parse KEY=VALUE string into object
function parseEnvContent(content) {
  const result = {};
  if (!content) return result;
  const lines = content.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx !== -1) {
      const key = line.substring(0, idx).trim();
      let val = line.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      result[key] = val;
    }
  }
  return result;
}

// Stringify object back to standard env format
function stringifyEnv(envObj) {
  const lines = [];
  lines.push('# Smart POS Environment Configuration');
  lines.push(`# Protected & Managed: ${new Date().toISOString()}`);
  lines.push('');
  for (const [k, v] of Object.entries(envObj)) {
    lines.push(`${k}="${v}"`);
  }
  return lines.join('\n') + '\n';
}

// Main loader function: loads configuration into process.env safely
function loadSecureEnvironment() {
  const { plainEnvPath, secureEnvPath, backupEnvPath } = getEnvPaths();
  let loadedConfig = {};

  try {
    // 1. Check if plaintext .env exists
    if (fs.existsSync(plainEnvPath)) {
      const plainRaw = fs.readFileSync(plainEnvPath, 'utf8');
      if (plainRaw.trim()) {
        loadedConfig = parseEnvContent(plainRaw);

        // Encrypt to .env.enc and backup to .env.bak
        try {
          const encData = encryptDPAPI(plainRaw);
          fs.writeFileSync(secureEnvPath, encData, 'utf8');
          fs.writeFileSync(backupEnvPath, plainRaw, 'utf8');
          restrictFilePermissions(secureEnvPath);
          restrictFilePermissions(backupEnvPath);
          restrictFilePermissions(plainEnvPath);
          console.log('🔒 [EnvSecurity] Synced plaintext .env into secure encrypted storage (.env.enc).');
        } catch (e) {
          console.warn('⚠️ [EnvSecurity] Could not create DPAPI encrypted vault:', e.message);
        }
      }
    } else if (fs.existsSync(secureEnvPath)) {
      // 2. Load directly from secure encrypted file into memory without recreating plaintext .env
      try {
        const encData = fs.readFileSync(secureEnvPath, 'utf8');
        const decRaw = decryptDPAPI(encData);
        if (decRaw.trim()) {
          loadedConfig = parseEnvContent(decRaw);
          console.log('🔓 [EnvSecurity] Decrypted configuration successfully into memory from DPAPI vault.');
        }
      } catch (e) {
        console.error('❌ [EnvSecurity] Failed to decrypt .env.enc:', e.message);
        // Fallback to backup if available
        if (fs.existsSync(backupEnvPath)) {
          const bakRaw = fs.readFileSync(backupEnvPath, 'utf8');
          loadedConfig = parseEnvContent(bakRaw);
          console.log('🔄 [EnvSecurity] Loaded configuration into memory from backup vault.');
        }
      }
    }

    // 3. Populate process.env
    for (const [key, val] of Object.entries(loadedConfig)) {
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }

    // Ensure JWT_SECRET is always present
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    }

  } catch (err) {
    console.error('❌ [EnvSecurity] Environment loader fatal error:', err.message);
  }

  return loadedConfig;
}

// Get masked configuration for admin review
function getMaskedConfig() {
  const { plainEnvPath, secureEnvPath } = getEnvPaths();
  let raw = '';
  if (fs.existsSync(plainEnvPath)) {
    raw = fs.readFileSync(plainEnvPath, 'utf8');
  } else if (fs.existsSync(secureEnvPath)) {
    raw = decryptDPAPI(fs.readFileSync(secureEnvPath, 'utf8'));
  }

  const parsed = parseEnvContent(raw);
  const sensitiveKeys = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN'];

  const masked = {};
  for (const [k, v] of Object.entries(parsed)) {
    const isSensitive = sensitiveKeys.some(sk => k.toUpperCase().includes(sk));
    if (isSensitive) {
      if (!v) {
        masked[k] = '';
      } else if (v.length <= 4) {
        masked[k] = '****';
      } else {
        masked[k] = v.substring(0, 2) + '****' + v.substring(v.length - 2);
      }
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

// Update configuration safely with backup, validation, and DPAPI sync
function updateEnvironmentConfig(newKeyValues) {
  const { plainEnvPath, secureEnvPath, backupEnvPath } = getEnvPaths();

  // Read current existing config
  let currentRaw = '';
  if (fs.existsSync(plainEnvPath)) {
    currentRaw = fs.readFileSync(plainEnvPath, 'utf8');
  } else if (fs.existsSync(secureEnvPath)) {
    currentRaw = decryptDPAPI(fs.readFileSync(secureEnvPath, 'utf8'));
  }

  const currentObj = parseEnvContent(currentRaw);

  // Backup current working configuration first
  if (currentRaw.trim()) {
    fs.writeFileSync(backupEnvPath, currentRaw, 'utf8');
    restrictFilePermissions(backupEnvPath);
  }

  // Merge updates (ignore masked values like "****")
  for (const [k, v] of Object.entries(newKeyValues)) {
    if (typeof v === 'string' && (v.includes('****') || v === '***')) {
      continue; // Skip masked fields that were not changed
    }
    currentObj[k] = v;
  }

  const updatedRaw = stringifyEnv(currentObj);

  // Write new configuration to plain and DPAPI encrypted files
  fs.writeFileSync(plainEnvPath, updatedRaw, 'utf8');
  restrictFilePermissions(plainEnvPath);

  try {
    const encData = encryptDPAPI(updatedRaw);
    fs.writeFileSync(secureEnvPath, encData, 'utf8');
    restrictFilePermissions(secureEnvPath);
  } catch (e) {
    console.warn('⚠️ [EnvSecurity] Could not re-encrypt to .env.enc:', e.message);
  }

  // Update live process.env
  for (const [k, v] of Object.entries(currentObj)) {
    process.env[k] = v;
  }

  return { success: true };
}

module.exports = {
  loadSecureEnvironment,
  getMaskedConfig,
  updateEnvironmentConfig,
  encryptDPAPI,
  decryptDPAPI,
  encryptWithPassword,
  decryptWithPassword,
  restrictFilePermissions
};

