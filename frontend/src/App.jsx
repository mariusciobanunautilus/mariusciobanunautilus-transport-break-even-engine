import { useEffect, useMemo, useState } from "react";
import {
  calculateBreakEven,
  defaultBlueprintCalculationInput,
  generatePricingScenarios,
  generateSensitivity,
  getBlueprintReferenceData
} from "@transport-break-even/shared";

const configuredApi =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:10000";
const API_BASE = configuredApi.replace(/\/api\/?$/, "").replace(/\/$/, "");

const fallbackReference = getBlueprintReferenceData();

const pages = [
  ["dashboard", "Dashboard"],
  ["company", "Company & Tax"],
  ["inputs", "Inputs"],
  ["results", "Break-even"],
  ["pricing", "Pricing"],
  ["sensitivity", "Sensitivity"],
  ["vehicles", "Vehicles"],
  ["history", "History"]
];

const inputSections = [
  {
    title: "Activity And Load",
    fields: [
      ["dailyKm", "Daily km", "km/day"],
      ["operatingDaysPerYear", "Operating days", "days/year"],
      ["loadFactor", "Loaded km share", "ratio"],
      ["payloadCapacityTons", "Payload capacity", "tons"],
      ["payloadUtilisation", "Payload utilisation", "ratio"]
    ]
  },
  {
    title: "Variable Cost",
    fields: [
      ["fuelConsumptionLPer100Km", "Fuel consumption", "l/100km"],
      ["fuelPricePerLiter", "Fuel price", "EUR/l"],
      ["tyresAnnualCost", "Tyres", "EUR/year"],
      ["maintenanceAnnualCost", "Maintenance", "EUR/year"],
      ["roadFeesAnnualCost", "Road fees", "EUR/year"]
    ]
  },
  {
    title: "Driver And Fixed Cost",
    fields: [
      ["driverSalaryAnnual", "Driver salary", "EUR/year"],
      ["driverPerDiemDaily", "Per diem", "EUR/day"],
      ["ownershipOrLeasingAnnual", "Ownership or leasing", "EUR/year"],
      ["insuranceAnnual", "Insurance", "EUR/year"],
      ["vehicleTaxAnnual", "Vehicle tax", "EUR/year"],
      ["structuralIndirectCostsAnnual", "Structural costs", "EUR/year"]
    ]
  },
  {
    title: "Pricing",
    fields: [
      ["markupPercentage", "Markup", "ratio"],
      ["targetAfterTaxMargin", "Target after-tax margin", "ratio"]
    ]
  }
];

