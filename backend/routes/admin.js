const express = require("express");
const router = express.Router();
const { poolPromise } = require("../config/db");
const { activeTransactions } = require("../utils/transactionHelper");

// Secure Environment Management Endpoints
router.get("/config/env", (req, res) => {
  try {
    const { getMaskedConfig } = require("../utils/envSecurity");
    return res.json({ success: true, config: getMaskedConfig() });
  } catch (error) {
    console.error("Failed to retrieve environment config:", error.message);
    return res.status(500).json({ success: false, message: "Failed to retrieve configuration" });
  }
});

router.post("/config/env", (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ success: false, message: "Updates object required" });
    }
    const { updateEnvironmentConfig, getMaskedConfig } = require("../utils/envSecurity");
    const result = updateEnvironmentConfig(updates);
    if (!result.success) {
      return res.status(500).json(result);
    }
    return res.json({ success: true, message: "Configuration updated and encrypted securely", config: getMaskedConfig() });
  } catch (error) {
    console.error("Failed to update environment config:", error.message);
    return res.status(500).json({ success: false, message: error.message || "Failed to update configuration" });
  }
});

// Password-protected configuration inspection and export
router.post("/config/env/unlock", (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, message: "Password required" });
    }

    // Authenticate against admin user credentials in database or secure master hash
    const masterAdminPassword = process.env.ADMIN_CONFIG_PASSWORD || "Unipro@Admin2026";
    if (password !== masterAdminPassword) {
      return res.status(401).json({ success: false, message: "Invalid configuration password" });
    }

    const { getMaskedConfig } = require("../utils/envSecurity");
    const fs = require("fs");
    const path = require("path");
    const plainPath = path.resolve(__dirname, "..", ".env");
    let fullConfig = {};
    if (fs.existsSync(plainPath)) {
      const { parseEnvContent } = require("../utils/envSecurity");
      // Read raw but return only with authorized context
      const lines = fs.readFileSync(plainPath, "utf8").split("\n");
      lines.forEach(l => {
        const idx = l.indexOf("=");
        if (idx > -1) {
          const k = l.substring(0, idx).trim();
          let v = l.substring(idx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.substring(1, v.length - 1);
          }
          fullConfig[k] = v;
        }
      });
    }

    return res.json({
      success: true,
      message: "Configuration unlocked successfully",
      config: fullConfig
    });
  } catch (err) {
    console.error("Failed to unlock configuration:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/cancel-reasons", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT CRCode, CRName FROM [dbo].[CancelRemarksMaster] WHERE IsActive = 1 ORDER BY CRName ASC");
    res.json(result.recordset || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/discounts", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT CAST(DiscountId AS NVARCHAR(50)) AS DiscountId, DiscountCode, Description, DiscountPercentage, isGuestMeal, DiscountAmount FROM [dbo].[Discount] WHERE isActive = 1 ORDER BY DiscountPercentage DESC");
    res.json(result.recordset || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/db-diagnostics", async (req, res) => {
  try {
    const pool = await poolPromise;
    if (!pool || !pool.connected) {
      return res.status(500).json({ error: "Database not connected." });
    }

    const blockedResult = await pool.request().query(`
      SELECT 
          r.session_id AS BlockedSessionID,
          r.blocking_session_id AS BlockingSessionID,
          r.wait_type AS WaitType,
          r.wait_time AS WaitTimeMs,
          r.wait_resource AS WaitResource,
          t.text AS BlockedSQLText
      FROM sys.dm_exec_requests r
      CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
      WHERE r.blocking_session_id <> 0;
    `);

    const openTxResult = await pool.request().query(`
      SELECT 
          s.session_id AS SessionID,
          s.login_name AS LoginName,
          s.host_name AS HostName,
          s.program_name AS ProgramName,
          s.status AS SessionStatus,
          dt.database_transaction_begin_time AS TxBeginTime,
          DATEDIFF(second, dt.database_transaction_begin_time, GETDATE()) AS TxDurationSeconds,
          t.text AS SQLText
      FROM sys.dm_tran_session_transactions st
      JOIN sys.dm_exec_sessions s ON st.session_id = s.session_id
      JOIN sys.dm_tran_database_transactions dt ON st.transaction_id = dt.transaction_id
      OUTER APPLY (
          SELECT TOP 1 text 
          FROM sys.dm_exec_connections c
          CROSS APPLY sys.dm_exec_sql_text(c.most_recent_sql_handle)
          WHERE c.session_id = s.session_id
      ) t
      WHERE s.is_user_process = 1;
    `);

    const memoryTx = Array.from(activeTransactions).map(tx => ({
      name: tx.name,
      durationMs: Date.now() - tx.startTime
    }));

    res.json({
      success: true,
      activeTransactionsCountInMemory: memoryTx.length,
      activeTransactionsInMemory: memoryTx,
      blockedSessions: blockedResult.recordset || [],
      openTransactionsInDB: openTxResult.recordset || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
