import {
  businessModels as legacyBusinessModels,
  pricingMarkups as legacyPricingMarkups,
  taxRules as legacyTaxRules,
  vehicleClasses as legacyVehicleClasses
} from "./referenceData.js";

export const blueprintPricingMarkups = [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4];
export const blueprintPayloadUtilisations = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
export const blueprintLoadFactors = [0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

export const defaultBlueprintCalculationInput = {
  countryId: 3,
  companyTypeId: 10,
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
  markupPercentage: 0.15,
  targetAfterTaxMargin: 0.1,
  vatRegistered: true
};

const vehicleClassCodes = [
  "SMALL_VAN",
  "LARGE_VAN_3_5T",
  "LIGHT_TRUCK_7_5T",
  "RIGID_12T",
  "RIGID_18T",
  "RIGID_26T",
  "ARTICULATED_40T",
  "ARTICULATED_44T",
  "EMS_60T"
];

const vehicleDisplayNames = [
  "Small delivery van",
  "Large 3.5t van",
  "7.5t urban truck",
  "12t rigid truck",
  "18t rigid truck",
  "26t rigid truck",
  "40t articulated truck",
  "44t articulated truck",
  "60t high-capacity combination"
];

const vehicleBestFor = [
  "Small parcels and city deliveries",
  "Courier work and light distribution",
  "Urban and regional pallet deliveries",
  "Regional distribution with moderate payloads",
  "Heavy regional distribution",
  "Large rigid distribution",
  "Standard long-haul freight",
  "Heavy long-haul or intermodal work where allowed",
  "Permit and country-specific high-capacity lanes"
];

export class CalculationValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "CalculationValidationError";
    this.code = "VALIDATION_ERROR";
    this.field = field;
  }
}

export function getBlueprintReferenceData() {
  const countries = getCountries();
  const companyTypes = getCompanyTypes();
  const businessModels = getBusinessModels();
  const vehicleClasses = getVehicleClasses();
  const taxProfiles = getTaxProfiles();

  return {
    countries,
    companyTypes,
    businessModels,
    vehicleClasses,
    taxProfiles,
    defaults: {
      input: defaultBlueprintCalculationInput,
      pricingMarkups: blueprintPricingMarkups,
      payloadUtilisations: blueprintPayloadUtilisations,
      loadFactors: blueprintLoadFactors
    }
  };
}

export function getCountries() {
  return legacyTaxRules.map((rule, index) => ({
    id: index + 1,
    code: rule.code,
    name: rule.jurisdiction,
    currency: rule.currency,
    note: rule.note,
    sourceDate: rule.asOf,
    lastReviewedAt: rule.asOf
  }));
}

export function getCompanyTypes(countryIdOrCode) {
  const countries = getCountries();
  const rows = [];

  for (const country of countries) {
    const rule = legacyTaxRules.find((item) => item.code === country.code);
    for (const name of rule.companyTypes) {
      rows.push({
        id: rows.length + 1,
        countryId: country.id,
        countryCode: country.code,
        name,
        description: name === rule.defaultCompanyType ? "Default legal form" : ""
      });
    }
  }

  if (countryIdOrCode == null) return rows;
  const country = findCountry(countryIdOrCode);
  return rows.filter((row) => row.countryId === country.id);
}

export function getBusinessModels() {
  return legacyBusinessModels.map((name, index) => ({
    id: index + 1,
    name,
    description: businessModelDescription(name)
  }));
}

export function getVehicleClasses() {
  return legacyVehicleClasses.map((vehicle, index) => ({
    id: index + 1,
    code: vehicleClassCodes[index],
    name: vehicleDisplayNames[index] || vehicle.vehicleClass,
    displayName: vehicleDisplayNames[index] || vehicle.vehicleClass,
    grossWeightTons: vehicle.gvwT,
    payloadCapacityTons: vehicle.payloadCapacityT,
    typicalPayloadUtilisation: vehicle.basePayloadUtilization,
    typicalFuelLPer100Km: vehicle.fuelConsumptionLPer100Km,
    annualFixedCostProxy: vehicle.fixedVehicleAnnualCost,
    bestFor: vehicleBestFor[index] || vehicle.note || "",
    regulatoryNote: vehicle.note,
    sourceUrl: vehicle.sourceUrl || null
  }));
}

export function getTaxProfiles() {
  return getCompanyTypes().map((companyType) => {
    const country = findCountry(companyType.countryId);
    const rule = legacyTaxRules.find((item) => item.code === country.code);
    const effectiveBusinessTaxRate = clamp(
      rule.corporateTaxRate + rule.localTradeTaxRate,
      0,
      1
    );

    return {
      id: companyType.id,
      countryId: country.id,
      countryCode: country.code,
      countryName: country.name,
      companyTypeId: companyType.id,
      companyTypeName: companyType.name,
      vatRegisteredDefault: rule.defaultVatRegistered,
      vatRate: rule.vatRate,
      corporateTaxRate: rule.corporateTaxRate,
      localTradeTaxRate: rule.localTradeTaxRate,
      effectiveBusinessTaxRate,
      employerContributionRate: rule.employerPayrollContributionRate,
      employeeContributionRate: rule.employeeContributionRate,
      vehicleTaxDefaultAnnual: rule.defaultVehicleTaxAnnual,
      targetAfterTaxMarginDefault: rule.defaultTargetAfterTaxMargin,
      ruleNote: rule.note,
      sourceName: "Seeded modelling defaults",
      sourceUrl: rule.sourceUrls,
      sourceDate: rule.asOf,
      validFrom: rule.asOf,
      validTo: null,
      status: "indicative"
    };
  });
}

