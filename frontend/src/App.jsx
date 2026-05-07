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
      ["vehicleTaxAnnual", "Vehicle tax per vehicle", "EUR/year"],
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

const vehicleInputSections = inputSections.filter(
  (section) => section.title !== "Pricing"
);

const vehicleGroupFields = vehicleInputSections.flatMap((section) =>
  section.fields.map(([field]) => field)
);

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
  const fleetGroups = useMemo(
    () => getFleetGroups(input, reference.vehicleClasses),
    [input, reference.vehicleClasses]
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
  const normalizedInput = useMemo(
    () => normalizedPreviewInput(input, reference.vehicleClasses),
    [input, reference.vehicleClasses]
  );
  const currentTaxProfile = useMemo(
    () => ({
      ...selectedTaxProfile,
      vatRegistered: Boolean(input.vatRegistered)
    }),
    [input.vatRegistered, selectedTaxProfile]
  );
  const draftCalculation = useMemo(
    () => safeCalculateBreakEven({ input: normalizedInput, taxProfile: currentTaxProfile }),
    [currentTaxProfile, normalizedInput]
  );
  const draftPricingScenarios = useMemo(
    () => safeGeneratePricingScenarios({ input: normalizedInput, taxProfile: currentTaxProfile }),
    [currentTaxProfile, normalizedInput]
  );
  const draftSensitivity = useMemo(
    () => safeGenerateSensitivity({ input: normalizedInput, taxProfile: currentTaxProfile }),
    [currentTaxProfile, normalizedInput]
  );

  useEffect(() => {
    loadReferenceData();
    loadHistory();
  }, []);

  useEffect(() => {
    previewCalculation({ silent: true });
  }, []);

  const previewIsStale = calculation
    ? JSON.stringify(calculation.input) !==
      JSON.stringify(normalizedInput)
    : true;
  const displayCalculation = previewIsStale
    ? draftCalculation
    : calculation || draftCalculation;
  const displayPricingScenarios = previewIsStale
    ? draftPricingScenarios
    : pricingScenarios;
  const displaySensitivity = previewIsStale
    ? draftSensitivity
    : sensitivity;

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
      input: normalizedPreviewInput({ ...input, ...overrides }, reference.vehicleClasses),
      taxProfile: currentTaxProfile
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
      const openedInput = normalizedPreviewInput(
        run.inputSnapshot || input,
        reference.vehicleClasses
      );
      const openedCalculation = calculateBreakEven({
        input: openedInput,
        taxProfile: run.taxSnapshot
      });
      setInput(openedInput);
      setRunName(run.runName || "Opened run");
      setCalculation({
        input: openedInput,
        taxProfile: run.taxSnapshot,
        vehicleSnapshot: run.vehicleSnapshot,
        result: openedCalculation.result,
        formulas: openedCalculation.formulas
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
    setInput(normalizedPreviewInput(run.inputSnapshot || input, reference.vehicleClasses));
    setRunName(`${run.runName || "Run"} copy`);
    setActivePage("inputs");
    setStatus("Run duplicated locally. Calculate and save when ready.");
  }

  function updateInput(field, value) {
    const normalized = value === "" ? "" : Number(value);
    if (value !== "" && !Number.isFinite(normalized)) return;
    setInput((current) => ({
      ...current,
      [field]: normalized,
      vehicleGroups: shouldApplyFieldToVehicleGroups(field)
        ? getFleetGroups(current, reference.vehicleClasses).map((group) => ({
            ...group,
            [field]: normalized
          }))
        : current.vehicleGroups
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
      vehicleGroups: getFleetGroups(current, reference.vehicleClasses)
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
      vehicleGroups: getFleetGroups(current, reference.vehicleClasses)
    }));
    setStatus("Company type defaults applied");
  }

  function updateVehicleGroup(index, field, value) {
    setInput((current) => {
      const groups = getFleetGroups(current, reference.vehicleClasses);
      const nextGroups = groups.map((group, groupIndex) => {
        if (groupIndex !== index) return group;

        if (field === "name") {
          return {
            ...group,
            name: value
          };
        }

        const normalized = value === "" ? "" : Number(value);
        if (value !== "" && !Number.isFinite(normalized)) return group;
        if (field === "vehicleCount") {
          return {
            ...group,
            vehicleCount: value === "" ? "" : normaliseVehicleCount(normalized)
          };
        }

        if (field === "vehicleClassId") {
          const vehicle = reference.vehicleClasses.find(
            (item) => item.id === Number(value)
          );
          const previousVehicle = reference.vehicleClasses.find(
            (item) => item.id === Number(group.vehicleClassId)
          );
          return vehicle
            ? applyVehicleDefaultsToGroup(group, vehicle, previousVehicle)
            : group;
        }

        return {
          ...group,
          [field]: normalized
        };
      });

      return syncInputWithFleetGroups(current, nextGroups);
    });
    setStatus("Unsaved fleet changes");
  }

  function addVehicleGroup() {
    setInput((current) => {
      const groups = getFleetGroups(current, reference.vehicleClasses);
      const sourceGroup = groups[groups.length - 1] || getFleetGroups(current, reference.vehicleClasses)[0];
      const nextGroup = {
        ...sourceGroup,
        id: `group-${Date.now()}`,
        name: `Vehicle group ${groups.length + 1}`,
        vehicleCount: 1
      };
      return syncInputWithFleetGroups(current, [...groups, nextGroup]);
    });
    setStatus("Vehicle group added");
  }

  function removeVehicleGroup(index) {
    setInput((current) => {
      const groups = getFleetGroups(current, reference.vehicleClasses);
      if (groups.length <= 1) return current;
      const nextGroups = groups.filter((_, groupIndex) => groupIndex !== index);
      return syncInputWithFleetGroups(current, nextGroups);
    });
    setStatus("Vehicle group removed");
  }

  const result = displayCalculation?.result;

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
            fleetGroups={fleetGroups}
            input={input}
            previewIsStale={previewIsStale}
            pricingScenarios={displayPricingScenarios}
            result={result}
            selectedBusinessModel={selectedBusinessModel}
            selectedCompanyType={selectedCompanyType}
            selectedCountry={selectedCountry}
            selectedTaxProfile={selectedTaxProfile}
            setActivePage={setActivePage}
            vatRegistered={Boolean(input.vatRegistered)}
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
            addVehicleGroup={addVehicleGroup}
            fleetGroups={fleetGroups}
            input={input}
            removeVehicleGroup={removeVehicleGroup}
            result={result}
            updateVehicleGroup={updateVehicleGroup}
            updateInput={updateInput}
            vehicles={reference.vehicleClasses}
          />
        )}

        {activePage === "results" && (
          <BreakEvenResultsPage calculation={displayCalculation} />
        )}

        {activePage === "pricing" && (
          <PricingPage
            pricingScenarios={displayPricingScenarios}
            result={result}
            updateInput={updateInput}
            input={input}
          />
        )}

        {activePage === "sensitivity" && (
          <SensitivityPage sensitivity={displaySensitivity} />
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
  fleetGroups,
  previewIsStale,
  pricingScenarios,
  result,
  selectedBusinessModel,
  selectedCompanyType,
  selectedCountry,
  selectedTaxProfile,
  setActivePage,
  vatRegistered
}) {
  const fleetStats = getFleetDraftStats(fleetGroups, result);
  const groupRows = buildDashboardGroupRows(fleetGroups, result);

  return (
    <div className="page-stack">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Fleet dashboard</p>
          <h2>{fleetStats.modeLabel}</h2>
          <div className="dashboard-meta">
            <span>{selectedCountry?.name || "No country"}</span>
            <span>{selectedCompanyType?.name || "No company type"}</span>
            <span>{selectedBusinessModel?.name || "No business model"}</span>
            <span>{previewIsStale ? "Draft preview" : "Calculated"}</span>
          </div>
        </div>
        <div className="dashboard-actions">
          <button onClick={() => setActivePage("inputs")} type="button">
            Edit Fleet
          </button>
          <button onClick={() => setActivePage("results")} type="button">
            Break-even
          </button>
        </div>
      </section>

      <section className="summary-grid">
        <Kpi label="Global annual cost" value={money(result?.totalAnnualCost)} unit="EUR/year" />
        <Kpi label="Global break-even" value={money(result?.breakEvenPerLoadedKm)} unit="EUR/loaded km" />
        <Kpi label="Global tonne-km" value={money(result?.breakEvenPerTonneKm)} unit="EUR/t-km" />
        <Kpi label="After tax profit" value={money(result?.profitAfterTax)} unit={percent(result?.afterTaxMargin)} />
      </section>

      <section className="dashboard-metrics-grid">
        <MetricTile label="Vehicles" value={formatCount(fleetStats.vehicleCount)} />
        <MetricTile label="Groups" value={formatCount(fleetStats.groupCount)} />
        <MetricTile label="Loaded km/year" value={format(result?.loadedKmYear)} />
        <MetricTile label="Tonne-km/year" value={format(result?.annualTonneKm)} />
        <MetricTile label="Average payload" value={`${format(result?.effectivePayloadTons)} t`} />
        <MetricTile label="VAT" value={vatRegistered ? percent(selectedTaxProfile?.vatRate) : "0.00%"} />
      </section>

      <section className="dashboard-panel">
        <div className="panel-heading">
          <h2>Break-even By Fleet Group</h2>
          <span>Global: {money(result?.breakEvenPerLoadedKm)} / loaded km</span>
        </div>
        <DataTable
          columns={[
            "Group",
            "Vehicle type",
            "Vehicles",
            "Annual cost",
            "Break-even loaded km",
            "Break-even tonne-km",
            "Customer rate",
            "Profit after tax"
          ]}
          rows={groupRows.map((group) => [
            group.name,
            group.vehicleClassName,
            formatCount(group.vehicleCount),
            money(group.totalAnnualCost),
            money(group.breakEvenPerLoadedKm),
            money(group.breakEvenPerTonneKm),
            money(group.customerRateExclVat),
            money(group.profitAfterTax)
          ])}
        />
      </section>

      <section className="dashboard-layout">
        <section className="dashboard-panel">
          <div className="panel-heading">
            <h2>Fleet Mix</h2>
            <span>{fleetStats.modeLabel}</span>
          </div>
          <div className="fleet-group-list">
            {groupRows.map((group) => (
              <FleetMixRow group={group} key={group.id} />
            ))}
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="panel-heading">
            <h2>Commercial Assumptions</h2>
            <span>{previewIsStale ? "Draft" : "Current"}</span>
          </div>
          <Fact label="Country" value={selectedCountry?.name || "n/a"} />
          <Fact label="Company type" value={selectedCompanyType?.name || "n/a"} />
          <Fact label="Business model" value={selectedBusinessModel?.name || "n/a"} />
          <Fact label="Markup" value={percent(fleetStats.markupPercentage)} />
          <Fact label="Business tax" value={percent(selectedTaxProfile?.effectiveBusinessTaxRate)} />
          <Fact label="Pricing scenarios" value={formatCount(pricingScenarios.length)} />
        </section>

        <section className="dashboard-panel">
          <div className="panel-heading">
            <h2>Operating Shape</h2>
            <span>{formatCount(fleetStats.vehicleCount)} vehicles</span>
          </div>
          <Fact label="Annual total km" value={format(result?.annualTotalKm)} />
          <Fact label="Loaded km" value={format(result?.loadedKmYear)} />
          <Fact label="Load factor" value={percent(fleetStats.weightedLoadFactor)} />
          <Fact label="Fuel cost/km" value={money(result?.fuelCostPerKm)} />
          <Fact label="Variable cost/km" value={money(result?.variableCostPerKm)} />
          <Fact label="Fixed and driver cost" value={money((result?.driverAnnualCost || 0) + (result?.vehicleFixedAnnualCost || 0))} />
        </section>
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
          <Fact label="Fleet vehicles" value={formatCount(input.numberOfTrucks)} />
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
  addVehicleGroup,
  fleetGroups,
  input,
  removeVehicleGroup,
  result,
  updateInput,
  updateVehicleGroup,
  vehicles
}) {
  return (
    <div className="page-stack">
      <section className="form-grid">
        <Card title="Fleet Strategy">
          <Fact label="Scenario" value={fleetModeLabel(result?.fleetMode, fleetGroups)} />
          <Fact label="Vehicle groups" value={formatCount(fleetGroups.length)} />
          <Fact
            label="Vehicles"
            value={formatCount(result?.vehicleCount ?? input.numberOfTrucks)}
          />
          <button className="secondary-button inline-action" onClick={addVehicleGroup} type="button">
            Add vehicle group
          </button>
        </Card>

        <Card title="Computed Fleet Preview">
          <Fact label="Annual total km" value={format(result?.annualTotalKm)} />
          <Fact label="Loaded km" value={format(result?.loadedKmYear)} />
          <Fact label="Average effective payload" value={`${format(result?.effectivePayloadTons)} t`} />
          <Fact label="Annual tonne-km" value={format(result?.annualTonneKm)} />
        </Card>
      </section>

      {fleetGroups.map((group, index) => {
        const selectedVehicle = vehicles.find(
          (vehicle) => vehicle.id === Number(group.vehicleClassId)
        );
        const groupResult = result?.vehicleGroupResults?.find(
          (row) => row.id === group.id
        );

        return (
          <Card key={group.id || index} title={group.name || `Vehicle group ${index + 1}`}>
            <div className="group-toolbar">
              <TextField
                label="Group name"
                onChange={(value) => updateVehicleGroup(index, "name", value)}
                value={group.name}
              />
              <SelectField
                label="Vehicle type"
                onChange={(value) => updateVehicleGroup(index, "vehicleClassId", value)}
                options={vehicles.map((vehicle) => [
                  vehicle.id,
                  `${vehicle.displayName} - ${format(vehicle.payloadCapacityTons)} t payload`
                ])}
                value={group.vehicleClassId}
              />
              <NumberField
                field="vehicleCount"
                label="Vehicles in group"
                onChange={(field, value) => updateVehicleGroup(index, field, value)}
                unit="vehicles"
                value={group.vehicleCount}
                integer
              />
            </div>

            <div className="group-summary">
              <Fact label="Best for" value={selectedVehicle?.bestFor || "n/a"} />
              <Fact label="Per vehicle annual cost" value={money(groupResult?.perVehicle?.totalAnnualCost)} />
              <Fact label="Group annual cost" value={groupCostFormula(groupResult)} />
              <Fact label="Group break-even" value={money(groupResult?.groupTotals?.breakEvenPerLoadedKm)} />
            </div>

            {vehicleInputSections.map((section) => (
              <div className="subsection" key={`${group.id}-${section.title}`}>
                <h3>{section.title}</h3>
                <div className="field-grid">
                  {section.fields.map(([field, label, unit]) => (
                    <NumberField
                      field={field}
                      key={field}
                      label={label}
                      onChange={(fieldName, value) =>
                        updateVehicleGroup(index, fieldName, value)
                      }
                      unit={unit}
                      value={group[field]}
                    />
                  ))}
                </div>
              </div>
            ))}

            {fleetGroups.length > 1 && (
              <button
                className="danger-link"
                onClick={() => removeVehicleGroup(index)}
                type="button"
              >
                Remove group
              </button>
            )}
          </Card>
        );
      })}

      <Card title="Fleet Pricing">
        <div className="field-grid compact-fields">
          {inputSections
            .find((section) => section.title === "Pricing")
            .fields.map(([field, label, unit]) => (
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
            value={money(result.structuralIndirectCostsAnnual)}
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

      {result.vehicleGroupResults?.length > 0 && (
        <Card title="Vehicle Group Breakdown">
          <DataTable
            columns={[
              "Group",
              "Vehicle type",
              "Vehicles",
              "Annual cost",
              "Break-even loaded km",
              "Break-even tonne-km",
              "Customer rate",
              "Profit after tax"
            ]}
            rows={result.vehicleGroupResults.map((group) => [
              group.name,
              group.vehicleClassName,
              formatCount(group.vehicleCount),
              money(group.groupTotals.totalAnnualCost),
              money(group.groupTotals.breakEvenPerLoadedKm),
              money(group.groupTotals.breakEvenPerTonneKm),
              money(group.groupTotals.customerRateExclVat),
              money(group.groupTotals.profitAfterTax)
            ])}
          />
        </Card>
      )}

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
        columns={["Code", "Name", "Best for", "GVW", "Payload", "Fuel", "Note"]}
        rows={vehicles.map((vehicle) => [
          vehicle.code,
          vehicle.displayName,
          vehicle.bestFor,
          `${format(vehicle.grossWeightTons)} t`,
          `${format(vehicle.payloadCapacityTons)} t`,
          `${format(vehicle.typicalFuelLPer100Km)} l/100km`,
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

function MetricTile({ label, value }) {
  return (
    <article className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function FleetMixRow({ group }) {
  return (
    <article className="fleet-mix-row">
      <div className="fleet-row-main">
        <strong>{group.name}</strong>
        <span>{group.vehicleClassName}</span>
        <div className="cost-share-track" aria-hidden="true">
          <span style={{ width: `${group.costShare}%` }} />
        </div>
      </div>
      <div className="fleet-mix-values">
        <span>{formatCount(group.vehicleCount)} vehicles</span>
        <strong>{format(group.costShare)}%</strong>
      </div>
    </article>
  );
}

function NumberField({ field, integer = false, label, onChange, unit, value }) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          inputMode={integer ? "numeric" : "decimal"}
          onChange={(event) => onChange(field, event.target.value)}
          step={integer ? "1" : "0.01"}
          type="number"
          value={integer ? formatInputInteger(value) : formatInputNumber(value)}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}

function TextField({ label, onChange, value }) {
  return (
    <label className="text-field">
      <span>{label}</span>
      <input onChange={(event) => onChange(event.target.value)} value={value ?? ""} />
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

function getFleetGroups(input, vehicles = []) {
  if (Array.isArray(input.vehicleGroups) && input.vehicleGroups.length > 0) {
    return input.vehicleGroups.map((group, index) =>
      normalizeFleetGroupForUi(group, input, vehicles, index)
    );
  }

  return [
    normalizeFleetGroupForUi(
      {
        ...input,
        id: "group-1",
        name:
          vehicles.find((vehicle) => vehicle.id === Number(input.vehicleClassId))
            ?.displayName || "Vehicle group 1",
        vehicleCount: normaliseVehicleCount(input.numberOfTrucks || 1)
      },
      input,
      vehicles,
      0
    )
  ];
}

function normalizeFleetGroupForUi(group, input, vehicles, index) {
  const vehicle =
    vehicles.find((item) => item.id === Number(group.vehicleClassId)) ||
    vehicles.find((item) => item.id === Number(input.vehicleClassId)) ||
    vehicles[0];

  return {
    id: group.id || `group-${index + 1}`,
    name: group.name || vehicle?.displayName || `Vehicle group ${index + 1}`,
    vehicleClassId: Number(group.vehicleClassId ?? vehicle?.id ?? input.vehicleClassId),
    vehicleCount: normaliseVehicleCount(group.vehicleCount ?? group.numberOfTrucks ?? 1),
    dailyKm: Number(group.dailyKm ?? input.dailyKm),
    operatingDaysPerYear: Number(
      group.operatingDaysPerYear ?? input.operatingDaysPerYear
    ),
    loadFactor: Number(group.loadFactor ?? input.loadFactor),
    payloadCapacityTons: Number(
      group.payloadCapacityTons ?? vehicle?.payloadCapacityTons ?? input.payloadCapacityTons
    ),
    payloadUtilisation: Number(
      group.payloadUtilisation ??
        vehicle?.typicalPayloadUtilisation ??
        input.payloadUtilisation
    ),
    fuelConsumptionLPer100Km: Number(
      group.fuelConsumptionLPer100Km ??
        vehicle?.typicalFuelLPer100Km ??
        input.fuelConsumptionLPer100Km
    ),
    fuelPricePerLiter: Number(group.fuelPricePerLiter ?? input.fuelPricePerLiter),
    tyresAnnualCost: Number(group.tyresAnnualCost ?? input.tyresAnnualCost),
    maintenanceAnnualCost: Number(
      group.maintenanceAnnualCost ?? input.maintenanceAnnualCost
    ),
    roadFeesAnnualCost: Number(group.roadFeesAnnualCost ?? input.roadFeesAnnualCost),
    driverSalaryAnnual: Number(group.driverSalaryAnnual ?? input.driverSalaryAnnual),
    driverPerDiemDaily: Number(group.driverPerDiemDaily ?? input.driverPerDiemDaily),
    ownershipOrLeasingAnnual: Number(
      group.ownershipOrLeasingAnnual ??
        vehicle?.annualFixedCostProxy ??
        input.ownershipOrLeasingAnnual
    ),
    insuranceAnnual: Number(group.insuranceAnnual ?? input.insuranceAnnual),
    vehicleTaxAnnual: Number(group.vehicleTaxAnnual ?? input.vehicleTaxAnnual),
    structuralIndirectCostsAnnual: Number(
      group.structuralIndirectCostsAnnual ?? input.structuralIndirectCostsAnnual
    ),
    markupPercentage: Number(group.markupPercentage ?? input.markupPercentage),
    targetAfterTaxMargin: Number(
      group.targetAfterTaxMargin ?? input.targetAfterTaxMargin
    )
  };
}

function syncInputWithFleetGroups(input, groups) {
  const firstGroup = groups[0] || getFleetGroups(input)[0];
  const nextInput = {
    ...input,
    ...copyGroupFieldsToInput(firstGroup),
    numberOfTrucks: groups.reduce((sum, group) => sum + vehicleCountValue(group), 0),
    vehicleClassId: firstGroup.vehicleClassId,
    vehicleGroups: groups
  };

  return nextInput;
}

function copyGroupFieldsToInput(group) {
  const fields = [
    "vehicleClassId",
    ...vehicleGroupFields,
    "markupPercentage",
    "targetAfterTaxMargin"
  ];
  const nextFields = {};

  for (const field of fields) {
    nextFields[field] = group[field];
  }

  return nextFields;
}

function applyVehicleDefaultsToGroup(group, vehicle, previousVehicle) {
  const shouldRenameGroup =
    !group.name ||
    group.name === previousVehicle?.displayName ||
    /^Vehicle group \d+$/.test(group.name);

  return {
    ...group,
    vehicleClassId: vehicle.id,
    name: shouldRenameGroup ? vehicle.displayName : group.name,
    payloadCapacityTons: vehicle.payloadCapacityTons,
    payloadUtilisation: vehicle.typicalPayloadUtilisation,
    fuelConsumptionLPer100Km: vehicle.typicalFuelLPer100Km,
    ownershipOrLeasingAnnual: vehicle.annualFixedCostProxy
  };
}

function shouldApplyFieldToVehicleGroups(field) {
  return [
    ...vehicleGroupFields,
    "markupPercentage",
    "targetAfterTaxMargin"
  ].includes(field);
}

function fleetModeLabel(mode, fleetGroups = []) {
  if (mode === "mixed_type_fleet") return "Mixed vehicle types";
  if (mode === "same_type_fleet") return "Multiple vehicles, same type";
  if (mode === "single_vehicle") return "Single vehicle";

  const uniqueVehicleClasses = new Set(
    fleetGroups.map((group) => Number(group.vehicleClassId))
  );
  const vehicleCount = fleetGroups.reduce(
    (sum, group) => sum + vehicleCountValue(group),
    0
  );

  if (vehicleCount <= 1) return "Single vehicle";
  return uniqueVehicleClasses.size > 1
    ? "Mixed vehicle types"
    : "Multiple vehicles, same type";
}

function getFleetDraftStats(fleetGroups, result) {
  const vehicleCount = fleetGroups.reduce(
    (sum, group) => sum + vehicleCountValue(group),
    0
  );
  const weightedAnnualKm = fleetGroups.reduce(
    (sum, group) =>
      sum + vehicleCountValue(group) * Number(group.dailyKm || 0) * Number(group.operatingDaysPerYear || 0),
    0
  );
  const weightedLoadedKm = fleetGroups.reduce(
    (sum, group) =>
      sum +
      vehicleCountValue(group) *
        Number(group.dailyKm || 0) *
        Number(group.operatingDaysPerYear || 0) *
        Number(group.loadFactor || 0),
    0
  );

  return {
    groupCount: fleetGroups.length,
    markupPercentage: fleetGroups[0]?.markupPercentage,
    modeLabel: fleetModeLabel(result?.fleetMode, fleetGroups),
    vehicleCount,
    weightedLoadFactor:
      result?.annualTotalKm > 0
        ? result.loadedKmYear / result.annualTotalKm
        : safeRatio(weightedLoadedKm, weightedAnnualKm)
  };
}

function buildDashboardGroupRows(fleetGroups, result) {
  const resultsById = new Map(
    (result?.vehicleGroupResults || []).map((group) => [group.id, group])
  );
  const totalCost = result?.totalAnnualCost || 0;

  return fleetGroups.map((group, index) => {
    const resultGroup = resultsById.get(group.id);
    const totalAnnualCost = resultGroup?.groupTotals?.totalAnnualCost;

    return {
      id: group.id || `group-${index + 1}`,
      name: group.name || `Vehicle group ${index + 1}`,
      vehicleClassName: resultGroup?.vehicleClassName || "Vehicle type",
      vehicleCount: group.vehicleCount,
      dailyKm: group.dailyKm,
      loadFactor: group.loadFactor,
      effectivePayloadTons:
        resultGroup?.perVehicle?.effectivePayloadTons ??
        Number(group.payloadCapacityTons || 0) * Number(group.payloadUtilisation || 0),
      totalAnnualCost,
      breakEvenPerLoadedKm: resultGroup?.groupTotals?.breakEvenPerLoadedKm,
      breakEvenPerTonneKm: resultGroup?.groupTotals?.breakEvenPerTonneKm,
      customerRateExclVat: resultGroup?.groupTotals?.customerRateExclVat,
      profitAfterTax: resultGroup?.groupTotals?.profitAfterTax,
      costShare: clampPercent(safeRatio(totalAnnualCost, totalCost) * 100)
    };
  });
}

function safeCalculateBreakEven(payload) {
  try {
    return calculateBreakEven(payload);
  } catch {
    return null;
  }
}

function safeGeneratePricingScenarios(payload) {
  try {
    return generatePricingScenarios(payload);
  } catch {
    return [];
  }
}

function safeGenerateSensitivity(payload) {
  try {
    return generateSensitivity(payload);
  } catch {
    return null;
  }
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

function normalizedPreviewInput(input, vehicles = []) {
  const vehicleGroups = getFleetGroups(input, vehicles);

  return {
    ...input,
    ...copyGroupFieldsToInput(vehicleGroups[0]),
    numberOfTrucks: vehicleGroups.reduce(
      (sum, group) => sum + vehicleCountValue(group),
      0
    ),
    vehicleGroups,
    vatRegistered: Boolean(input.vatRegistered)
  };
}

function money(value) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return `EUR ${format(value)}`;
}

function percent(value) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return `${format(Number(value) * 100)}%`;
}

function format(value) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });
}

function formatCount(value) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return String(normaliseVehicleCount(value));
}

function groupCostFormula(groupResult) {
  if (!groupResult?.perVehicle || !groupResult?.groupTotals) return "n/a";
  return `${money(groupResult.perVehicle.totalAnnualCost)} x ${formatCount(groupResult.vehicleCount)} = ${money(groupResult.groupTotals.totalAnnualCost)}`;
}

function formatInputNumber(value) {
  if (value === "" || value == null || Number.isNaN(Number(value))) return "";
  return Number(value).toFixed(2);
}

function formatInputInteger(value) {
  if (value === "" || value == null || Number.isNaN(Number(value))) return "";
  return String(normaliseVehicleCount(value));
}

function normaliseVehicleCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Math.max(1, Math.round(number));
}

function vehicleCountValue(group) {
  const count = normaliseVehicleCount(group.vehicleCount);
  return count === "" ? 0 : count;
}

function safeRatio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function clampPercent(value) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.min(100, Number(value)));
}

function dateTime(value) {
  if (!value) return "n/a";
  return new Date(value).toLocaleString();
}
