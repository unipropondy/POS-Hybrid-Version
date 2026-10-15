const { sql } = require("../config/db");

// Table specifications with proper business unique keys and identity column handling
const SYNC_SPECS = [
  // 1. Settlements & Payments
  {
    table: "SettlementHeader",
    keys: ["SettlementID"],
    fallbackKeys: ["BillNo"],
    dateCol: "CreatedOn",
    omitIdentity: true
  },
  {
    table: "SettlementItemDetail",
    keys: ["OrderDetailId"],
    fallbackKeys: ["SettlementID", "DishId"],
    dateCol: "OrderDateTime",
    omitIdentity: true
  },
  {
    table: "SettlementTotalSales",
    keys: ["SettlementID", "PayMode"],
    omitIdentity: true
  },
  {
    table: "SettlementDetail",
    keys: ["SettlementId", "Paymode"],
    omitIdentity: true
  },
  {
    table: "SettlementTranDetail",
    keys: ["SettlementID", "PayMode"],
    omitIdentity: true
  },
  {
    table: "SettlementDiscountDetail",
    keys: ["SettlementId", "DiscountId"],
    omitIdentity: true
  },
  {
    table: "SettlementCreditSales",
    keys: ["SettlementID", "PayMode"],
    omitIdentity: true
  },
  {
    table: "PaymentDetail",
    keys: ["PaymentId"],
    fallbackKeys: ["SettlementID", "PaymentMode"],
    omitIdentity: true
  },
  {
    table: "PaymentDetailCur",
    keys: ["PaymentId"],
    fallbackKeys: ["SettlementID", "PaymentMode"],
    omitIdentity: true
  },
  {
    table: "ArtistCashBox",
    keys: ["CashBoxId"],
    omitIdentity: true
  },
  {
    table: "dishOrderItemShare",
    keys: ["Id"],
    omitIdentity: true
  },

  // 2. Sales Invoices & Orders (for All Reports)
  {
    table: "RestaurantInvoice",
    keys: ["RestaurantBillId"],
    fallbackKeys: ["BillNumber"],
    dateCol: "CreatedOn",
    omitIdentity: true
  },
  {
    table: "RestaurantInvoiceCur",
    keys: ["RestaurantBillId"],
    fallbackKeys: ["BillNumber"],
    dateCol: "CreatedOn",
    omitIdentity: true
  },
  {
    table: "RestaurantOrder",
    keys: ["OrderId"],
    dateCol: "CreatedOn",
    omitIdentity: true
  },
  {
    table: "RestaurantOrderDetail",
    keys: ["OrderDetailId"],
    dateCol: "CreatedOn",
    omitIdentity: true
  },
  {
    table: "Restaurantmodifierdetail",
    keys: ["OrderDetailId", "ModifierId"],
    omitIdentity: true
  },
  {
    table: "OrderSequences",
    keys: ["RestaurantId", "SequenceDate"],
    omitIdentity: true,
    updateIfExists: true
  },
  {
    table: "PrintReport",
    keys: ["OrderId", "Ordernumber", "PrintType"],
    omitIdentity: true
  },

  // 3. Day End, Day Start & Cash Drawer
  {
    table: "BusinessDayLog",
    keys: ["BusinessDate"],
    omitIdentity: true,
    updateIfExists: true
  },
  {
    table: "BusinessDayAuditLog",
    keys: ["BusinessDate", "EventType", "EventTime"],
    fallbackKeys: ["AuditId"],
    omitIdentity: true
  },
  {
    table: "CashInEntry",
    keys: ["CashInId"],
    fallbackKeys: ["CashInNo"],
    dateCol: "CreatedOn",
    omitIdentity: true
  },
  {
    table: "CashOutEntry",
    keys: ["CashOutId"],
    fallbackKeys: ["CashOutNo"],
    dateCol: "CreatedOn",
    omitIdentity: true
  },
  {
    table: "OpeningCashDenomination",
    keys: ["Id"],
    omitIdentity: true
  },
  {
    table: "CashDrawerLog",
    keys: ["LogId"],
    fallbackKeys: ["OrderId", "CreatedOn"],
    omitIdentity: true
  },

  // 4. Members & Loyalty
  {
    table: "MemberMaster",
    keys: ["MemberId"],
    omitIdentity: true,
    updateIfExists: true
  },
  {
    table: "RewardPointDetails",
    keys: ["MemberId", "SettlementId", "BillNo"],
    omitIdentity: true
  },
  {
    table: "LoyaltyCustomer",
    keys: ["LoyaltyCustomerId"],
    fallbackKeys: ["Phone"],
    omitIdentity: true,
    updateIfExists: true
  },
  {
    table: "LoyaltyVisit",
    keys: ["LoyaltyVisitId"],
    omitIdentity: true
  },
  {
    table: "CustomerDishLoyaltyState",
    keys: ["CustomerId", "RuleId"],
    omitIdentity: true,
    updateIfExists: true
  },

  // 5. Credit Customers
  {
    table: "CreditCustomerMaster",
    keys: ["CustomerId"],
    omitIdentity: true,
    updateIfExists: true
  },
  {
    table: "CustomerCreditTransactions",
    keys: ["TransactionId"],
    dateCol: "CreatedDate",
    omitIdentity: true
  },
  {
    table: "CustomerCreditAllocations",
    keys: ["AllocationId"],
    omitIdentity: true
  }
];

