import {
  CalculationValidationError,
  getBlueprintReferenceData as getFallbackBlueprintReferenceData,
  getBusinessModels as getFallbackBusinessModels,
  getCompanyTypesForCountry as getFallbackCompanyTypesForCountry,
  getCountries as getFallbackCountries,
  getTaxProfile as getFallbackTaxProfile,
  getVehicleClasses as getFallbackVehicleClasses
} from "@transport-break-even/shared";
import { hasDatabaseUrl, query } from "./db.js";

const countryOrderSql = `
  CASE code
    WHEN 'AT' THEN 1
    WHEN 'DE' THEN 2
    WHEN 'RO' THEN 3
    WHEN 'HU' THEN 4
    WHEN 'BG' THEN 5
    WHEN 'CZ' THEN 6
    WHEN 'SK' THEN 7
    WHEN 'MANUAL' THEN 8
    ELSE 99
  END
`;

const businessModelOrderSql = `
  CASE code
    WHEN 'OWNER_OPERATOR' THEN 1
    WHEN 'FLEET_OPERATOR' THEN 2
    WHEN 'SUBCONTRACTOR' THEN 3
    WHEN 'MIXED' THEN 4
    WHEN 'CARRIER_WITH_SUBCONTRACTORS' THEN 5
    ELSE 99
  END
`;

const vehicleCodeSql = `
  CASE vehicle_class
    WHEN 'Small van' THEN 'SMALL_VAN'
    WHEN 'Large van 3.5t' THEN 'LARGE_VAN_3_5T'
    WHEN 'Light truck 7.5t' THEN 'LIGHT_TRUCK_7_5T'
    WHEN 'Medium rigid 12t' THEN 'RIGID_12T'
    WHEN 'Rigid truck 18t' THEN 'RIGID_18T'
    WHEN 'Rigid truck 26t' THEN 'RIGID_26T'
    WHEN 'Articulated 40t' THEN 'ARTICULATED_40T'
    WHEN 'Articulated 44t' THEN 'ARTICULATED_44T'
    WHEN 'EMS / high-capacity 60t' THEN 'EMS_60T'
    ELSE UPPER(REPLACE(vehicle_class, ' ', '_'))
  END
`;

const vehicleDisplayNameSql = `
  CASE vehicle_class
    WHEN 'Medium rigid 12t' THEN 'Rigid truck 12t'
    ELSE vehicle_class
  END
`;

export async function getBlueprintReferenceData() {
  if (!hasDatabaseUrl()) return getFallbackBlueprintReferenceData();

  const [countries, companyTypes, businessModels, vehicleClasses, taxProfiles] =
    await Promise.all([
      getCountries(),
      getAllCompanyTypes(),
      getBusinessModels(),
      getVehicleClasses(),
      getTaxProfiles()
    ]);

  return {
    ...getFallbackBlueprintReferenceData(),
    countries,
    companyTypes,
    businessModels,
    vehicleClasses,
    taxProfiles
  };
}

export async function getCountries() {
  if (!hasDatabaseUrl()) return getFallbackCountries();

  const result = await query(
    `SELECT
       ROW_NUMBER() OVER (ORDER BY ${countryOrderSql}, code)::INT AS id,
       code,
       name,
       currency,
       modelling_note,
       as_of
     FROM jurisdictions
     ORDER BY ${countryOrderSql}, code`
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.name,
    currency: row.currency,
    note: row.modelling_note,
    sourceDate: row.as_of,
    lastReviewedAt: row.as_of
  }));
}

export async function getCompanyTypesForCountry(countryIdOrCode) {
  if (!hasDatabaseUrl()) return getFallbackCompanyTypesForCountry(countryIdOrCode);

  const country = await findCountry(countryIdOrCode);
  if (!country) {
    throw new CalculationValidationError("countryId must exist in countries", "countryId");
  }

  const result = await query(
    `SELECT id, jurisdiction_code, name, is_default
     FROM company_types
     WHERE jurisdiction_code = $1
     ORDER BY id`,
    [country.code]
  );

  return result.rows.map((row) => mapCompanyType(row, country));
}

export async function getAllCompanyTypes() {
  if (!hasDatabaseUrl()) return getFallbackBlueprintReferenceData().companyTypes;

  const countries = await getCountries();
  const countryByCode = new Map(countries.map((country) => [country.code, country]));
  const result = await query(
    `SELECT id, jurisdiction_code, name, is_default
     FROM company_types
     ORDER BY id`
  );

  return result.rows.map((row) =>
    mapCompanyType(row, countryByCode.get(row.jurisdiction_code))
  );
}

export async function getBusinessModels() {
  if (!hasDatabaseUrl()) return getFallbackBusinessModels();

  const result = await query(
    `SELECT
       ROW_NUMBER() OVER (ORDER BY ${businessModelOrderSql}, code)::INT AS id,
       code,
       label
     FROM business_models
     ORDER BY ${businessModelOrderSql}, code`
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.label,
    description: businessModelDescription(row.label)
  }));
}