export function getCompanyTypesForCountry(countryIdOrCode) {
  return getCompanyTypes(countryIdOrCode);
}

export function getTaxProfile(query = {}) {
  const country = findCountry(query.countryId ?? query.countryCode ?? query.code);
  const companyTypes = getCompanyTypes(country.id);
  const selectedCompanyType =
    query.companyTypeId != null
      ? companyTypes.find((item) => item.id === Number(query.companyTypeId))
      : query.companyTypeName != null
        ? companyTypes.find((item) => item.name === query.companyTypeName)
        : companyTypes.find(
            (item) =>
              item.name ===
              legacyTaxRules.find((rule) => rule.code === country.code)
                .defaultCompanyType
          );

  if (!selectedCompanyType) {
    throw validationError("companyTypeId must belong to the selected country", "companyTypeId");
  }

  return getTaxProfiles().find(
    (profile) =>
      profile.countryId === country.id &&
      profile.companyTypeId === selectedCompanyType.id
  );
}

export function calculateBreakEven(payload = {}) {
  const input = normalizeCalculationInput(payload);
  const taxProfile = resolveTaxProfile(payload, input);
  const vehicleGroups = normalizeVehicleGroups(payload, input, taxProfile);
  const vehicleGroupResults = vehicleGroups.map((groupInput, index) =>
    calculateVehicleGroup(groupInput, taxProfile, index)
  );
  const result = aggregateFleetResult(input, vehicleGroupResults);
  const normalizedInput = {
    ...input,
    numberOfTrucks: result.companyTotals.numberOfTrucks,
    vehicleGroups: vehicleGroups.map(toVehicleGroupInput)
  };

  return {
    input: normalizedInput,
    taxProfile,
    vehicleSnapshot: buildVehicleSnapshot(vehicleGroupResults),
    result,
    formulas: blueprintFormulaDefinitions()
  };
}

export function generatePricingScenarios(payload = {}) {
  const markups = normaliseNumberArray(
    payload.markups ?? payload.markupPercentages ?? blueprintPricingMarkups,
    "markups"
  );

  return markups.map((markupPercentage) => {
    const nextInput = withVehicleGroupOverrides(payload.input ?? payload, {
      markupPercentage
    });
    const calculation = calculateBreakEven({
      ...payload,
      input: nextInput,
      markupPercentage
    });

    return {
      markupPercentage,
      customerRateExclVat: calculation.result.customerRateExclVat,
      customerRateInclVat: calculation.result.customerRateInclVat,
      annualRevenueExclVat: calculation.result.annualRevenueExclVat,
      vatCollected: calculation.result.vatCollected,
      invoiceValueInclVat: calculation.result.invoiceValueInclVat,
      ebitBeforeTax: calculation.result.ebitBeforeTax,
      businessTax: calculation.result.businessTax,
      profitAfterTax: calculation.result.profitAfterTax,
      afterTaxMargin: calculation.result.afterTaxMargin
    };
  });
}

export function generateSensitivity(payload = {}) {
  const input = normalizeCalculationInput(payload);
  const taxProfile = resolveTaxProfile(payload, input);
  const payloadUtilisations = normaliseNumberArray(
    payload.payloadUtilisations ?? blueprintPayloadUtilisations,
    "payloadUtilisations"
  );
  const loadFactors = normaliseNumberArray(
    payload.loadFactors ?? blueprintLoadFactors,
    "loadFactors"
  );
  const markups = normaliseNumberArray(
    payload.markups ?? payload.markupPercentages ?? blueprintPricingMarkups,
    "markups"
  );
  const fuelPrices = normaliseNumberArray(
    payload.fuelPrices ?? defaultFuelPrices(input.fuelPricePerLiter),
    "fuelPrices"
  );

  return {
    vehicleClassSensitivity: getVehicleClasses().map((vehicle) => {
      const calculation = calculateBreakEven({
        input: withVehicleDefaults(withoutVehicleGroups(input), vehicle),
        taxProfile
      });
      return {
        vehicleClassId: vehicle.id,
        vehicleClassCode: vehicle.code,
        vehicleClassName: vehicle.displayName,
        payloadCapacityTons: vehicle.payloadCapacityTons,
        breakEvenPerLoadedKm: calculation.result.breakEvenPerLoadedKm,
        breakEvenPerTonneKm: calculation.result.breakEvenPerTonneKm,
        annualTonneKm: calculation.result.annualTonneKm
      };
    }),
    payloadUtilisationSensitivity: payloadUtilisations.map((payloadUtilisation) => {
      const calculation = calculateBreakEven({
        input: withVehicleGroupOverrides(input, { payloadUtilisation }),
        taxProfile
      });
      return {
        payloadUtilisation,
        breakEvenPerTonneKm: calculation.result.breakEvenPerTonneKm,
        annualTonneKm: calculation.result.annualTonneKm
      };
    }),
    loadFactorSensitivity: loadFactors.map((loadFactor) => {
      const calculation = calculateBreakEven({
        input: withVehicleGroupOverrides(input, { loadFactor }),
        taxProfile
      });
      return {
        loadFactor,
        breakEvenPerLoadedKm: calculation.result.breakEvenPerLoadedKm,
        annualRevenueExclVat: calculation.result.annualRevenueExclVat,
        profitAfterTax: calculation.result.profitAfterTax
      };
    }),
    markupSensitivity: markups.map((markupPercentage) => {
      const calculation = calculateBreakEven({
        input: withVehicleGroupOverrides(input, { markupPercentage }),
        taxProfile
      });
      return {
        markupPercentage,
        customerRateExclVat: calculation.result.customerRateExclVat,
        ebitBeforeTax: calculation.result.ebitBeforeTax,
        afterTaxMargin: calculation.result.afterTaxMargin
      };
    }),
    fuelPriceSensitivity: fuelPrices.map((fuelPricePerLiter) => {
      const calculation = calculateBreakEven({
        input: withVehicleGroupOverrides(input, { fuelPricePerLiter }),
        taxProfile
      });
      return {
        fuelPricePerLiter,
        variableCostPerKm: calculation.result.variableCostPerKm,
        totalAnnualCost: calculation.result.totalAnnualCost,
        breakEvenPerLoadedKm: calculation.result.breakEvenPerLoadedKm
      };
    })
  };
}