// Helper: Push a single table from Local DB -> Remote DB
async function pushTable(localPool, remotePool, spec) {
  const { table, keys, fallbackKeys, omitIdentity, updateIfExists } = spec;

  try {
    // 1. Verify remote table columns
    const rColsRes = await remotePool.request().query(`
      SELECT c.COLUMN_NAME, c.DATA_TYPE, 
             COLUMNPROPERTY(OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME)), c.COLUMN_NAME, 'IsIdentity') as is_identity,
             c.IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS c 
      WHERE c.TABLE_NAME = '${table}'
    `).catch(() => ({ recordset: [] }));

    if (!rColsRes.recordset || rColsRes.recordset.length === 0) {
      return { table, pushed: 0 };
    }

    const rColMap = new Map(rColsRes.recordset.map(c => [c.COLUMN_NAME.toLowerCase(), c]));

    // Determine active keys
    let activeKeys = keys.filter(k => rColMap.has(k.toLowerCase()));
    if (activeKeys.length === 0 && fallbackKeys) {
      activeKeys = fallbackKeys.filter(k => rColMap.has(k.toLowerCase()));
    }
    if (activeKeys.length === 0) {
      return { table, pushed: 0 };
    }

    const keyColsSql = activeKeys.map(k => `[${k}]`).join(", ");

    // 2. Fetch existing keys from both sides
    const lKeyRes = await localPool.request().query(`SELECT DISTINCT ${keyColsSql} FROM [dbo].[${table}]`).catch(() => ({ recordset: [] }));
    const rKeyRes = await remotePool.request().query(`SELECT DISTINCT ${keyColsSql} FROM [dbo].[${table}]`).catch(() => ({ recordset: [] }));

    const makeKey = (row) => activeKeys.map(k => String(row[k] ?? row[k.toLowerCase()] ?? '')).join('___');

    const rKeySet = new Set(rKeyRes.recordset.map(r => makeKey(r)));
    const missing = lKeyRes.recordset.filter(r => !rKeySet.has(makeKey(r)));

    let pushed = 0;

    // 3. Push missing records (in batches of 50 for max network throughput)
    const BATCH_SIZE = 50;
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batchRows = missing.slice(i, i + BATCH_SIZE);

      for (const mRow of batchRows) {
        const whereParts = activeKeys.map((k, idx) => `[${k}] = @k_${idx}`);
        const fetchReq = localPool.request();
        activeKeys.forEach((k, idx) => fetchReq.input(`k_${idx}`, mRow[k] ?? mRow[k.toLowerCase()]));

        const fullRowRes = await fetchReq.query(`SELECT TOP 1 * FROM [dbo].[${table}] WHERE ${whereParts.join(" AND ")}`).catch(() => ({ recordset: [] }));
        const fullRow = fullRowRes.recordset[0];
        if (!fullRow) continue;

        const insertCols = Object.keys(fullRow).filter(k => {
          const rCol = rColMap.get(k.toLowerCase());
          if (!rCol) return false;
          if (omitIdentity && rCol.is_identity === 1) return false;
          if (fullRow[k] === null && rCol.IS_NULLABLE === 'NO') return false;
          return true;
        });

        if (insertCols.length === 0) continue;

        const colList = insertCols.map(k => `[${k}]`).join(", ");
        const insertReq = remotePool.request();
        const valList = insertCols.map((k, idx) => {
          const val = fullRow[k];
          if (val === null) return "NULL";
          insertReq.input(`p_${idx}`, val);
          return `@p_${idx}`;
        }).join(", ");

        const whereCheck = activeKeys.map((k, idx) => {
          insertReq.input(`chk_${idx}`, mRow[k] ?? mRow[k.toLowerCase()]);
          return `[${k}] = @chk_${idx}`;
        }).join(" AND ");

        const insertSql = `
          IF NOT EXISTS (SELECT 1 FROM [dbo].[${table}] WHERE ${whereCheck})
          BEGIN
            INSERT INTO [dbo].[${table}] (${colList}) VALUES (${valList});
          END
        `;

        try {
          await insertReq.query(insertSql);
          pushed++;
        } catch (err) {
          // Non-fatal warning
        }
      }
    }

    // 4. Update if exists (for BusinessDayLog Day End updates, MemberMaster balance updates)
    if (updateIfExists && lKeyRes.recordset.length > 0) {
      if (table === "BusinessDayLog") {
        for (const lRow of lKeyRes.recordset) {
          const bDate = lRow.BusinessDate;
          const lLogRes = await localPool.request().input("d", bDate).query("SELECT TOP 1 * FROM BusinessDayLog WHERE BusinessDate = @d");
          const lLog = lLogRes.recordset[0];
          if (lLog && lLog.EndedAt) {
            await remotePool.request()
              .input("d", bDate)
              .input("endedAt", lLog.EndedAt)
              .input("endedBy", lLog.EndedBy || 'admin')
              .query(`
                UPDATE BusinessDayLog 
                SET EndedAt = @endedAt, EndedBy = @endedBy 
                WHERE BusinessDate = @d AND (EndedAt IS NULL OR EndedAt <> @endedAt)
              `).catch(() => {});
          }
        }
      } else if (table === "MemberMaster") {
        const topRecentMembers = await localPool.request().query("SELECT TOP 20 MemberId, Name, Phone, Balance, CurrentBalance, CreditLimit, Promocode, Promoamount FROM MemberMaster").catch(() => ({ recordset: [] }));
        for (const m of topRecentMembers.recordset) {
          await remotePool.request()
            .input("mid", m.MemberId)
            .input("name", m.Name)
            .input("phone", m.Phone)
            .input("bal", m.Balance)
            .input("currBal", m.CurrentBalance)
            .input("cLim", m.CreditLimit)
            .input("promo", m.Promocode)
            .input("pAmt", m.Promoamount)
            .query(`
              UPDATE MemberMaster 
              SET Name = @name, Phone = @phone, Balance = @bal, CurrentBalance = @currBal,
                  CreditLimit = @cLim, Promocode = @promo, Promoamount = @pAmt
              WHERE MemberId = @mid
            `).catch(() => {});
        }
      } else if (table === "CreditCustomerMaster") {
        const topRecentCreditCusts = await localPool.request().query("SELECT TOP 20 CustomerId, Name, Phone, Balance, CurrentBalance, CreditLimit FROM CreditCustomerMaster").catch(() => ({ recordset: [] }));
        for (const c of topRecentCreditCusts.recordset) {
          await remotePool.request()
            .input("cid", c.CustomerId)
            .input("name", c.Name)
            .input("phone", c.Phone)
            .input("bal", c.Balance)
            .input("currBal", c.CurrentBalance)
            .input("cLim", c.CreditLimit)
            .query(`
              UPDATE CreditCustomerMaster 
              SET Name = @name, Phone = @phone, Balance = @bal, CurrentBalance = @currBal, CreditLimit = @cLim
              WHERE CustomerId = @cid
            `).catch(() => {});
        }
      } else if (table === "OrderSequences") {
        const localSeqs = await localPool.request().query("SELECT TOP 50 RestaurantId, SequenceDate, LastNumber FROM OrderSequences").catch(() => ({ recordset: [] }));
        for (const seq of localSeqs.recordset) {
          await remotePool.request()
            .input("rid", seq.RestaurantId)
            .input("sdate", seq.SequenceDate)
            .input("lnum", seq.LastNumber)
            .query(`
              IF EXISTS (SELECT 1 FROM OrderSequences WHERE RestaurantId = @rid AND SequenceDate = @sdate)
                UPDATE OrderSequences SET LastNumber = @lnum WHERE RestaurantId = @rid AND SequenceDate = @sdate;
              ELSE
                INSERT INTO OrderSequences (RestaurantId, SequenceDate, LastNumber) VALUES (@rid, @sdate, @lnum);
            `).catch(() => {});
        }
      }
    }

    return { table, pushed };
  } catch (err) {
    console.warn(`⚠️ [SalesPush] Error pushing table ${table}:`, err.message);
    return { table, pushed: 0 };
  }
}

