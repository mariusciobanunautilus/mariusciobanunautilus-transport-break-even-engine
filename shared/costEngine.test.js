import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeLongDistance40t,
  computeRegional40t,
  computeTransportEngine,
  computeVehicleClassSensitivity,
  taxRules
} from "./costEngine.js";

test("long distance 40t matches the workbook break-even outputs", () => {
  const result = computeLongDistance40t();

  assert.equal(result.profile.code, "LONG_DISTANCE_40T");
  assertClose(result.operational.annualTotalKm, 113100.00000000001);
  assertClose(result.operational.loadedRevenueKm, 96474.30000000002);
  assertClose(result.costs.totals.totalAnnualCost, 142868.33944952502);
  assertClose(result.costs.totals.breakEvenPricePerLoadedKm, 1.480895320821452);
  assertClose(result.pricing.selectedCustomerRate, 1.6660072359241334);
  assertClose(result.pricing.ebitAtSelectedRate, 17858.54243119061);
  assertClose(result.pricing.ebitMarginAtSelectedRate, 0.11111111111111101);
});

test("regional 40t matches the workbook break-even outputs", () => {
  const result = computeRegional40t();

  assert.equal(result.profile.code, "REGIONAL_40T");
  assertClose(result.operational.annualTotalKm, 98000);
  assertClose(result.operational.loadedRevenueKm, 78890);
  assertClose(result.costs.totals.totalAnnualCost, 126816.953251);
  assertClose(result.costs.totals.breakEvenPricePerLoadedKm, 1.6075162029534795);
  assertClose(result.pricing.selectedCustomerRate, 1.8084557283226645);
  assertClose(result.pricing.ebitAtSelectedRate, 15852.119156375004);
});

test("Romania tax layer matches the selected workbook profile", () => {
  const result = computeTransportEngine({ jurisdictionCode: "RO" });

  assert.equal(result.cascade.companyType, "SRL");
  assert.equal(result.cascade.businessModel, "Fleet operator");
  assert.equal(result.tax.vatRegistered, true);
  assertClose(result.tax.customerInvoiceRateInclVat, 2.015868755468201);
  assertClose(result.tax.vatCollectedAnnual, 33752.64519495028);
  assertClose(result.tax.businessTaxCharge, 2857.3667889904978);
  assertClose(result.tax.profitAfterBusinessTax, 15001.175642200113);
  assertClose(result.tax.afterTaxProfitMargin, 0.09333333333333325);
  assertClose(result.tax.requiredCustomerRateForTargetAfterTaxMargin, 1.6792295155743249);
});

test("reference data includes every jurisdiction from the workbook", () => {
  assert.deepEqual(
    taxRules.map((rule) => rule.jurisdiction),
    [
      "Austria",
      "Germany",
      "Romania",
      "Hungary",
      "Bulgaria",
      "Czechia",
      "Slovakia",
      "Manual / Custom"
    ]
  );
});

test("vehicle class sensitivity matches workbook tonne-km output", () => {
  const rows = computeVehicleClassSensitivity();
  const artic40t = rows.find((row) => row.vehicleClass === "Articulated 40t");
  const ems60t = rows.find((row) => row.vehicleClass === "EMS / high-capacity 60t");

  assertClose(artic40t.breakEvenEurPerLoadedKm, 1.5976037721955485);
  assertClose(artic40t.breakEvenEurPerTonneKm, 0.0766898892182963);
  assertClose(ems60t.breakEvenEurPerTonneKm, 0.06557014635593636);
});

test("engine refuses invalid percentage entry", () => {
  assert.throws(
    () => computeLongDistance40t({ loadedRatio: 85.3 }),
    /loadedRatio must be entered as a decimal ratio/
  );
});

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}
