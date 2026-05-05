import {
  businessModels,
  inputSections,
  operatingProfiles,
  payloadUtilizationScenarios,
  pricingMarkups,
  sensitivityLoadFactors,
  sensitivityRates,
  taxRules,
  vehicleClasses
} from "./referenceData.js";

export {
  businessModels,
  inputSections,
  operatingProfiles,
  payloadUtilizationScenarios,
  pricingMarkups,
  sensitivityLoadFactors,
  sensitivityRates,
  taxRules,
  vehicleClasses
};

export function getReferenceData() {
  return {
    businessModels,
    inputSections,
    operatingProfiles,
    payloadUtilizationScenarios,
    pricingMarkups,
    sensitivityLoadFactors,
    sensitivityRates,
    taxRules,
    vehicleClasses
  };
}

export function computeLongDistance40t(overrides = {}, options = {}) {
  return computeTransportEngine({
    ...options,
    profileCode: "LONG_DISTANCE_40T",
    inputs: overrides
  });
}

export function computeRegional40t(overrides = {}, options = {}) {
  return computeTransportEngine({
    ...options,
    profileCode: "REGIONAL_40T",
    inputs: overrides
  });
}

export function computeTransportEngine({
  profileCode = "LONG_DISTANCE_40T",
  jurisdictionCode = "RO",
  companyType,
  businessModel,
  vatRegistered,
  inputs = {}
} = {}) {
  const profile = findProfile(profileCode);
  const taxRule = findTaxRule(jurisdictionCode);
  const mergedInputs = normalizeInputs(profile, inputs, taxRule);
  const cascade = resolveCascade({
    taxRule,
    companyType,
    businessModel
  });
  const usesVat =
    typeof vatRegistered === "boolean"
      ? vatRegistered
      : taxRule.defaultVatRegistered;

  const operational = computeOperationalOutputs(mergedInputs);
  const variable = computeVariableCostBlock(mergedInputs, operational);
  const driver = computeDriverCostBlock(mergedInputs, operational);
  const fixed = computeFixedCostBlock(mergedInputs, driver);
  const totals = computeTotals(mergedInputs, operational, variable, fixed);
  const pricing = computePricingOutputs(mergedInputs, operational, variable, fixed, totals);
  const tax = computeTaxOutputs({
    taxRule,
    vatRegistered: usesVat,
    operational,
    pricing,
    totals
  });

  return {
    profile: {
      code: profile.code,
      name: profile.name,
      shortName: profile.shortName
    },
    jurisdiction: {
      code: taxRule.code,
      name: taxRule.jurisdiction,
      currency: taxRule.currency,
      asOf: taxRule.asOf,
      note: taxRule.note
    },
    cascade,
    inputs: mergedInputs,
    operational,
    costs: {
      variable,
      driver,
      fixed,
      totals
    },
    pricing,
    tax,
    sensitivity: computeSensitivityMatrix(operational, variable, fixed),
    pricingScenarios: computePricingScenarios(operational, totals),
    vehicleClasses: computeVehicleClassSensitivity(mergedInputs.fuelPriceExVat)
  };
}

export function computeVehicleClassSensitivity(fuelPriceExVat = 1.265524625) {
  return vehicleClasses.map((vehicle) => {
    const effectivePayloadT =
      vehicle.payloadCapacityT * vehicle.basePayloadUtilization;
    const loadedKm = vehicle.annualTotalKm * vehicle.loadedRatio;
    const annualTonneKm = loadedKm * effectivePayloadT;
    const fuelEurPerKm =
      (vehicle.fuelConsumptionLPer100Km / 100) * fuelPriceExVat;
    const variableAnnualCost =
      (fuelEurPerKm + vehicle.nonFuelVariableEurPerKm) *
      vehicle.annualTotalKm;
    const totalAnnualCost =
      variableAnnualCost +
      vehicle.driverAnnualCost +
      vehicle.fixedVehicleAnnualCost +
      vehicle.structuralOverheadAnnual;
    const breakEvenEurPerLoadedKm = safeDivide(totalAnnualCost, loadedKm);
    const breakEvenEurPerTonneKm = safeDivide(totalAnnualCost, annualTonneKm);

    return {
      ...vehicle,
      fuelPriceExVat,
      effectivePayloadT,
      loadedKm,
      annualTonneKm,
      fuelEurPerKm,
      variableAnnualCost,
      totalAnnualCost,
      breakEvenEurPerLoadedKm,
      breakEvenEurPerTonneKm,
      payloadMatrix: payloadUtilizationScenarios.map((utilization) => ({
        utilization,
        breakEvenEurPerTonneKm: safeDivide(
          totalAnnualCost,
          loadedKm * vehicle.payloadCapacityT * utilization
        )
      }))
    };
  });
}