// 2-Way Mirror for Business Day Active Status (DateEntry)
async function mirrorBusinessDateEntry(localPool, remotePool) {
  try {
    const lDateRes = await localPool.request().query("SELECT * FROM DateEntry").catch(() => ({ recordset: [] }));
    if (lDateRes.recordset.length === 0) {
      // Local business day has ended -> Clear Remote DateEntry!
      await remotePool.request().query("DELETE FROM DateEntry").catch(() => {});
    } else {
      // Local business day is active -> Mirror to Remote DateEntry!
      const activeDe = lDateRes.recordset[0];
      await remotePool.request()
        .input("id", activeDe.DateEntryId)
        .input("user", activeDe.username)
        .input("start", activeDe.StartDate)
        .input("createdBy", activeDe.Createdby)
        .input("createdDate", activeDe.CreatedDate)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM DateEntry WHERE DateEntryId = @id)
          BEGIN
            DELETE FROM DateEntry;
            INSERT INTO DateEntry (DateEntryId, username, StartDate, Createdby, CreatedDate)
            VALUES (@id, @user, @start, @createdBy, @createdDate);
          END
        `).catch(() => {});
    }
  } catch (err) {
    console.warn("⚠️ [SalesPush] Error mirroring DateEntry:", err.message);
  }
}

let lastSalesPushTime = 0;
const SALES_PUSH_THROTTLE_MS = 3000;

// Main execution function: Pushes all sales, settlements, day end, reports, members & credit
async function pushAllSalesAndOperationalToRemote(localPool, remotePool, force = false) {
  if (!localPool || !remotePool) return false;

  const now = Date.now();
  if (!force && (now - lastSalesPushTime < SALES_PUSH_THROTTLE_MS)) {
    return true; // Throttle redundant back-to-back execution
  }
  lastSalesPushTime = now;

  let totalPushed = 0;
  for (const spec of SYNC_SPECS) {
    const res = await pushTable(localPool, remotePool, spec);
    totalPushed += res.pushed;
  }

  // Mirror DateEntry
  await mirrorBusinessDateEntry(localPool, remotePool);

  if (totalPushed > 0) {
    console.log(`⚡ [SalesPush] Successfully pushed ${totalPushed} sales/settlement/operational records to Remote Cloud DB!`);
  }
  return true;
}

module.exports = {
  pushAllSalesAndOperationalToRemote,
  mirrorBusinessDateEntry,
  SYNC_SPECS
};
