import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateBreakEven,
  computeLongDistance40t,
  computeRegional40t,
  computeTransportEngine,
  computeVehicleClassSensitivity,
  defaultBlueprintCalculationInput,
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

test("blueprint same-type fleet multiplies vehicle totals without changing the rate", () => {
  const taxProfile = {
    vatRegistered: true,
    vatRate: 0.2,
    employerContributionRate: 0.21,
    effectiveBusinessTaxRate: 0.23,
    vehicleTaxDefaultAnnual: 1200
  };
  const input = {
    ...defaultBlueprintCalculationInput,
    countryId: 1,
    companyTypeId: 2,
    numberOfTrucks: 1
  };
  const singleVehicle = calculateBreakEven({ input, taxProfile });
  const sameTypeFleet = calculateBreakEven({
    input: {
      ...input,
      numberOfTrucks: 3
    },
    taxProfile
  });

  assert.equal(sameTypeFleet.result.fleetMode, "same_type_fleet");
  assert.equal(sameTypeFleet.result.vehicleGroupResults.length, 1);
  assertClose(sameTypeFleet.result.vehicleCount, 3);
  assertClose(
    sameTypeFleet.result.totalAnnualCost,
    singleVehicle.result.totalAnnualCost * 3
  );
  assertClose(
    sameTypeFleet.result.breakEvenPerLoadedKm,
    singleVehicle.result.breakEvenPerLoadedKm
  );
});

test("blueprint mixed fleet calculates each vehicle group before aggregation", () => {
  const taxProfile = {
    vatRegistered: true,
    vatRate: 0.2,
    employerContributionRate: 0.21,
    effectiveBusinessTaxRate: 0.23,
    vehicleTaxDefaultAnnual: 1200
  };
  const input = {
    ...defaultBlueprintCalculationInput,
    countryId: 1,
    companyTypeId: 2,
    vehicleGroups: [
      {
        ...defaultBlueprintCalculationInput,
        id: "vans",
        name: "City vans",
        vehicleClassId: 2,
        vehicleCount: 2,
        dailyKm: 180,
        operatingDaysPerYear: 250,
        loadFactor: 0.72,
        payloadCapacityTons: 2,
        payloadUtilisation: 0.8,
        fuelConsumptionLPer100Km: 12,
        tyresAnnualCost: 1200,
        maintenanceAnnualCost: 2800,
        roadFeesAnnualCost: 1000,
        driverSalaryAnnual: 30000,
        driverPerDiemDaily: 15,
        ownershipOrLeasingAnnual: 16000,
        insuranceAnnual: 2500,
        vehicleTaxAnnual: 400,
        structuralIndirectCostsAnnual: 5000
      },
      {
        ...defaultBlueprintCalculationInput,
        id: "artics",
        name: "Long-haul artics",
        vehicleClassId: 7,
        vehicleCount: 1
      }
    ]
  };
  const { result, vehicleSnapshot } = calculateBreakEven({ input, taxProfile });
  const sumGroupCost = result.vehicleGroupResults.reduce(
    (sum, group) => sum + group.groupTotals.totalAnnualCost,
    0
  );

  assert.equal(result.fleetMode, "mixed_type_fleet");
  assert.equal(vehicleSnapshot.displayName, "Mixed fleet");
  assert.equal(result.vehicleGroupResults.length, 2);
  assertClose(result.vehicleCount, 3);
  assertClose(result.totalAnnualCost, sumGroupCost);
  assertClose(
    result.breakEvenPerLoadedKm,
    result.totalAnnualCost / result.loadedKmYear
  );
  assert.notEqual(
    result.vehicleGroupResults[0].groupTotals.breakEvenPerLoadedKm,
    result.vehicleGroupResults[1].groupTotals.breakEvenPerLoadedKm
  );
});

test("blueprint rejects fractional vehicle counts", () => {
  assert.throws(
    () =>
      calculateBreakEven({
        input: {
          ...defaultBlueprintCalculationInput,
          countryId: 1,
          companyTypeId: 2,
          numberOfTrucks: 1.06
        }
      }),
    /numberOfTrucks must be a whole number/
  );

  assert.throws(
    () =>
      calculateBreakEven({
        input: {
          ...defaultBlueprintCalculationInput,
          countryId: 1,
          companyTypeId: 2,
          vehicleGroups: [
            {
              ...defaultBlueprintCalculationInput,
              vehicleCount: 1.06
            }
          ]
        }
      }),
    /vehicleGroups\[0\]\.vehicleCount must be a whole number/
  );
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
