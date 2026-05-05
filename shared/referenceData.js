export const businessModels = [
  "Owner-operator",
  "Fleet operator",
  "Subcontractor",
  "Mixed",
  "Carrier with subcontractors"
];

export const taxRules = [
  {
    code: "AT",
    jurisdiction: "Austria",
    currency: "EUR",
    defaultVatRegistered: true,
    vatRate: 0.2,
    corporateTaxRate: 0.23,
    localTradeTaxRate: 0,
    employerPayrollContributionRate: 0.2098,
    employeeContributionRate: 0.1807,
    defaultVehicleTaxAnnual: 800,
    defaultTargetAfterTaxMargin: 0.1,
    defaultCompanyType: "GmbH",
    defaultBusinessModel: "Fleet operator",
    companyTypes: ["Einzelunternehmen", "GmbH", "AG", "Branch / PE"],
    note:
      "Corporate rate used for GmbH/AG. Sole traders need separate validation.",
    sourceUrls: {
      vat:
        "https://www.usp.gv.at/en/themen/steuern-finanzen/umsatzsteuer-ueberblick/steuersaetze-und-steuerbefreiungen-der-umsatzsteuer.html",
      corporate:
        "https://www.usp.gv.at/en/themen/steuern-finanzen/koerperschaftsteuer-ueberblick.html",
      payroll: "https://taxsummaries.pwc.com/austria/individual/other-taxes"
    },
    asOf: "2026-05"
  },
  {
    code: "DE",
    jurisdiction: "Germany",
    currency: "EUR",
    defaultVatRegistered: true,
    vatRate: 0.19,
    corporateTaxRate: 0.15825,
    localTradeTaxRate: 0.14,
    employerPayrollContributionRate: 0.1942,
    employeeContributionRate: 0.1933,
    defaultVehicleTaxAnnual: 900,
    defaultTargetAfterTaxMargin: 0.1,
    defaultCompanyType: "GmbH",
    defaultBusinessModel: "Fleet operator",
    companyTypes: ["Einzelunternehmen", "UG", "GmbH", "AG", "Branch / PE"],
    note:
      "Corporate tax includes solidarity surcharge on CIT. Trade tax is modelled as an average proxy.",
    sourceUrls: {
      vat:
        "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en",
      corporate:
        "https://taxsummaries.pwc.com/germany/corporate/taxes-on-corporate-income",
      payroll: "https://taxsummaries.pwc.com/germany/individual/other-taxes"
    },
    asOf: "2026-05"
  },
  {
    code: "RO",
    jurisdiction: "Romania",
    currency: "RON/EUR",
    defaultVatRegistered: true,
    vatRate: 0.21,
    corporateTaxRate: 0.16,
    localTradeTaxRate: 0,
    employerPayrollContributionRate: 0.0225,
    employeeContributionRate: 0.35,
    defaultVehicleTaxAnnual: 500,
    defaultTargetAfterTaxMargin: 0.1,
    defaultCompanyType: "SRL",
    defaultBusinessModel: "Fleet operator",
    companyTypes: ["PFA / II", "SRL", "SA", "Branch / PE"],
    note:
      "Standard CIT used for SRL/SA. Micro-company turnover tax regimes are not modelled by default.",
    sourceUrls: {
      vat:
        "https://www.ey.com/en_gl/technical/tax-alerts/romanian-tax-changes-introduced-by-new-fiscal-and-budgetary-measures",
      corporate: "https://www.accace.com/tax-guideline-for-romania/",
      payroll: "https://taxsummaries.pwc.com/romania/individual/other-taxes"
    },
    asOf: "2026-05"
  },
  {
    code: "HU",
    jurisdiction: "Hungary",
    currency: "HUF/EUR",
    defaultVatRegistered: true,
    vatRate: 0.27,
    corporateTaxRate: 0.09,
    localTradeTaxRate: 0.02,
    employerPayrollContributionRate: 0.13,
    employeeContributionRate: 0.185,
    defaultVehicleTaxAnnual: 500,
    defaultTargetAfterTaxMargin: 0.1,
    defaultCompanyType: "Kft.",
    defaultBusinessModel: "Fleet operator",
    companyTypes: ["Egyeni vallalkozo", "Kft.", "Zrt. / Nyrt.", "Branch / PE"],
    note:
      "Local business tax can be up to 2% and is modelled as a simplified EBIT-tax proxy.",
    sourceUrls: {
      vat:
        "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en",
      corporate:
        "https://taxsummaries.pwc.com/hungary/corporate/taxes-on-corporate-income",
      payroll: "https://taxsummaries.pwc.com/hungary/individual/other-taxes"
    },
    asOf: "2026-05"
  },
  {
    code: "BG",
    jurisdiction: "Bulgaria",
    currency: "BGN/EUR",
    defaultVatRegistered: true,
    vatRate: 0.2,
    corporateTaxRate: 0.1,
    localTradeTaxRate: 0,
    employerPayrollContributionRate: 0.193,
    employeeContributionRate: 0.1378,
    defaultVehicleTaxAnnual: 400,
    defaultTargetAfterTaxMargin: 0.1,
    defaultCompanyType: "EOOD/OOD",
    defaultBusinessModel: "Fleet operator",
    companyTypes: ["ET", "EOOD/OOD", "AD", "Branch / PE"],
    note:
      "Flat 10% CIT used. Employer contribution uses a midpoint proxy.",
    sourceUrls: {
      vat: "https://taxsummaries.pwc.com/bulgaria/corporate/other-taxes",
      corporate:
        "https://taxsummaries.pwc.com/bulgaria/corporate/taxes-on-corporate-income",
      payroll: "https://taxsummaries.pwc.com/bulgaria/individual/other-taxes"
    },
    asOf: "2026-05"
  },
  {
    code: "CZ",
    jurisdiction: "Czechia",
    currency: "CZK/EUR",
    defaultVatRegistered: true,
    vatRate: 0.21,
    corporateTaxRate: 0.21,
    localTradeTaxRate: 0,
    employerPayrollContributionRate: 0.338,
    employeeContributionRate: 0.116,
    defaultVehicleTaxAnnual: 550,
    defaultTargetAfterTaxMargin: 0.1,
    defaultCompanyType: "s.r.o.",
    defaultBusinessModel: "Fleet operator",
    companyTypes: ["OSVC", "s.r.o.", "a.s.", "Branch / PE"],
    note:
      "Standard corporate rate used. Employer contribution combines social and health contributions.",
    sourceUrls: {
      vat:
        "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en",
      corporate:
        "https://portal.gov.cz/en/informace/what-is-the-corporate-income-tax-rate-INF-329",
      payroll:
        "https://taxsummaries.pwc.com/czech-republic/individual/other-taxes"
    },
    asOf: "2026-05"
  },
  {
    code: "SK",
    jurisdiction: "Slovakia",
    currency: "EUR",
    defaultVatRegistered: true,
    vatRate: 0.23,
    corporateTaxRate: 0.21,
    localTradeTaxRate: 0,
    employerPayrollContributionRate: 0.362,
    employeeContributionRate: 0.144,
    defaultVehicleTaxAnnual: 550,
    defaultTargetAfterTaxMargin: 0.1,
    defaultCompanyType: "s.r.o.",
    defaultBusinessModel: "Fleet operator",
    companyTypes: ["zivnostnik", "s.r.o.", "a.s.", "Branch / PE"],
    note:
      "Default CIT rate assumes taxable income above the lower-rate thresholds.",
    sourceUrls: {
      vat:
        "https://taxsummaries.pwc.com/slovak-republic/corporate/other-taxes",
      corporate: "https://www.accace.com/tax-guideline-for-slovakia/",
      payroll:
        "https://taxsummaries.pwc.com/slovak-republic/corporate/other-taxes"
    },
    asOf: "2026-05"
  },
  {
    code: "MANUAL",
    jurisdiction: "Manual / Custom",
    currency: "EUR",
    defaultVatRegistered: false,
    vatRate: 0,
    corporateTaxRate: 0,
    localTradeTaxRate: 0,
    employerPayrollContributionRate: 0,
    employeeContributionRate: 0,
    defaultVehicleTaxAnnual: 0,
    defaultTargetAfterTaxMargin: 0.1,
    defaultCompanyType: "Manual entity",
    defaultBusinessModel: "Fleet operator",
    companyTypes: ["Manual entity"],
    note:
      "Use this option when the jurisdiction or exact legal entity is not included.",
    sourceUrls: {
      vat: "Manual input",
      corporate: "Manual input",
      payroll: "Manual input"
    },
    asOf: "2026-05"
  }
];

