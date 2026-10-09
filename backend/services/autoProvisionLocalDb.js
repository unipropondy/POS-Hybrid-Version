const sql = require("mssql");
const { getPool, getRemotePool, isRemoteOnline, connectRemote } = require("../config/db");

// Master reference tables to copy initial data from Remote DB to Local DB
const MASTER_DATA_TABLES = [
  "UserMaster",
  "CompanyMaster",
  "CompanySettings",
  "CategoryMaster",
  "SubCategoryMaster",
  "DishGroupMaster",
  "DishMaster",
  "TableMaster",
  "DiningSectionMaster",
  "PaymentModeMaster",
  "PrintMaster",
  "KitchenMaster",
  "TerminalMaster",
  "SettingsMaster"
];

// Step 1: Ensure Local Database exists (creates DB on local SQL Server if missing)
async function ensureLocalDatabaseExists() {
  const rawServer = process.env.LOCAL_DB_SERVER || "127.0.0.1";
  let serverHost = rawServer;
  let instanceName = undefined;
  if (rawServer.includes("\\")) {
    const parts = rawServer.split("\\");
    serverHost = parts[0] || "127.0.0.1";
    instanceName = parts[1];
  }

  const port = parseInt(process.env.LOCAL_DB_PORT || process.env.DB_PORT || "1433");
  const user = process.env.LOCAL_DB_USER || process.env.DB_USER;
  const password = process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD;
  const targetDbName = process.env.LOCAL_DB_NAME || process.env.DB_NAME || "UCSPONDY";

  const masterConfig = {
    user,
    password,
    server: serverHost,
    ...(instanceName ? {} : { port }),
    database: "master",
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 3000,
      ...(instanceName ? { instanceName } : {})
    }
  };

  let masterPool = null;
  try {
    console.log(`🔍 [Auto-Provision] Checking if database '${targetDbName}' exists on Local SQL Server (${serverHost}:${port})...`);
    masterPool = await new sql.ConnectionPool(masterConfig).connect();
    
    const checkDbResult = await masterPool.request()
      .input("DbName", sql.NVarChar, targetDbName)
      .query(`SELECT database_id FROM sys.databases WHERE name = @DbName`);

    if (checkDbResult.recordset.length === 0) {
      console.log(`✨ [Auto-Provision] Database '${targetDbName}' NOT found on Local SQL Server! Creating database automatically...`);
      await masterPool.request().query(`CREATE DATABASE [${targetDbName}]`);
      console.log(`✅ [Auto-Provision] Local database '${targetDbName}' created successfully!`);
    } else {
      console.log(`✅ [Auto-Provision] Local database '${targetDbName}' already exists.`);
    }
  } catch (err) {
    console.warn(`⚠️ [Auto-Provision] Database creation check on master failed:`, err.message);
  } finally {
    if (masterPool) {
      try { await masterPool.close(); } catch (_) {}
    }
  }
}