export async function getVehicleClasses() {
  if (!hasDatabaseUrl()) return getFallbackVehicleClasses();

  const result = await query(
    `SELECT
       id,
       ${vehicleCodeSql} AS code,
       ${vehicleDisplayNameSql} AS display_name,
       vehicle_class,
       gvw_t,
       payload_capacity_t,
       base_payload_utilization,
       fuel_consumption_l_per_100km,
       fixed_vehicle_annual_cost,
       validation_note,
       source_url
     FROM vehicle_classes
     ORDER BY id`
  );

  const fallbackVehicleByCode = new Map(
    getFallbackVehicleClasses().map((vehicle) => [vehicle.code, vehicle])
  );

  return result.rows.map((row) => {
    const fallbackVehicle = fallbackVehicleByCode.get(row.code);
    const displayName = fallbackVehicle?.displayName ?? row.display_name;

    return {
      id: Number(row.id),
      code: row.code,
      name: displayName,
      displayName,
      grossWeightTons: Number(row.gvw_t),
      payloadCapacityTons: Number(row.payload_capacity_t),
      typicalPayloadUtilisation: Number(row.base_payload_utilization),
      typicalFuelLPer100Km: Number(row.fuel_consumption_l_per_100km),
      annualFixedCostProxy: Number(row.fixed_vehicle_annual_cost),
      bestFor: fallbackVehicle?.bestFor ?? row.validation_note,
      regulatoryNote: row.validation_note,
      sourceUrl: row.source_url
    };
  });
}

export async function getTaxProfiles() {
  if (!hasDatabaseUrl()) return getFallbackBlueprintReferenceData().taxProfiles;

  const countries = await getCountries();
  const countryByCode = new Map(countries.map((country) => [country.code, country]));
  const result = await query(
    `SELECT
       tr.*,
       ct.id AS company_type_id,
       ct.name AS company_type_name,
       j.name AS country_name,
       j.currency,
       j.as_of,
       j.modelling_note
     FROM tax_rules tr
     JOIN company_types ct ON ct.jurisdiction_code = tr.jurisdiction_code
     JOIN jurisdictions j ON j.code = tr.jurisdiction_code
     ORDER BY tr.jurisdiction_code, ct.id`
  );

  return result.rows.map((row) => {
    const country = countryByCode.get(row.jurisdiction_code);
    return mapTaxProfile(row, country);
  });
}

export async function getTaxProfile(criteria = {}) {
  if (!hasDatabaseUrl()) return getFallbackTaxProfile(criteria);

  const country = await findCountry(
    criteria.countryId ?? criteria.countryCode ?? criteria.code
  );
  if (!country) {
    throw new CalculationValidationError("countryId must exist in countries", "countryId");
  }

  const companyTypeId = criteria.companyTypeId
    ? Number(criteria.companyTypeId)
    : null;
  const companyTypeName = criteria.companyTypeName ?? null;
  const companyTypeFilter = companyTypeId
    ? "ct.id = $2"
    : companyTypeName
      ? "ct.name = $2"
      : "ct.is_default = TRUE";
  const params = [
    country.code,
    companyTypeId || companyTypeName
  ].filter((value) => value !== null && value !== undefined);

  const result = await query(
    `SELECT
       tr.*,
       ct.id AS company_type_id,
       ct.name AS company_type_name,
       j.name AS country_name,
       j.currency,
       j.as_of,
       j.modelling_note
     FROM tax_rules tr
     JOIN company_types ct ON ct.jurisdiction_code = tr.jurisdiction_code
     JOIN jurisdictions j ON j.code = tr.jurisdiction_code
     WHERE tr.jurisdiction_code = $1 AND ${companyTypeFilter}
     ORDER BY ct.is_default DESC, ct.id
     LIMIT 1`,
    params
  );

  if (!result.rows[0]) {
    throw new CalculationValidationError(
      "companyTypeId must belong to selected country",
      "companyTypeId"
    );
  }

  return mapTaxProfile(result.rows[0], country);
}

async function findCountry(countryIdOrCode) {
  const countries = await getCountries();
  return countries.find(
    (country) =>
      country.id === Number(countryIdOrCode) ||
      country.code === String(countryIdOrCode)
  );
}

function mapCompanyType(row, country) {
  return {
    id: Number(row.id),
    countryId: country?.id,
    countryCode: row.jurisdiction_code,
    name: row.name,
    description: row.is_default ? "Default legal form" : ""
  };
}

function mapTaxProfile(row, country) {
  const corporateTaxRate = Number(row.corporate_tax_rate);
  const localTradeTaxRate = Number(row.local_trade_tax_rate);
  return {
    id: Number(row.company_type_id),
    countryId: country?.id,
    countryCode: row.jurisdiction_code,
    countryName: row.country_name,
    companyTypeId: Number(row.company_type_id),
    companyTypeName: row.company_type_name,
    vatRegisteredDefault: Boolean(row.default_vat_registered),
    vatRate: Number(row.standard_vat_rate),
    corporateTaxRate,
    localTradeTaxRate,
    effectiveBusinessTaxRate: corporateTaxRate + localTradeTaxRate,
    employerContributionRate: Number(row.employer_payroll_contribution_rate),
    employeeContributionRate: Number(row.employee_contribution_rate),
    vehicleTaxDefaultAnnual: Number(row.default_vehicle_tax_annual),
    targetAfterTaxMarginDefault: Number(row.default_target_after_tax_margin),
    ruleNote: row.modelling_note,
    sourceName: row.source_name || "Seeded modelling defaults",
    sourceUrl: row.source_urls,
    sourceDate: row.source_as_of || row.as_of,
    validFrom: row.valid_from || row.as_of,
    validTo: row.valid_to,
    status: row.rule_status || "indicative"
  };
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
