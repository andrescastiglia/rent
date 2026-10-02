const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { Client } = require("pg");

async function main() {
  assert.equal(
    process.env.NODE_ENV,
    "test",
    "This fixture requires NODE_ENV=test",
  );
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const company = randomUUID(),
    user = randomUUID(),
    owner = randomUUID(),
    tenant = randomUUID();
  const property = randomUUID(),
    lease = randomUUID(),
    account = randomUUID();
  const cwd = path.resolve(__dirname, "..");
  const run = (dryRun = false, billingDate = "2026-10-10") =>
    execFileSync(
      process.execPath,
      [
        "-r",
        require.resolve("ts-node/register"),
        "src/index.ts",
        "billing",
        "--date",
        billingDate,
        "--company-id",
        company,
        "--lease-id",
        lease,
        ...(dryRun ? ["--dry-run"] : []),
      ],
      {
        cwd,
        env: process.env,
        encoding: "utf8",
        timeout: 90000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  try {
    await db.query(
      "INSERT INTO companies(id,name,tax_id,settings) VALUES($1,$2,$3,$4::jsonb)",
      [
        company,
        "Billing CLI fixture",
        company,
        JSON.stringify({ financial: { commissionTaxRate: 21 } }),
      ],
    );
    await db.query(
      "INSERT INTO users(id,company_id,email,password_hash,role,roles,first_name,last_name) VALUES($1,$2,$3,'disabled-test-password','admin',ARRAY['admin','owner','tenant']::user_role[],'Billing','Fixture')",
      [user, company, `${user}@billing.test`],
    );
    await db.query(
      "INSERT INTO owners(id,company_id,user_id,commission_rate) VALUES($1,$2,$3,10)",
      [owner, company, user],
    );
    await db.query(
      "INSERT INTO tenants(id,company_id,user_id) VALUES($1,$2,$3)",
      [tenant, company, user],
    );
    await db.query(
      "INSERT INTO properties(id,company_id,owner_id,name,property_type,address_street,address_city,address_state) VALUES($1,$2,$3,'Billing fixture','apartment','Test','Test','Test')",
      [property, company, owner],
    );
    await db.query(
      "INSERT INTO leases(id,company_id,property_id,owner_id,tenant_id,status,contract_type,start_date,end_date,monthly_rent,currency,next_billing_date) VALUES($1,$2,$3,$4,$5,'active','rental','2026-08-01','2027-10-01',123.45,'ARS','2026-08-01')",
      [lease, company, property, owner, tenant],
    );
    await db.query(
      "INSERT INTO tenant_accounts(id,company_id,lease_id,tenant_id,current_balance,currency) VALUES($1,$2,$3,$4,0,'ARS')",
      [account, company, lease, tenant],
    );
    run(true);
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM invoices WHERE company_id=$1",
          [company],
        )
      ).rows[0].n,
      0,
    );
    run();
    run(); // Same scheduled day while September is still overdue: recover August.
    const invoices = (
      await db.query(
        "SELECT status,currency,total_amount::text,period_start::text,pdf_url FROM invoices WHERE company_id=$1",
        [company],
      )
    ).rows;
    assert.deepEqual(invoices, [
      {
        status: "pending",
        currency: "ARS",
        total_amount: "123.45",
        period_start: "2026-08-01",
        pdf_url: null,
      },
    ]);
    assert.equal(
      (
        await db.query(
          "SELECT current_balance::text FROM tenant_accounts WHERE id=$1",
          [account],
        )
      ).rows[0].current_balance,
      "123.45",
    );
    for (const table of [
      "invoice_generations",
      "invoice_effects_outbox",
      "commission_invoices",
    ])
      assert.equal(
        (
          await db.query(
            `SELECT count(*)::int AS n FROM ${table} WHERE company_id=$1`,
            [company],
          )
        ).rows[0].n,
        1,
      );
    const jobs = (
      await db.query(
        "SELECT status,records_processed,records_skipped FROM billing_jobs WHERE parameters->>'companyId'=$1 ORDER BY created_at",
        [company],
      )
    ).rows;
    assert.deepEqual(jobs, [
      { status: "completed", records_processed: 0, records_skipped: 1 },
      { status: "completed", records_processed: 1, records_skipped: 0 },
      { status: "completed", records_processed: 1, records_skipped: 0 },
    ]);
    await db.query("UPDATE tenant_accounts SET currency='USD' WHERE id=$1", [
      account,
    ]);
    assert.throws(
      () => run(false, "2026-10-11"),
      (error) => error.status === 1,
    );
    const partial = (
      await db.query(
        "SELECT status,records_failed FROM billing_jobs WHERE parameters->>'companyId'=$1 ORDER BY created_at DESC LIMIT 1",
        [company],
      )
    ).rows[0];
    assert.deepEqual(partial, { status: "partial_failure", records_failed: 1 });
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM invoices WHERE company_id=$1",
          [company],
        )
      ).rows[0].n,
      1,
    );
    process.stdout.write(
      "Billing CLI: preview, write, retry, ledger, commission, outbox and partial failure verified.\n",
    );
  } finally {
    await db.query(
      "DELETE FROM billing_jobs WHERE parameters->>'companyId'=$1",
      [company],
    );
    await db.query(
      "DELETE FROM tenant_account_movements WHERE tenant_account_id=$1",
      [account],
    );
    for (const table of [
      "communication_deliveries",
      "invoice_generations",
      "invoice_effects_outbox",
      "commission_invoices",
      "invoices",
      "documents",
      "tenant_accounts",
      "leases",
      "properties",
      "tenants",
      "owners",
      "users",
    ])
      await db.query(`DELETE FROM ${table} WHERE company_id=$1`, [company]);
    await db.query("DELETE FROM companies WHERE id=$1", [company]);
    await db.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  process.exitCode = 1;
});