function calculateVehicleGroup(groupInput, taxProfile, index) {
  const perVehicle = calculateSingleVehicleResult(groupInput, taxProfile);
  const vehicleCount = groupInput.vehicleCount;
  const vehicleSnapshot = findVehicleClass(groupInput.vehicleClassId);
  const groupTotals = multiplyVehicleResult(perVehicle, vehicleCount);

  return {
    id: groupInput.id || `group-${index + 1}`,
    name: groupInput.name || vehicleSnapshot.displayName,
    vehicleClassId: groupInput.vehicleClassId,
    vehicleClassCode: vehicleSnapshot.code,
    vehicleClassName: vehicleSnapshot.displayName,
    vehicleCount,
    vehicleSnapshot,
    input: toVehicleGroupInput(groupInput),
    perVehicle,
    groupTotals
  };
}

function calculateSingleVehicleResult(input, taxProfile) {
  const annualTotalKm = input.dailyKm * input.operatingDaysPerYear;
  const loadedKmYear = annualTotalKm * input.loadFactor;
  const effectivePayloadTons = input.payloadCapacityTons * input.payloadUtilisation;
  const annualTonneKm = loadedKmYear * effectivePayloadTons;

  requirePositiveDenominator(annualTotalKm, "annualTotalKm");
  requirePositiveDenominator(loadedKmYear, "loadedKmYear");
  requirePositiveDenominator(annualTonneKm, "annualTonneKm");

  const fuelCostPerKm =
    (input.fuelConsumptionLPer100Km / 100) * input.fuelPricePerLiter;
  const tyresCostPerKm = input.tyresAnnualCost / annualTotalKm;
  const maintenanceCostPerKm = input.maintenanceAnnualCost / annualTotalKm;
  const roadFeesCostPerKm = input.roadFeesAnnualCost / annualTotalKm;
  const variableCostPerKm =
    fuelCostPerKm + tyresCostPerKm + maintenanceCostPerKm + roadFeesCostPerKm;
  const variableAnnualCost = variableCostPerKm * annualTotalKm;

  const employerContributionAnnual =
    input.driverSalaryAnnual * taxProfile.employerContributionRate;
  const annualPerDiem =
    input.driverPerDiemDaily * input.operatingDaysPerYear;
  const driverAnnualCost =
    input.driverSalaryAnnual + employerContributionAnnual + annualPerDiem;

  const vehicleFixedAnnualCost =
    input.ownershipOrLeasingAnnual +
    input.insuranceAnnual +
    input.vehicleTaxAnnual;
  const totalAnnualCost =
    variableAnnualCost +
    driverAnnualCost +
    vehicleFixedAnnualCost +
    input.structuralIndirectCostsAnnual;

  const breakEvenPerLoadedKm = totalAnnualCost / loadedKmYear;
  const breakEvenPerTonneKm = totalAnnualCost / annualTonneKm;
  const customerRateExclVat =
    breakEvenPerLoadedKm * (1 + input.markupPercentage);
  const vatRate = taxProfile.vatRegistered ? taxProfile.vatRate : 0;
  const customerRateInclVat = customerRateExclVat * (1 + vatRate);
  const annualRevenueExclVat = customerRateExclVat * loadedKmYear;
  const vatCollected = annualRevenueExclVat * vatRate;
  const invoiceValueInclVat = annualRevenueExclVat + vatCollected;
  const ebitBeforeTax = annualRevenueExclVat - totalAnnualCost;
  const businessTax =
    Math.max(0, ebitBeforeTax * taxProfile.effectiveBusinessTaxRate);
  const profitAfterTax = ebitBeforeTax - businessTax;
  const afterTaxMargin = safeDivide(profitAfterTax, annualRevenueExclVat);

  return {
    annualTotalKm,
    loadedKmYear,
    effectivePayloadTons,
    annualTonneKm,
    fuelCostPerKm,
    tyresCostPerKm,
    maintenanceCostPerKm,
    roadFeesCostPerKm,
    variableCostPerKm,
    variableAnnualCost,
    employerContributionAnnual,
    annualPerDiem,
    driverAnnualCost,
    vehicleFixedAnnualCost,
    structuralIndirectCostsAnnual: input.structuralIndirectCostsAnnual,
    totalAnnualCost,
    breakEvenPerLoadedKm,
    breakEvenPerTonneKm,
    customerRateExclVat,
    customerRateInclVat,
    annualRevenueExclVat,
    vatCollected,
    invoiceValueInclVat,
    ebitBeforeTax,
    businessTax,
    profitAfterTax,
    afterTaxMargin
  };
}

