import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deleteCalculationRun,
  getCalculationRun,
  listAuditEvents,
  listCalculationRuns,
  saveCalculationRun
} from "./src/storage.js";

test("calculation runs can be saved, listed, opened and deleted", async () => {
  const saved = await saveCalculationRun({
    runName: "Storage smoke test",
    inputSnapshot: {
      countryId: 1,
      companyTypeId: 2,
      businessModelId: 2,
      vehicleClassId: 7
    },
    taxSnapshot: {
      countryName: "Austria",
      companyTypeName: "GmbH"
    },
    vehicleSnapshot: {
      displayName: "Articulated 40t"
    },
    resultSnapshot: {
      totalAnnualCost: 100000,
      breakEvenPerLoadedKm: 1.5,
      customerRateExclVat: 1.8,
      profitAfterTax: 12000
    },
    calculationMode: "rolling_forecast",
    planYear: 2026,
    asOfDate: "2026-05-07",
    scenarioStatus: "draft",
    engineVersion: "time-weighted-v1",
    scenarioName: "May forecast",
    scenarioVersion: 1,
    periods: [
      {
        periodStart: "2026-01-01",
        periodEnd: "2026-01-31",
        periodType: "month",
        dataStatus: "actual",
        loadedKm: 10000,
        otherCost: 14000
      }
    ],
    pricingScenarios: [
      {
        markupPercentage: 0.15,
        customerRateExclVat: 1.8
      }
    ]
  });

  assert.ok(saved.id);

  const rows = await listCalculationRuns();
  assert.ok(rows.some((row) => row.id === saved.id));

  const opened = await getCalculationRun(saved.id);
  assert.equal(opened.runName, "Storage smoke test");
  assert.equal(opened.resultSnapshot.breakEvenPerLoadedKm, 1.5);
  assert.equal(opened.calculationMode, "rolling_forecast");
  assert.equal(opened.planYear, 2026);
  assert.equal(opened.asOfDate, "2026-05-07");
  assert.equal(opened.scenarioStatus, "draft");
  assert.equal(opened.periods.length, 1);
  assert.equal(opened.periods[0].dataStatus, "actual");

  assert.equal(await deleteCalculationRun(saved.id, "test"), true);
  assert.equal(await getCalculationRun(saved.id), null);

  const auditEvents = await listAuditEvents();
  assert.ok(
    auditEvents.some(
      (event) =>
        event.entityId === saved.id &&
        event.action === "CALCULATION_DELETED"
    )
  );
});

test("memory calculation runs are scoped by workspace", async () => {
  const workspaceA = {
    actor: "a@example.com",
    actorUserId: "user-a",
    workspaceId: "workspace-a",
    workspaceName: "Workspace A"
  };
  const workspaceB = {
    actor: "b@example.com",
    actorUserId: "user-b",
    workspaceId: "workspace-b",
    workspaceName: "Workspace B"
  };
  const saved = await saveCalculationRun(
    {
      runName: "Scoped run",
      inputSnapshot: { countryId: 1 },
      taxSnapshot: { countryName: "Austria" },
      resultSnapshot: { breakEvenPerLoadedKm: 1.4 }
    },
    workspaceA
  );

  assert.equal((await getCalculationRun(saved.id, workspaceA)).id, saved.id);
  assert.equal(await getCalculationRun(saved.id, workspaceB), null);
  assert.equal(
    (await listCalculationRuns(workspaceB)).some((run) => run.id === saved.id),
    false
  );
});
