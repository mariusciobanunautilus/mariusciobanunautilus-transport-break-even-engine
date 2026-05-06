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