function multiplyVehicleResult(result, vehicleCount) {
  const aggregateFields = [
    "annualTotalKm",
    "loadedKmYear",
    "annualTonneKm",
    "variableAnnualCost",
    "employerContributionAnnual",
    "annualPerDiem",
    "driverAnnualCost",
    "vehicleFixedAnnualCost",
    "structuralIndirectCostsAnnual",
    "totalAnnualCost",
    "annualRevenueExclVat",
    "vatCollected",
    "invoiceValueInclVat",
    "ebitBeforeTax",
    "businessTax",
    "profitAfterTax"
  ];
  const totals = { ...result, vehicleCount };

  for (const field of aggregateFields) {
    totals[field] = result[field] * vehicleCount;
  }

  totals.effectivePayloadTons = result.effectivePayloadTons;
  totals.breakEvenPerLoadedKm = safeDivide(totals.totalAnnualCost, totals.loadedKmYear);
  totals.breakEvenPerTonneKm = safeDivide(totals.totalAnnualCost, totals.annualTonneKm);
  totals.customerRateExclVat = safeDivide(
    totals.annualRevenueExclVat,
    totals.loadedKmYear
  );
  totals.customerRateInclVat = safeDivide(
    totals.invoiceValueInclVat,
    totals.loadedKmYear
  );
  totals.afterTaxMargin = safeDivide(totals.profitAfterTax, totals.annualRevenueExclVat);

  return totals;
}

function aggregateFleetResult(input, vehicleGroupResults) {
  const sums = sumGroupTotals(vehicleGroupResults);

  requirePositiveDenominator(sums.annualTotalKm, "annualTotalKm");
  requirePositiveDenominator(sums.loadedKmYear, "loadedKmYear");
  requirePositiveDenominator(sums.annualTonneKm, "annualTonneKm");

  const result = {
    fleetMode: resolveFleetMode(vehicleGroupResults),
    vehicleGroupCount: vehicleGroupResults.length,
    vehicleCount: sums.vehicleCount,
    annualTotalKm: sums.annualTotalKm,
    loadedKmYear: sums.loadedKmYear,
    effectivePayloadTons: safeDivide(sums.annualTonneKm, sums.loadedKmYear),
    annualTonneKm: sums.annualTonneKm,
    fuelCostPerKm: safeDivide(sums.fuelAnnualCost, sums.annualTotalKm),
    tyresCostPerKm: safeDivide(sums.tyresAnnualCost, sums.annualTotalKm),
    maintenanceCostPerKm: safeDivide(sums.maintenanceAnnualCost, sums.annualTotalKm),
    roadFeesCostPerKm: safeDivide(sums.roadFeesAnnualCost, sums.annualTotalKm),
    variableCostPerKm: safeDivide(sums.variableAnnualCost, sums.annualTotalKm),
    variableAnnualCost: sums.variableAnnualCost,
    employerContributionAnnual: sums.employerContributionAnnual,
    annualPerDiem: sums.annualPerDiem,
    driverAnnualCost: sums.driverAnnualCost,
    vehicleFixedAnnualCost: sums.vehicleFixedAnnualCost,
    structuralIndirectCostsAnnual: sums.structuralIndirectCostsAnnual,
    totalAnnualCost: sums.totalAnnualCost,
    breakEvenPerLoadedKm: safeDivide(sums.totalAnnualCost, sums.loadedKmYear),
    breakEvenPerTonneKm: safeDivide(sums.totalAnnualCost, sums.annualTonneKm),
    customerRateExclVat: safeDivide(sums.annualRevenueExclVat, sums.loadedKmYear),
    customerRateInclVat: safeDivide(sums.invoiceValueInclVat, sums.loadedKmYear),
    annualRevenueExclVat: sums.annualRevenueExclVat,
    vatCollected: sums.vatCollected,
    invoiceValueInclVat: sums.invoiceValueInclVat,
    ebitBeforeTax: sums.ebitBeforeTax,
    businessTax: sums.businessTax,
    profitAfterTax: sums.profitAfterTax,
    afterTaxMargin: safeDivide(sums.profitAfterTax, sums.annualRevenueExclVat),
    vehicleGroupResults
  };

  result.companyTotals = {
    numberOfTrucks: sums.vehicleCount,
    vehicleGroupCount: vehicleGroupResults.length,
    fleetMode: result.fleetMode,
    totalAnnualCost: result.totalAnnualCost,
    annualRevenueExclVat: result.annualRevenueExclVat,
    profitAfterTax: result.profitAfterTax
  };
  result.fleetTotals = result.companyTotals;

  if (vehicleGroupResults.length === 1) {
    result.selectedVehicleClassId = input.vehicleClassId;
  }

  return result;
}