export const operatingProfiles = [
  {
    code: "LONG_DISTANCE_40T",
    name: "Long Distance 40t",
    shortName: "Long distance",
    inputs: {
      dailyKm: 495.183887915937,
      operatingDays: 228.4,
      workingDays: 215.2,
      annualWorkingHours: 2123,
      averageSpeed: 63.9,
      loadedRatio: 0.853,
      capacityUtilization: 0.868,
      waitingTimeHoursPerDay: 3.3833333333,
      fuelConsumptionLPer100Km: 34.2,
      fuelPriceExVat: 1.265524625,
      tyresAnnualCost: 3098,
      maintenanceAnnualCost: 8221,
      roadFeesAnnualCost: 8090,
      tractorOwnershipAnnualCost: 10793,
      trailerOwnershipAnnualCost: 3208,
      vehicleInsuranceAnnual: 2198,
      cargoInsuranceAnnual: 477,
      vehicleTaxesAnnual: 500,
      monthlyDriverSalary: 2348.72,
      employerTaxRateOnSalary: 0.0225,
      travelAllowancePerWorkingDay: 38.36,
      driversPerVehicle: 1.064,
      structuralOverheadAnnual: 17886,
      commercialAdminOverheadAnnualCost: 0,
      targetEbitMargin: 0.1,
      selectedMarkup: 0.125
    }
  },
  {
    code: "REGIONAL_40T",
    name: "Regional 40t",
    shortName: "Regional",
    inputs: {
      dailyKm: 421.505376344086,
      operatingDays: 232.5,
      workingDays: 214.6,
      annualWorkingHours: 2058,
      averageSpeed: 62.5,
      loadedRatio: 0.805,
      capacityUtilization: 0.939,
      waitingTimeHoursPerDay: 3.4,
      fuelConsumptionLPer100Km: 33.8,
      fuelPriceExVat: 1.265524625,
      tyresAnnualCost: 3101,
      maintenanceAnnualCost: 7278,
      roadFeesAnnualCost: 5805,
      tractorOwnershipAnnualCost: 10934,
      trailerOwnershipAnnualCost: 3551,
      vehicleInsuranceAnnual: 2598,
      cargoInsuranceAnnual: 411,
      vehicleTaxesAnnual: 500,
      monthlyDriverSalary: 2182.15,
      employerTaxRateOnSalary: 0.0225,
      travelAllowancePerWorkingDay: 16.53,
      driversPerVehicle: 1.085,
      structuralOverheadAnnual: 17820,
      commercialAdminOverheadAnnualCost: 0,
      targetEbitMargin: 0.1,
      selectedMarkup: 0.125
    }
  }
];

