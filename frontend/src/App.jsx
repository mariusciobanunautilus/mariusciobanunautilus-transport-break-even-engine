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

const localeByCountryCode = {
  AT: "de-AT",
  BG: "bg-BG",
  CZ: "cs-CZ",
  DE: "de-DE",
  HU: "hu-HU",
  MANUAL: "en-GB",
  RO: "ro-RO",
  SK: "sk-SK"
};

let activeFormatContext = {
  currency: "EUR",
  locale: "en-US"
};

const metricHelp = {
  "Annual cost": "Total yearly cost for the selected fleet or vehicle group.",
  "Annual total km": "All kilometres driven in a year, loaded and empty.",
  "Average payload": "Weighted effective payload after applying payload utilisation.",
  "Break-even": "The minimum customer rate needed to cover annual cost before markup.",
  "Break-even loaded km": "Annual cost divided by loaded kilometres.",
  "Break-even tonne-km": "Annual cost divided by transported tonne-kilometres.",
  "Customer rate": "The rate charged to the customer after markup, excluding VAT.",
  "EBIT before tax": "Profit before business tax.",
  "Global annual cost": "Total yearly cost across all vehicle groups.",
  "Global break-even": "Fleet-wide break-even per loaded kilometre.",
  "Global tonne-km": "Fleet-wide break-even per transported tonne-kilometre.",
  "Loaded km": "Kilometres driven with payable freight.",
  "Loaded km/year": "Annual loaded kilometres across the fleet.",
  "Profit after tax": "Profit after applying the selected business tax profile.",
  "Tonne-km/year": "Loaded kilometres multiplied by effective payload.",
  VAT: "Value-added tax applied to customer invoices when VAT registered."
};