function sumGroupTotals(vehicleGroupResults) {
  const sums = {
    vehicleCount: 0,
    annualTotalKm: 0,
    loadedKmYear: 0,
    annualTonneKm: 0,
    fuelAnnualCost: 0,
    tyresAnnualCost: 0,
    maintenanceAnnualCost: 0,
    roadFeesAnnualCost: 0,
    variableAnnualCost: 0,
    employerContributionAnnual: 0,
    annualPerDiem: 0,
    driverAnnualCost: 0,
    vehicleFixedAnnualCost: 0,
    structuralIndirectCostsAnnual: 0,
    totalAnnualCost: 0,
    annualRevenueExclVat: 0,
    vatCollected: 0,
    invoiceValueInclVat: 0,
    ebitBeforeTax: 0,
    businessTax: 0,
    profitAfterTax: 0
  };

  for (const group of vehicleGroupResults) {
    const totals = group.groupTotals;
    sums.vehicleCount += group.vehicleCount;
    sums.annualTotalKm += totals.annualTotalKm;
    sums.loadedKmYear += totals.loadedKmYear;
    sums.annualTonneKm += totals.annualTonneKm;
    sums.fuelAnnualCost += group.perVehicle.fuelCostPerKm * group.perVehicle.annualTotalKm * group.vehicleCount;
    sums.tyresAnnualCost += group.perVehicle.tyresCostPerKm * group.perVehicle.annualTotalKm * group.vehicleCount;
    sums.maintenanceAnnualCost += group.perVehicle.maintenanceCostPerKm * group.perVehicle.annualTotalKm * group.vehicleCount;
    sums.roadFeesAnnualCost += group.perVehicle.roadFeesCostPerKm * group.perVehicle.annualTotalKm * group.vehicleCount;
    sums.variableAnnualCost += totals.variableAnnualCost;
    sums.employerContributionAnnual += totals.employerContributionAnnual;
    sums.annualPerDiem += totals.annualPerDiem;
    sums.driverAnnualCost += totals.driverAnnualCost;
    sums.vehicleFixedAnnualCost += totals.vehicleFixedAnnualCost;
    sums.structuralIndirectCostsAnnual += totals.structuralIndirectCostsAnnual;
    sums.totalAnnualCost += totals.totalAnnualCost;
    sums.annualRevenueExclVat += totals.annualRevenueExclVat;
    sums.vatCollected += totals.vatCollected;
    sums.invoiceValueInclVat += totals.invoiceValueInclVat;
    sums.ebitBeforeTax += totals.ebitBeforeTax;
    sums.businessTax += totals.businessTax;
    sums.profitAfterTax += totals.profitAfterTax;
  }

  return sums;
}

function normalizeVehicleGroups(payload, input, taxProfile) {
  const raw = payload.input ?? payload.inputs ?? payload;
  const rawGroups = raw.vehicleGroups;

  if (rawGroups != null && !Array.isArray(rawGroups)) {
    throw validationError("vehicleGroups must be an array", "vehicleGroups");
  }

  if (Array.isArray(rawGroups) && rawGroups.length === 0) {
    throw validationError("vehicleGroups must contain at least one group", "vehicleGroups");
  }

  const fallbackVehicle = findVehicleClass(input.vehicleClassId);
  const groupSeeds = Array.isArray(rawGroups)
    ? rawGroups
    : [
        {
          ...raw,
          id: "group-1",
          name:
            input.numberOfTrucks > 1
              ? `${fallbackVehicle.displayName} fleet`
              : fallbackVehicle.displayName,
          vehicleCount: input.numberOfTrucks
        }
      ];

  return groupSeeds.map((group, index) =>
    normalizeVehicleGroup(group, input, taxProfile, index, Array.isArray(rawGroups))
  );
}