export const inputSections = [
  {
    title: "Operations",
    fields: [
      ["dailyKm", "Daily km", "km/day"],
      ["operatingDays", "Operating days", "days/year"],
      ["workingDays", "Working days", "days/year"],
      ["annualWorkingHours", "Driver working hours", "h/year"],
      ["averageSpeed", "Average speed", "km/h"],
      ["loadedRatio", "Loaded ratio", "ratio"],
      ["capacityUtilization", "Capacity utilisation", "ratio"],
      ["waitingTimeHoursPerDay", "Terminal time", "h/day"]
    ]
  },
  {
    title: "Variable Cost",
    fields: [
      ["fuelConsumptionLPer100Km", "Fuel consumption", "L/100 km"],
      ["fuelPriceExVat", "Fuel price excl. VAT", "EUR/L"],
      ["tyresAnnualCost", "Tyres", "EUR/year"],
      ["maintenanceAnnualCost", "Maintenance", "EUR/year"],
      ["roadFeesAnnualCost", "Road fees", "EUR/year"]
    ]
  },
  {
    title: "Fixed And Driver Cost",
    fields: [
      ["tractorOwnershipAnnualCost", "Tractor ownership", "EUR/year"],
      ["trailerOwnershipAnnualCost", "Trailer ownership", "EUR/year"],
      ["vehicleInsuranceAnnual", "Vehicle insurance", "EUR/year"],
      ["cargoInsuranceAnnual", "Cargo insurance", "EUR/year"],
      ["vehicleTaxesAnnual", "Vehicle taxes", "EUR/year"],
      ["monthlyDriverSalary", "Driver salary", "EUR/month"],
      ["employerTaxRateOnSalary", "Employer tax rate", "ratio"],
      ["travelAllowancePerWorkingDay", "Travel allowance", "EUR/day"],
      ["driversPerVehicle", "Drivers per vehicle", "count"],
      ["structuralOverheadAnnual", "Structural overhead", "EUR/year"],
      ["commercialAdminOverheadAnnualCost", "Admin overhead", "EUR/year"],
      ["targetEbitMargin", "Target EBIT margin", "ratio"],
      ["selectedMarkup", "Selected markup", "ratio"]
    ]
  }
];