export function resolveCascade({ taxRule, companyType, businessModel }) {
  const selectedCompanyType = companyType || taxRule.defaultCompanyType;
  const selectedBusinessModel = businessModel || taxRule.defaultBusinessModel;
  const validCompanyType = taxRule.companyTypes.includes(selectedCompanyType);
  const validBusinessModel = businessModels.includes(selectedBusinessModel);

  return {
    companyType: validCompanyType
      ? selectedCompanyType
      : taxRule.defaultCompanyType,
    businessModel: validBusinessModel
      ? selectedBusinessModel
      : taxRule.defaultBusinessModel,
    availableCompanyTypes: taxRule.companyTypes,
    availableBusinessModels: businessModels,
    valid: validCompanyType && validBusinessModel,
    status:
      validCompanyType && validBusinessModel
        ? "Valid cascade"
        : "Reselect company type / business model"
  };
}

function computeOperationalOutputs(input) {
  const annualTotalKm = input.dailyKm * input.operatingDays;
  const loadedRevenueKm = annualTotalKm * input.loadedRatio;
  const emptyKm = annualTotalKm - loadedRevenueKm;
  const drivingHours = safeDivide(annualTotalKm, input.averageSpeed);
  const waitingLoadingHours =
    input.operatingDays * input.waitingTimeHoursPerDay;
  const totalActivityHours = drivingHours + waitingLoadingHours;

  return {
    annualTotalKm,
    loadedRevenueKm,
    emptyKm,
    drivingHours,
    waitingLoadingHours,
    totalActivityHours
  };
}

function computeVariableCostBlock(input, operational) {
  const fuelCostPerTotalKm =
    (input.fuelConsumptionLPer100Km / 100) * input.fuelPriceExVat;
  const tyresCostPerTotalKm = safeDivide(
    input.tyresAnnualCost,
    operational.annualTotalKm
  );
  const maintenanceCostPerTotalKm = safeDivide(
    input.maintenanceAnnualCost,
    operational.annualTotalKm
  );
  const roadFeesCostPerTotalKm = safeDivide(
    input.roadFeesAnnualCost,
    operational.annualTotalKm
  );
  const variableOperatingCostPerTotalKm =
    fuelCostPerTotalKm +
    tyresCostPerTotalKm +
    maintenanceCostPerTotalKm +
    roadFeesCostPerTotalKm;
  const variableOperatingCostPerLoadedKm = safeDivide(
    variableOperatingCostPerTotalKm,
    input.loadedRatio
  );
  const annualVariableOperatingCost =
    variableOperatingCostPerTotalKm * operational.annualTotalKm;

  return {
    fuelCostPerTotalKm,
    tyresCostPerTotalKm,
    maintenanceCostPerTotalKm,
    roadFeesCostPerTotalKm,
    variableOperatingCostPerTotalKm,
    variableOperatingCostPerLoadedKm,
    annualVariableOperatingCost
  };
}

function computeDriverCostBlock(input, operational) {
  const salaryInclEmployerTaxes =
    input.monthlyDriverSalary *
    12 *
    input.driversPerVehicle *
    (1 + input.employerTaxRateOnSalary);
  const travelAllowance =
    input.travelAllowancePerWorkingDay *
    input.workingDays *
    input.driversPerVehicle;
  const totalDriverCost = salaryInclEmployerTaxes + travelAllowance;
  const driverCostPerActivityHour = safeDivide(
    totalDriverCost,
    operational.totalActivityHours
  );
  const driverCostPerLoadedKm = safeDivide(
    totalDriverCost,
    operational.loadedRevenueKm
  );

  return {
    salaryInclEmployerTaxes,
    travelAllowance,
    totalDriverCost,
    driverCostPerActivityHour,
    driverCostPerLoadedKm
  };
}

function computeFixedCostBlock(input, driver) {
  const vehicleFixedCost =
    input.tractorOwnershipAnnualCost +
    input.trailerOwnershipAnnualCost +
    input.vehicleInsuranceAnnual +
    input.cargoInsuranceAnnual +
    input.vehicleTaxesAnnual;
  const structuralAdminFixedCost =
    input.structuralOverheadAnnual + input.commercialAdminOverheadAnnualCost;
  const fixedCostBeforeDriver = vehicleFixedCost + structuralAdminFixedCost;
  const fixedCostIncludingDriver =
    fixedCostBeforeDriver + driver.totalDriverCost;

  return {
    vehicleFixedCost,
    structuralAdminFixedCost,
    fixedCostBeforeDriver,
    fixedCostIncludingDriver
  };
}

