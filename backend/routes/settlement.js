const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../config/db");

// ===== TOTAL SALES =====
router.get("/total-sales/:terminal", async (req, res) => {
  try {
    const { fromDate, toDate, userId } = req.query;
    const pool = await poolPromise;
    const request = pool.request();

    let dateFilter = "ric.start_date = CAST(GETDATE() AS DATE)";

    if (fromDate && toDate) {
      const fDate = fromDate.replace(/[^0-9T:.-]/g, '');
      const tDate = toDate.replace(/[^0-9T:.-]/g, '');
      dateFilter = `ric.start_date BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
    }

    let userFilter = "";
    if (userId && userId !== "ALL" && userId !== "0") {
      request.input("UserId", sql.VarChar, userId);
      userFilter = `AND (
        TRY_CAST(sh.CashierId AS UNIQUEIDENTIFIER) = @UserId 
        OR CAST(sh.CashierId AS NVARCHAR(50)) = @UserId
        OR LOWER(LTRIM(RTRIM(sh.CashierId))) = LOWER(LTRIM(RTRIM(@UserId)))
      )`;
    }

    const result = await request.query(`
      SELECT
        ISNULL(SUM(sh.SubTotal),0) AS SubTotal,
        ISNULL(SUM(sh.DiscountAmount),0) AS DiscountAmount,
        ISNULL(SUM(sh.ServiceCharge),0) AS ServiceCharge,
        ISNULL(SUM(sh.TakeawayCharge),0) AS TakeawayCharge,
        ISNULL(SUM(sh.TotalTax),0) AS TotalTax,
        ISNULL(SUM(sh.RoundedBy),0) AS RoundedBy,
        COUNT(sh.SettlementID) AS InvoiceCount,
        ISNULL(SUM(sh.SysAmount),0) AS NetTotal
      FROM SettlementHeader sh
      WHERE (sh.IsCancelled = 0 OR sh.IsCancelled IS NULL)
        AND ${dateFilter.replace(/start_date/g, 'COALESCE(sh.start_date, CAST(sh.LastSettlementDate AS DATE))')}
    `);
    const data = result.recordset[0] || {};
    res.json(data);
  } catch (err) {
    console.error("❌ TOTAL SALES ERROR:", err);
    res.status(500).send(err.message);
  }
});

// ===== PAYMENT DETAILS =====
router.get("/payment/:terminal/:userId", async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const { terminal, userId } = req.params;
    const pool = await poolPromise;
    const request = pool.request();

    request.input("TerminalCode", sql.VarChar, terminal);

    // Build the start_date filter expression for each data source
    let dateFilter      = "start_date = CAST(GETDATE() AS DATE)";
    let ptdDateFilter   = "CAST(ptd.CreatedDate AS DATE) = CAST(GETDATE() AS DATE)";
    let pdc_DateFilter  = "pdc.start_date = CAST(GETDATE() AS DATE)";
    let sh_DateFilter   = "CAST(sh.start_date AS DATE) = CAST(GETDATE() AS DATE)";
    if (fromDate && toDate) {
      const fDate = fromDate.replace(/[^0-9T:.-]/g, '');
      const tDate = toDate.replace(/[^0-9T:.-]/g, '');
      dateFilter     = `start_date BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
      ptdDateFilter  = `CAST(ptd.CreatedDate AS DATE) BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
      pdc_DateFilter = `pdc.start_date BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
      sh_DateFilter  = `CAST(sh.start_date AS DATE) BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
    }

    let userFilter = "";
    if (userId && userId !== "ALL" && userId !== "0") {
      request.input("UserIdParam", sql.VarChar, userId);
      userFilter = `AND (
        TRY_CAST(sh.CashierId AS UNIQUEIDENTIFIER) = @UserIdParam 
        OR CAST(sh.CashierId AS NVARCHAR(50)) = @UserIdParam
        OR LOWER(LTRIM(RTRIM(sh.CashierId))) = LOWER(LTRIM(RTRIM(@UserIdParam)))
      )`;
    }

    // Fetch active bill payments from PaymentTransactionDetails (always reflects change-payment updates).
    // This is the authoritative source: change-payment deletes+reinserts PTD rows correctly.
    // Fallback via UNION to old PaymentDetailCur rows that have no matching PTD entry (legacy orders).
    const billsResult = await request.query(`
      -- PRIMARY: PaymentTransactionDetails joined to SettlementHeader for date + Paymode for name
      SELECT
        LTRIM(RTRIM(ISNULL(COALESCE(pm.PayMode, pm.Description), ''))) AS PaymodeName,
        ISNULL(SUM(ptd.Amount), 0) AS Amount,
        COUNT(*) AS PayCount
      FROM PaymentTransactionDetails ptd
      INNER JOIN SettlementHeader sh ON sh.SettlementID = ptd.ReferenceId
      LEFT  JOIN Paymode pm ON pm.Position = ptd.PayModeId
      WHERE ptd.ReferenceType = 'BILL'
        AND ${ptdDateFilter}
        AND UPPER(LTRIM(RTRIM(ISNULL(COALESCE(pm.PayMode, pm.Description), '')))) NOT IN ('CREDIT', 'MEMBER')
        AND ptd.ReferenceId NOT IN (
            SELECT RestaurantBillId FROM RestaurantInvoiceCur
            WHERE StatusCode = 4 AND RestaurantBillId IS NOT NULL
        )
      GROUP BY LTRIM(RTRIM(ISNULL(COALESCE(pm.PayMode, pm.Description), '')))

      UNION ALL

      -- FALLBACK: PaymentDetailCur for legacy orders that have no PTD row
      SELECT
        LTRIM(RTRIM(ISNULL(pdc.Remarks, ''))) AS PaymodeName,
        ISNULL(SUM(pdc.Amount), 0) AS Amount,
        COUNT(*) AS PayCount
      FROM PaymentDetailCur pdc
      WHERE ${pdc_DateFilter}
        AND UPPER(LTRIM(RTRIM(ISNULL(pdc.Remarks, '')))) NOT IN ('CREDIT', 'MEMBER')
        AND (pdc.RestaurantBillId IS NULL OR pdc.RestaurantBillId NOT IN (
            SELECT RestaurantBillId FROM RestaurantInvoiceCur
            WHERE StatusCode = 4 AND RestaurantBillId IS NOT NULL
        ))
        -- Exclude any bill that already has a PTD row (to prevent double-counting)
        AND (pdc.RestaurantBillId IS NULL OR pdc.RestaurantBillId NOT IN (
            SELECT DISTINCT ptd2.ReferenceId
            FROM PaymentTransactionDetails ptd2
            WHERE ptd2.ReferenceType = 'BILL'
              AND ${ptdDateFilter.replace(/ptd\./g, 'ptd2.')}
        ))
      GROUP BY LTRIM(RTRIM(ISNULL(pdc.Remarks, '')))
    `);

    // Fetch credit outstanding & issued amounts separately for Credit Activity tracking
    let creditUserFilter = "";
    if (userId && userId !== "ALL" && userId !== "0") {
      creditUserFilter = `AND (
        TRY_CAST(CreatedBy AS UNIQUEIDENTIFIER) = @UserIdParam 
        OR CAST(CreatedBy AS NVARCHAR(50)) = @UserIdParam
        OR LOWER(LTRIM(RTRIM(CreatedBy))) = LOWER(LTRIM(RTRIM(@UserIdParam)))
      )`;
    }
    const creditOutstandingResult = await request.query(`
      SELECT
        ISNULL(CustomerType, 'CREDIT') AS PaymodeName,
        ISNULL(SUM(OutstandingAmount), 0) AS Amount,
        ISNULL(SUM(BillAmount), 0) AS BilledAmount,
        ISNULL(SUM(PaidAmount), 0) AS PaidAmount,
        COUNT(*) AS PayCount
      FROM CustomerCreditTransactions
      WHERE TransactionType = 'CREDIT_SALE'
        AND ${dateFilter.replace(/p\.start_date/g, 'COALESCE(start_date, CAST(CreatedDate AS DATE))')}
        ${creditUserFilter}
      GROUP BY ISNULL(CustomerType, 'CREDIT')
    `);

    // Fetch non-cash ledger collections (e.g. PAYNOW, NETS, CARD paid on receivables screen)
    let ledgerUserFilter = "";
    if (userId && userId !== "ALL" && userId !== "0") {
      ledgerUserFilter = `AND (
        TRY_CAST(ptd.CreatedBy AS UNIQUEIDENTIFIER) = @UserIdParam 
        OR CAST(ptd.CreatedBy AS NVARCHAR(50)) = @UserIdParam
        OR LOWER(LTRIM(RTRIM(ptd.CreatedBy))) = LOWER(LTRIM(RTRIM(@UserIdParam)))
      )`;
    }
    const ledgerResult = await request.query(`
      SELECT
        pm.PayMode AS PaymodeName,
        ISNULL(SUM(ptd.Amount), 0) AS Amount,
        COUNT(*) AS PayCount
      FROM PaymentTransactionDetails ptd
      INNER JOIN Paymode pm ON ptd.PayModeId = pm.Position
      WHERE ptd.ReferenceType = 'MEMBER'
        AND UPPER(pm.PayMode) NOT LIKE '%CASH%'
        AND ${dateFilter.replace(/p\.start_date/g, 'CAST(ptd.CreatedDate AS DATE)')}
        ${ledgerUserFilter}
      GROUP BY pm.PayMode
    `);

    const normalizePayMode = (paymentMethod = "CASH") => {
      const raw = String(paymentMethod || "CASH").toUpperCase().trim();
      if (raw === "Q-R" || raw === "Q.R.") return "QR";
      if (raw === "PAY_NOW" || raw === "PAY NOW") return "PAYNOW";
      if (raw === "U-P-I") return "UPI";
      if (raw === "G-PAY") return "GPAY";
      if (raw === "P-H-O-N-E") return "PHONE";
      if (raw === "P-A-Y-T-M") return "PAYTM";
      if (raw === "CAS" || raw === "1") return "CASH";
      if (raw === "2") return "NETS";
      if (raw === "3") return "PAYNOW";
      if (raw === "4") return "UPI";
      if (raw === "5") return "MEMBER";
      if (raw === "6") return "CREDIT";
      return raw;
    };

    // Aggregate cash/non-cash movements
    const aggregated = {};
    
    (billsResult.recordset || []).forEach(row => {
      const normName = normalizePayMode(row.PaymodeName);
      if (!aggregated[normName]) {
        aggregated[normName] = { PaymodeName: normName, Amount: 0, PayCount: 0 };
      }
      aggregated[normName].Amount += parseFloat(row.Amount) || 0;
      aggregated[normName].PayCount += parseInt(row.PayCount, 10) || 0;
    });

    (ledgerResult.recordset || []).forEach(row => {
      const normName = normalizePayMode(row.PaymodeName);
      const ledgerName = `Credit Settlement - ${normName}`;
      if (!aggregated[ledgerName]) {
        aggregated[ledgerName] = { PaymodeName: ledgerName, Amount: 0, PayCount: 0 };
      }
      aggregated[ledgerName].Amount += parseFloat(row.Amount) || 0;
      aggregated[ledgerName].PayCount += parseInt(row.PayCount, 10) || 0;
    });

    const creditAggregated = {};
    (creditOutstandingResult.recordset || []).forEach(row => {
      const normName = normalizePayMode(row.PaymodeName);
      if (!creditAggregated[normName]) {
        creditAggregated[normName] = { PaymodeName: normName, Amount: 0, BilledAmount: 0, PaidAmount: 0, PayCount: 0 };
      }
      creditAggregated[normName].Amount += parseFloat(row.Amount) || 0;
      creditAggregated[normName].BilledAmount += parseFloat(row.BilledAmount) || 0;
      creditAggregated[normName].PaidAmount += parseFloat(row.PaidAmount) || 0;
      creditAggregated[normName].PayCount += parseInt(row.PayCount, 10) || 0;
    });

    res.json({
      payments: Object.values(aggregated),
      creditOutstanding: Object.values(creditAggregated)
    });

  } catch (err) {
    console.error("❌ PAYMENT ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== TRANSACTIONS =====
router.get("/transactions/:terminal/:userId", async (req, res) => {
  try {
    // [TEMP FIX]: Commenting this out because the 'Transactions' table is missing,
    // which was causing the tedious driver to throw a fatal unhandled rejection stream error
    /*
    const pool = await poolPromise;

    const result = await pool.request()
      .input("TerminalCode", sql.VarChar, req.params.terminal)
      .input("UserId", sql.VarChar, req.params.userId)
      .query(`SELECT 
              ISNULL(TransactionMode,'') AS TransactionMode,
              ISNULL(TransactionType,'') AS TransactionType,
              ISNULL(Amount,0) AS Amount
              FROM Transactions
              WHERE TerminalCode = @TerminalCode
         AND UserId = @UserId
      `);

    res.json(result.recordset || []);
    */

    res.json([]);

  } catch (err) {
    console.error("❌ TRANSACTION ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== SALES SUMMARY =====
router.get("/sales-summary/:terminal", async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const pool = await poolPromise;
    const request = pool.request();
    request.input("TerminalCode", sql.VarChar, req.params.terminal);

    let dateFilter = "";
    if (fromDate && toDate) {
      const fDate = fromDate.replace(/[^0-9T:.-]/g, '');
      const tDate = toDate.replace(/[^0-9T:.-]/g, '');
      dateFilter = `AND start_date BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
    }

    const result = await request.query(`
             SELECT 
          ISNULL(Paymode,'') AS Paymode,
          ISNULL(SUM(Amount),0) AS Amount
        FROM PaymentDetailCur
        WHERE TerminalCode = @TerminalCode
        AND isSettlement = 0
        AND (RestaurantBillId IS NULL OR RestaurantBillId NOT IN (
            SELECT RestaurantBillId 
            FROM RestaurantInvoiceCur 
            WHERE StatusCode = 4 AND RestaurantBillId IS NOT NULL
        ))
        ${dateFilter}
        GROUP BY Paymode 
      `);

    res.json(result.recordset || []);

  } catch (err) {
    console.error("❌ SALES SUMMARY ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== CHECK PENDING ORDERS =====
router.get("/pending-orders", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT * FROM RestaurantOrderCur
      WHERE StatusCode < 5
    `);

    res.json({
      hasPending: result.recordset.length > 0,
      data: result.recordset
    });

  } catch (err) {
    console.error("❌ PENDING ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== SAVE SETTLEMENT =====
router.post("/settlement", async (req, res) => {
  const { terminal, userId } = req.body;

  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    const request = new sql.Request(transaction);

    // HEADER
    const result = await request
      .input("TerminalCode", sql.VarChar, terminal)
      .input("UserId", sql.VarChar, userId)
      .query(`
        INSERT INTO SettlementHeader (
          SettlementId,
          TerminalCode,
          CreatedBy,
          CreatedOn
        )
        OUTPUT INSERTED.SettlementId
        VALUES (NEWID(), @TerminalCode, @UserId, GETDATE())
      `);

    const settlementId = result.recordset[0].SettlementId;

    // UPDATE ONLY THIS TERMINAL
    await request
      .input("TerminalCode", sql.VarChar, terminal)
      .query(`
        UPDATE PaymentDetailCur
        SET isSettlement = 1
        WHERE isSettlement = 0
        AND TerminalCode = @TerminalCode
      `);

    await transaction.commit();

    // Notify all connected clients to refresh settlement data
    const io = req.app.get('io');
    if (io) io.emit('settlement_updated', { action: 'settlement_saved' });

    res.json({
      message: "Settlement Completed ✅",
      settlementId
    });

  } catch (err) {
    console.error("❌ SETTLEMENT ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== LAST SETTLEMENT =====
router.get("/last-settlement/:terminal", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request()
      .input("TerminalCode", sql.VarChar, req.params.terminal)
      .query(`
        SELECT 
          ISNULL(MAX(CreatedOn), DATEADD(DAY,-1,GETDATE())) AS LastSettlementDate
        FROM SettlementHeader
        WHERE TerminalCode = @TerminalCode
      `);

    res.json(result.recordset[0]);

  } catch (err) {
    console.error("❌ LAST SETTLEMENT ERROR:", err);
    res.status(500).send(err.message);
  }
});


// ===== TERMINAL LIST =====
router.get("/terminals", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT TerminalCode, TerminalName FROM TerminalMaster
    `);

    console.log("🔥 TERMINALS FROM DB 👉", result.recordset);

    res.json(result.recordset);

  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

module.exports = router;
