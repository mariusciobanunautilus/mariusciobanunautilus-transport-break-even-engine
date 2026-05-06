import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateBreakEven,
  computeLongDistance40t,
  computeRegional40t,
  computeTransportEngine,
  computeVehicleClassSensitivity,
  generatePricingScenarios,
  generateSensitivity,
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

test("blueprint calculation matches the baseline payload", () => {
  const { result } = calculateBreakEven({
    input: {
      countryId: 1,
      companyTypeId: 2,
      businessModelId: 2,
      numberOfTrucks: 1,
      vehicleClassId: 7,
      dailyKm: 450,
      operatingDaysPerYear: 240,
      loadFactor: 0.85,
      payloadCapacityTons: 24,
      payloadUtilisation: 0.9,
      fuelConsumptionLPer100Km: 29,
      fuelPricePerLiter: 1.55,
      tyresAnnualCost: 4500,
      maintenanceAnnualCost: 9500,
      roadFeesAnnualCost: 18000,
      driverSalaryAnnual: 36000,
      driverPerDiemDaily: 35,
      ownershipOrLeasingAnnual: 32000,
      insuranceAnnual: 4800,
      vehicleTaxAnnual: 1200,
      structuralIndirectCostsAnnual: 15000,
      markupPercentage: 0.15
    },
    taxProfile: {
      vatRegistered: true,
      vatRate: 0.2,
      employerContributionRate: 0.21,
      effectiveBusinessTaxRate: 0.23,
      vehicleTaxDefaultAnnual: 1200
    }
  });

  assertClose(result.annualTotalKm, 108000);
  assertClose(result.loadedKmYear, 91800);
  assertClose(result.effectivePayloadTons, 21.6);
  assertClose(result.annualTonneKm, 1982880.0000000002);
  assertClose(result.totalAnnualCost, 185506);
  assertClose(result.breakEvenPerLoadedKm, 2.0207625272331153);
  assertClose(result.breakEvenPerTonneKm, 0.09355382070523682);
  assertClose(result.customerRateExclVat, 2.3238769063180826);
  assertClose(result.customerRateInclVat, 2.7886522875816993);
  assertClose(result.profitAfterTax, 21425.942999999996);
  assertClose(result.afterTaxMargin, 0.10043478260869564);
});

test("blueprint VAT-disabled invoice layer keeps VAT out of revenue", () => {
  const { result, taxProfile } = calculateBreakEven({
    input: {
      countryId: 1,
      companyTypeId: 2,
      businessModelId: 2,
      vehicleClassId: 7,
      vatRegistered: false
    },
    taxProfile: {
      vatRegisteredDefault: true,
      vatRate: 0.2,
      employerContributionRate: 0.21,
      effectiveBusinessTaxRate: 0.23,
      vehicleTaxDefaultAnnual: 1200
    }
  });

  assert.equal(taxProfile.vatRegistered, false);
  assertClose(result.customerRateInclVat, result.customerRateExclVat);
  assertClose(result.vatCollected, 0);
});

test("blueprint pricing and sensitivity previews produce expected matrices", () => {
  const scenarios = generatePricingScenarios({
    markups: [0, 0.15],
    taxProfile: {
      vatRegistered: true,
      vatRate: 0.2,
      employerContributionRate: 0.21,
      effectiveBusinessTaxRate: 0.23,
      vehicleTaxDefaultAnnual: 1200
    }
  });
  const sensitivity = generateSensitivity({
    markups: [0, 0.15],
    payloadUtilisations: [0.5, 1],
    loadFactors: [0.75, 0.9],
    fuelPrices: [1.2, 1.8],
    taxProfile: {
      vatRegistered: true,
      vatRate: 0.2,
      employerContributionRate: 0.21,
      effectiveBusinessTaxRate: 0.23,
      vehicleTaxDefaultAnnual: 1200
    }
  });

  assert.equal(scenarios.length, 2);
  assert.equal(sensitivity.vehicleClassSensitivity.length, 9);
  assert.equal(sensitivity.payloadUtilisationSensitivity.length, 2);
  assert.equal(sensitivity.loadFactorSensitivity.length, 2);
  assert.equal(sensitivity.markupSensitivity.length, 2);
  assert.equal(sensitivity.fuelPriceSensitivity.length, 2);
});

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}
