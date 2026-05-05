import { useMemo, useState } from "react";
import {
  computeTransportEngine,
  getReferenceData
} from "@transport-break-even/shared";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:10000").replace(
  /\/$/,
  ""
);

const reference = getReferenceData();
const defaultJurisdictionCode = "RO";

export default function App() {
  const defaultTaxRule = findTaxRule(defaultJurisdictionCode);
  const [profileCode, setProfileCode] = useState("LONG_DISTANCE_40T");
  const [jurisdictionCode, setJurisdictionCode] = useState(defaultJurisdictionCode);
  const [companyType, setCompanyType] = useState(defaultTaxRule.defaultCompanyType);
  const [businessModel, setBusinessModel] = useState(defaultTaxRule.defaultBusinessModel);
  const [vatRegistered, setVatRegistered] = useState(defaultTaxRule.defaultVatRegistered);
  const [inputsByProfile, setInputsByProfile] = useState(() =>
    createInputsByProfile(defaultTaxRule)
  );
  const [saveStatus, setSaveStatus] = useState("Ready");

  const taxRule = useMemo(
    () => findTaxRule(jurisdictionCode),
    [jurisdictionCode]
  );
  const activeInputs = inputsByProfile[profileCode];

  const result = useMemo(() => {
    try {
      return computeTransportEngine({
        profileCode,
        jurisdictionCode,
        companyType,
        businessModel,
        vatRegistered,
        inputs: activeInputs
      });
    } catch (error) {
      return { error: error.message };
    }
  }, [
    activeInputs,
    businessModel,
    companyType,
    jurisdictionCode,
    profileCode,
    vatRegistered
  ]);

  const comparison = useMemo(
    () =>
      reference.operatingProfiles.map((profile) => {
        try {
          return computeTransportEngine({
            profileCode: profile.code,
            jurisdictionCode,
            companyType,
            businessModel,
            vatRegistered,
            inputs: inputsByProfile[profile.code]
          });
        } catch {
          return null;
        }
      }),
    [businessModel, companyType, inputsByProfile, jurisdictionCode, vatRegistered]
  );

  const handleJurisdictionChange = (nextCode) => {
    const nextRule = findTaxRule(nextCode);
    setJurisdictionCode(nextCode);
    setCompanyType(nextRule.defaultCompanyType);
    setBusinessModel(nextRule.defaultBusinessModel);
    setVatRegistered(nextRule.defaultVatRegistered);
    setInputsByProfile((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([code, values]) => [
          code,
          withLinkedTaxDefaults(values, nextRule)
        ])
      )
    );
    setSaveStatus("Jurisdiction defaults applied");
  };

  const updateInput = (field, value) => {
    const normalized = value.replace(",", ".");
    if (normalized !== "" && !Number.isFinite(Number(normalized))) return;
    setInputsByProfile((previous) => ({
      ...previous,
      [profileCode]: {
        ...previous[profileCode],
        [field]: normalized === "" ? "" : Number(normalized)
      }
    }));
    setSaveStatus("Unsaved changes");
  };

  const resetProfile = () => {
    const profile = reference.operatingProfiles.find(
      (item) => item.code === profileCode
    );
    setInputsByProfile((previous) => ({
      ...previous,
      [profileCode]: withLinkedTaxDefaults(profile.inputs, taxRule)
    }));
    setSaveStatus("Profile reset");
  };

  const saveCalculation = async () => {
    if (result.error) {
      setSaveStatus(result.error);
      return;
    }

    setSaveStatus("Saving...");
    try {
      const response = await fetch(`${API_BASE}/api/calculations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileCode,
          jurisdictionCode,
          companyType,
          businessModel,
          vatRegistered,
          inputs: activeInputs
        })
      });

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      setSaveStatus("Saved");
    } catch (error) {
      setSaveStatus(error.message);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Transport Break-even Engine</p>
          <h1>Pricing control room</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" onClick={resetProfile} type="button">
            Reset profile
          </button>
          <button className="primary-button" onClick={saveCalculation} type="button">
            Save run
          </button>
        </div>
      </header>

      <section className="layout-grid">
        <aside className="sidebar">
          <section className="control-group">
            <h2>Profile</h2>
            <div className="segmented">
              {reference.operatingProfiles.map((profile) => (
                <button
                  className={profile.code === profileCode ? "active" : ""}
                  key={profile.code}
                  onClick={() => setProfileCode(profile.code)}
                  type="button"
                >
                  {profile.shortName}
                </button>
              ))}
            </div>
          </section>

          <section className="control-group">
            <h2>Jurisdiction</h2>
            <label className="select-field">
              <span>Country</span>
              <select
                onChange={(event) => handleJurisdictionChange(event.target.value)}
                value={jurisdictionCode}
              >
                {reference.taxRules.map((rule) => (
                  <option key={rule.code} value={rule.code}>
                    {rule.jurisdiction}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>Company type</span>
              <select
                onChange={(event) => setCompanyType(event.target.value)}
                value={companyType}
              >
                {taxRule.companyTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-field">
              <span>Business model</span>
              <select
                onChange={(event) => setBusinessModel(event.target.value)}
                value={businessModel}
              >
                {reference.businessModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <label className="toggle-row">
              <input
                checked={vatRegistered}
                onChange={(event) => setVatRegistered(event.target.checked)}
                type="checkbox"
              />
              <span>VAT registered</span>
            </label>
          </section>

          <section className="control-group compact">
            <h2>Tax Profile</h2>
            <Fact label="VAT" value={formatPercent(taxRule.vatRate)} />
            <Fact
              label="Business tax"
              value={formatPercent(
                taxRule.corporateTaxRate + taxRule.localTradeTaxRate
              )}
            />
            <Fact
              label="Payroll"
              value={formatPercent(taxRule.employerPayrollContributionRate)}
            />
            <Fact label="Vehicle tax" value={formatMoney(taxRule.defaultVehicleTaxAnnual, 0)} />
          </section>
        </aside>

        <section className="main-panel">
          {result.error ? (
            <div className="error-panel">{result.error}</div>
          ) : (
            <>
              <section className="kpi-grid">
                <Kpi
                  label="Break-even loaded km"
                  value={formatMoney(result.costs.totals.breakEvenPricePerLoadedKm, 4)}
                  unit="EUR/km"
                  tone="green"
                />
                <Kpi
                  label="Selected rate"
                  value={formatMoney(result.pricing.selectedCustomerRate, 4)}
                  unit="EUR/km"
                  tone="amber"
                />
                <Kpi
                  label="EBIT"
                  value={formatMoney(result.pricing.ebitAtSelectedRate, 0)}
                  unit={formatPercent(result.pricing.ebitMarginAtSelectedRate)}
                />
                <Kpi
                  label="After tax profit"
                  value={formatMoney(result.tax.profitAfterBusinessTax, 0)}
                  unit={formatPercent(result.tax.afterTaxProfitMargin)}
                />
              </section>

              <section className="workbench">
                <div className="input-stack">
                  {reference.inputSections.map((section) => (
                    <InputSection
                      inputs={activeInputs}
                      key={section.title}
                      onChange={updateInput}
                      section={section}
                    />
                  ))}
                </div>

                <aside className="result-stack">
                  <ResultCard title="Cost Bridge">
                    <Fact
                      label="Variable cost"
                      value={formatMoney(
                        result.costs.variable.annualVariableOperatingCost,
                        0
                      )}
                    />
                    <Fact
                      label="Driver cost"
                      value={formatMoney(result.costs.driver.totalDriverCost, 0)}
                    />
                    <Fact
                      label="Fixed before driver"
                      value={formatMoney(
                        result.costs.fixed.fixedCostBeforeDriver,
                        0
                      )}
                    />
                    <Fact
                      label="Total annual cost"
                      value={formatMoney(result.costs.totals.totalAnnualCost, 0)}
                    />
                  </ResultCard>

                  <ResultCard title="Tax View">
                    <Fact
                      label="Invoice rate incl. VAT"
                      value={formatMoney(result.tax.customerInvoiceRateInclVat, 4)}
                    />
                    <Fact
                      label="VAT collected"
                      value={formatMoney(result.tax.vatCollectedAnnual, 0)}
                    />
                    <Fact
                      label="Business tax"
                      value={formatMoney(result.tax.businessTaxCharge, 0)}
                    />
                    <Fact
                      label="After-tax target rate"
                      value={formatMoney(
                        result.tax.requiredCustomerRateForTargetAfterTaxMargin,
                        4
                      )}
                    />
                  </ResultCard>

                  <ResultCard title="Operating Cushion">
                    <Fact
                      label="Loaded km"
                      value={formatNumber(result.operational.loadedRevenueKm, 0)}
                    />
                    <Fact
                      label="Break-even loaded km"
                      value={formatNullable(
                        result.pricing.breakEvenLoadedKmAtSelectedRate,
                        0
                      )}
                    />
                    <Fact
                      label="Safety margin"
                      value={formatNullablePercent(result.pricing.safetyMargin)}
                    />
                    <Fact
                      label="Required loaded ratio"
                      value={formatPercent(
                        result.pricing.requiredLoadedRatioAtPlannedTotalKm
                      )}
                    />
                  </ResultCard>
                </aside>
              </section>

              <section className="tables-grid">
                <ScenarioTable result={result} />
                <ComparisonTable results={comparison} />
              </section>

              <section className="tables-grid">
                <SensitivityTable result={result} />
                <VehicleClassTable rows={result.vehicleClasses} />
              </section>
            </>
          )}
        </section>
      </section>

      <footer className="status-line">
        <span>{saveStatus}</span>
        <span>{result.error ? "Calculation paused" : result.cascade.status}</span>
      </footer>
    </main>
  );
}

function InputSection({ section, inputs, onChange }) {
  return (
    <section className="input-card">
      <h2>{section.title}</h2>
      <div className="field-grid">
        {section.fields.map(([field, label, unit]) => (
          <label className="number-field" key={field}>
            <span>{label}</span>
            <div>
              <input
                inputMode="decimal"
                onChange={(event) => onChange(field, event.target.value)}
                type="number"
                value={inputs[field] ?? ""}
              />
              <small>{unit}</small>
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}

function ScenarioTable({ result }) {
  return (
    <TableCard title="Pricing Scenarios">
      <table>
        <thead>
          <tr>
            <th>Markup</th>
            <th>Rate</th>
            <th>Revenue</th>
            <th>EBIT</th>
            <th>Margin</th>
          </tr>
        </thead>
        <tbody>
          {result.pricingScenarios.map((row) => (
            <tr
              className={
                row.markup === result.pricing.selectedMarkup ? "selected-row" : ""
              }
              key={row.markup}
            >
              <td>{formatPercent(row.markup)}</td>
              <td>{formatMoney(row.rate, 4)}</td>
              <td>{formatMoney(row.annualRevenue, 0)}</td>
              <td>{formatMoney(row.ebit, 0)}</td>
              <td>{formatPercent(row.ebitMargin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );
}

function ComparisonTable({ results }) {
  return (
    <TableCard title="Profile Comparison">
      <table>
        <thead>
          <tr>
            <th>Profile</th>
            <th>Cost</th>
            <th>Break-even</th>
            <th>Rate</th>
            <th>EBIT</th>
          </tr>
        </thead>
        <tbody>
          {results.filter(Boolean).map((row) => (
            <tr key={row.profile.code}>
              <td>{row.profile.shortName}</td>
              <td>{formatMoney(row.costs.totals.totalAnnualCost, 0)}</td>
              <td>{formatMoney(row.costs.totals.breakEvenPricePerLoadedKm, 4)}</td>
              <td>{formatMoney(row.pricing.selectedCustomerRate, 4)}</td>
              <td>{formatMoney(row.pricing.ebitAtSelectedRate, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );
}

function SensitivityTable({ result }) {
  return (
    <TableCard title="Rate And Load Sensitivity">
      <table className="heat-table">
        <thead>
          <tr>
            <th>Load</th>
            {result.sensitivity[0].values.map((cell) => (
              <th key={cell.rate}>{formatMoney(cell.rate, 2)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.sensitivity.map((row) => (
            <tr key={row.loadFactor}>
              <td>{formatPercent(row.loadFactor)}</td>
              {row.values.map((cell) => (
                <td
                  className={cell.ebit >= 0 ? "positive-cell" : "negative-cell"}
                  key={cell.rate}
                >
                  {formatMoney(cell.ebit, 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );
}

function VehicleClassTable({ rows }) {
  return (
    <TableCard title="Vehicle Capability">
      <table>
        <thead>
          <tr>
            <th>Vehicle</th>
            <th>Payload</th>
            <th>Loaded km</th>
            <th>EUR/km</th>
            <th>EUR/t-km</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.vehicleClass}>
              <td>{row.vehicleClass}</td>
              <td>{formatNumber(row.effectivePayloadT, 1)} t</td>
              <td>{formatNumber(row.loadedKm, 0)}</td>
              <td>{formatMoney(row.breakEvenEurPerLoadedKm, 4)}</td>
              <td>{formatMoney(row.breakEvenEurPerTonneKm, 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );
}

function ResultCard({ title, children }) {
  return (
    <section className="result-card">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function TableCard({ title, children }) {
  return (
    <section className="table-card">
      <h2>{title}</h2>
      <div className="table-scroll">{children}</div>
    </section>
  );
}

function Kpi({ label, value, unit, tone }) {
  return (
    <article className={`kpi-card ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{unit}</small>
    </article>
  );
}

function Fact({ label, value }) {
  return (
    <div className="fact-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function createInputsByProfile(taxRule) {
  return Object.fromEntries(
    reference.operatingProfiles.map((profile) => [
      profile.code,
      withLinkedTaxDefaults(profile.inputs, taxRule)
    ])
  );
}

function withLinkedTaxDefaults(values, taxRule) {
  return {
    ...values,
    employerTaxRateOnSalary: taxRule.employerPayrollContributionRate,
    vehicleTaxesAnnual: taxRule.defaultVehicleTaxAnnual
  };
}

function findTaxRule(code) {
  return reference.taxRules.find((rule) => rule.code === code);
}

function formatMoney(value, digits = 2) {
  return `EUR ${formatNumber(value, digits)}`;
}

function formatNumber(value, digits = 2) {
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function formatPercent(value, digits = 1) {
  return `${formatNumber(Number(value) * 100, digits)}%`;
}

function formatNullable(value, digits = 0) {
  return value == null ? "Below variable cost" : formatNumber(value, digits);
}

function formatNullablePercent(value) {
  return value == null ? "Below variable cost" : formatPercent(value);
}
