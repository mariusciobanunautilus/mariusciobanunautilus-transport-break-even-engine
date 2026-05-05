CREATE TABLE IF NOT EXISTS jurisdictions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL,
  as_of TEXT NOT NULL,
  modelling_note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_rules (
  jurisdiction_code TEXT PRIMARY KEY REFERENCES jurisdictions(code),
  default_vat_registered BOOLEAN NOT NULL,
  standard_vat_rate NUMERIC(8, 6) NOT NULL,
  corporate_tax_rate NUMERIC(8, 6) NOT NULL,
  local_trade_tax_rate NUMERIC(8, 6) NOT NULL,
  employer_payroll_contribution_rate NUMERIC(8, 6) NOT NULL,
  employee_contribution_rate NUMERIC(8, 6) NOT NULL,
  default_vehicle_tax_annual NUMERIC(14, 2) NOT NULL,
  default_target_after_tax_margin NUMERIC(8, 6) NOT NULL,
  default_company_type TEXT NOT NULL,
  default_business_model TEXT NOT NULL,
  source_urls JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE TABLE IF NOT EXISTS company_types (
  id BIGSERIAL PRIMARY KEY,
  jurisdiction_code TEXT NOT NULL REFERENCES jurisdictions(code),
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (jurisdiction_code, name)
);

CREATE TABLE IF NOT EXISTS business_models (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS jurisdiction_business_models (
  jurisdiction_code TEXT NOT NULL REFERENCES jurisdictions(code),
  business_model_code TEXT NOT NULL REFERENCES business_models(code),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (jurisdiction_code, business_model_code)
);

CREATE TABLE IF NOT EXISTS operating_profiles (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  default_inputs JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicle_classes (
  id BIGSERIAL PRIMARY KEY,
  vehicle_class TEXT NOT NULL UNIQUE,
  capability_band TEXT NOT NULL,
  gvw_t NUMERIC(10, 3) NOT NULL,
  payload_capacity_t NUMERIC(10, 3) NOT NULL,
  base_payload_utilization NUMERIC(8, 6) NOT NULL,
  annual_total_km NUMERIC(14, 3) NOT NULL,
  loaded_ratio NUMERIC(8, 6) NOT NULL,
  fuel_consumption_l_per_100km NUMERIC(10, 3) NOT NULL,
  non_fuel_variable_eur_per_km NUMERIC(10, 6) NOT NULL,
  driver_annual_cost NUMERIC(14, 2) NOT NULL,
  fixed_vehicle_annual_cost NUMERIC(14, 2) NOT NULL,
  structural_overhead_annual NUMERIC(14, 2) NOT NULL,
  validation_note TEXT NOT NULL,
  source_url TEXT
);

CREATE TABLE IF NOT EXISTS calculation_runs (
  id BIGSERIAL PRIMARY KEY,
  profile_code TEXT NOT NULL REFERENCES operating_profiles(code),
  jurisdiction_code TEXT NOT NULL REFERENCES jurisdictions(code),
  company_type TEXT NOT NULL,
  business_model TEXT NOT NULL,
  inputs JSONB NOT NULL,
  outputs JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO jurisdictions (code, name, currency, as_of, modelling_note) VALUES
  ('AT', 'Austria', 'EUR', '2026-05', 'Corporate rate used for GmbH/AG. Sole traders need separate validation.'),
  ('DE', 'Germany', 'EUR', '2026-05', 'Corporate tax includes solidarity surcharge on CIT. Trade tax is modelled as an average proxy.'),
  ('RO', 'Romania', 'RON/EUR', '2026-05', 'Standard CIT used for SRL/SA. Micro-company turnover tax regimes are not modelled by default.'),
  ('HU', 'Hungary', 'HUF/EUR', '2026-05', 'Local business tax can be up to 2% and is modelled as a simplified EBIT-tax proxy.'),
  ('BG', 'Bulgaria', 'BGN/EUR', '2026-05', 'Flat 10% CIT used. Employer contribution uses a midpoint proxy.'),
  ('CZ', 'Czechia', 'CZK/EUR', '2026-05', 'Standard corporate rate used. Employer contribution combines social and health contributions.'),
  ('SK', 'Slovakia', 'EUR', '2026-05', 'Default CIT rate assumes taxable income above the lower-rate thresholds.'),
  ('MANUAL', 'Manual / Custom', 'EUR', '2026-05', 'Use this option when the jurisdiction or exact legal entity is not included.')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  currency = EXCLUDED.currency,
  as_of = EXCLUDED.as_of,
  modelling_note = EXCLUDED.modelling_note;

INSERT INTO tax_rules (
  jurisdiction_code,
  default_vat_registered,
  standard_vat_rate,
  corporate_tax_rate,
  local_trade_tax_rate,
  employer_payroll_contribution_rate,
  employee_contribution_rate,
  default_vehicle_tax_annual,
  default_target_after_tax_margin,
  default_company_type,
  default_business_model,
  source_urls
) VALUES
  ('AT', TRUE, 0.20, 0.23, 0, 0.2098, 0.1807, 800, 0.10, 'GmbH', 'Fleet operator', '{"vat":"https://www.usp.gv.at/en/themen/steuern-finanzen/umsatzsteuer-ueberblick/steuersaetze-und-steuerbefreiungen-der-umsatzsteuer.html","corporate":"https://www.usp.gv.at/en/themen/steuern-finanzen/koerperschaftsteuer-ueberblick.html","payroll":"https://taxsummaries.pwc.com/austria/individual/other-taxes"}'),
  ('DE', TRUE, 0.19, 0.15825, 0.14, 0.1942, 0.1933, 900, 0.10, 'GmbH', 'Fleet operator', '{"vat":"https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en","corporate":"https://taxsummaries.pwc.com/germany/corporate/taxes-on-corporate-income","payroll":"https://taxsummaries.pwc.com/germany/individual/other-taxes"}'),
  ('RO', TRUE, 0.21, 0.16, 0, 0.0225, 0.35, 500, 0.10, 'SRL', 'Fleet operator', '{"vat":"https://www.ey.com/en_gl/technical/tax-alerts/romanian-tax-changes-introduced-by-new-fiscal-and-budgetary-measures","corporate":"https://www.accace.com/tax-guideline-for-romania/","payroll":"https://taxsummaries.pwc.com/romania/individual/other-taxes"}'),
  ('HU', TRUE, 0.27, 0.09, 0.02, 0.13, 0.185, 500, 0.10, 'Kft.', 'Fleet operator', '{"vat":"https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en","corporate":"https://taxsummaries.pwc.com/hungary/corporate/taxes-on-corporate-income","payroll":"https://taxsummaries.pwc.com/hungary/individual/other-taxes"}'),
  ('BG', TRUE, 0.20, 0.10, 0, 0.193, 0.1378, 400, 0.10, 'EOOD/OOD', 'Fleet operator', '{"vat":"https://taxsummaries.pwc.com/bulgaria/corporate/other-taxes","corporate":"https://taxsummaries.pwc.com/bulgaria/corporate/taxes-on-corporate-income","payroll":"https://taxsummaries.pwc.com/bulgaria/individual/other-taxes"}'),
  ('CZ', TRUE, 0.21, 0.21, 0, 0.338, 0.116, 550, 0.10, 's.r.o.', 'Fleet operator', '{"vat":"https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en","corporate":"https://portal.gov.cz/en/informace/what-is-the-corporate-income-tax-rate-INF-329","payroll":"https://taxsummaries.pwc.com/czech-republic/individual/other-taxes"}'),
  ('SK', TRUE, 0.23, 0.21, 0, 0.362, 0.144, 550, 0.10, 's.r.o.', 'Fleet operator', '{"vat":"https://taxsummaries.pwc.com/slovak-republic/corporate/other-taxes","corporate":"https://www.accace.com/tax-guideline-for-slovakia/","payroll":"https://taxsummaries.pwc.com/slovak-republic/corporate/other-taxes"}'),
  ('MANUAL', FALSE, 0, 0, 0, 0, 0, 0, 0.10, 'Manual entity', 'Fleet operator', '{"vat":"Manual input","corporate":"Manual input","payroll":"Manual input"}')
ON CONFLICT (jurisdiction_code) DO UPDATE SET
  default_vat_registered = EXCLUDED.default_vat_registered,
  standard_vat_rate = EXCLUDED.standard_vat_rate,
  corporate_tax_rate = EXCLUDED.corporate_tax_rate,
  local_trade_tax_rate = EXCLUDED.local_trade_tax_rate,
  employer_payroll_contribution_rate = EXCLUDED.employer_payroll_contribution_rate,
  employee_contribution_rate = EXCLUDED.employee_contribution_rate,
  default_vehicle_tax_annual = EXCLUDED.default_vehicle_tax_annual,
  default_target_after_tax_margin = EXCLUDED.default_target_after_tax_margin,
  default_company_type = EXCLUDED.default_company_type,
  default_business_model = EXCLUDED.default_business_model,
  source_urls = EXCLUDED.source_urls;

INSERT INTO business_models (code, label) VALUES
  ('OWNER_OPERATOR', 'Owner-operator'),
  ('FLEET_OPERATOR', 'Fleet operator'),
  ('SUBCONTRACTOR', 'Subcontractor'),
  ('MIXED', 'Mixed'),
  ('CARRIER_WITH_SUBCONTRACTORS', 'Carrier with subcontractors')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label;

INSERT INTO company_types (jurisdiction_code, name, is_default) VALUES
  ('AT', 'Einzelunternehmen', FALSE), ('AT', 'GmbH', TRUE), ('AT', 'AG', FALSE), ('AT', 'Branch / PE', FALSE),
  ('DE', 'Einzelunternehmen', FALSE), ('DE', 'UG', FALSE), ('DE', 'GmbH', TRUE), ('DE', 'AG', FALSE), ('DE', 'Branch / PE', FALSE),
  ('RO', 'PFA / II', FALSE), ('RO', 'SRL', TRUE), ('RO', 'SA', FALSE), ('RO', 'Branch / PE', FALSE),
  ('HU', 'Egyeni vallalkozo', FALSE), ('HU', 'Kft.', TRUE), ('HU', 'Zrt. / Nyrt.', FALSE), ('HU', 'Branch / PE', FALSE),
  ('BG', 'ET', FALSE), ('BG', 'EOOD/OOD', TRUE), ('BG', 'AD', FALSE), ('BG', 'Branch / PE', FALSE),
  ('CZ', 'OSVC', FALSE), ('CZ', 's.r.o.', TRUE), ('CZ', 'a.s.', FALSE), ('CZ', 'Branch / PE', FALSE),
  ('SK', 'zivnostnik', FALSE), ('SK', 's.r.o.', TRUE), ('SK', 'a.s.', FALSE), ('SK', 'Branch / PE', FALSE),
  ('MANUAL', 'Manual entity', TRUE)
ON CONFLICT (jurisdiction_code, name) DO UPDATE SET is_default = EXCLUDED.is_default;

INSERT INTO jurisdiction_business_models (jurisdiction_code, business_model_code, is_default)
SELECT j.code, bm.code, bm.code = 'FLEET_OPERATOR'
FROM jurisdictions j
CROSS JOIN business_models bm
ON CONFLICT (jurisdiction_code, business_model_code) DO UPDATE SET
  is_default = EXCLUDED.is_default;

INSERT INTO operating_profiles (code, name, short_name, default_inputs) VALUES
  ('LONG_DISTANCE_40T', 'Long Distance 40t', 'Long distance', '{
    "dailyKm":495.183887915937,
    "operatingDays":228.4,
    "workingDays":215.2,
    "annualWorkingHours":2123,
    "averageSpeed":63.9,
    "loadedRatio":0.853,
    "capacityUtilization":0.868,
    "waitingTimeHoursPerDay":3.3833333333,
    "fuelConsumptionLPer100Km":34.2,
    "fuelPriceExVat":1.265524625,
    "tyresAnnualCost":3098,
    "maintenanceAnnualCost":8221,
    "roadFeesAnnualCost":8090,
    "tractorOwnershipAnnualCost":10793,
    "trailerOwnershipAnnualCost":3208,
    "vehicleInsuranceAnnual":2198,
    "cargoInsuranceAnnual":477,
    "vehicleTaxesAnnual":500,
    "monthlyDriverSalary":2348.72,
    "employerTaxRateOnSalary":0.0225,
    "travelAllowancePerWorkingDay":38.36,
    "driversPerVehicle":1.064,
    "structuralOverheadAnnual":17886,
    "commercialAdminOverheadAnnualCost":0,
    "targetEbitMargin":0.1,
    "selectedMarkup":0.125
  }'),
  ('REGIONAL_40T', 'Regional 40t', 'Regional', '{
    "dailyKm":421.505376344086,
    "operatingDays":232.5,
    "workingDays":214.6,
    "annualWorkingHours":2058,
    "averageSpeed":62.5,
    "loadedRatio":0.805,
    "capacityUtilization":0.939,
    "waitingTimeHoursPerDay":3.4,
    "fuelConsumptionLPer100Km":33.8,
    "fuelPriceExVat":1.265524625,
    "tyresAnnualCost":3101,
    "maintenanceAnnualCost":7278,
    "roadFeesAnnualCost":5805,
    "tractorOwnershipAnnualCost":10934,
    "trailerOwnershipAnnualCost":3551,
    "vehicleInsuranceAnnual":2598,
    "cargoInsuranceAnnual":411,
    "vehicleTaxesAnnual":500,
    "monthlyDriverSalary":2182.15,
    "employerTaxRateOnSalary":0.0225,
    "travelAllowancePerWorkingDay":16.53,
    "driversPerVehicle":1.085,
    "structuralOverheadAnnual":17820,
    "commercialAdminOverheadAnnualCost":0,
    "targetEbitMargin":0.1,
    "selectedMarkup":0.125
  }')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  default_inputs = EXCLUDED.default_inputs;

INSERT INTO vehicle_classes (
  vehicle_class,
  capability_band,
  gvw_t,
  payload_capacity_t,
  base_payload_utilization,
  annual_total_km,
  loaded_ratio,
  fuel_consumption_l_per_100km,
  non_fuel_variable_eur_per_km,
  driver_annual_cost,
  fixed_vehicle_annual_cost,
  structural_overhead_annual,
  validation_note,
  source_url
) VALUES
  ('Small van', 'Urban / light delivery', 3.5, 1.2, 0.75, 45000, 0.7, 9.5, 0.1, 32000, 12000, 6000, 'Model assumption; validate payload against actual van spec', 'https://climate.ec.europa.eu/system/files/2017-03/hdv_lightweighting_en.pdf'),
  ('Large van 3.5t', 'Van / courier', 3.5, 2, 0.75, 65000, 0.72, 12, 0.14, 34000, 16000, 7000, 'Payload depends on body and specification', 'https://climate.ec.europa.eu/system/files/2017-03/hdv_lightweighting_en.pdf'),
  ('Light truck 7.5t', 'Small rigid', 7.5, 3.5, 0.8, 75000, 0.75, 16, 0.2, 40000, 25000, 10000, 'Validate by vehicle body and national rules', NULL),
  ('Medium rigid 12t', 'Rigid truck', 12, 6, 0.82, 80000, 0.78, 22, 0.27, 43000, 38000, 12000, 'Payload depends on body and axle setup', NULL),
  ('Rigid truck 18t', 'Rigid truck', 18, 9, 0.85, 85000, 0.8, 27, 0.33, 46000, 52000, 14000, 'Common distribution and retail class', NULL),
  ('Rigid truck 26t', 'Heavy rigid', 26, 14, 0.85, 90000, 0.82, 31, 0.4, 48000, 68000, 16000, 'Common three-axle heavy rigid class', NULL),
  ('Articulated 40t', 'Standard heavy artic', 40, 24, 0.868, 113100, 0.853, 34.2, 0.1716, 49674, 36095, 0, 'Standard EU heavy-goods reference class', 'https://ec.europa.eu/commission/presscorner/detail/en/MEMO_13_329'),
  ('Articulated 44t', 'Intermodal / heavier permitted artic', 44, 28, 0.88, 113100, 0.86, 35.5, 0.18, 50000, 39000, 18000, '44t only where rules allow, especially combined/intermodal transport', 'https://ec.europa.eu/commission/presscorner/detail/en/MEMO_13_329'),
  ('EMS / high-capacity 60t', 'Country/permit dependent EMS', 60, 38, 0.9, 115000, 0.88, 45, 0.23, 53000, 60000, 22000, 'EMS/high-capacity combinations are country and route dependent', 'https://transport.ec.europa.eu/document/download/45e1073e-373a-4156-966b-0523915dec9f_en?filename=SWD_2023_70_implementation_report_amendments_dir_96_53.pdf')
ON CONFLICT (vehicle_class) DO UPDATE SET
  capability_band = EXCLUDED.capability_band,
  gvw_t = EXCLUDED.gvw_t,
  payload_capacity_t = EXCLUDED.payload_capacity_t,
  base_payload_utilization = EXCLUDED.base_payload_utilization,
  annual_total_km = EXCLUDED.annual_total_km,
  loaded_ratio = EXCLUDED.loaded_ratio,
  fuel_consumption_l_per_100km = EXCLUDED.fuel_consumption_l_per_100km,
  non_fuel_variable_eur_per_km = EXCLUDED.non_fuel_variable_eur_per_km,
  driver_annual_cost = EXCLUDED.driver_annual_cost,
  fixed_vehicle_annual_cost = EXCLUDED.fixed_vehicle_annual_cost,
  structural_overhead_annual = EXCLUDED.structural_overhead_annual,
  validation_note = EXCLUDED.validation_note,
  source_url = EXCLUDED.source_url;
