import { hasDatabaseUrl, query, withTransaction } from "./db.js";

let nextMemoryId = 1;
const memoryRuns = new Map();
const memoryAuditEvents = [];

export async function saveCalculationRun(record, context = {}) {
  const storageContext = normalizeStorageContext(context, record);
  const run = normalizeRunRecord({
    ...record,
    createdBy: record.createdBy ?? storageContext.actor,
    createdByUserId: record.createdByUserId ?? storageContext.actorUserId,
    workspaceId: record.workspaceId ?? storageContext.workspaceId
  });

  if (!hasDatabaseUrl()) {
    return saveMemoryRun(run);
  }

  return saveDatabaseRun(run, storageContext);
}

export async function listCalculationRuns(context = {}) {
  const storageContext = normalizeStorageContext(context);

  if (!hasDatabaseUrl()) {
    return Array.from(memoryRuns.values())
      .filter((run) => run.workspaceId === storageContext.workspaceId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(toRunListItem);
  }

  assertWorkspaceContext(storageContext);
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
     WHERE cr.workspace_id = $1
     ORDER BY cr.created_at DESC`
    ,
    [storageContext.workspaceId]
  );

  return result.rows.map((row) => toRunListItem(mapRunRow(row)));
}

export async function getCalculationRun(id, context = {}) {
  const storageContext = normalizeStorageContext(context);

  if (!hasDatabaseUrl()) {
    const run = memoryRuns.get(String(id)) ?? null;
    return run?.workspaceId === storageContext.workspaceId ? run : null;
  }

  assertWorkspaceContext(storageContext);
  return getDatabaseRun(id, storageContext);
}

export async function deleteCalculationRun(id, context = {}) {
  const storageContext = normalizeStorageContext(context);

  if (!hasDatabaseUrl()) {
    const run = memoryRuns.get(String(id));
    if (!run || run.workspaceId !== storageContext.workspaceId) return false;

    memoryRuns.delete(String(id));
    appendMemoryAuditEvent({
      actor: storageContext.actor,
      actorUserId: storageContext.actorUserId,
      action: "CALCULATION_DELETED",
      entityType: "calculation_run",
      entityId: String(id),
      before: run,
      workspaceId: storageContext.workspaceId
    });
    return true;
  }

  assertWorkspaceContext(storageContext);
  return withTransaction(async (client) => {
    const run = await getDatabaseRun(id, storageContext, client);
    if (!run) return false;

    await client.query(
      "DELETE FROM calculation_runs WHERE id = $1 AND workspace_id = $2",
      [id, storageContext.workspaceId]
    );
    await insertAuditEvent(
      client,
      {
        actor: storageContext.actor,
        actorUserId: storageContext.actorUserId,
        action: "CALCULATION_DELETED",
        entityType: "calculation_run",
        entityId: String(id),
        before: run,
        workspaceId: storageContext.workspaceId
      },
      storageContext
    );
    return true;
  });
}

export async function listAuditEvents(context = {}) {
  const storageContext = normalizeStorageContext(context);

  if (!hasDatabaseUrl()) {
    return [...memoryAuditEvents]
      .filter((event) => event.workspaceId === storageContext.workspaceId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  assertWorkspaceContext(storageContext);
  const result = await query(
    `SELECT
       id,
       actor,
       actor_user_id,
       action,
       entity_type,
       entity_id,
       workspace_id,
       before_snapshot,
       after_snapshot,
       created_at
     FROM audit_log
     WHERE workspace_id = $1
     ORDER BY created_at DESC, id DESC`
    ,
    [storageContext.workspaceId]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    actor: row.actor,
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
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
    actorUserId: savedRun.createdByUserId,
    action: "CALCULATION_SAVED",
    entityType: "calculation_run",
    entityId: String(savedRun.id),
    after: savedRun,
    workspaceId: savedRun.workspaceId
  });

  return savedRun;
}

async function saveDatabaseRun(run, context) {
  return withTransaction(async (client) => {
    const outputSnapshot = buildOutputSnapshot(run);
    const inserted = await client.query(
      `INSERT INTO calculation_runs (
         profile_code,
         jurisdiction_code,
         workspace_id,
         company_type,
         business_model,
         inputs,
         outputs,
         run_name,
         input_snapshot,
         tax_snapshot,
         vehicle_snapshot,
         created_by,
         created_by_user_id,
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21, $22)
       RETURNING id, created_at`,
      [
        databaseProfileCode(run.profile),
        run.jurisdiction,
        context.workspaceId,
        run.companyType,
        run.businessModel,
        run.inputSnapshot,
        outputSnapshot,
        run.runName,
        run.inputSnapshot,
        run.taxSnapshot,
        run.vehicleSnapshot,
        run.createdBy,
        run.createdByUserId,
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
      actorUserId: savedRun.createdByUserId,
      action: "CALCULATION_SAVED",
      entityType: "calculation_run",
      entityId: savedRun.id,
      after: savedRun,
      workspaceId: savedRun.workspaceId
    }, context);

    return savedRun;
  });
}

async function getDatabaseRun(id, context, client = null) {
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
     WHERE cr.id = $1 AND cr.workspace_id = $2
     LIMIT 1`,
    [id, context.workspaceId]
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
    workspaceId: String(record.workspaceId ?? record.workspace_id ?? "local-workspace"),
    createdByUserId: nullableString(
      record.createdByUserId ?? record.created_by_user_id
    ),
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
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
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
    workspaceId: run.workspaceId,
    createdBy: run.createdBy,
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
  actorUserId = null,
  action,
  entityType,
  entityId,
  before,
  after,
  workspaceId = null
}, context = {}) {
  await client.query(
    `INSERT INTO audit_log (
       actor,
       actor_user_id,
       action,
       entity_type,
       entity_id,
       workspace_id,
       before_snapshot,
       after_snapshot
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      actor,
      actorUserId ?? context.actorUserId ?? null,
      action,
      entityType,
      entityId,
      workspaceId ?? context.workspaceId,
      before ?? null,
      after ?? null
    ]
  );
}

function appendMemoryAuditEvent({
  actor = "system",
  actorUserId = null,
  action,
  entityType,
  entityId,
  before,
  after,
  workspaceId = "local-workspace"
}) {
  memoryAuditEvents.push({
    id: String(memoryAuditEvents.length + 1),
    actor,
    actorUserId,
    action,
    entityType,
    entityId,
    workspaceId,
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

function normalizeStorageContext(context = {}, record = {}) {
  if (typeof context === "string") {
    return {
      actor: context,
      actorUserId: null,
      workspaceId: String(record.workspaceId ?? "local-workspace"),
      workspaceName: record.workspaceName ?? "Local Workspace",
      role: "member"
    };
  }

  return {
    actor: context.actor ?? record.createdBy ?? record.actor ?? "local-user",
    actorUserId:
      context.actorUserId ?? record.createdByUserId ?? record.actorUserId ?? null,
    workspaceId: String(
      context.workspaceId ?? record.workspaceId ?? record.workspace_id ?? "local-workspace"
    ),
    workspaceName:
      context.workspaceName ?? record.workspaceName ?? "Local Workspace",
    role: context.role ?? "member"
  };
}

function assertWorkspaceContext(context) {
  if (!context.workspaceId) {
    throw new Error("Workspace context is required for persistent storage.");
  }
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

function nullableString(value) {
  return value == null ? null : String(value);
}