function normalizeVehicleGroup(rawGroup, baseInput, taxProfile, index, usesExplicitGroups) {
  const vehicleCount = parseFiniteNumber(
    rawGroup.vehicleCount ?? rawGroup.numberOfVehicles ?? rawGroup.numberOfTrucks ?? 1,
    `vehicleGroups[${index}].vehicleCount`
  );

  if (!(vehicleCount > 0)) {
    throw validationError(
      `vehicleGroups[${index}].vehicleCount must be greater than zero`,
      `vehicleGroups[${index}].vehicleCount`
    );
  }

  const merged = {
    ...baseInput,
    ...rawGroup,
    numberOfTrucks: 1
  };
  delete merged.vehicleGroups;

  const normalized = normalizeCalculationInput({
    input: merged,
    taxProfile
  });
  const vehicle = findVehicleClass(normalized.vehicleClassId);

  if (usesExplicitGroups) {
    if (
      rawGroup.payloadCapacityTons == null &&
      rawGroup.payloadCapacityT == null &&
      rawGroup.capacityTons == null
    ) {
      normalized.payloadCapacityTons = vehicle.payloadCapacityTons;
    }
    if (
      rawGroup.payloadUtilisation == null &&
      rawGroup.payloadUtilization == null &&
      rawGroup.capacityUtilization == null
    ) {
      normalized.payloadUtilisation = vehicle.typicalPayloadUtilisation;
    }
    if (rawGroup.fuelConsumptionLPer100Km == null) {
      normalized.fuelConsumptionLPer100Km = vehicle.typicalFuelLPer100Km;
    }
    if (rawGroup.ownershipOrLeasingAnnual == null) {
      normalized.ownershipOrLeasingAnnual = vehicle.annualFixedCostProxy;
    }
  }

  normalized.id = String(rawGroup.id || `group-${index + 1}`);
  normalized.name = String(rawGroup.name || vehicle.displayName).trim() || vehicle.displayName;
  normalized.vehicleCount = vehicleCount;

  validateCalculationInput(normalized);
  return normalized;
}

function toVehicleGroupInput(groupInput) {
  const fields = [
    "id",
    "name",
    "vehicleClassId",
    "vehicleCount",
    "dailyKm",
    "operatingDaysPerYear",
    "loadFactor",
    "payloadCapacityTons",
    "payloadUtilisation",
    "fuelConsumptionLPer100Km",
    "fuelPricePerLiter",
    "tyresAnnualCost",
    "maintenanceAnnualCost",
    "roadFeesAnnualCost",
    "driverSalaryAnnual",
    "driverPerDiemDaily",
    "ownershipOrLeasingAnnual",
    "insuranceAnnual",
    "vehicleTaxAnnual",
    "structuralIndirectCostsAnnual",
    "markupPercentage",
    "targetAfterTaxMargin"
  ];
  const group = {};

  for (const field of fields) {
    group[field] = groupInput[field];
  }

  return group;
}

function buildVehicleSnapshot(vehicleGroupResults) {
  const uniqueVehicleClasses = [
    ...new Map(
      vehicleGroupResults.map((group) => [group.vehicleClassId, group.vehicleSnapshot])
    ).values()
  ];

  if (uniqueVehicleClasses.length === 1) {
    return uniqueVehicleClasses[0];
  }

  return {
    code: "MIXED_FLEET",
    name: "Mixed fleet",
    displayName: "Mixed fleet",
    vehicleGroups: vehicleGroupResults.map((group) => ({
      id: group.id,
      name: group.name,
      vehicleClassId: group.vehicleClassId,
      vehicleClassName: group.vehicleClassName,
      vehicleCount: group.vehicleCount
    }))
  };
}

function resolveFleetMode(vehicleGroupResults) {
  const vehicleCount = vehicleGroupResults.reduce(
    (sum, group) => sum + group.vehicleCount,
    0
  );
  const uniqueVehicleClassCount = new Set(
    vehicleGroupResults.map((group) => group.vehicleClassId)
  ).size;

  if (vehicleCount <= 1 && vehicleGroupResults.length === 1) {
    return "single_vehicle";
  }
  if (uniqueVehicleClassCount === 1) {
    return "same_type_fleet";
  }
  return "mixed_type_fleet";
}

export function blueprintFormulaDefinitions() {
  return [
    ["annualTotalKm", "dailyKm x operatingDaysPerYear"],
    ["loadedKmYear", "annualTotalKm x loadFactor"],
    ["effectivePayloadTons", "payloadCapacityTons x payloadUtilisation"],
    ["annualTonneKm", "loadedKmYear x effectivePayloadTons"],
    ["fuelCostPerKm", "(fuelConsumptionLPer100Km / 100) x fuelPricePerLiter"],
    ["variableCostPerKm", "fuel + tyres + maintenance + road fees per km"],
    ["driverAnnualCost", "salary + employer contribution + per diem"],
    ["totalAnnualCost", "variable + driver + vehicle fixed + structural cost"],
    ["breakEvenPerLoadedKm", "totalAnnualCost / loadedKmYear"],
    ["breakEvenPerTonneKm", "totalAnnualCost / annualTonneKm"],
    ["customerRateExclVat", "breakEvenPerLoadedKm x (1 + markupPercentage)"],
    ["customerRateInclVat", "customerRateExclVat x (1 + vatRate)"],
    ["profitAfterTax", "ebitBeforeTax - businessTax"],
    ["fleetTotalAnnualCost", "sum of each vehicle group annual cost x vehicle count"],
    ["fleetBreakEvenPerLoadedKm", "fleetTotalAnnualCost / fleetLoadedKmYear"]
  ].map(([field, formula]) => ({
    field,
    formula,
    rounding: "Full precision internally; round only at display/API formatting."
  }));
}

