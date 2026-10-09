const path = require("path");
// Adjust path to root of backend folder where .env is located
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const sql = require("mssql"); 

// --- Local Database Config (Primary for fast offline & online operations) ---
let rawLocalServer = process.env.LOCAL_DB_SERVER || "127.0.0.1";
let localServerHost = rawLocalServer;
let localInstanceName = undefined;

if (rawLocalServer.includes("\\")) {
  const parts = rawLocalServer.split("\\");
  localServerHost = parts[0] || "127.0.0.1";
  localInstanceName = parts[1];
}

const localDbConfig = {
  user: process.env.LOCAL_DB_USER || process.env.DB_USER,
  password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD,
  server: localServerHost,
  ...(localInstanceName ? {} : { port: parseInt(process.env.LOCAL_DB_PORT || process.env.DB_PORT || "1433") }),
  database: process.env.LOCAL_DB_NAME || process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 3000, 
    requestTimeout: 30000,
    appName: "POS_System_Local",
    keepAlive: true,
    ...(localInstanceName ? { instanceName: localInstanceName } : {})
  },
  connectionTimeout: 3000,
  requestTimeout: 30000,
  pool: {
    max: 100,
    min: 0,
    idleTimeoutMillis: 15000
  }
};

// --- Remote Database Config (Cloud / Central Server for sync) ---
const remoteDbServer = process.env.REMOTE_DB_SERVER || (process.env.LOCAL_DB_SERVER ? process.env.DB_SERVER : null);
const remoteDbConfig = remoteDbServer ? {
  user: process.env.REMOTE_DB_USER || process.env.DB_USER,
  password: process.env.REMOTE_DB_PASSWORD || process.env.DB_PASSWORD,
  server: remoteDbServer,
  port: parseInt(process.env.REMOTE_DB_PORT || process.env.DB_PORT || "1433"),
  database: process.env.REMOTE_DB_NAME || process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000, 
    requestTimeout: 30000,
    appName: "POS_System_RemoteSync",
    keepAlive: true
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
  pool: {
    max: 50,
    min: 0,
    idleTimeoutMillis: 30000
  }
} : null;

const displayLocalPort = localDbConfig.port || (localInstanceName ? `\\${localInstanceName}` : "1433");
console.log("📋 [Hybrid DB Architecture Configuration]:");
console.log(`   Local DB  : ${localDbConfig.server}:${displayLocalPort} (${localDbConfig.database})`);
if (remoteDbConfig) {
  console.log(`   Remote DB : ${remoteDbConfig.server}:${remoteDbConfig.port} (${remoteDbConfig.database})`);
} else {
  console.log(`   Remote DB : Not configured (Operating in Local standalone mode)`);
}

let localPoolInstance = null;
let remotePoolInstance = null;
let isRemoteConnected = false;

async function connectLocalWithRetry(retries = 2, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔌 [Local DB] Connecting to ${localDbConfig.server}:${displayLocalPort}... (Attempt ${i + 1}/${retries})`);
      const pool = await new sql.ConnectionPool(localDbConfig).connect();
      console.log("✅ [Local DB] Connected Successfully");
      pool.on("error", (err) => {
        console.error("⚠️ [Local DB Pool Error]:", err.message);
      });
      localPoolInstance = pool;
      return pool;
    } catch (err) {
      console.error(`❌ [Local DB Connection Attempt ${i + 1} Failed]:`, err.message);
      if (i < retries - 1) {
        console.log(`⏳ Retrying local database connection in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error("❌ All local database connection attempts failed.");
        return null;
      }
    }
  }
  return null;
}

async function connectRemote() {
  if (!remoteDbConfig) return null;
  if (remotePoolInstance && remotePoolInstance.connected) return remotePoolInstance;
  try {
    console.log(`🌐 [Remote Cloud DB] Attempting connection to ${remoteDbConfig.server}:${remoteDbConfig.port}...`);
    const pool = await new sql.ConnectionPool(remoteDbConfig).connect();
    console.log("✅ [Remote Cloud DB] Connected Successfully");
    pool.on("error", (err) => {
      console.error("⚠️ [Remote Cloud DB Pool Error]:", err.message);
      isRemoteConnected = false;
    });
    remotePoolInstance = pool;
    isRemoteConnected = true;
    return pool;
  } catch (err) {
    console.warn(`🟡 [Remote Cloud DB Offline]: ${err.message} - Backend operating smoothly in Offline Local Mode.`);
    isRemoteConnected = false;
    remotePoolInstance = null;
    return null;
  }
}

// Ensure remote pool promise is created FIRST before fallback check
const remotePoolPromise = connectRemote();

const poolPromise = (async () => {
  const localPool = await connectLocalWithRetry(2, 2000); // Try local DB fast
  if (localPool && localPool.connected) {
    return localPool;
  }
  console.log("🌐 [Fallback] Local DB unavailable. Falling back seamlessly to Remote Cloud DB...");
  const remotePool = await remotePoolPromise || await connectRemote();
  return remotePool;
})();

module.exports = { 
    sql, 
    poolPromise, 
    remotePoolPromise,
    dbConfig: localDbConfig,
    remoteDbConfig,
    getPool: () => (localPoolInstance && localPoolInstance.connected) ? localPoolInstance : remotePoolInstance,
    getRemotePool: () => (remotePoolInstance && remotePoolInstance.connected) ? remotePoolInstance : null,
    connectRemote,
    isRemoteOnline: () => isRemoteConnected && remotePoolInstance && remotePoolInstance.connected
};

