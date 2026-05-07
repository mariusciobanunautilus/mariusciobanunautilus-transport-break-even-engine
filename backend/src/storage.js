import { hasDatabaseUrl, query, withTransaction } from "./db.js";

let nextMemoryId = 1;
const memoryRuns = new Map();
const memoryAuditEvents = [];

export async function saveCalculationRun(record) {
  const run = normalizeRunRecord(record);

  if (!hasDatabaseUrl()) {
    return saveMemoryRun(run);
  }

  return saveDatabaseRun(run);
}

export async function listCalculationRuns() {
  if (!hasDatabaseUrl()) {
    return Array.from(memoryRuns.values())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(toRunListItem);
  }

  const result = await query(
    `SELECT
       cr.*,
       latest_result.result_snapshot
     FROM calculation_runs cr
     LEFT JOIN LATERAL (
       SELECT result_snapshot
       FROM calculation_results
       WHERE calculation_run_id = cr.id
       ORDER BY id DESC
       LIMIT 1
     ) latest_result ON TRUE
     ORDER BY cr.created_at DESC`
  );

  return result.rows.map((row) => toRunListItem(mapRunRow(row)));
}

export async function getCalculationRun(id) {
  if (!hasDatabaseUrl()) {
    return memoryRuns.get(String(id)) ?? null;
  }

  return getDatabaseRun(id);
}

export async function deleteCalculationRun(id, actor = "system") {
  if (!hasDatabaseUrl()) {
    const run = memoryRuns.get(String(id));
    if (!run) return false;

    memoryRuns.delete(String(id));
    appendMemoryAuditEvent({
      actor,
      action: "CALCULATION_DELETED",
      entityType: "calculation_run",
      entityId: String(id),
      before: run
    });
    return true;
  }

  return withTransaction(async (client) => {
    const run = await getDatabaseRun(id, client);
    if (!run) return false;

    await client.query("DELETE FROM calculation_runs WHERE id = $1", [id]);
    await insertAuditEvent(
      client,
      {
        actor,
        action: "CALCULATION_DELETED",
        entityType: "calculation_run",
        entityId: String(id),
        before: run
      }
    );
    return true;
  });
}

export async function listAuditEvents() {
  if (!hasDatabaseUrl()) {
    return [...memoryAuditEvents].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }

  const result = await query(
    `SELECT
       id,
       actor,
       action,
       entity_type,
       entity_id,
       before_snapshot,
       after_snapshot,
       created_at
     FROM audit_log
     ORDER BY created_at DESC, id DESC`
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    beforeSnapshot: row.before_snapshot,
    afterSnapshot: row.after_snapshot,
    createdAt: toIso(row.created_at)
  }));
}

function saveMemoryRun(run) {
  const savedRun = {
    ...run,
    id: String(nextMemoryId++),
    createdAt: run.createdAt || new Date().toISOString()
  };

  memoryRuns.set(String(savedRun.id), savedRun);
  appendMemoryAuditEvent({
    actor: savedRun.createdBy,
    action: "CALCULATION_SAVED",
    entityType: "calculation_run",
    entityId: String(savedRun.id),
    after: savedRun
  });

  return savedRun;
}