export default function App() {
  const [reference, setReference] = useState(fallbackReference);
  const [activePage, setActivePage] = useState("dashboard");
  const [input, setInput] = useState(defaultBlueprintCalculationInput);
  const [runName, setRunName] = useState("Baseline pricing run");
  const [calculation, setCalculation] = useState(null);
  const [pricingScenarios, setPricingScenarios] = useState([]);
  const [sensitivity, setSensitivity] = useState(null);
  const [history, setHistory] = useState([]);
  const [exportPack, setExportPack] = useState(null);
  const [status, setStatus] = useState("Ready");

  const selectedCountry = useMemo(
    () => reference.countries.find((country) => country.id === input.countryId),
    [input.countryId, reference.countries]
  );
  const companyTypes = useMemo(
    () =>
      reference.companyTypes.filter(
        (companyType) => companyType.countryId === input.countryId
      ),
    [input.countryId, reference.companyTypes]
  );
  const selectedCompanyType = useMemo(
    () =>
      reference.companyTypes.find(
        (companyType) => companyType.id === input.companyTypeId
      ),
    [input.companyTypeId, reference.companyTypes]
  );
  const selectedBusinessModel = useMemo(
    () =>
      reference.businessModels.find(
        (businessModel) => businessModel.id === input.businessModelId
      ),
    [input.businessModelId, reference.businessModels]
  );
  const selectedVehicle = useMemo(
    () =>
      reference.vehicleClasses.find(
        (vehicleClass) => vehicleClass.id === input.vehicleClassId
      ),
    [input.vehicleClassId, reference.vehicleClasses]
  );
  const selectedTaxProfile = useMemo(
    () =>
      reference.taxProfiles.find(
        (profile) =>
          profile.countryId === input.countryId &&
          profile.companyTypeId === input.companyTypeId
      ) || reference.taxProfiles[0],
    [input.companyTypeId, input.countryId, reference.taxProfiles]
  );

  useEffect(() => {
    loadReferenceData();
    loadHistory();
  }, []);

  useEffect(() => {
    previewCalculation({ silent: true });
  }, []);

  const previewIsStale = calculation
    ? JSON.stringify(calculation.input) !== JSON.stringify(normalizedPreviewInput(input))
    : true;

  async function loadReferenceData() {
    try {
      const data = await apiRequest("/api/reference-data");
      if (data.blueprint) setReference(data.blueprint);
    } catch {
      setStatus("Using bundled reference data");
    }
  }

  async function loadHistory() {
    try {
      setHistory(await apiRequest("/api/calculations"));
    } catch {
      setHistory([]);
    }
  }

  function buildPayload(overrides = {}) {
    return {
      runName,
      input: normalizedPreviewInput({ ...input, ...overrides }),
      taxProfile: {
        ...selectedTaxProfile,
        vatRegistered: input.vatRegistered
      }
    };
  }

  async function previewCalculation(options = {}) {
    const payload = buildPayload();

    try {
      const [nextCalculation, nextPricing, nextSensitivity] = await Promise.all([
        apiRequest("/api/calculations/preview", {
          method: "POST",
          body: payload
        }),
        apiRequest("/api/pricing-scenarios/preview", {
          method: "POST",
          body: payload
        }),
        apiRequest("/api/sensitivity/preview", {
          method: "POST",
          body: payload
        })
      ]);
      setCalculation(nextCalculation);
      setPricingScenarios(nextPricing);
      setSensitivity(nextSensitivity);
      if (!options.silent) setStatus("Preview updated from backend");
    } catch (error) {
      const nextCalculation = calculateBreakEven(payload);
      setCalculation(nextCalculation);
      setPricingScenarios(generatePricingScenarios(payload));
      setSensitivity(generateSensitivity(payload));
      setStatus(
        options.silent
          ? "Using local preview until backend is running"
          : `Backend unavailable: ${error.message}. Showing local preview.`
      );
    }
  }

  async function saveRun() {
    const payload = buildPayload();

    try {
      const response = await apiRequest("/api/calculations", {
        method: "POST",
        body: payload
      });
      setStatus(`Saved run ${response.calculationRunId}`);
      await loadHistory();
      setActivePage("history");
    } catch (error) {
      setStatus(`Save needs backend: ${error.message}`);
    }
  }

  async function deleteRun(id) {
    try {
      await apiRequest(`/api/calculations/${id}`, { method: "DELETE" });
      setStatus("Run deleted");
      await loadHistory();
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    }
  }

  async function openRun(id) {
    try {
      const run = await apiRequest(`/api/calculations/${id}`);
      setInput(run.inputSnapshot);
      setRunName(run.runName || "Opened run");
      setCalculation({
        input: run.inputSnapshot,
        taxProfile: run.taxSnapshot,
        vehicleSnapshot: run.vehicleSnapshot,
        result: run.resultSnapshot,
        formulas: calculateBreakEven({
          input: run.inputSnapshot,
          taxProfile: run.taxSnapshot
        }).formulas
      });
      setPricingScenarios(run.pricingScenarios || []);
      setActivePage("results");
      setStatus(`Opened ${run.runName}`);
    } catch (error) {
      setStatus(`Open failed: ${error.message}`);
    }
  }

  async function exportRun(id) {
    try {
      const pack = await apiRequest(`/api/exports/${id}/json`);
      setExportPack(pack);
      setStatus("JSON audit pack loaded");
    } catch (error) {
      setStatus(`Export failed: ${error.message}`);
    }
  }

  function duplicateRun(run) {
    setInput(run.inputSnapshot || input);
    setRunName(`${run.runName || "Run"} copy`);
    setActivePage("inputs");
    setStatus("Run duplicated locally. Calculate and save when ready.");
  }

  function updateInput(field, value) {
    const normalized = value === "" ? "" : Number(value);
    if (value !== "" && !Number.isFinite(normalized)) return;
    setInput((current) => ({
      ...current,
      [field]: normalized
    }));
    setStatus("Unsaved changes");
  }

  function updateCountry(countryId) {
    const nextCountryId = Number(countryId);
    const nextCompanyType =
      reference.companyTypes.find(
        (companyType) => companyType.countryId === nextCountryId
      ) || reference.companyTypes[0];
    const nextTaxProfile =
      reference.taxProfiles.find(
        (profile) =>
          profile.countryId === nextCountryId &&
          profile.companyTypeId === nextCompanyType.id
      ) || selectedTaxProfile;

    setInput((current) => ({
      ...current,
      countryId: nextCountryId,
      companyTypeId: nextCompanyType.id,
      vatRegistered: nextTaxProfile.vatRegisteredDefault,
      vehicleTaxAnnual: nextTaxProfile.vehicleTaxDefaultAnnual
    }));
    setStatus("Country defaults applied");
  }

  function updateCompanyType(companyTypeId) {
    const nextCompanyTypeId = Number(companyTypeId);
    const nextTaxProfile =
      reference.taxProfiles.find(
        (profile) =>
          profile.countryId === input.countryId &&
          profile.companyTypeId === nextCompanyTypeId
      ) || selectedTaxProfile;

    setInput((current) => ({
      ...current,
      companyTypeId: nextCompanyTypeId,
      vatRegistered: nextTaxProfile.vatRegisteredDefault,
      vehicleTaxAnnual: nextTaxProfile.vehicleTaxDefaultAnnual
    }));
    setStatus("Company type defaults applied");
  }

  function updateVehicle(vehicleClassId) {
    const vehicle = reference.vehicleClasses.find(
      (item) => item.id === Number(vehicleClassId)
    );
    if (!vehicle) return;

    setInput((current) => ({
      ...current,
      vehicleClassId: vehicle.id,
      payloadCapacityTons: vehicle.payloadCapacityTons,
      payloadUtilisation: vehicle.typicalPayloadUtilisation,
      fuelConsumptionLPer100Km: vehicle.typicalFuelLPer100Km
    }));
    setStatus("Vehicle defaults applied");
  }

  const result = calculation?.result;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Transport Break-even Engine</p>
          <h1>Pricing Workspace</h1>
        </div>
        <nav className="page-nav" aria-label="Workflow">
          {pages.map(([key, label]) => (
            <button
              className={activePage === key ? "active" : ""}
              key={key}
              onClick={() => setActivePage(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-actions">
          <button className="primary-button" onClick={() => previewCalculation()} type="button">
            Calculate
          </button>
          <button className="secondary-button" onClick={saveRun} type="button">
            Save Run
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <label className="run-name">
              <span>Run name</span>
              <input
                onChange={(event) => setRunName(event.target.value)}
                value={runName}
              />
            </label>
          </div>
          <StatusPill stale={previewIsStale} status={status} />
        </header>

        {activePage === "dashboard" && (
          <DashboardPage
            input={input}
            pricingScenarios={pricingScenarios}
            result={result}
            selectedCountry={selectedCountry}
            selectedVehicle={selectedVehicle}
            setActivePage={setActivePage}
          />
        )}

        {activePage === "company" && (
          <CompanyTaxPage
            businessModels={reference.businessModels}
            companyTypes={companyTypes}
            input={input}
            selectedBusinessModel={selectedBusinessModel}
            selectedCompanyType={selectedCompanyType}
            selectedCountry={selectedCountry}
            selectedTaxProfile={selectedTaxProfile}
            taxProfiles={reference.taxProfiles}
            updateCompanyType={updateCompanyType}
            updateCountry={updateCountry}
            updateInput={updateInput}
            countries={reference.countries}
          />
        )}

        {activePage === "inputs" && (
          <TransportInputsPage
            input={input}
            result={result}
            selectedVehicle={selectedVehicle}
            updateInput={updateInput}
            updateVehicle={updateVehicle}
            vehicles={reference.vehicleClasses}
          />
        )}

        {activePage === "results" && (
          <BreakEvenResultsPage calculation={calculation} />
        )}

        {activePage === "pricing" && (
          <PricingPage
            pricingScenarios={pricingScenarios}
            result={result}
            updateInput={updateInput}
            input={input}
          />
        )}

        {activePage === "sensitivity" && (
          <SensitivityPage sensitivity={sensitivity} />
        )}

        {activePage === "vehicles" && (
          <VehicleClassesPage vehicles={reference.vehicleClasses} />
        )}

        {activePage === "history" && (
          <HistoryPage
            duplicateRun={duplicateRun}
            exportPack={exportPack}
            exportRun={exportRun}
            history={history}
            onDelete={deleteRun}
            onOpen={openRun}
          />
        )}
      </section>
    </main>
  );
}

function DashboardPage({
  input,
  pricingScenarios,
  result,
  selectedCountry,
  selectedVehicle,
  setActivePage
}) {
  return (
    <div className="page-stack">
      <section className="summary-grid">
        <Kpi label="Break-even" value={money(result?.breakEvenPerLoadedKm, 4)} unit="EUR/loaded km" />
        <Kpi label="Tonne-km" value={money(result?.breakEvenPerTonneKm, 4)} unit="EUR/tonne-km" />
        <Kpi label="Customer rate" value={money(result?.customerRateExclVat, 4)} unit="excl. VAT" />
        <Kpi label="After tax profit" value={money(result?.profitAfterTax, 0)} unit={percent(result?.afterTaxMargin)} />
      </section>

      <section className="two-column">
        <Card title="Workflow Status">
          <WorkflowList
            rows={[
              ["Company profile", selectedCountry?.name || "Not selected", "company"],
              ["Vehicle and load", selectedVehicle?.displayName || "Not selected", "inputs"],
              ["Break-even result", result ? money(result.breakEvenPerLoadedKm, 4) : "Needs calculation", "results"],
              ["Pricing scenarios", `${pricingScenarios.length} generated`, "pricing"]
            ]}
            setActivePage={setActivePage}
          />
        </Card>

        <Card title="Current Assumptions">
          <Fact label="Trucks" value={format(input.numberOfTrucks, 0)} />
          <Fact label="Daily km" value={format(input.dailyKm, 0)} />
          <Fact label="Operating days" value={format(input.operatingDaysPerYear, 0)} />
          <Fact label="Load factor" value={percent(input.loadFactor)} />
          <Fact label="Payload utilisation" value={percent(input.payloadUtilisation)} />
        </Card>
      </section>
    </div>
  );
}

function CompanyTaxPage({
  businessModels,
  companyTypes,
  countries,
  input,
  selectedTaxProfile,
  updateCompanyType,
  updateCountry,
  updateInput
}) {
  return (
    <div className="page-stack">
      <section className="form-grid">
        <Card title="Company Setup">
          <SelectField
            label="Country / jurisdiction"
            onChange={updateCountry}
            options={countries.map((country) => [country.id, country.name])}
            value={input.countryId}
          />
          <SelectField
            label="Company type"
            onChange={updateCompanyType}
            options={companyTypes.map((companyType) => [
              companyType.id,
              companyType.name
            ])}
            value={input.companyTypeId}
          />
          <SelectField
            label="Business model"
            onChange={(value) => updateInput("businessModelId", value)}
            options={businessModels.map((model) => [model.id, model.name])}
            value={input.businessModelId}
          />
          <NumberField
            field="numberOfTrucks"
            label="Number of trucks"
            onChange={updateInput}
            unit="trucks"
            value={input.numberOfTrucks}
          />
          <label className="checkbox-row">
            <input
              checked={Boolean(input.vatRegistered)}
              onChange={(event) =>
                updateInput("vatRegistered", event.target.checked ? 1 : 0)
              }
              type="checkbox"
            />
            <span>VAT registered</span>
          </label>
        </Card>

        <Card title="Tax Defaults">
          <Fact label="VAT rate" value={percent(selectedTaxProfile?.vatRate)} />
          <Fact
            label="Business tax"
            value={percent(selectedTaxProfile?.effectiveBusinessTaxRate)}
          />
          <Fact
            label="Employer contribution"
            value={percent(selectedTaxProfile?.employerContributionRate)}
          />
          <Fact
            label="Vehicle tax default"
            value={money(selectedTaxProfile?.vehicleTaxDefaultAnnual, 0)}
          />
          <Fact label="Source date" value={selectedTaxProfile?.sourceDate || "n/a"} />
          <p className="disclaimer">
            The tax profile is a modelling layer for business planning. It is not tax advice.
          </p>
        </Card>
      </section>
    </div>
  );
}

function TransportInputsPage({
  input,
  result,
  selectedVehicle,
  updateInput,
  updateVehicle,
  vehicles
}) {
  return (
    <div className="page-stack">
      <section className="form-grid">
        <Card title="Vehicle Class">
          <SelectField
            label="Vehicle"
            onChange={updateVehicle}
            options={vehicles.map((vehicle) => [vehicle.id, vehicle.displayName])}
            value={input.vehicleClassId}
          />
          <Fact label="Default payload" value={`${format(selectedVehicle?.payloadCapacityTons, 1)} t`} />
          <Fact
            label="Typical utilisation"
            value={percent(selectedVehicle?.typicalPayloadUtilisation)}
          />
          <p className="helper-text">{selectedVehicle?.regulatoryNote}</p>
        </Card>

        <Card title="Computed Preview">
          <Fact label="Annual total km" value={format(result?.annualTotalKm, 0)} />
          <Fact label="Loaded km" value={format(result?.loadedKmYear, 0)} />
          <Fact label="Effective payload" value={`${format(result?.effectivePayloadTons, 2)} t`} />
          <Fact label="Annual tonne-km" value={format(result?.annualTonneKm, 0)} />
        </Card>
      </section>

      {inputSections.map((section) => (
        <Card key={section.title} title={section.title}>
          <div className="field-grid">
            {section.fields.map(([field, label, unit]) => (
              <NumberField
                field={field}
                key={field}
                label={label}
                onChange={updateInput}
                unit={unit}
                value={input[field]}
              />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function BreakEvenResultsPage({ calculation }) {
  const result = calculation?.result;

  if (!result) return <EmptyState title="No result yet" text="Calculate a preview first." />;

  return (
    <div className="page-stack">
      <section className="summary-grid">
        <Kpi label="Total annual cost" value={money(result.totalAnnualCost, 0)} unit="EUR/year" />
        <Kpi label="Break-even loaded km" value={money(result.breakEvenPerLoadedKm, 4)} unit="EUR/km" />
        <Kpi label="Break-even tonne-km" value={money(result.breakEvenPerTonneKm, 4)} unit="EUR/t-km" />
        <Kpi label="EBIT before tax" value={money(result.ebitBeforeTax, 0)} unit="EUR/year" />
      </section>

      <section className="two-column">
        <Card title="Cost Breakdown">
          <Fact label="Variable annual cost" value={money(result.variableAnnualCost, 0)} />
          <Fact label="Driver annual cost" value={money(result.driverAnnualCost, 0)} />
          <Fact label="Vehicle fixed cost" value={money(result.vehicleFixedAnnualCost, 0)} />
          <Fact
            label="Structural indirect cost"
            value={money(calculation.input.structuralIndirectCostsAnnual, 0)}
          />
        </Card>

        <Card title="Tax And Profit">
          <Fact label="Annual revenue excl. VAT" value={money(result.annualRevenueExclVat, 0)} />
          <Fact label="VAT collected" value={money(result.vatCollected, 0)} />
          <Fact label="Business tax" value={money(result.businessTax, 0)} />
          <Fact label="Profit after tax" value={money(result.profitAfterTax, 0)} />
          <Fact label="After-tax margin" value={percent(result.afterTaxMargin)} />
        </Card>
      </section>

      <Card title="Formula Audit">
        <div className="formula-list">
          {calculation.formulas.map((formula) => (
            <details key={formula.field}>
              <summary>{formula.field}</summary>
              <p>{formula.formula}</p>
              <small>{formula.rounding}</small>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}

function PricingPage({ input, pricingScenarios, result, updateInput }) {
  if (!result) return <EmptyState title="No pricing yet" text="Calculate a preview first." />;

  return (
    <div className="page-stack">
      <section className="form-grid">
        <Card title="Selected Markup">
          <NumberField
            field="markupPercentage"
            label="Markup over break-even"
            onChange={updateInput}
            unit="ratio"
            value={input.markupPercentage}
          />
          <Fact label="Current rate excl. VAT" value={money(result.customerRateExclVat, 4)} />
          <Fact label="Current rate incl. VAT" value={money(result.customerRateInclVat, 4)} />
        </Card>

        <Card title="Markup Vs Margin">
          <p className="helper-text">
            A markup over break-even is not the same as a profit margin. The margin is calculated after revenue, cost and business tax.
          </p>
          <Fact label="EBIT" value={money(result.ebitBeforeTax, 0)} />
          <Fact label="After-tax margin" value={percent(result.afterTaxMargin)} />
        </Card>
      </section>

      <Card title="Generated Pricing Scenarios">
        <DataTable
          columns={["Markup", "Rate excl. VAT", "Rate incl. VAT", "EBIT", "Profit after tax", "After-tax margin"]}
          rows={pricingScenarios.map((row) => [
            percent(row.markupPercentage),
            money(row.customerRateExclVat, 4),
            money(row.customerRateInclVat, 4),
            money(row.ebitBeforeTax, 0),
            money(row.profitAfterTax, 0),
            percent(row.afterTaxMargin)
          ])}
        />
      </Card>
    </div>
  );
}

function SensitivityPage({ sensitivity }) {
  if (!sensitivity) return <EmptyState title="No sensitivity yet" text="Calculate a preview first." />;

  return (
    <div className="page-stack">
      <Card title="Vehicle Class Sensitivity">
        <DataTable
          columns={["Vehicle", "Payload", "EUR/loaded km", "EUR/tonne-km", "Annual tonne-km"]}
          rows={sensitivity.vehicleClassSensitivity.map((row) => [
            row.vehicleClassName,
            `${format(row.payloadCapacityTons, 1)} t`,
            money(row.breakEvenPerLoadedKm, 4),
            money(row.breakEvenPerTonneKm, 4),
            format(row.annualTonneKm, 0)
          ])}
        />
      </Card>

      <section className="two-column">
        <Card title="Payload Utilisation">
          <DataTable
            columns={["Utilisation", "EUR/tonne-km", "Annual tonne-km"]}
            rows={sensitivity.payloadUtilisationSensitivity.map((row) => [
              percent(row.payloadUtilisation),
              money(row.breakEvenPerTonneKm, 4),
              format(row.annualTonneKm, 0)
            ])}
          />
        </Card>

        <Card title="Fuel Price">
          <DataTable
            columns={["Fuel price", "Variable cost/km", "Total cost", "Break-even"]}
            rows={sensitivity.fuelPriceSensitivity.map((row) => [
              money(row.fuelPricePerLiter, 2),
              money(row.variableCostPerKm, 4),
              money(row.totalAnnualCost, 0),
              money(row.breakEvenPerLoadedKm, 4)
            ])}
          />
        </Card>
      </section>
    </div>
  );
}

function VehicleClassesPage({ vehicles }) {
  return (
    <Card title="Vehicle Classes">
      <DataTable
        columns={["Code", "Name", "GVW", "Payload", "Fuel", "Note"]}
        rows={vehicles.map((vehicle) => [
          vehicle.code,
          vehicle.displayName,
          `${format(vehicle.grossWeightTons, 1)} t`,
          `${format(vehicle.payloadCapacityTons, 1)} t`,
          `${format(vehicle.typicalFuelLPer100Km, 1)} l/100km`,
          vehicle.regulatoryNote
        ])}
      />
    </Card>
  );
}

function HistoryPage({
  duplicateRun,
  exportPack,
  exportRun,
  history,
  onDelete,
  onOpen
}) {
  return (
    <div className="page-stack">
      <Card title="Saved Runs">
        {history.length === 0 ? (
          <p className="helper-text">No saved runs are available in the active backend session.</p>
        ) : (
          <div className="history-list">
            {history.map((run) => (
              <article className="history-row" key={run.id}>
                <div>
                  <strong>{run.runName}</strong>
                  <span>
                    {run.country} | {run.companyType} | {dateTime(run.createdAt)}
                  </span>
                </div>
                <div className="history-metrics">
                  <span>{money(run.breakEvenPerLoadedKm, 4)}</span>
                  <span>{money(run.profitAfterTax, 0)}</span>
                </div>
                <div className="row-actions">
                  <button onClick={() => onOpen(run.id)} type="button">Open</button>
                  <button onClick={() => duplicateRun(run)} type="button">Duplicate</button>
                  <button onClick={() => exportRun(run.id)} type="button">JSON</button>
                  <button className="danger-button" onClick={() => onDelete(run.id)} type="button">Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      {exportPack && (
        <Card title="Audit Pack Preview">
          <pre className="json-preview">{JSON.stringify(exportPack, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
}

function WorkflowList({ rows, setActivePage }) {
  return (
    <div className="workflow-list">
      {rows.map(([label, value, page]) => (
        <button key={label} onClick={() => setActivePage(page)} type="button">
          <span>{label}</span>
          <strong>{value}</strong>
        </button>
      ))}
    </div>
  );
}

function Card({ children, title }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, unit, value }) {
  return (
    <article className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{unit}</small>
    </article>
  );
}

function NumberField({ field, label, onChange, unit, value }) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          inputMode="decimal"
          onChange={(event) => onChange(field, event.target.value)}
          step="any"
          type="number"
          value={value ?? ""}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}

function SelectField({ label, onChange, options, value }) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
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

function DataTable({ columns, rows }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ stale, status }) {
  return (
    <div className={`status-pill ${stale ? "stale" : ""}`}>
      <span>{stale ? "Needs calculate" : "Current"}</span>
      <strong>{status}</strong>
    </div>
  );
}

function EmptyState({ text, title }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      errorMessage = payload.error?.message || errorMessage;
    } catch {
      // Keep the HTTP status message.
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) return null;
  return response.json();
}

function normalizedPreviewInput(input) {
  return {
    ...input,
    vatRegistered: Boolean(input.vatRegistered)
  };
}

function money(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return `EUR ${format(value, digits)}`;
}

function percent(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return `${format(Number(value) * 100, digits)}%`;
}

function format(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function dateTime(value) {
  if (!value) return "n/a";
  return new Date(value).toLocaleString();
}