export default function App() {
  const [reference, setReference] = useState(fallbackReference);
  const [activePage, setActivePage] = useState(() => pageFromHash());
  const [input, setInput] = useState(defaultBlueprintCalculationInput);
  const [runName, setRunName] = useState("Baseline pricing run");
  const [calculation, setCalculation] = useState(null);
  const [pricingScenarios, setPricingScenarios] = useState([]);
  const [sensitivity, setSensitivity] = useState(null);
  const [history, setHistory] = useState([]);
  const [exportPack, setExportPack] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [undoStack, setUndoStack] = useState([]);

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

  useEffect(() => {
    const handleHashChange = () => setActivePage(pageFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!saveNotice) return undefined;
    const timer = window.setTimeout(() => setSaveNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

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
  const activePageLabel = pages.find(([key]) => key === activePage)?.[1] || "Dashboard";
  const currentCountry = selectedCountry || reference.countries[0];
  setActiveFormatContext(currentCountry);

  function selectPage(page) {
    const nextPage = pages.some(([key]) => key === page) ? page : "dashboard";
    setActivePage(nextPage);
    if (window.location.hash !== `#/${nextPage}`) {
      window.history.replaceState(null, "", `#/${nextPage}`);
    }
  }

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
    setIsCalculating(true);
    if (!options.silent) setStatus("Calculating");

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
      if (!options.silent) setStatus("Calculated");
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
    } finally {
      setIsCalculating(false);
    }
  }

  async function saveRun() {
    const payload = buildPayload();
    setIsSaving(true);

    try {
      const response = await apiRequest("/api/calculations", {
        method: "POST",
        body: payload
      });
      setCalculation(calculateBreakEven(payload));
      setPricingScenarios(generatePricingScenarios(payload));
      setSensitivity(generateSensitivity(payload));
      setStatus("Saved");
      setSaveNotice(`Saved "${response.savedRun?.runName || runName}" to History`);
      await loadHistory();
      selectPage("history");
    } catch (error) {
      setStatus(`Save needs backend: ${error.message}`);
    } finally {
      setIsSaving(false);
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
      selectPage("results");
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
    selectPage("inputs");
    setStatus("Run duplicated locally. Calculate and save when ready.");
  }

  function exportCurrentCsv() {
    if (!displayCalculation?.result) return;
    const csv = buildCurrentScenarioCsv(runName, displayCalculation.result);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(runName || "pricing-run")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setSaveNotice("CSV export prepared");
  }

  function printCurrentScenario() {
    window.print();
  }

  function rememberInputSnapshot() {
    setUndoStack((stack) => [input, ...stack].slice(0, 10));
  }

  function undoLastInputChange() {
    setUndoStack((stack) => {
      const [previous, ...rest] = stack;
      if (previous) {
        setInput(previous);
        setStatus("Last input change undone");
      }
      return rest;
    });
  }

  function resetInputsToDefaults() {
    rememberInputSnapshot();
    setInput(defaultBlueprintCalculationInput);
    setStatus("Defaults restored");
  }

  function updateInput(field, value) {
    const normalized = value === "" ? "" : Number(value);
    if (value !== "" && !Number.isFinite(normalized)) return;
    rememberInputSnapshot();
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

    rememberInputSnapshot();
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

    rememberInputSnapshot();
    setInput((current) => ({
      ...current,
      companyTypeId: nextCompanyTypeId,
      vatRegistered: nextTaxProfile.vatRegisteredDefault,
      vehicleGroups: getFleetGroups(current, reference.vehicleClasses)
    }));
    setStatus("Company type defaults applied");
  }

  function updateVehicleGroup(index, field, value) {
    rememberInputSnapshot();
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
    rememberInputSnapshot();
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
    rememberInputSnapshot();
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
              onClick={() => selectPage(key)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="breadcrumb-bar">
            <span>Pricing Workspace</span>
            <strong>{activePageLabel}</strong>
          </div>
          <div className="run-strip">
            <label className="run-name">
              <span>Run</span>
              <input
                onChange={(event) => setRunName(event.target.value)}
                value={runName}
              />
            </label>
            <StatusPill stale={previewIsStale} status={status} />
            <button
              className="primary-button"
              disabled={isCalculating}
              onClick={() => previewCalculation()}
              type="button"
            >
              {isCalculating ? "Calculating..." : previewIsStale ? "Recalculate" : "Calculate"}
            </button>
            <button className="secondary-button" disabled={isSaving} onClick={saveRun} type="button">
              {isSaving ? "Saving..." : "Save Run"}
            </button>
          </div>
        </header>

        {previewIsStale && (
          <StaleBanner isCalculating={isCalculating} onCalculate={() => previewCalculation()} />
        )}

        {saveNotice && <Toast message={saveNotice} />}

        {activePage === "dashboard" && (
          <DashboardPage
            fleetGroups={fleetGroups}
            historyCount={history.length}
            input={input}
            onExportCsv={exportCurrentCsv}
            onPrintPdf={printCurrentScenario}
            previewIsStale={previewIsStale}
            pricingScenarios={displayPricingScenarios}
            result={result}
            selectedBusinessModel={selectedBusinessModel}
            selectedCompanyType={selectedCompanyType}
            selectedCountry={selectedCountry}
            selectedTaxProfile={selectedTaxProfile}
            setActivePage={selectPage}
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
            canUndo={undoStack.length > 0}
            isCalculating={isCalculating}
            onCalculate={() => previewCalculation()}
            previewIsStale={previewIsStale}
            removeVehicleGroup={removeVehicleGroup}
            result={result}
            resetInputsToDefaults={resetInputsToDefaults}
            undoLastInputChange={undoLastInputChange}
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
  historyCount,
  onExportCsv,
  onPrintPdf,
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
          <button onClick={onExportCsv} type="button">
            Export CSV
          </button>
          <button onClick={onPrintPdf} type="button">
            Print PDF
          </button>
        </div>
      </section>

      {historyCount === 0 && (
        <FirstRunGuide
          breakEven={money(result?.breakEvenPerLoadedKm)}
          onCompany={() => setActivePage("company")}
          onInputs={() => setActivePage("inputs")}
          onPricing={() => setActivePage("pricing")}
        />
      )}

      <section className="summary-grid">
        <Kpi label="Global annual cost" value={money(result?.totalAnnualCost)} unit={currencyUnit("year")} />
        <Kpi label="Global break-even" value={money(result?.breakEvenPerLoadedKm)} unit={`${currencyCode()}/loaded km`} />
        <Kpi label="Global tonne-km" value={money(result?.breakEvenPerTonneKm)} unit={`${currencyCode()}/t-km`} />
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
              friendlyCompanyTypeName(companyType.name)
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
          <Fact label="Source date" value={formatMonth(selectedTaxProfile?.sourceDate)} />
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
  canUndo,
  fleetGroups,
  input,
  isCalculating,
  onCalculate,
  previewIsStale,
  removeVehicleGroup,
  result,
  resetInputsToDefaults,
  undoLastInputChange,
  updateInput,
  updateVehicleGroup,
  vehicles
}) {
  const [activeSection, setActiveSection] = useState(vehicleInputSections[0].title);
  const activeVehicleSection =
    vehicleInputSections.find((section) => section.title === activeSection) ||
    vehicleInputSections[0];

  return (
    <div className="page-stack">
      <section className="input-command-bar">
        <div>
          <p className="eyebrow">Inputs</p>
          <h2>{activeVehicleSection.title}</h2>
        </div>
        <div className="input-section-nav" aria-label="Input sections">
          {vehicleInputSections.map((section) => (
            <button
              className={section.title === activeVehicleSection.title ? "active" : ""}
              key={section.title}
              onClick={() => setActiveSection(section.title)}
              type="button"
            >
              {shortSectionLabel(section.title)}
            </button>
          ))}
        </div>
        <div className="input-actions">
          <button disabled={!canUndo} onClick={undoLastInputChange} type="button">
            Undo
          </button>
          <button onClick={resetInputsToDefaults} type="button">
            Reset defaults
          </button>
          <button
            className="primary-button"
            disabled={!previewIsStale || isCalculating}
            onClick={onCalculate}
            type="button"
          >
            {isCalculating ? "Calculating..." : "Recalculate"}
          </button>
        </div>
      </section>

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

            <div className="subsection" key={`${group.id}-${activeVehicleSection.title}`}>
              <h3>{activeVehicleSection.title}</h3>
              <div className="field-grid">
                {activeVehicleSection.fields.map(([field, label, unit]) => (
                  <NumberField
                    error={fieldValidationMessage(field, group[field])}
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
                error={fieldValidationMessage(field, input[field])}
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
        <Kpi label="Total annual cost" value={money(result.totalAnnualCost)} unit={currencyUnit("year")} />
        <Kpi label="Break-even loaded km" value={money(result.breakEvenPerLoadedKm)} unit={`${currencyCode()}/km`} />
        <Kpi label="Break-even tonne-km" value={money(result.breakEvenPerTonneKm)} unit={`${currencyCode()}/t-km`} />
        <Kpi label="EBIT before tax" value={money(result.ebitBeforeTax)} unit={currencyUnit("year")} />
      </section>

      <section className="two-column">
        <Card title="Cost Breakdown">
          <Fact label="Variable annual cost" value={money(result.variableAnnualCost)} />
          <Fact label="Driver annual cost" value={money(result.driverAnnualCost)} />
          <Fact label="Vehicle fixed cost" value={money(result.vehicleFixedAnnualCost)} />
          <Fact
            label="Structural indirect cost"
            value={money(result.structuralIndirectCostsAnnual)}
          />
        </Card>

        <Card title="Tax And Profit">
          <Fact label="Annual revenue excl. VAT" value={money(result.annualRevenueExclVat)} />
          <Fact label="VAT collected" value={money(result.vatCollected)} />
          <Fact label="Business tax" value={money(result.businessTax)} />
          <Fact label="Profit after tax" value={money(result.profitAfterTax)} />
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

      <CalculationBreakdown calculation={calculation} result={result} />
    </div>
  );
}

function PricingPage({ input, pricingScenarios, result, updateInput }) {
  const [pinnedMarkups, setPinnedMarkups] = useState([]);
  if (!result) return <EmptyState title="No pricing yet" text="Calculate a preview first." />;
  const selectedMarkup = Number(input.markupPercentage || 0);
  const scenarioRows = ensureSelectedPricingScenario(pricingScenarios, result, selectedMarkup);

  function togglePinnedMarkup(markup) {
    setPinnedMarkups((current) => {
      const normalized = Number(markup.toFixed(4));
      return current.includes(normalized)
        ? current.filter((item) => item !== normalized)
        : [...current, normalized].slice(-5);
    });
  }

  return (
    <div className="page-stack">
      <section className="form-grid">
        <Card title="Selected Markup">
          <div className="slider-panel">
            <label>
              <span>Markup over break-even</span>
              <strong>{percent(selectedMarkup)}</strong>
              <input
                max="0.5"
                min="0"
                onChange={(event) => updateInput("markupPercentage", event.target.value)}
                step="0.01"
                type="range"
                value={selectedMarkup}
              />
            </label>
            <div className="scenario-presets" aria-label="Scenario presets">
              {[
                ["Conservative", 0.05],
                ["Realistic", 0.15],
                ["Aggressive", 0.3]
              ].map(([label, markup]) => (
                <button
                  className={Math.abs(selectedMarkup - markup) < 0.005 ? "active" : ""}
                  key={label}
                  onClick={() => updateInput("markupPercentage", markup)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Fact label="Current rate excl. VAT" value={money(result.customerRateExclVat)} />
          <Fact label="Current rate incl. VAT" value={money(result.customerRateInclVat)} />
        </Card>

        <Card title="Markup Vs Margin">
          <p className="helper-text">
            A markup over break-even is not the same as a profit margin. The margin is calculated after revenue, cost and business tax.
          </p>
          <Fact label="EBIT" value={money(result.ebitBeforeTax)} />
          <Fact label="After-tax margin" value={percent(result.afterTaxMargin)} />
        </Card>
      </section>

      <Card title="Generated Pricing Scenarios">
        <PricingScenarioTable
          onPin={togglePinnedMarkup}
          pinnedMarkups={pinnedMarkups}
          rows={scenarioRows}
          selectedMarkup={selectedMarkup}
        />
      </Card>
    </div>
  );
}

function SensitivityPage({ sensitivity }) {
  const [selectedFuelPrice, setSelectedFuelPrice] = useState(
    sensitivity?.fuelPriceSensitivity?.[Math.floor((sensitivity?.fuelPriceSensitivity?.length || 1) / 2)]
      ?.fuelPricePerLiter || 1.55
  );
  const [selectedLoadFactor, setSelectedLoadFactor] = useState(
    sensitivity?.loadFactorSensitivity?.[Math.floor((sensitivity?.loadFactorSensitivity?.length || 1) / 2)]
      ?.loadFactor || 0.85
  );
  if (!sensitivity) return <EmptyState title="No sensitivity yet" text="Calculate a preview first." />;
  const fuelPoint = nearestSensitivityPoint(
    sensitivity.fuelPriceSensitivity,
    "fuelPricePerLiter",
    selectedFuelPrice
  );
  const loadPoint = nearestSensitivityPoint(
    sensitivity.loadFactorSensitivity,
    "loadFactor",
    selectedLoadFactor
  );

  return (
    <div className="page-stack">
      <section className="form-grid">
        <Card title="Fuel Price Drag Test">
          <SensitivitySlider
            max={maxBy(sensitivity.fuelPriceSensitivity, "fuelPricePerLiter")}
            min={minBy(sensitivity.fuelPriceSensitivity, "fuelPricePerLiter")}
            onChange={setSelectedFuelPrice}
            step="0.01"
            value={selectedFuelPrice}
            valueLabel={money(selectedFuelPrice, 2)}
          />
          <Fact label="Nearest break-even" value={money(fuelPoint?.breakEvenPerLoadedKm)} />
          <Fact label="Variable cost/km" value={money(fuelPoint?.variableCostPerKm)} />
          <SensitivityBars
            labelFormatter={(row) => money(row.fuelPricePerLiter)}
            rows={sensitivity.fuelPriceSensitivity}
            valueField="breakEvenPerLoadedKm"
          />
        </Card>

        <Card title="Load Factor Drag Test">
          <SensitivitySlider
            max={maxBy(sensitivity.loadFactorSensitivity, "loadFactor")}
            min={minBy(sensitivity.loadFactorSensitivity, "loadFactor")}
            onChange={setSelectedLoadFactor}
            step="0.01"
            value={selectedLoadFactor}
            valueLabel={percent(selectedLoadFactor)}
          />
          <Fact label="Nearest break-even" value={money(loadPoint?.breakEvenPerLoadedKm)} />
          <Fact label="Profit after tax" value={money(loadPoint?.profitAfterTax)} />
          <SensitivityBars
            labelFormatter={(row) => percent(row.loadFactor)}
            rows={sensitivity.loadFactorSensitivity}
            valueField="breakEvenPerLoadedKm"
          />
        </Card>
      </section>

      <Card title="Vehicle Class Sensitivity">
        <DataTable
          columns={["Vehicle", "Payload", `${currencyCode()}/loaded km`, `${currencyCode()}/tonne-km`, "Annual tonne-km"]}
          rows={sensitivity.vehicleClassSensitivity.map((row) => [
            row.vehicleClassName,
            `${format(row.payloadCapacityTons)} t`,
            money(row.breakEvenPerLoadedKm),
            money(row.breakEvenPerTonneKm),
            format(row.annualTonneKm)
          ])}
        />
      </Card>

      <section className="two-column">
        <Card title="Payload Utilisation">
          <DataTable
            columns={["Utilisation", `${currencyCode()}/tonne-km`, "Annual tonne-km"]}
            rows={sensitivity.payloadUtilisationSensitivity.map((row) => [
              percent(row.payloadUtilisation),
              money(row.breakEvenPerTonneKm),
              format(row.annualTonneKm)
            ])}
          />
        </Card>

        <Card title="Fuel Price">
          <DataTable
            columns={["Fuel price", "Variable cost/km", "Total cost", "Break-even"]}
            rows={sensitivity.fuelPriceSensitivity.map((row) => [
              money(row.fuelPricePerLiter, 2),
              money(row.variableCostPerKm),
              money(row.totalAnnualCost),
              money(row.breakEvenPerLoadedKm)
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
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedRuns = history.filter((run) => selectedIds.includes(String(run.id)));

  function toggleRunSelection(id) {
    const runId = String(id);
    setSelectedIds((current) => {
      if (current.includes(runId)) return current.filter((item) => item !== runId);
      return [...current, runId].slice(-3);
    });
  }

  return (
    <div className="page-stack">
      {selectedRuns.length > 0 && (
        <Card title="Run Comparison">
          <RunComparison runs={selectedRuns} />
        </Card>
      )}

      <Card title="Saved Runs">
        {history.length === 0 ? (
          <p className="helper-text">
            No saved runs are available yet. Saved runs live in the backend database, so they survive refreshes when the API is connected.
          </p>
        ) : (
          <div className="history-list">
            {history.map((run) => (
              <article className="history-row" key={run.id}>
                <label className="compare-check">
                  <input
                    checked={selectedIds.includes(String(run.id))}
                    onChange={() => toggleRunSelection(run.id)}
                    type="checkbox"
                  />
                  <span>Compare</span>
                </label>
                <div>
                  <strong>{run.runName}</strong>
                  <span>
                    {run.country} | {run.companyType} | {dateTime(run.createdAt)}
                  </span>
                </div>
                <div className="history-metrics">
                  <span>{money(run.breakEvenPerLoadedKm)} / km</span>
                  <span>{money(run.profitAfterTax)} profit</span>
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

function FirstRunGuide({ breakEven, onCompany, onInputs, onPricing }) {
  return (
    <section className="first-run-panel">
      <div>
        <p className="eyebrow">First run</p>
        <h2>{breakEven} is the current break-even loaded km rate.</h2>
        <p>
          Break-even covers the annual fleet cost divided by loaded kilometres. Tonne-km adds payload into the same question: how much cost sits behind every transported tonne over one kilometre.
        </p>
      </div>
      <div className="first-run-steps">
        <button onClick={onCompany} type="button">
          <span>1</span>
          <strong>Country & company</strong>
          <small>{friendlyCompanyTypeName("PFA / II")} means an individual authorised business.</small>
        </button>
        <button onClick={onInputs} type="button">
          <span>2</span>
          <strong>Vehicle & activity</strong>
          <small>Set vehicle groups, loaded km, payload and annual costs.</small>
        </button>
        <button onClick={onPricing} type="button">
          <span>3</span>
          <strong>Pricing</strong>
          <small>Choose a markup and compare profit outcomes.</small>
        </button>
      </div>
    </section>
  );
}

function PricingScenarioTable({ onPin, pinnedMarkups, rows, selectedMarkup }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {["Pin", "Markup", "Rate excl. VAT", "Rate incl. VAT", "EBIT", "Profit after tax", "After-tax margin"].map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const markup = Number(row.markupPercentage || 0);
            const selected = Math.abs(markup - selectedMarkup) < 0.005;
            const pinned = pinnedMarkups.includes(Number(markup.toFixed(4)));
            return (
              <tr className={`${selected ? "selected-row" : ""} ${pinned ? "pinned-row" : ""}`} key={markup}>
                <td>
                  <button className="pin-button" onClick={() => onPin(markup)} type="button">
                    {pinned ? "Pinned" : "Pin"}
                  </button>
                </td>
                <td>{percent(markup)}</td>
                <td>{money(row.customerRateExclVat)}</td>
                <td>{money(row.customerRateInclVat)}</td>
                <td>{money(row.ebitBeforeTax)}</td>
                <td>{money(row.profitAfterTax)}</td>
                <td>{percent(row.afterTaxMargin)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SensitivitySlider({ max, min, onChange, step, value, valueLabel }) {
  return (
    <div className="slider-panel">
      <label>
        <span>Drag assumption</span>
        <strong>{valueLabel}</strong>
        <input
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="range"
          value={value}
        />
      </label>
    </div>
  );
}

function SensitivityBars({ labelFormatter, rows, valueField }) {
  const maxValue = maxBy(rows, valueField);
  return (
    <div className="sensitivity-bars">
      {rows.map((row) => {
        const value = Number(row[valueField]);
        return (
          <div className="sensitivity-bar" key={`${labelFormatter(row)}-${value}`}>
            <span>{labelFormatter(row)}</span>
            <div aria-hidden="true">
              <i style={{ width: `${clampPercent((value / maxValue) * 100)}%` }} />
            </div>
            <strong>{money(value)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function RunComparison({ runs }) {
  const baseline = runs[0];
  return (
    <div className="comparison-grid">
      {runs.map((run) => (
        <article className="comparison-card" key={run.id}>
          <strong>{run.runName}</strong>
          <span>{dateTime(run.createdAt)}</span>
          <Fact label="Break-even" value={money(run.breakEvenPerLoadedKm)} />
          <Fact label="Customer rate" value={money(run.customerRateExclVat)} />
          <Fact label="Annual cost" value={money(run.totalAnnualCost)} />
          <Fact label="Profit after tax" value={money(run.profitAfterTax)} />
          {baseline && run.id !== baseline.id && (
            <small>
              Diff vs first: {signedMoney(Number(run.breakEvenPerLoadedKm) - Number(baseline.breakEvenPerLoadedKm), 4)} / km
            </small>
          )}
        </article>
      ))}
    </div>
  );
}

function CalculationBreakdown({ calculation, result }) {
  const loadedShare = safeRatio(result.loadedKmYear, result.annualTotalKm);
  const markup = safeRatio(result.customerRateExclVat, result.breakEvenPerLoadedKm) - 1;
  const revenueBeforeTax = result.annualRevenueExclVat - result.totalAnnualCost;
  const groupCount = result.vehicleGroupResults?.length || 0;

  const steps = [
    {
      category: "Activity",
      detail: "Start with how much the fleet works and how much of that distance is loaded.",
      equation: `${format(result.annualTotalKm)} total km x ${percent(loadedShare)} loaded = ${format(result.loadedKmYear)} loaded km`,
      label: "Loaded kilometres",
      result: `${format(result.loadedKmYear)} km/year`
    },
    {
      category: "Cost",
      detail: "Add operating, driver, vehicle and structural costs into one annual cost base.",
      equation: `${money(result.variableAnnualCost)} + ${money(result.driverAnnualCost)} + ${money(result.vehicleFixedAnnualCost)} + ${money(result.structuralIndirectCostsAnnual)} = ${money(result.totalAnnualCost)}`,
      label: "Total annual cost",
      result: money(result.totalAnnualCost)
    },
    {
      category: "Break-even",
      detail: "Divide the annual cost by loaded kilometres to get the minimum rate before margin.",
      equation: `${money(result.totalAnnualCost)} / ${format(result.loadedKmYear)} loaded km = ${money(result.breakEvenPerLoadedKm)}/km`,
      label: "Break-even loaded km",
      result: money(result.breakEvenPerLoadedKm)
    },
    {
      category: "Payload",
      detail: "Tonne-km shows the same cost spread over transported payload, not just distance.",
      equation: `${money(result.totalAnnualCost)} / ${format(result.annualTonneKm)} tonne-km = ${money(result.breakEvenPerTonneKm)}/t-km`,
      label: "Break-even tonne-km",
      result: money(result.breakEvenPerTonneKm)
    },
    {
      category: "Pricing",
      detail: "Apply the selected markup to the break-even rate to reach the customer rate.",
      equation: `${money(result.breakEvenPerLoadedKm)} x (1 + ${percent(markup)}) = ${money(result.customerRateExclVat)}`,
      label: "Customer rate excl. VAT",
      result: money(result.customerRateExclVat)
    },
    {
      category: "Profit",
      detail: "Revenue above cost becomes EBIT, then business tax is deducted from positive EBIT.",
      equation: `${money(result.annualRevenueExclVat)} - ${money(result.totalAnnualCost)} = ${money(revenueBeforeTax)} EBIT; after tax = ${money(result.profitAfterTax)}`,
      label: "Profit after tax",
      result: money(result.profitAfterTax)
    }
  ];

  return (
    <section className="calculation-breakdown">
      <div className="calculation-breakdown-header">
        <div>
          <p className="eyebrow">Calculation breakdown</p>
          <h2>How the break-even is built</h2>
          <p>
            Follow the result from fleet activity to cost, break-even, pricing and profit. The technical formula audit is still available below for checking the engine details.
          </p>
        </div>
        <div className="breakdown-hero-number">
          <span>Global break-even</span>
          <strong>{money(result.breakEvenPerLoadedKm)}</strong>
          <small>{currencyCode()}/loaded km</small>
        </div>
      </div>

      <div className="formula-flow" aria-label="Break-even calculation flow">
        {["Activity", "Cost", "Break-even", "Pricing", "Profit"].map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>

      <div className="equation-grid">
        {steps.map((step) => (
          <FormulaStepCard key={step.category} step={step} />
        ))}
      </div>

      {groupCount > 1 && (
        <div className="fleet-aggregation-note">
          <strong>Fleet aggregation</strong>
          <span>
            {formatCount(groupCount)} groups are calculated separately first. The global break-even then uses total fleet cost divided by total loaded kilometres.
          </span>
        </div>
      )}

      <AdvancedFormulaAudit formulas={calculation.formulas || []} />
    </section>
  );
}

function FormulaStepCard({ step }) {
  return (
    <article className="formula-step-card">
      <div>
        <span>{step.category}</span>
        <h3>{step.label}</h3>
      </div>
      <strong>{step.result}</strong>
      <p>{step.detail}</p>
      <code>{step.equation}</code>
    </article>
  );
}

function AdvancedFormulaAudit({ formulas }) {
  if (formulas.length === 0) return null;
  const grouped = formulas.reduce((groups, formula) => {
    const category = formulaCategory(formula.field);
    groups[category] = [...(groups[category] || []), formula];
    return groups;
  }, {});

  return (
    <details className="advanced-formula-audit">
      <summary>
        <span>Advanced formula audit</span>
        <strong>{formatCount(formulas.length)} formulas</strong>
      </summary>
      <div className="advanced-formula-grid">
        {Object.entries(grouped).map(([category, categoryFormulas]) => (
          <section key={category}>
            <h3>{category}</h3>
            <div className="formula-list">
              {categoryFormulas.map((formula) => (
                <details key={formula.field}>
                  <summary>
                    {friendlyFormulaLabel(formula.field)}
                    <code>{formula.field}</code>
                  </summary>
                  <p>{humanizeFormula(formula.formula)}</p>
                  <small>{formula.rounding}</small>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </details>
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
      <span>
        {label}
        <InfoTip text={metricHelp[label]} />
      </span>
      <strong>{value}</strong>
      <small>{unit}</small>
    </article>
  );
}

function MetricTile({ label, value }) {
  return (
    <article className="metric-tile">
      <span>
        {label}
        <InfoTip text={metricHelp[label]} />
      </span>
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

function NumberField({ error, field, integer = false, label, onChange, unit, value }) {
  return (
    <label className={`number-field ${error ? "has-error" : ""}`}>
      <span>{label}</span>
      <div>
        <input
          aria-invalid={Boolean(error)}
          inputMode={integer ? "numeric" : "decimal"}
          onChange={(event) => onChange(field, event.target.value)}
          step={integer ? "1" : "0.01"}
          type="number"
          value={integer ? formatInputInteger(value) : formatInputNumber(value)}
        />
        <small>{displayUnit(unit)}</small>
      </div>
      {error && <em>{error}</em>}
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
      <span>
        {label}
        <InfoTip text={metricHelp[label]} />
      </span>
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
      <span>{stale ? "Stale" : "Current"}</span>
      <strong>{status}</strong>
    </div>
  );
}

function InfoTip({ text }) {
  if (!text) return null;
  return (
    <button aria-label={text} className="info-tip" title={text} type="button">
      ?
    </button>
  );
}

function StaleBanner({ isCalculating, onCalculate }) {
  return (
    <section className="stale-banner">
      <div>
        <strong>Recalculate needed</strong>
        <span>The visible numbers are a draft preview until you calculate this run.</span>
      </div>
      <button disabled={isCalculating} onClick={onCalculate} type="button">
        {isCalculating ? "Calculating..." : "Recalculate now"}
      </button>
    </section>
  );
}

function Toast({ message }) {
  return (
    <div className="toast" role="status">
      {message}
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

function money(value, decimals = 2) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return Number(value).toLocaleString(activeFormatContext.locale, {
    currency: activeFormatContext.currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
    style: "currency"
  });
}

function percent(value) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return `${format(Number(value) * 100)}%`;
}

function format(value) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  return Number(value).toLocaleString(activeFormatContext.locale, {
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
  return new Date(value).toLocaleString(activeFormatContext.locale, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function setActiveFormatContext(country) {
  activeFormatContext = getFormatContext(country);
}

function getFormatContext(country) {
  const currency = currencyFromCountry(country);
  return {
    currency,
    locale: localeByCountryCode[country?.code] || "en-US"
  };
}

function currencyFromCountry(country) {
  const rawCurrency = country?.currency || "EUR";
  if (rawCurrency.includes("EUR")) return "EUR";
  return rawCurrency.split("/")[0] || "EUR";
}

function currencyCode() {
  return activeFormatContext.currency;
}

function currencyUnit(period) {
  return `${currencyCode()}/${period}`;
}

function displayUnit(unit) {
  if (!unit) return "";
  return unit.replace(/^EUR/, currencyCode());
}

function signedMoney(value, decimals = 2) {
  if (value == null || Number.isNaN(Number(value))) return "n/a";
  const prefix = Number(value) >= 0 ? "+" : "";
  return `${prefix}${money(value, decimals)}`;
}

function formatMonth(value) {
  if (!value) return "n/a";
  const normalized = String(value).length === 7 ? `${value}-01` : value;
  return new Date(normalized).toLocaleDateString(activeFormatContext.locale, {
    month: "long",
    year: "numeric"
  });
}

function pageFromHash() {
  const hashPage = window.location.hash.replace(/^#\/?/, "");
  return pages.some(([key]) => key === hashPage) ? hashPage : "dashboard";
}

function friendlyCompanyTypeName(name) {
  const labels = {
    "PFA / II": "PFA / II - sole trader",
    "Branch / PE": "Branch / permanent establishment",
    SRL: "SRL - limited liability company",
    SA: "SA - joint stock company",
    "s.r.o.": "s.r.o. - limited liability company",
    "GmbH": "GmbH - limited liability company",
    "Kft.": "Kft. - limited liability company",
    "EOOD/OOD": "EOOD/OOD - limited liability company",
    "Manual entity": "Manual entity"
  };
  return labels[name] || name;
}

function shortSectionLabel(title) {
  return title
    .replace(" And Load", "")
    .replace(" And Fixed Cost", " & Fixed");
}

function fieldValidationMessage(field, value) {
  if (value === "" || value == null || Number.isNaN(Number(value))) {
    return "Required";
  }

  const number = Number(value);
  if (["loadFactor", "payloadUtilisation", "markupPercentage", "targetAfterTaxMargin"].includes(field)) {
    if (number < 0 || number > 1) return "Use a value between 0.00 and 1.00";
  }

  if (field === "vehicleCount" && (!Number.isInteger(number) || number < 1)) {
    return "Use a whole number of vehicles";
  }

  if (
    [
      "dailyKm",
      "operatingDaysPerYear",
      "payloadCapacityTons",
      "fuelConsumptionLPer100Km",
      "fuelPricePerLiter"
    ].includes(field) &&
    number <= 0
  ) {
    return "Must be greater than 0.00";
  }

  if (
    [
      "tyresAnnualCost",
      "maintenanceAnnualCost",
      "roadFeesAnnualCost",
      "driverSalaryAnnual",
      "driverPerDiemDaily",
      "ownershipOrLeasingAnnual",
      "insuranceAnnual",
      "vehicleTaxAnnual",
      "structuralIndirectCostsAnnual"
    ].includes(field) &&
    number < 0
  ) {
    return "Cannot be negative";
  }

  return "";
}

function ensureSelectedPricingScenario(rows, result, selectedMarkup) {
  const currentRow = {
    markupPercentage: selectedMarkup,
    customerRateExclVat: result.customerRateExclVat,
    customerRateInclVat: result.customerRateInclVat,
    ebitBeforeTax: result.ebitBeforeTax,
    profitAfterTax: result.profitAfterTax,
    afterTaxMargin: result.afterTaxMargin
  };
  const hasSelected = rows.some(
    (row) => Math.abs(Number(row.markupPercentage || 0) - selectedMarkup) < 0.005
  );
  return [...(hasSelected ? rows : [...rows, currentRow])].sort(
    (left, right) => Number(left.markupPercentage) - Number(right.markupPercentage)
  );
}

function nearestSensitivityPoint(rows = [], field, value) {
  return rows.reduce((best, row) => {
    if (!best) return row;
    return Math.abs(Number(row[field]) - value) < Math.abs(Number(best[field]) - value)
      ? row
      : best;
  }, null);
}

function minBy(rows = [], field) {
  return rows.reduce((min, row) => Math.min(min, Number(row[field])), Number.POSITIVE_INFINITY);
}

function maxBy(rows = [], field) {
  return rows.reduce((max, row) => Math.max(max, Number(row[field])), Number.NEGATIVE_INFINITY);
}

function buildCurrentScenarioCsv(runName, result) {
  const rows = [
    ["Run", runName],
    ["Metric", "Value"],
    ["Total annual cost", result.totalAnnualCost],
    ["Break-even loaded km", result.breakEvenPerLoadedKm],
    ["Break-even tonne-km", result.breakEvenPerTonneKm],
    ["Customer rate excl. VAT", result.customerRateExclVat],
    ["Customer rate incl. VAT", result.customerRateInclVat],
    ["EBIT before tax", result.ebitBeforeTax],
    ["Profit after tax", result.profitAfterTax],
    [],
    ["Group", "Vehicle type", "Vehicles", "Annual cost", "Break-even loaded km", "Customer rate", "Profit after tax"],
    ...(result.vehicleGroupResults || []).map((group) => [
      group.name,
      group.vehicleClassName,
      group.vehicleCount,
      group.groupTotals.totalAnnualCost,
      group.groupTotals.breakEvenPerLoadedKm,
      group.groupTotals.customerRateExclVat,
      group.groupTotals.profitAfterTax
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function friendlyFormulaLabel(field) {
  const labels = {
    annualPerDiem: "Annual per diem",
    annualRevenueExclVat: "Annual revenue excluding VAT",
    annualTonneKm: "Annual tonne-km",
    annualTotalKm: "Annual total kilometres",
    breakEvenPerLoadedKm: "Break-even per loaded km",
    breakEvenPerTonneKm: "Break-even per tonne-km",
    businessTax: "Business tax",
    customerRateExclVat: "Customer rate excluding VAT",
    customerRateInclVat: "Customer rate including VAT",
    dailyKm: "Daily kilometres",
    driverAnnualCost: "Driver annual cost",
    effectivePayloadTons: "Effective payload",
    ebitBeforeTax: "EBIT before tax",
    employerContributionAnnual: "Employer contribution",
    fleetBreakEvenPerLoadedKm: "Fleet break-even per loaded km",
    fleetLoadedKmYear: "Fleet loaded kilometres",
    fleetTotalAnnualCost: "Fleet total annual cost",
    fuelCostPerKm: "Fuel cost per km",
    fuelConsumptionLPer100Km: "Fuel consumption",
    fuelPricePerLiter: "Fuel price",
    invoiceValueInclVat: "Invoice value including VAT",
    loadFactor: "Loaded km share",
    loadedKmYear: "Loaded kilometres per year",
    markupPercentage: "Markup",
    operatingDaysPerYear: "Operating days",
    payloadCapacityTons: "Payload capacity",
    payloadUtilisation: "Payload utilisation",
    profitAfterTax: "Profit after tax",
    totalAnnualCost: "Total annual cost",
    variableCostPerKm: "Variable cost per km",
    vatRate: "VAT rate",
    vatCollected: "VAT collected",
    vehicleFixedAnnualCost: "Vehicle fixed annual cost"
  };
  return labels[field] || field.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function formulaCategory(field) {
  if (/fleet/i.test(field)) return "Fleet";
  if (/annualTotalKm|loadedKm|payload|tonne/i.test(field)) return "Activity";
  if (/fuel|variable|driver|vehicleFixed|perDiem|employer|totalAnnualCost/i.test(field)) return "Cost";
  if (/breakEven/i.test(field)) return "Break-even";
  if (/customerRate|revenue|invoice|vat/i.test(field)) return "Pricing";
  if (/tax|profit/i.test(field)) return "Tax & profit";
  return "Other";
}

function humanizeFormula(formula) {
  if (!formula) return "n/a";
  return formula
    .replaceAll(" x ", " * ")
    .replace(/\b([a-z][a-zA-Z0-9]*)\b/g, (match) => friendlyFormulaLabel(match));
}