function computeTotals(input, operational, variable, fixed) {
  const totalAnnualCost =
    variable.annualVariableOperatingCost + fixed.fixedCostIncludingDriver;
  const costPerTotalKm = safeDivide(totalAnnualCost, operational.annualTotalKm);
  const breakEvenPricePerLoadedKm = safeDivide(
    totalAnnualCost,
    operational.loadedRevenueKm
  );
  const requiredPriceForTargetEbitMargin = safeDivide(
    breakEvenPricePerLoadedKm,
    1 - input.targetEbitMargin
  );

  return {
    totalAnnualCost,
    costPerTotalKm,
    breakEvenPricePerLoadedKm,
    requiredPriceForTargetEbitMargin
  };
}

function computePricingOutputs(input, operational, variable, fixed, totals) {
  const selectedCustomerRate =
    totals.breakEvenPricePerLoadedKm * (1 + input.selectedMarkup);
  const annualRevenueAtSelectedRate =
    selectedCustomerRate * operational.loadedRevenueKm;
  const ebitAtSelectedRate =
    annualRevenueAtSelectedRate - totals.totalAnnualCost;
  const ebitMarginAtSelectedRate = safeDivide(
    ebitAtSelectedRate,
    annualRevenueAtSelectedRate
  );
  const contributionPerLoadedKm =
    selectedCustomerRate - variable.variableOperatingCostPerLoadedKm;
  const breakEvenLoadedKmAtSelectedRate =
    contributionPerLoadedKm <= 0
      ? null
      : safeDivide(fixed.fixedCostIncludingDriver, contributionPerLoadedKm);
  const breakEvenTotalKmAtSelectedRate =
    breakEvenLoadedKmAtSelectedRate == null
      ? null
      : safeDivide(breakEvenLoadedKmAtSelectedRate, input.loadedRatio);
  const breakEvenUtilizationOfPlannedLoadedKm =
    breakEvenLoadedKmAtSelectedRate == null
      ? null
      : safeDivide(
          breakEvenLoadedKmAtSelectedRate,
          operational.loadedRevenueKm
        );
  const requiredLoadedRatioAtPlannedTotalKm = safeDivide(
    totals.totalAnnualCost,
    selectedCustomerRate * operational.annualTotalKm
  );
  const loadedKmSafetyMargin =
    breakEvenLoadedKmAtSelectedRate == null
      ? null
      : operational.loadedRevenueKm - breakEvenLoadedKmAtSelectedRate;
  const safetyMargin =
    loadedKmSafetyMargin == null
      ? null
      : safeDivide(loadedKmSafetyMargin, operational.loadedRevenueKm);
  const rateVarianceVsBreakEven =
    selectedCustomerRate - totals.breakEvenPricePerLoadedKm;

  return {
    selectedMarkup: input.selectedMarkup,
    targetEbitMargin: input.targetEbitMargin,
    selectedCustomerRate,
    annualRevenueAtSelectedRate,
    ebitAtSelectedRate,
    ebitMarginAtSelectedRate,
    breakEvenLoadedKmAtSelectedRate,
    breakEvenTotalKmAtSelectedRate,
    breakEvenUtilizationOfPlannedLoadedKm,
    requiredLoadedRatioAtPlannedTotalKm,
    loadedKmSafetyMargin,
    safetyMargin,
    rateVarianceVsBreakEven,
    profitContributionPerLoadedKm: rateVarianceVsBreakEven,
    contributionPerLoadedKm
  };
}