// Step 2: Sync full schema and tables from Remote DB -> Local DB
async function syncSchemaFromRemoteToLocal() {
  let remotePool = getRemotePool();
  if (!isRemoteOnline()) {
    remotePool = await connectRemote();
  }

  if (!remotePool || !isRemoteOnline()) {
    console.log("🟡 [Auto-Provision] Remote DB is offline. Skipping remote schema replication.");
    return false;
  }

  const localPool = getPool();
  if (!localPool) {
    console.warn("⚠️ [Auto-Provision] Local DB pool not ready.");
    return false;
  }

  console.log("🔄 [Auto-Provision] Fetching remote table schemas from Remote Cloud Database...");

  try {
    // 1. Get all base tables from Remote DB
    const tablesResult = await remotePool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME NOT IN ('sysdiagrams', 'POS_SyncQueue')
      ORDER BY TABLE_NAME
    `);

    const remoteTables = tablesResult.recordset.map(r => r.TABLE_NAME);
    console.log(`📋 [Auto-Provision] Found ${remoteTables.length} tables in Remote DB.`);

    for (const tableName of remoteTables) {
      await replicateTableSchema(remotePool, localPool, tableName);
    }

    // 2. Hydrate Master Data if Local Tables are Empty
    console.log("🚚 [Auto-Provision] Hydrating initial Master Data from Remote DB to empty Local tables...");
    for (const masterTable of MASTER_DATA_TABLES) {
      if (remoteTables.includes(masterTable)) {
        await hydrateMasterTableData(remotePool, localPool, masterTable);
      }
    }

    console.log("✅ [Auto-Provision] Local Database schema & master data provisioning complete!");
    return true;
  } catch (err) {
    console.error("❌ [Auto-Provision] Error syncing schema from Remote DB:", err.message);
    return false;
  }
}

// Helper: Replicate a single table's schema (CREATE TABLE or ADD MISSING COLUMNS)
async function replicateTableSchema(remotePool, localPool, tableName) {
  try {
    // Check if table exists in Local DB
    const checkLocalTable = await localPool.request().query(`
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${tableName}'
    `);

    // Fetch column details from Remote DB
    const remoteColumnsRes = await remotePool.request().query(`
      SELECT 
        COLUMN_NAME, 
        DATA_TYPE, 
        CHARACTER_MAXIMUM_LENGTH, 
        NUMERIC_PRECISION, 
        NUMERIC_SCALE, 
        IS_NULLABLE, 
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${tableName}'
      ORDER BY ORDINAL_POSITION
    `);

    const remoteCols = remoteColumnsRes.recordset;
    if (remoteCols.length === 0) return;

    if (checkLocalTable.recordset.length === 0) {
      // Table does not exist in Local DB -> Generate CREATE TABLE statement
      console.log(`🛠️ [Auto-Provision] Creating table [${tableName}] in Local DB...`);
      
      const colDefs = remoteCols.map(col => {
        let typeStr = col.DATA_TYPE.toUpperCase();
        if (["NVARCHAR", "VARCHAR", "NCHAR", "CHAR", "VARBINARY", "BINARY"].includes(typeStr)) {
          if (col.CHARACTER_MAXIMUM_LENGTH === -1 || col.CHARACTER_MAXIMUM_LENGTH > 8000) {
            typeStr += "(MAX)";
          } else if (col.CHARACTER_MAXIMUM_LENGTH) {
            typeStr += `(${col.CHARACTER_MAXIMUM_LENGTH})`;
          }
        } else if (["DECIMAL", "NUMERIC"].includes(typeStr)) {
          typeStr += `(${col.NUMERIC_PRECISION || 18}, ${col.NUMERIC_SCALE || 2})`;
        }

        const nullableStr = col.IS_NULLABLE === "YES" ? "NULL" : "NOT NULL";
        return `[${col.COLUMN_NAME}] ${typeStr} ${nullableStr}`;
      });

      const createTableSql = `CREATE TABLE [dbo].[${tableName}] (\n  ${colDefs.join(",\n  ")}\n);`;
      await localPool.request().query(createTableSql);
      console.log(`✅ [Auto-Provision] Table [${tableName}] created in Local DB.`);
    } else {
      // Table exists -> Add missing columns if any
      const localColsRes = await localPool.request().query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}'
      `);
      const localColNames = new Set(localColsRes.recordset.map(r => r.COLUMN_NAME.toLowerCase()));

      for (const col of remoteCols) {
        if (!localColNames.has(col.COLUMN_NAME.toLowerCase())) {
          console.log(`➕ [Auto-Provision] Adding missing column [${col.COLUMN_NAME}] to Local table [${tableName}]...`);
          let typeStr = col.DATA_TYPE.toUpperCase();
          if (["NVARCHAR", "VARCHAR", "NCHAR", "CHAR"].includes(typeStr)) {
            if (col.CHARACTER_MAXIMUM_LENGTH === -1 || col.CHARACTER_MAXIMUM_LENGTH > 8000) {
              typeStr += "(MAX)";
            } else if (col.CHARACTER_MAXIMUM_LENGTH) {
              typeStr += `(${col.CHARACTER_MAXIMUM_LENGTH})`;
            }
          } else if (["DECIMAL", "NUMERIC"].includes(typeStr)) {
            typeStr += `(${col.NUMERIC_PRECISION || 18}, ${col.NUMERIC_SCALE || 2})`;
          }

          const addColSql = `ALTER TABLE [dbo].[${tableName}] ADD [${col.COLUMN_NAME}] ${typeStr} NULL;`;
          await localPool.request().query(addColSql);
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ [Auto-Provision] Error replicating table schema for [${tableName}]:`, err.message);
  }
}

// Helper: Copy master table records if local table is empty
async function hydrateMasterTableData(remotePool, localPool, tableName) {
  try {
    const localCountRes = await localPool.request().query(`SELECT COUNT(*) AS cnt FROM [dbo].[${tableName}]`);
    if (localCountRes.recordset[0].cnt > 0) {
      return; // Already populated
    }

    console.log(`📦 [Auto-Provision] Hydrating table [${tableName}] data from Remote DB...`);
    const remoteDataRes = await remotePool.request().query(`SELECT * FROM [dbo].[${tableName}]`);
    const records = remoteDataRes.recordset;

    if (records.length === 0) return;

    for (const record of records) {
      const keys = Object.keys(record).filter(k => record[k] !== null);
      if (keys.length === 0) continue;

      const colList = keys.map(k => `[${k}]`).join(", ");
      const req = localPool.request();
      const valList = keys.map((k, idx) => {
        const paramName = `p_${idx}`;
        req.input(paramName, record[k]);
        return `@${paramName}`;
      }).join(", ");

      const insertSql = `
        SET IDENTITY_INSERT [dbo].[${tableName}] ON;
        INSERT INTO [dbo].[${tableName}] (${colList}) VALUES (${valList});
        SET IDENTITY_INSERT [dbo].[${tableName}] OFF;
      `;

      try {
        await req.query(insertSql);
      } catch (_) {
        // Fallback without IDENTITY_INSERT if not an identity column table
        try {
          const fallbackReq = localPool.request();
          const fallbackValList = keys.map((k, idx) => {
            const paramName = `p_${idx}`;
            fallbackReq.input(paramName, record[k]);
            return `@${paramName}`;
          }).join(", ");
          await fallbackReq.query(`INSERT INTO [dbo].[${tableName}] (${colList}) VALUES (${fallbackValList});`);
        } catch (innerErr) {
          // Ignore duplicate constraint or identity errors
        }
      }
    }
    console.log(`✅ [Auto-Provision] Hydrated ${records.length} records into Local table [${tableName}].`);
  } catch (err) {
    console.warn(`⚠️ [Auto-Provision] Data hydration warning for [${tableName}]:`, err.message);
  }
}

module.exports = {
  ensureLocalDatabaseExists,
  syncSchemaFromRemoteToLocal
};
