import pg from "pg";

let pool;

export async function saveCalculationRun({
  profile,
  jurisdiction,
  companyType,
  businessModel,
  inputs,
  outputs
}) {
  if (!process.env.DATABASE_URL) return null;

  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false
    });
  }

  const result = await pool.query(
    `INSERT INTO calculation_runs (
       profile_code,
       jurisdiction_code,
       company_type,
       business_model,
       inputs,
       outputs
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [profile, jurisdiction, companyType, businessModel, inputs, outputs]
  );

  return result.rows[0]?.id ?? null;
}