function normalizeCalculationInput(payload = {}) {
  const raw = payload.input ?? payload.inputs ?? payload;
  const input = {
    ...defaultBlueprintCalculationInput,
    ...raw
  };

  if (input.vehicleClassId != null) {
    const vehicle = findVehicleClass(input.vehicleClassId);
    input.payloadCapacityTons =
      raw.payloadCapacityTons ?? input.payloadCapacityTons ?? vehicle.payloadCapacityTons;
    input.payloadUtilisation =
      raw.payloadUtilisation ??
      raw.payloadUtilization ??
      input.payloadUtilisation ??
      vehicle.typicalPayloadUtilisation;
    input.fuelConsumptionLPer100Km =
      raw.fuelConsumptionLPer100Km ??
      input.fuelConsumptionLPer100Km ??
      vehicle.typicalFuelLPer100Km;
  }

  input.operatingDaysPerYear =
    raw.operatingDaysPerYear ?? raw.operatingDays ?? input.operatingDaysPerYear;
  input.loadFactor = raw.loadFactor ?? raw.loadedRatio ?? input.loadFactor;
  input.payloadUtilisation =
    raw.payloadUtilisation ??
    raw.payloadUtilization ??
    raw.capacityUtilization ??
    input.payloadUtilisation;
  input.fuelPricePerLiter =
    raw.fuelPricePerLiter ?? raw.fuelPriceExVat ?? input.fuelPricePerLiter;
  input.vehicleTaxAnnual =
    raw.vehicleTaxAnnual ?? raw.vehicleTaxesAnnual ?? input.vehicleTaxAnnual;
  input.markupPercentage =
    raw.markupPercentage ?? raw.selectedMarkup ?? input.markupPercentage;

  const taxProfile = resolveTaxProfile(payload, input, { allowInvalid: true });
  input.vehicleTaxAnnual =
    raw.vehicleTaxAnnual ??
    raw.vehicleTaxesAnnual ??
    taxProfile?.vehicleTaxDefaultAnnual ??
    input.vehicleTaxAnnual;

  const numericFields = [
    "countryId",
    "companyTypeId",
    "businessModelId",
    "numberOfTrucks",
    "vehicleClassId",
    "dailyKm",
    "operatingDaysPerYear",
    "loadFactor",
    "payloadCapacityTons",
    "payloadUtilisation",
    "fuelConsumptionLPer100Km",
    "fuelPricePerLiter",
    "tyresAnnualCost",
    "maintenanceAnnualCost",
    "roadFeesAnnualCost",
    "driverSalaryAnnual",
    "driverPerDiemDaily",
    "ownershipOrLeasingAnnual",
    "insuranceAnnual",
    "vehicleTaxAnnual",
    "structuralIndirectCostsAnnual",
    "markupPercentage",
    "targetAfterTaxMargin"
  ];

  for (const field of numericFields) {
    input[field] = parseFiniteNumber(input[field], field);
  }

  input.vatRegistered =
    typeof raw.vatRegistered === "boolean"
      ? raw.vatRegistered
      : taxProfile?.vatRegisteredDefault ?? Boolean(input.vatRegistered);

  validateCalculationInput(input);
  return input;
}

function validateCalculationInput(input) {
  if (!findCountry(input.countryId)) {
    throw validationError("countryId must exist in countries", "countryId");
  }

  const companyType = getCompanyTypes(input.countryId).find(
    (item) => item.id === input.companyTypeId
  );
  if (!companyType) {
    throw validationError("companyTypeId must belong to selected country", "companyTypeId");
  }

  if (!getBusinessModels().some((item) => item.id === input.businessModelId)) {
    throw validationError("businessModelId must exist in business_models", "businessModelId");
  }

  if (!findVehicleClass(input.vehicleClassId)) {
    throw validationError("vehicleClassId must exist in vehicle_classes", "vehicleClassId");
  }

  const positiveFields = [
    "numberOfTrucks",
    "dailyKm",
    "operatingDaysPerYear",
    "loadFactor",
    "payloadCapacityTons",
    "payloadUtilisation",
    "fuelConsumptionLPer100Km",
    "fuelPricePerLiter"
  ];
  for (const field of positiveFields) {
    if (!(input[field] > 0)) {
      throw validationError(`${field} must be greater than zero`, field);
    }
  }

  if (input.operatingDaysPerYear > 365) {
    throw validationError("operatingDaysPerYear cannot exceed 365", "operatingDaysPerYear");
  }

  for (const field of ["loadFactor", "payloadUtilisation"]) {
    if (input[field] > 1) {
      throw validationError(`${field} must be between 0 and 1`, field);
    }
  }

  const nonNegativeFields = [
    "tyresAnnualCost",
    "maintenanceAnnualCost",
    "roadFeesAnnualCost",
    "driverSalaryAnnual",
    "driverPerDiemDaily",
    "ownershipOrLeasingAnnual",
    "insuranceAnnual",
    "vehicleTaxAnnual",
    "structuralIndirectCostsAnnual",
    "markupPercentage",
    "targetAfterTaxMargin"
  ];
  for (const field of nonNegativeFields) {
    if (input[field] < 0) {
      throw validationError(`${field} cannot be negative`, field);
    }
  }

  if (input.targetAfterTaxMargin >= 1) {
    throw validationError("targetAfterTaxMargin must be lower than 1", "targetAfterTaxMargin");
  }
}