function computeTaxOutputs({ taxRule, vatRegistered, operational, pricing, totals }) {
  const effectiveBusinessTaxRate = clamp(
    taxRule.corporateTaxRate + taxRule.localTradeTaxRate,
    0,
    1
  );
  const customerInvoiceRateInclVat = vatRegistered
    ? pricing.selectedCustomerRate * (1 + taxRule.vatRate)
    : pricing.selectedCustomerRate;
  const vatCollectedAnnual = vatRegistered
    ? pricing.annualRevenueAtSelectedRate * taxRule.vatRate
    : 0;
  const invoiceValueInclVat =
    pricing.annualRevenueAtSelectedRate + vatCollectedAnnual;
  const businessTaxCharge =
    Math.max(0, pricing.ebitAtSelectedRate) * effectiveBusinessTaxRate;
  const profitAfterBusinessTax =
    pricing.ebitAtSelectedRate - businessTaxCharge;
  const afterTaxProfitMargin = safeDivide(
    profitAfterBusinessTax,
    pricing.annualRevenueAtSelectedRate
  );
  const requiredAfterTaxProfit = safeDivide(
    pricing.annualRevenueAtSelectedRate *
      taxRule.defaultTargetAfterTaxMargin,
    1 - effectiveBusinessTaxRate
  );
  const requiredCustomerRateForTargetAfterTaxMargin = safeDivide(
    totals.totalAnnualCost + requiredAfterTaxProfit,
    operational.loadedRevenueKm
  );
  const exactRequiredRateForTargetAfterTaxMargin = safeDivide(
    totals.breakEvenPricePerLoadedKm,
    1 -
      safeDivide(
        taxRule.defaultTargetAfterTaxMargin,
        1 - effectiveBusinessTaxRate
      )
  );

  return {
    vatRegistered,
    vatRate: taxRule.vatRate,
    corporateTaxRate: taxRule.corporateTaxRate,
    localTradeTaxRate: taxRule.localTradeTaxRate,
    effectiveBusinessTaxRate,
    employerPayrollContributionRate: taxRule.employerPayrollContributionRate,
    employeeContributionRate: taxRule.employeeContributionRate,
    defaultVehicleTaxAnnual: taxRule.defaultVehicleTaxAnnual,
    targetAfterTaxProfitMargin: taxRule.defaultTargetAfterTaxMargin,
    customerInvoiceRateInclVat,
    annualRevenueExVat: pricing.annualRevenueAtSelectedRate,
    vatCollectedAnnual,
    invoiceValueInclVat,
    ebitBeforeBusinessTax: pricing.ebitAtSelectedRate,
    businessTaxCharge,
    profitAfterBusinessTax,
    ebitMargin: pricing.ebitMarginAtSelectedRate,
    afterTaxProfitMargin,
    requiredAfterTaxProfit,
    requiredCustomerRateForTargetAfterTaxMargin,
    exactRequiredRateForTargetAfterTaxMargin
  };
}

function computeSensitivityMatrix(operational, variable, fixed) {
  return sensitivityLoadFactors.map((loadFactor) => ({
    loadFactor,
    values: sensitivityRates.map((rate) => ({
      rate,
      ebit:
        rate * operational.annualTotalKm * loadFactor -
        (fixed.fixedCostIncludingDriver +
          variable.variableOperatingCostPerTotalKm *
            operational.annualTotalKm)
    }))
  }));
}

function computePricingScenarios(operational, totals) {
  return pricingMarkups.map((markup) => {
    const rate = totals.breakEvenPricePerLoadedKm * (1 + markup);
    const annualRevenue = rate * operational.loadedRevenueKm;
    const ebit = annualRevenue - totals.totalAnnualCost;
    return {
      markup,
      rate,
      annualRevenue,
      ebit,
      ebitMargin: safeDivide(ebit, annualRevenue)
    };
  });
}

function normalizeInputs(profile, overrides, taxRule) {
  const linkedDefaults = {
    ...profile.inputs,
    employerTaxRateOnSalary: taxRule.employerPayrollContributionRate,
    vehicleTaxesAnnual: taxRule.defaultVehicleTaxAnnual
  };
  const normalized = {};

  for (const field of inputFieldKeys()) {
    const value =
      overrides[field] === null || overrides[field] === undefined
        ? linkedDefaults[field]
        : overrides[field];
    normalized[field] = parseNumber(value, field);
  }

  validateInputs(normalized);
  return normalized;
}

function inputFieldKeys() {
  return inputSections.flatMap((section) =>
    section.fields.map(([field]) => field)
  );
}

function validateInputs(input) {
  const positiveFields = [
    "dailyKm",
    "operatingDays",
    "workingDays",
    "annualWorkingHours",
    "averageSpeed",
    "loadedRatio",
    "fuelPriceExVat",
    "driversPerVehicle"
  ];

  for (const field of positiveFields) {
    if (!(input[field] > 0)) {
      throw new Error(`${field} must be greater than zero`);
    }
  }

  for (const field of ["loadedRatio", "capacityUtilization"]) {
    if (input[field] > 1) {
      throw new Error(`${field} must be entered as a decimal ratio, not percent points`);
    }
  }

  if (input.targetEbitMargin >= 1) {
    throw new Error("targetEbitMargin must be lower than 100%");
  }
}

function findProfile(profileCode) {
  const profile = operatingProfiles.find((item) => item.code === profileCode);
  if (!profile) {
    throw new Error(`Unknown operating profile: ${profileCode}`);
  }
  return profile;
}

function findTaxRule(jurisdictionCode) {
  const taxRule =
    taxRules.find((item) => item.code === jurisdictionCode) ||
    taxRules.find((item) => item.jurisdiction === jurisdictionCode);
  if (!taxRule) {
    throw new Error(`Unknown jurisdiction: ${jurisdictionCode}`);
  }
  return taxRule;
}

function parseNumber(value, field) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`Invalid numeric input for ${field}: ${value}`);
  }
  return numericValue;
}

function safeDivide(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