export const pricingMarkups = [0, 0.05, 0.1, 0.125, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];

export const sensitivityRates = [1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4];

export const sensitivityLoadFactors = [0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];

export const payloadUtilizationScenarios = [0.5, 0.65, 0.8, 0.9, 1];

export const vehicleClasses = [
  {
    vehicleClass: "Small van",
    capabilityBand: "Urban / light delivery",
    gvwT: 3.5,
    payloadCapacityT: 1.2,
    basePayloadUtilization: 0.75,
    annualTotalKm: 45000,
    loadedRatio: 0.7,
    fuelConsumptionLPer100Km: 9.5,
    nonFuelVariableEurPerKm: 0.1,
    driverAnnualCost: 32000,
    fixedVehicleAnnualCost: 12000,
    structuralOverheadAnnual: 6000,
    note: "Model assumption; validate payload against actual van spec",
    sourceUrl:
      "https://climate.ec.europa.eu/system/files/2017-03/hdv_lightweighting_en.pdf"
  },
  {
    vehicleClass: "Large van 3.5t",
    capabilityBand: "Van / courier",
    gvwT: 3.5,
    payloadCapacityT: 2,
    basePayloadUtilization: 0.75,
    annualTotalKm: 65000,
    loadedRatio: 0.72,
    fuelConsumptionLPer100Km: 12,
    nonFuelVariableEurPerKm: 0.14,
    driverAnnualCost: 34000,
    fixedVehicleAnnualCost: 16000,
    structuralOverheadAnnual: 7000,
    note: "Payload depends on body and specification",
    sourceUrl:
      "https://climate.ec.europa.eu/system/files/2017-03/hdv_lightweighting_en.pdf"
  },
  {
    vehicleClass: "Light truck 7.5t",
    capabilityBand: "Small rigid",
    gvwT: 7.5,
    payloadCapacityT: 3.5,
    basePayloadUtilization: 0.8,
    annualTotalKm: 75000,
    loadedRatio: 0.75,
    fuelConsumptionLPer100Km: 16,
    nonFuelVariableEurPerKm: 0.2,
    driverAnnualCost: 40000,
    fixedVehicleAnnualCost: 25000,
    structuralOverheadAnnual: 10000,
    note: "Validate by vehicle body and national rules"
  },
  {
    vehicleClass: "Medium rigid 12t",
    capabilityBand: "Rigid truck",
    gvwT: 12,
    payloadCapacityT: 6,
    basePayloadUtilization: 0.82,
    annualTotalKm: 80000,
    loadedRatio: 0.78,
    fuelConsumptionLPer100Km: 22,
    nonFuelVariableEurPerKm: 0.27,
    driverAnnualCost: 43000,
    fixedVehicleAnnualCost: 38000,
    structuralOverheadAnnual: 12000,
    note: "Payload depends on body and axle setup"
  },
  {
    vehicleClass: "Rigid truck 18t",
    capabilityBand: "Rigid truck",
    gvwT: 18,
    payloadCapacityT: 9,
    basePayloadUtilization: 0.85,
    annualTotalKm: 85000,
    loadedRatio: 0.8,
    fuelConsumptionLPer100Km: 27,
    nonFuelVariableEurPerKm: 0.33,
    driverAnnualCost: 46000,
    fixedVehicleAnnualCost: 52000,
    structuralOverheadAnnual: 14000,
    note: "Common distribution and retail class"
  },
  {
    vehicleClass: "Rigid truck 26t",
    capabilityBand: "Heavy rigid",
    gvwT: 26,
    payloadCapacityT: 14,
    basePayloadUtilization: 0.85,
    annualTotalKm: 90000,
    loadedRatio: 0.82,
    fuelConsumptionLPer100Km: 31,
    nonFuelVariableEurPerKm: 0.4,
    driverAnnualCost: 48000,
    fixedVehicleAnnualCost: 68000,
    structuralOverheadAnnual: 16000,
    note: "Common three-axle heavy rigid class"
  },
  {
    vehicleClass: "Articulated 40t",
    capabilityBand: "Standard heavy artic",
    gvwT: 40,
    payloadCapacityT: 24,
    basePayloadUtilization: 0.868,
    annualTotalKm: 113100,
    loadedRatio: 0.853,
    fuelConsumptionLPer100Km: 34.2,
    nonFuelVariableEurPerKm: 0.1716,
    driverAnnualCost: 49674,
    fixedVehicleAnnualCost: 36095,
    structuralOverheadAnnual: 0,
    note: "Standard EU heavy-goods reference class",
    sourceUrl: "https://ec.europa.eu/commission/presscorner/detail/en/MEMO_13_329"
  },
  {
    vehicleClass: "Articulated 44t",
    capabilityBand: "Intermodal / heavier permitted artic",
    gvwT: 44,
    payloadCapacityT: 28,
    basePayloadUtilization: 0.88,
    annualTotalKm: 113100,
    loadedRatio: 0.86,
    fuelConsumptionLPer100Km: 35.5,
    nonFuelVariableEurPerKm: 0.18,
    driverAnnualCost: 50000,
    fixedVehicleAnnualCost: 39000,
    structuralOverheadAnnual: 18000,
    note: "44t only where rules allow, especially combined/intermodal transport",
    sourceUrl: "https://ec.europa.eu/commission/presscorner/detail/en/MEMO_13_329"
  },
  {
    vehicleClass: "EMS / high-capacity 60t",
    capabilityBand: "Country/permit dependent EMS",
    gvwT: 60,
    payloadCapacityT: 38,
    basePayloadUtilization: 0.9,
    annualTotalKm: 115000,
    loadedRatio: 0.88,
    fuelConsumptionLPer100Km: 45,
    nonFuelVariableEurPerKm: 0.23,
    driverAnnualCost: 53000,
    fixedVehicleAnnualCost: 60000,
    structuralOverheadAnnual: 22000,
    note: "EMS/high-capacity combinations are country and route dependent",
    sourceUrl:
      "https://transport.ec.europa.eu/document/download/45e1073e-373a-4156-966b-0523915dec9f_en?filename=SWD_2023_70_implementation_report_amendments_dir_96_53.pdf"
  }
];
