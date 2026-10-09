const { getPool, getRemotePool, isRemoteOnline, connectRemote, sql } = require("../config/db");

let isSyncing = false;
let syncIntervalObj = null;
let lastSyncTime = null;
let syncStats = {
  pendingCount: 0,
  lastSyncStatus: "IDLE",
  lastError: null,
  totalSynced: 0
};

// Ensure POS_SyncQueue table exists in Local Database
async function initSyncQueue() {
  const localPool = getPool();
  if (!localPool) return;
  try {
    await localPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[POS_SyncQueue]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[POS_SyncQueue](
              [SyncID] [bigint] IDENTITY(1,1) PRIMARY KEY,
              [EntityName] [nvarchar](100) NOT NULL,
              [EntityID] [nvarchar](255) NOT NULL,
              [Action] [nvarchar](50) NOT NULL,
              [Payload] [nvarchar](max) NOT NULL,
              [Status] [nvarchar](50) DEFAULT 'PENDING',
              [Retries] [int] DEFAULT 0,
              [ErrorMessage] [nvarchar](max) NULL,
              [CreatedAt] [datetime] DEFAULT GETDATE(),
              [SyncedAt] [datetime] NULL
          );
          CREATE INDEX IX_POS_SyncQueue_Status ON [dbo].[POS_SyncQueue]([Status]);
      END
    `);
    console.log("✅ [Sync Engine] Sync queue initialized successfully.");
  } catch (err) {
    console.error("❌ [Sync Engine] Failed to initialize sync queue:", err.message);
  }
}

// Enqueue item to local sync queue
async function enqueueSync(entityName, entityID, action, payloadData) {
  const localPool = getPool();
  if (!localPool) return false;
  try {
    const payloadStr = typeof payloadData === 'string' ? payloadData : JSON.stringify(payloadData);
    await localPool.request()
      .input("EntityName", sql.NVarChar, entityName)
      .input("EntityID", sql.NVarChar, String(entityID))
      .input("Action", sql.NVarChar, action)
      .input("Payload", sql.NVarChar, payloadStr)
      .query(`
        INSERT INTO POS_SyncQueue (EntityName, EntityID, Action, Payload, Status, CreatedAt)
        VALUES (@EntityName, @EntityID, @Action, @Payload, 'PENDING', GETDATE())
      `);
    syncStats.pendingCount++;
    // Immediately attempt sync process if online
    triggerSyncProcess();
    return true;
  } catch (err) {
    console.error(`❌ [Sync Engine] Error enqueuing ${entityName} (${entityID}):`, err.message);
    return false;
  }
}

// Core Sync Processor function
async function triggerSyncProcess() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    let remotePool = getRemotePool();
    if (!isRemoteOnline()) {
      remotePool = await connectRemote();
    }

    if (!remotePool || !isRemoteOnline()) {
      syncStats.lastSyncStatus = "OFFLINE";
      isSyncing = false;
      return;
    }

    const localPool = getPool();
    if (!localPool) {
      isSyncing = false;
      return;
    }

    // 1. Fetch PENDING items from Local POS_SyncQueue
    const pendingItemsResult = await localPool.request().query(`
      SELECT TOP 50 SyncID, EntityName, EntityID, Action, Payload, Retries
      FROM POS_SyncQueue
      WHERE Status IN ('PENDING', 'FAILED') AND Retries < 5
      ORDER BY SyncID ASC
    `);

    const pendingItems = pendingItemsResult.recordset;
    syncStats.pendingCount = pendingItems.length;

    if (pendingItems.length === 0) {
      syncStats.lastSyncStatus = "SYNCED";
      lastSyncTime = new Date();
      isSyncing = false;
      return;
    }

    console.log(`🔄 [Sync Engine] Syncing ${pendingItems.length} queued items to Remote Database...`);
    syncStats.lastSyncStatus = "SYNCING";

    for (const item of pendingItems) {
      try {
        const data = JSON.parse(item.Payload);
        const success = await syncSingleItemToRemote(remotePool, item.EntityName, item.Action, data);

        if (success) {
          await localPool.request()
            .input("SyncID", sql.BigInt, item.SyncID)
            .query(`
              UPDATE POS_SyncQueue
              SET Status = 'SYNCED', SyncedAt = GETDATE(), ErrorMessage = NULL
              WHERE SyncID = @SyncID
            `);
          syncStats.totalSynced++;
        } else {
          throw new Error("Sync execution returned false");
        }
      } catch (itemErr) {
        console.warn(`⚠️ [Sync Engine] Item ${item.SyncID} (${item.EntityName}) failed:`, itemErr.message);
        await localPool.request()
          .input("SyncID", sql.BigInt, item.SyncID)
          .input("ErrMsg", sql.NVarChar, itemErr.message)
          .query(`
            UPDATE POS_SyncQueue
            SET Status = 'FAILED', Retries = Retries + 1, ErrorMessage = @ErrMsg
            WHERE SyncID = @SyncID
          `);
        syncStats.lastError = itemErr.message;
      }
    }

    // Refresh pending count
    const countRes = await localPool.request().query(`
      SELECT COUNT(*) AS PendingCount FROM POS_SyncQueue WHERE Status = 'PENDING'
    `);
    syncStats.pendingCount = countRes.recordset[0].PendingCount || 0;
    syncStats.lastSyncStatus = syncStats.pendingCount === 0 ? "SYNCED" : "PENDING";
    lastSyncTime = new Date();
  } catch (err) {
    console.error("❌ [Sync Engine] Process error:", err.message);
    syncStats.lastSyncStatus = "ERROR";
    syncStats.lastError = err.message;
  } finally {
    isSyncing = false;
  }
}

// Sync execution router to remote database
async function syncSingleItemToRemote(remotePool, entityName, action, data) {
  if (!remotePool) return false;
  
  if (entityName === 'SettlementHeader') {
    const req = remotePool.request();
    req.input("SettlementID", sql.UniqueIdentifier, data.SettlementID);
    req.input("OrderNo", sql.NVarChar, data.OrderNo);
    req.input("TotalAmount", sql.Decimal(18, 2), data.TotalAmount);
    req.input("PaymentMode", sql.NVarChar, data.PaymentMode);
    req.input("CreatedOn", sql.DateTime, data.CreatedOn ? new Date(data.CreatedOn) : new Date());

    await req.query(`
      IF NOT EXISTS (SELECT 1 FROM SettlementHeader WHERE SettlementID = @SettlementID OR OrderNo = @OrderNo)
      BEGIN
        INSERT INTO SettlementHeader (SettlementID, OrderNo, TotalAmount, PaymentMode, CreatedOn)
        VALUES (@SettlementID, @OrderNo, @TotalAmount, @PaymentMode, @CreatedOn)
      END
    `);
    return true;
  }

  if (entityName === 'MemberMaster') {
    const req = remotePool.request();
    req.input("MemberId", sql.UniqueIdentifier, data.MemberId);
    req.input("Name", sql.NVarChar, data.Name);
    req.input("Phone", sql.NVarChar, data.Phone);
    req.input("Balance", sql.Decimal(18, 2), data.Balance);
    
    await req.query(`
      IF EXISTS (SELECT 1 FROM MemberMaster WHERE MemberId = @MemberId)
      BEGIN
        UPDATE MemberMaster SET Name = @Name, Phone = @Phone, Balance = @Balance WHERE MemberId = @MemberId
      END
      ELSE
      BEGIN
        INSERT INTO MemberMaster (MemberId, Name, Phone, Balance) VALUES (@MemberId, @Name, @Phone, @Balance)
      END
    `);
    return true;
  }

  // Generic fallback query execution if script is passed
  if (data.rawSql) {
    await remotePool.request().query(data.rawSql);
    return true;
  }

  return true;
}

// Start periodic heartbeat & sync worker
function startSyncWorker(intervalMs = 5000) {
  initSyncQueue();
  if (syncIntervalObj) clearInterval(syncIntervalObj);
  
  syncIntervalObj = setInterval(() => {
    triggerSyncProcess();
  }, intervalMs);
  
  console.log(`🚀 [Sync Engine] Background Sync Worker started (interval: ${intervalMs / 1000}s)`);
}

module.exports = {
  startSyncWorker,
  triggerSyncProcess,
  enqueueSync,
  getSyncStats: () => ({
    ...syncStats,
    isOnline: isRemoteOnline(),
    lastSyncTime: lastSyncTime ? lastSyncTime.toISOString() : null
  })
};