function resolveTaxProfile(payload, input, options = {}) {
  const raw = payload.input ?? payload.inputs ?? payload;
  const suppliedProfile = payload.taxProfile ?? raw.taxProfile;

  if (suppliedProfile) {
    return normalizeTaxProfile(suppliedProfile, raw);
  }

  try {
    const profile = getTaxProfile({
      countryId: raw.countryId ?? input?.countryId,
      countryCode: raw.countryCode ?? payload.countryCode,
      companyTypeId: raw.companyTypeId ?? input?.companyTypeId,
      companyTypeName: raw.companyTypeName ?? payload.companyTypeName
    });
    return normalizeTaxProfile(profile, raw);
  } catch (error) {
    if (options.allowInvalid) return null;
    throw error;
  }
}

function normalizeTaxProfile(profile, raw = {}) {
  const vatRate = parseFiniteNumber(raw.vatRate ?? profile.vatRate, "vatRate");
  const employerContributionRate = parseFiniteNumber(
    raw.employerContributionRate ??
      raw.employerPayrollContributionRate ??
      profile.employerContributionRate,
    "employerContributionRate"
  );
  const effectiveBusinessTaxRate = parseFiniteNumber(
    raw.effectiveBusinessTaxRate ??
      profile.effectiveBusinessTaxRate ??
      (profile.corporateTaxRate ?? 0) + (profile.localTradeTaxRate ?? 0),
    "effectiveBusinessTaxRate"
  );

  for (const [field, value] of [
    ["vatRate", vatRate],
    ["employerContributionRate", employerContributionRate],
    ["effectiveBusinessTaxRate", effectiveBusinessTaxRate]
  ]) {
    if (value < 0 || value > 1) {
      throw validationError(`${field} must be between 0 and 1`, field);
    }
  }

  return {
    ...profile,
    vatRegistered:
      typeof raw.vatRegistered === "boolean"
        ? raw.vatRegistered
        : profile.vatRegistered ?? profile.vatRegisteredDefault ?? true,
    vatRate,
    employerContributionRate,
    effectiveBusinessTaxRate,
    vehicleTaxDefaultAnnual: parseFiniteNumber(
      raw.vehicleTaxDefaultAnnual ??
        profile.vehicleTaxDefaultAnnual ??
        profile.defaultVehicleTaxAnnual ??
        0,
      "vehicleTaxDefaultAnnual"
    )
  };
}

function findCountry(countryIdOrCode) {
  if (countryIdOrCode == null || countryIdOrCode === "") return null;
  const countries = getCountries();
  return countries.find(
    (country) =>
      country.id === Number(countryIdOrCode) ||
      country.code === String(countryIdOrCode)
  );
}

function findVehicleClass(vehicleClassIdOrCode) {
  if (vehicleClassIdOrCode == null || vehicleClassIdOrCode === "") return null;
  return getVehicleClasses().find(
    (vehicle) =>
      vehicle.id === Number(vehicleClassIdOrCode) ||
      vehicle.code === String(vehicleClassIdOrCode)
  );
}

function withVehicleDefaults(input, vehicle) {
  return {
    ...input,
    vehicleClassId: vehicle.id,
    payloadCapacityTons: vehicle.payloadCapacityTons,
    payloadUtilisation: vehicle.typicalPayloadUtilisation,
    fuelConsumptionLPer100Km: vehicle.typicalFuelLPer100Km,
    ownershipOrLeasingAnnual: vehicle.annualFixedCostProxy
  };
}

function withVehicleGroupOverrides(input, overrides) {
  if (!Array.isArray(input.vehicleGroups) || input.vehicleGroups.length === 0) {
    return {
      ...input,
      ...overrides
    };
  }

  return {
    ...input,
    ...overrides,
    vehicleGroups: input.vehicleGroups.map((group) => ({
      ...group,
      ...overrides
    }))
  };
}

function withoutVehicleGroups(input) {
  const nextInput = { ...input };
  delete nextInput.vehicleGroups;
  return nextInput;
}

function defaultFuelPrices(currentFuelPrice) {
  const base = Number(currentFuelPrice) || 1.5;
  return [base - 0.3, base - 0.15, base, base + 0.15, base + 0.3].map(
    (value) => Math.max(0.01, Number(value.toFixed(4)))
  );
}

function normaliseNumberArray(values, field) {
  if (!Array.isArray(values) || values.length === 0) {
    throw validationError(`${field} must contain at least one value`, field);
  }

  return values.map((value, index) =>
    parseFiniteNumber(value, `${field}[${index}]`)
  );
}

function businessModelDescription(name) {
  const descriptions = {
    "Owner-operator": "Single operator with owner-managed vehicle costs.",
    "Fleet operator": "Company fleet with driver and fixed-cost assumptions.",
    Subcontractor: "External transport capacity with simplified own-cost assumptions.",
    Mixed: "Blend of own fleet and subcontracted capacity.",
    "Carrier with subcontractors": "Carrier model with subcontractor support."
  };
  return descriptions[name] || "";
}

function parseFiniteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw validationError(`${field} must be a finite number`, field);
  }
  return number;
}

function requirePositiveDenominator(value, field) {
  if (!(value > 0)) {
    throw validationError(`${field} cannot be zero`, field);
  }
}

function validationError(message, field) {
  return new CalculationValidationError(message, field);
}

function safeDivide(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