async function saveDatabaseRun(run) {
  return withTransaction(async (client) => {
    const outputSnapshot = buildOutputSnapshot(run);
    const inserted = await client.query(
      `INSERT INTO calculation_runs (
         profile_code,
         jurisdiction_code,
         company_type,
         business_model,
         inputs,
         outputs,
         run_name,
         input_snapshot,
         tax_snapshot,
         vehicle_snapshot,
         created_by,
         calculation_mode,
         plan_year,
         as_of_date,
         scenario_status,
         engine_version,
         scenario_name,
         scenario_version,
         approved_at,
         approved_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING id, created_at`,
      [
        databaseProfileCode(run.profile),
        run.jurisdiction,
        run.companyType,
        run.businessModel,
        run.inputSnapshot,
        outputSnapshot,
        run.runName,
        run.inputSnapshot,
        run.taxSnapshot,
        run.vehicleSnapshot,
        run.createdBy,
        run.calculationMode,
        run.planYear,
        run.asOfDate,
        run.scenarioStatus,
        run.engineVersion,
        run.scenarioName,
        run.scenarioVersion,
        run.approvedAt,
        run.approvedBy
      ]
    );

    const savedRun = {
      ...run,
      id: String(inserted.rows[0].id),
      createdAt: toIso(inserted.rows[0].created_at)
    };

    await client.query(
      `INSERT INTO calculation_results (calculation_run_id, result_snapshot)
       VALUES ($1, $2)`,
      [savedRun.id, savedRun.resultSnapshot]
    );

    for (const period of savedRun.periods) {
      await insertScenarioPeriod(client, savedRun.id, period);
    }

    for (const scenario of savedRun.pricingScenarios) {
      await client.query(
        `INSERT INTO pricing_scenarios (
           calculation_run_id,
           markup_percentage,
           customer_rate_excl_vat,
           customer_rate_incl_vat,
           annual_revenue_excl_vat,
           ebit_before_tax,
           profit_after_tax,
           after_tax_margin
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          savedRun.id,
          scenario.markupPercentage ?? scenario.markup ?? 0,
          scenario.customerRateExclVat ?? scenario.rate ?? 0,
          scenario.customerRateInclVat ?? scenario.customerRateExclVat ?? scenario.rate ?? 0,
          scenario.annualRevenueExclVat ?? scenario.annualRevenue ?? 0,
          scenario.ebitBeforeTax ?? scenario.ebit ?? 0,
          scenario.profitAfterTax ?? scenario.ebit ?? 0,
          scenario.afterTaxMargin ?? scenario.ebitMargin ?? 0
        ]
      );
    }

    await insertAuditEvent(client, {
      actor: savedRun.createdBy,
      action: "CALCULATION_SAVED",
      entityType: "calculation_run",
      entityId: savedRun.id,
      after: savedRun
    });

    return savedRun;
  });
}

async function getDatabaseRun(id, client = null) {
  const executor = client ?? { query };
  const result = await executor.query(
    `SELECT
       cr.*,
       latest_result.result_snapshot
     FROM calculation_runs cr
     LEFT JOIN LATERAL (
       SELECT result_snapshot
       FROM calculation_results
       WHERE calculation_run_id = cr.id
       ORDER BY id DESC
       LIMIT 1
     ) latest_result ON TRUE
     WHERE cr.id = $1
     LIMIT 1`,
    [id]
  );

  if (!result.rows[0]) return null;

  const run = mapRunRow(result.rows[0]);
  const scenarios = await executor.query(
    `SELECT
       markup_percentage,
       customer_rate_excl_vat,
       customer_rate_incl_vat,
       annual_revenue_excl_vat,
       ebit_before_tax,
       profit_after_tax,
       after_tax_margin
     FROM pricing_scenarios
     WHERE calculation_run_id = $1
     ORDER BY markup_percentage ASC`,
    [id]
  );
  const periods = await executor.query(
    `SELECT
       period_start,
       period_end,
       period_type,
       data_status,
       total_km,
       loaded_km,
       load_factor,
       fuel_price_per_liter,
       fuel_consumption_l_per_100km,
       fuel_cost,
       tyres_cost,
       maintenance_cost,
       road_fees_cost,
       driver_cost,
       fixed_vehicle_cost,
       structural_overhead_cost,
       other_cost,
       revenue_excl_vat,
       notes,
       raw_period
     FROM scenario_periods
     WHERE calculation_run_id = $1
     ORDER BY period_start NULLS LAST, period_end NULLS LAST, id ASC`,
    [id]
  );

  return {
    ...run,
    periods: periods.rows.map(mapScenarioPeriodRow),
    pricingScenarios: scenarios.rows.map((row) => ({
      markupPercentage: Number(row.markup_percentage),
      customerRateExclVat: Number(row.customer_rate_excl_vat),
      customerRateInclVat: Number(row.customer_rate_incl_vat),
      annualRevenueExclVat: Number(row.annual_revenue_excl_vat),
      ebitBeforeTax: Number(row.ebit_before_tax),
      profitAfterTax: Number(row.profit_after_tax),
      afterTaxMargin: Number(row.after_tax_margin)
    }))
  };
}

async function insertScenarioPeriod(client, calculationRunId, period) {
  await client.query(
    `INSERT INTO scenario_periods (
       calculation_run_id,
       period_start,
       period_end,
       period_type,
       data_status,
       total_km,
       loaded_km,
       load_factor,
       fuel_price_per_liter,
       fuel_consumption_l_per_100km,
       fuel_cost,
       tyres_cost,
       maintenance_cost,
       road_fees_cost,
       driver_cost,
       fixed_vehicle_cost,
       structural_overhead_cost,
       other_cost,
       revenue_excl_vat,
       notes,
       raw_period
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    [
      calculationRunId,
      period.periodStart ?? period.period_start ?? null,
      period.periodEnd ?? period.period_end ?? null,
      period.periodType ?? period.period_type ?? "month",
      period.dataStatus ?? period.data_status ?? "planned",
      period.totalKm ?? period.total_km ?? null,
      period.loadedKm ?? period.loaded_km ?? period.loadedRevenueKm ?? null,
      period.loadFactor ?? period.load_factor ?? period.loadedRatio ?? null,
      period.fuelPricePerLiter ?? period.fuel_price_per_liter ?? null,
      period.fuelConsumptionLPer100Km ??
        period.fuel_consumption_l_per_100km ??
        null,
      period.fuelCost ?? period.fuel_cost ?? null,
      period.tyresCost ?? period.tyres_cost ?? period.tiresCost ?? null,
      period.maintenanceCost ?? period.maintenance_cost ?? null,
      period.roadFeesCost ?? period.road_fees_cost ?? null,
      period.driverCost ?? period.driver_cost ?? null,
      period.fixedVehicleCost ?? period.fixed_vehicle_cost ?? null,
      period.structuralOverheadCost ??
        period.structural_overhead_cost ??
        null,
      period.otherCost ?? period.other_cost ?? null,
      period.revenueExclVat ?? period.revenue_excl_vat ?? null,
      period.notes ?? null,
      period
    ]
  );
}

function normalizeRunRecord(record) {
  const now = new Date().toISOString();
  const legacyOutput = record.outputs ?? record.resultSnapshot;
  const resultSnapshot = record.resultSnapshot ?? legacyOutput?.result ?? legacyOutput;
  const inputSnapshot =
    record.inputSnapshot ?? record.inputs ?? legacyOutput?.input ?? {};
  const taxSnapshot =
    record.taxSnapshot ?? legacyOutput?.taxProfile ?? legacyOutput?.tax ?? {};

  return {
    id: record.id ? String(record.id) : null,
    runName:
      record.runName ||
      inputSnapshot.runName ||
      `Run ${new Date(now).toLocaleString("en-GB")}`,
    profile: record.profile ?? inputSnapshot.profileCode ?? "BLUEPRINT",
    jurisdiction:
      record.jurisdiction ??
      taxSnapshot.countryCode ??
      legacyOutput?.jurisdiction?.code ??
      countryCodeFromInput(inputSnapshot) ??
      "MANUAL",
    companyType:
      record.companyType ??
      taxSnapshot.companyTypeName ??
      legacyOutput?.cascade?.companyType ??
      "Unknown",
    businessModel:
      record.businessModel ??
      inputSnapshot.businessModelName ??
      businessModelNameFromInput(inputSnapshot) ??
      legacyOutput?.cascade?.businessModel ??
      "Unknown",
    inputSnapshot,
    taxSnapshot,
    vehicleSnapshot: record.vehicleSnapshot ?? legacyOutput?.vehicleSnapshot ?? null,
    resultSnapshot,
    pricingScenarios: record.pricingScenarios ?? legacyOutput?.pricingScenarios ?? [],
    periods: record.periods ?? record.scenarioPeriods ?? legacyOutput?.periods ?? [],
    calculationMode:
      record.calculationMode ??
      record.calculation_mode ??
      resultSnapshot?.calculationMode ??
      inputSnapshot.calculationMode ??
      "snapshot",
    planYear: record.planYear ?? record.plan_year ?? inputSnapshot.planYear ?? null,
    asOfDate: record.asOfDate ?? record.as_of_date ?? inputSnapshot.asOfDate ?? null,
    scenarioStatus:
      record.scenarioStatus ?? record.scenario_status ?? record.status ?? "draft",
    engineVersion:
      record.engineVersion ?? record.engine_version ?? legacyOutput?.engineVersion ?? null,
    scenarioName:
      record.scenarioName ?? record.scenario_name ?? record.runName ?? null,
    scenarioVersion:
      record.scenarioVersion ?? record.scenario_version ?? 1,
    approvedAt: record.approvedAt ?? record.approved_at ?? null,
    approvedBy: record.approvedBy ?? record.approved_by ?? null,
    createdBy: record.createdBy ?? record.actor ?? "local-user",
    createdAt: record.createdAt ?? now
  };
}

function mapRunRow(row) {
  const outputSnapshot = row.outputs || {};
  return {
    id: String(row.id),
    runName: row.run_name || `Run ${row.id}`,
    profile: row.profile_code,
    jurisdiction: row.jurisdiction_code,
    companyType: row.company_type,
    businessModel: row.business_model,
    inputSnapshot: row.input_snapshot ?? row.inputs ?? outputSnapshot.input ?? {},
    taxSnapshot: row.tax_snapshot ?? outputSnapshot.taxProfile ?? outputSnapshot.tax ?? {},
    vehicleSnapshot: row.vehicle_snapshot ?? outputSnapshot.vehicleSnapshot ?? null,
    resultSnapshot:
      row.result_snapshot ?? outputSnapshot.result ?? outputSnapshot.outputs ?? outputSnapshot,
    pricingScenarios: outputSnapshot.pricingScenarios ?? [],
    periods: outputSnapshot.periods ?? [],
    calculationMode:
      row.calculation_mode ?? outputSnapshot.calculationMode ?? "snapshot",
    planYear: row.plan_year ?? outputSnapshot.planYear ?? null,
    asOfDate: dateOnly(row.as_of_date) ?? outputSnapshot.asOfDate ?? null,
    scenarioStatus:
      row.scenario_status ?? outputSnapshot.scenarioStatus ?? "draft",
    engineVersion: row.engine_version ?? outputSnapshot.engineVersion ?? null,
    scenarioName: row.scenario_name ?? outputSnapshot.scenarioName ?? row.run_name ?? null,
    scenarioVersion: row.scenario_version ?? outputSnapshot.scenarioVersion ?? 1,
    approvedAt: toIso(row.approved_at),
    approvedBy: row.approved_by ?? null,
    createdBy: row.created_by ?? "local-user",
    createdAt: toIso(row.created_at)
  };
}

function toRunListItem(run) {
  return {
    id: run.id,
    runName: run.runName,
    country: run.taxSnapshot?.countryName ?? run.jurisdiction,
    companyType:
      run.taxSnapshot?.companyTypeName ?? run.companyType ?? "Unknown",
    businessModel: run.businessModel,
    vehicleClass: run.vehicleSnapshot?.displayName ?? run.vehicleSnapshot?.name,
    totalAnnualCost: run.resultSnapshot?.totalAnnualCost,
    breakEvenPerLoadedKm: run.resultSnapshot?.breakEvenPerLoadedKm,
    customerRateExclVat: run.resultSnapshot?.customerRateExclVat,
    profitAfterTax: run.resultSnapshot?.profitAfterTax,
    calculationMode: run.calculationMode,
    planYear: run.planYear,
    asOfDate: run.asOfDate,
    scenarioStatus: run.scenarioStatus,
    scenarioName: run.scenarioName,
    scenarioVersion: run.scenarioVersion,
    engineVersion: run.engineVersion,
    inputSnapshot: run.inputSnapshot,
    taxSnapshot: run.taxSnapshot,
    vehicleSnapshot: run.vehicleSnapshot,
    createdAt: run.createdAt
  };
}

function mapScenarioPeriodRow(row) {
  return {
    ...(row.raw_period ?? {}),
    periodStart: dateOnly(row.period_start),
    periodEnd: dateOnly(row.period_end),
    periodType: row.period_type,
    dataStatus: row.data_status,
    totalKm: nullableNumber(row.total_km),
    loadedKm: nullableNumber(row.loaded_km),
    loadFactor: nullableNumber(row.load_factor),
    fuelPricePerLiter: nullableNumber(row.fuel_price_per_liter),
    fuelConsumptionLPer100Km: nullableNumber(row.fuel_consumption_l_per_100km),
    fuelCost: nullableNumber(row.fuel_cost),
    tyresCost: nullableNumber(row.tyres_cost),
    maintenanceCost: nullableNumber(row.maintenance_cost),
    roadFeesCost: nullableNumber(row.road_fees_cost),
    driverCost: nullableNumber(row.driver_cost),
    fixedVehicleCost: nullableNumber(row.fixed_vehicle_cost),
    structuralOverheadCost: nullableNumber(row.structural_overhead_cost),
    otherCost: nullableNumber(row.other_cost),
    revenueExclVat: nullableNumber(row.revenue_excl_vat),
    notes: row.notes
  };
}

async function insertAuditEvent(client, {
  actor = "system",
  action,
  entityType,
  entityId,
  before,
  after
}) {
  await client.query(
    `INSERT INTO audit_log (
       actor,
       action,
       entity_type,
       entity_id,
       before_snapshot,
       after_snapshot
     )
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      actor,
      action,
      entityType,
      entityId,
      before ?? null,
      after ?? null
    ]
  );
}

function appendMemoryAuditEvent({
  actor = "system",
  action,
  entityType,
  entityId,
  before,
  after
}) {
  memoryAuditEvents.push({
    id: String(memoryAuditEvents.length + 1),
    actor,
    action,
    entityType,
    entityId,
    beforeSnapshot: before ?? null,
    afterSnapshot: after ?? null,
    createdAt: new Date().toISOString()
  });
}

function buildOutputSnapshot(run) {
  return {
    input: run.inputSnapshot,
    taxProfile: run.taxSnapshot,
    vehicleSnapshot: run.vehicleSnapshot,
    result: run.resultSnapshot,
    pricingScenarios: run.pricingScenarios,
    periods: run.periods,
    calculationMode: run.calculationMode,
    planYear: run.planYear,
    asOfDate: run.asOfDate,
    scenarioStatus: run.scenarioStatus,
    engineVersion: run.engineVersion,
    scenarioName: run.scenarioName,
    scenarioVersion: run.scenarioVersion
  };
}

function databaseProfileCode(profile) {
  return profile === "BLUEPRINT" ? "BLUEPRINT_DEFAULT" : profile;
}

function countryCodeFromInput(input) {
  const countryCodes = ["AT", "DE", "RO", "HU", "BG", "CZ", "SK", "MANUAL"];
  return countryCodes[Number(input.countryId) - 1] ?? null;
}

function businessModelNameFromInput(input) {
  const names = [
    "Owner-operator",
    "Fleet operator",
    "Subcontractor",
    "Mixed",
    "Carrier with subcontractors"
  ];
  return names[Number(input.businessModelId) - 1] ?? null;
}

function toIso(value) {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dateOnly(value) {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function nullableNumber(value) {
  return value == null ? null : Number(value);
}
