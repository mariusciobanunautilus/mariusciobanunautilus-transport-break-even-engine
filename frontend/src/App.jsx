import { useEffect, useMemo, useState } from "react";
import {
  calculateBreakEven,
  calculationModes,
  defaultBlueprintCalculationInput,
  generatePricingScenarios,
  generateSensitivity,
  getBlueprintReferenceData
} from "@transport-break-even/shared";
import { apiRequest, getStoredAuthToken, setApiAuthToken } from "./apiClient.js";
import { DashboardVisualAidGrid } from "./DashboardVisualAids.jsx";

const fallbackReference = getBlueprintReferenceData();

const pages = [
  ["dashboard", "Dashboard"],
  ["company", "Company & Tax"],
  ["inputs", "Inputs"],
  ["time", "Time Model"],
  ["results", "Break-even"],
  ["pricing", "Pricing"],
  ["sensitivity", "Sensitivity"],
  ["vehicles", "Vehicles"],
  ["history", "History"],
  ["team", "Team"]
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

const calculationModeLabels = {
  snapshot: "Snapshot",
  planned_annual: "Planned Annual",
  rolling_forecast: "Rolling Forecast",
  actual_annual: "Actual Annual"
};

const scenarioStatusOptions = ["draft", "reviewed", "approved", "archived"];

const periodCostFields = [
  ["fuelCost", "Fuel"],
  ["tyresCost", "Tyres"],
  ["maintenanceCost", "Maintenance"],
  ["roadFeesCost", "Road fees"],
  ["driverCost", "Driver"],
  ["fixedVehicleCost", "Vehicle fixed"],
  ["structuralOverheadCost", "Overhead"],
  ["otherCost", "Other"]
];

const periodAssumptionFields = [
  "totalKm",
  "loadedKm",
  ...periodCostFields.map(([field]) => field),
  "revenueExclVat"
];

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
  const [session, setSession] = useState(null);
  const [authStatus, setAuthStatus] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [reference, setReference] = useState(fallbackReference);
  const [activePage, setActivePage] = useState(() => pageFromHash());
  const [input, setInput] = useState(defaultBlueprintCalculationInput);
  const [timeModel, setTimeModel] = useState(() => defaultTimeModel());
  const [periods, setPeriods] = useState([]);
  const [runName, setRunName] = useState("Baseline pricing run");
  const [calculation, setCalculation] = useState(null);
  const [pricingScenarios, setPricingScenarios] = useState([]);
  const [sensitivity, setSensitivity] = useState(null);
  const [history, setHistory] = useState([]);
  const [exportPack, setExportPack] = useState(null);
  const [status, setStatus] = useState("Ready");
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [agentInsight, setAgentInsight] = useState(null);
  const [agentError, setAgentError] = useState("");
  const [isAgentLoading, setIsAgentLoading] = useState(false);
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
    () => safeCalculateBreakEven(buildPayload()),
    [currentTaxProfile, normalizedInput, periods, runName, timeModel]
  );
  const draftPricingScenarios = useMemo(
    () => safeGeneratePricingScenarios(buildPayload()),
    [currentTaxProfile, normalizedInput, periods, runName, timeModel]
  );
  const draftSensitivity = useMemo(
    () => safeGenerateSensitivity(buildPayload()),
    [currentTaxProfile, normalizedInput, periods, runName, timeModel]
  );

  useEffect(() => {
    restoreSession();

    function handleExpiredSession() {
      setSession(null);
      setAuthMessage("Session expired. Please sign in again.");
    }

    window.addEventListener("transport-auth-expired", handleExpiredSession);
    return () =>
      window.removeEventListener("transport-auth-expired", handleExpiredSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    loadReferenceData();
    loadHistory();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    previewCalculation({ silent: true });
  }, [session]);

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
    ? calculationSignature(calculation) !==
      calculationSignature(buildPayload())
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
  const navigationPages =
    session?.user?.role === "admin"
      ? pages
      : pages.filter(([key]) => key !== "team");
  setActiveFormatContext(currentCountry);

  async function restoreSession() {
    const token = getStoredAuthToken();
    if (!token) {
      await loadAuthStatus();
      setAuthReady(true);
      return;
    }

    try {
      const restored = await apiRequest("/api/auth/me");
      setSession(restored);
      setAuthStatus({ bootstrapRequired: false });
    } catch {
      setApiAuthToken("");
      await loadAuthStatus();
    } finally {
      setAuthReady(true);
    }
  }

  async function loadAuthStatus() {
    try {
      const health = await apiRequest("/api/health");
      setAuthStatus(health.auth || null);
      setAuthMessage("");
    } catch (error) {
      setAuthMessage(
        error.status
          ? `Backend health check failed: ${error.message}`
          : "Could not reach the backend API. Check the Render service is a Web Service and that production is not pointing at localhost."
      );
    }
  }

  async function signIn(credentials) {
    setAuthMessage("");
    const nextSession = await apiRequest("/api/auth/login", {
      method: "POST",
      body: credentials
    });
    setApiAuthToken(nextSession.token);
    setSession({
      user: nextSession.user,
      workspace: nextSession.workspace
    });
    setStatus("Ready");
  }

  async function createFirstAdmin(payload) {
    setAuthMessage("");
    const nextSession = await apiRequest("/api/auth/setup", {
      method: "POST",
      body: payload
    });
    setApiAuthToken(nextSession.token);
    setSession({
      user: nextSession.user,
      workspace: nextSession.workspace
    });
    setAuthStatus({ bootstrapRequired: false });
    setStatus("Ready");
  }

  async function createWorkspaceUser(payload) {
    const response = await apiRequest("/api/users", {
      method: "POST",
      body: payload
    });
    setStatus(`Created ${response.user.email}`);
    return response.user;
  }

  async function signOut() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      // The local session is cleared even if the backend is already unavailable.
    }

    setApiAuthToken("");
    setSession(null);
    setAuthMessage("");
  }

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
    const nextTimeModel = {
      ...timeModel,
      ...(overrides.timeModel || {})
    };
    const nextPeriods =
      overrides.periods ??
      periods.map((period) => normalizePeriodForPayload(period));
    const nextInput = normalizedPreviewInput(
      { ...input, ...(overrides.input || overrides) },
      reference.vehicleClasses
    );
    const inputWithMode = {
      ...nextInput,
      calculationMode: nextTimeModel.calculationMode,
      planYear: parseNullableNumber(nextTimeModel.planYear),
      asOfDate: nextTimeModel.asOfDate || null
    };

    return {
      runName,
      scenarioName: runName,
      calculationMode: nextTimeModel.calculationMode,
      planYear: parseNullableNumber(nextTimeModel.planYear),
      asOfDate: nextTimeModel.asOfDate || null,
      scenarioStatus: nextTimeModel.scenarioStatus,
      scenarioVersion: parseNullableNumber(nextTimeModel.scenarioVersion) || 1,
      input: inputWithMode,
      taxProfile: currentTaxProfile,
      periods: nextPeriods
    };
  }

  async function previewCalculation(options = {}) {
    const payload = buildPayload();
    setIsCalculating(true);
    setAgentInsight(null);
    setAgentError("");
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

  async function explainCurrentResult() {
    const currentCalculation = displayCalculation;
    if (!currentCalculation?.result) return;

    setIsAgentLoading(true);
    setAgentError("");

    try {
      const response = await apiRequest("/api/agent/analyse", {
        method: "POST",
        body: {
          agent: "cost-intelligence",
          question: "Explain this result and identify the main cost-per-km risks.",
          vehicleCode: primaryVehicleCode(input, reference.vehicleClasses),
          inputs: currentCalculation.input || buildPayload().input,
          outputs: currentCalculation.result
        }
      });
      setAgentInsight(response);
      setStatus("AI insight ready");
    } catch (error) {
      setAgentError(error.message || "AI insight failed");
      setStatus(`AI insight failed: ${error.message}`);
    } finally {
      setIsAgentLoading(false);
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
      const openedTimeModel = {
        ...defaultTimeModel(),
        calculationMode: run.calculationMode || run.inputSnapshot?.calculationMode || "snapshot",
        planYear:
          run.planYear ??
          run.inputSnapshot?.planYear ??
          defaultTimeModel().planYear,
        asOfDate:
          run.asOfDate ||
          run.inputSnapshot?.asOfDate ||
          defaultTimeModel().asOfDate,
        scenarioStatus: run.scenarioStatus || "draft",
        scenarioVersion: run.scenarioVersion || 1
      };
      const openedPeriods = run.periods || [];
      const openedCalculation = calculateBreakEven({
        input: openedInput,
        taxProfile: run.taxSnapshot,
        calculationMode: openedTimeModel.calculationMode,
        planYear: openedTimeModel.planYear,
        asOfDate: openedTimeModel.asOfDate,
        scenarioStatus: openedTimeModel.scenarioStatus,
        scenarioVersion: openedTimeModel.scenarioVersion,
        periods: openedPeriods
      });
      setInput(openedInput);
      setTimeModel(openedTimeModel);
      setPeriods(openedPeriods);
      setRunName(run.runName || "Opened run");
      setCalculation(openedCalculation);
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
    setTimeModel({
      ...defaultTimeModel(),
      calculationMode: run.calculationMode || run.inputSnapshot?.calculationMode || "snapshot",
      planYear: run.planYear ?? run.inputSnapshot?.planYear ?? defaultTimeModel().planYear,
      asOfDate: run.asOfDate || run.inputSnapshot?.asOfDate || defaultTimeModel().asOfDate,
      scenarioStatus: "draft",
      scenarioVersion: Number(run.scenarioVersion || 1) + 1
    });
    setPeriods(run.periods || []);
    setRunName(`${run.runName || "Run"} copy`);
    selectPage("time");
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

  function updateTimeModel(field, value) {
    setTimeModel((current) => ({
      ...current,
      [field]:
        field === "planYear" || field === "scenarioVersion"
          ? parseNullableNumber(value)
          : value
    }));
    setStatus("Unsaved time model changes");
  }

  function addPeriod() {
    setPeriods((current) => [
      ...current,
      createBlankPeriod(timeModel.planYear, current.length)
    ]);
    setStatus("Period added");
  }

  function updatePeriod(index, field, value) {
    setPeriods((current) =>
      current.map((period, periodIndex) =>
        periodIndex === index
          ? {
              ...period,
              [field]: periodNumberField(field) ? parseNullableNumber(value) : value
            }
          : period
      )
    );
    setStatus("Unsaved period changes");
  }

  function copyPreviousPeriodAssumptions(index) {
    if (index <= 0) return;
    setPeriods((current) =>
      current.map((period, periodIndex) =>
        periodIndex === index
          ? copyPeriodAssumptions(current[index - 1], period)
          : period
      )
    );
    setStatus("Copied previous period assumptions");
  }

  function applyPeriodAssumptionsForward(index) {
    setPeriods((current) =>
      current.map((period, periodIndex) =>
        periodIndex > index
          ? copyPeriodAssumptions(current[index], period)
          : period
      )
    );
    setStatus("Applied period assumptions forward");
  }

  function applyFirstPeriodAssumptionsToAll() {
    setPeriods((current) =>
      current.map((period, periodIndex) =>
        periodIndex > 0 ? copyPeriodAssumptions(current[0], period) : period
      )
    );
    setStatus("Applied first period assumptions to all periods");
  }

  function removePeriod(index) {
    setPeriods((current) => current.filter((_, periodIndex) => periodIndex !== index));
    setStatus("Period removed");
  }

  function generateMonthlyPlan() {
    if (!result) return;
    setPeriods(buildMonthlyPlanFromResult(result, timeModel.planYear));
    setTimeModel((current) => ({
      ...current,
      calculationMode:
        current.calculationMode === "snapshot" ? "planned_annual" : current.calculationMode
    }));
    selectPage("time");
    setStatus("Monthly plan generated from current annual assumptions");
  }

  const result = displayCalculation?.result;

  if (!authReady) {
    return <AuthShell title="Opening workspace" message="Checking your session." />;
  }

  if (!session) {
    return (
      <LoginPage
        message={authMessage}
        onSetup={createFirstAdmin}
        onSignIn={signIn}
        setupRequired={Boolean(authStatus?.bootstrapRequired)}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Transport Break-even Engine</p>
          <h1>Pricing Workspace</h1>
        </div>
        <nav className="page-nav" aria-label="Workflow">
          {navigationPages.map(([key, label]) => (
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
            <SessionChip onSignOut={signOut} session={session} />
          </div>
        </header>

        {previewIsStale && (
          <StaleBanner isCalculating={isCalculating} onCalculate={() => previewCalculation()} />
        )}

        {saveNotice && <Toast message={saveNotice} />}

        {activePage === "dashboard" && (
          <DashboardPage
            fleetGroups={fleetGroups}
            generateMonthlyPlan={generateMonthlyPlan}
            historyCount={history.length}
            input={input}
            onExportCsv={exportCurrentCsv}
            onPrintPdf={printCurrentScenario}
            periods={periods}
            previewIsStale={previewIsStale}
            pricingScenarios={displayPricingScenarios}
            result={result}
            selectedBusinessModel={selectedBusinessModel}
            selectedCompanyType={selectedCompanyType}
            selectedCountry={selectedCountry}
            selectedTaxProfile={selectedTaxProfile}
            setActivePage={selectPage}
            timeModel={timeModel}
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

        {activePage === "time" && (
          <TimeModelPage
            addPeriod={addPeriod}
            applyFirstPeriodAssumptionsToAll={applyFirstPeriodAssumptionsToAll}
            applyPeriodAssumptionsForward={applyPeriodAssumptionsForward}
            copyPreviousPeriodAssumptions={copyPreviousPeriodAssumptions}
            generateMonthlyPlan={generateMonthlyPlan}
            periods={periods}
            removePeriod={removePeriod}
            result={result}
            timeModel={timeModel}
            updatePeriod={updatePeriod}
            updateTimeModel={updateTimeModel}
          />
        )}

        {activePage === "results" && (
          <BreakEvenResultsPage
            agentError={agentError}
            agentInsight={agentInsight}
            calculation={displayCalculation}
            isAgentLoading={isAgentLoading}
            onExplainResult={explainCurrentResult}
          />
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

        {activePage === "team" && (
          <TeamPage
            createWorkspaceUser={createWorkspaceUser}
            session={session}
          />
        )}
      </section>
    </main>
  );
}

function AuthShell({ message, title }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <p className="eyebrow">Transport Break-even Engine</p>
        <h1>{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function LoginPage({ message, onSetup, onSignIn, setupRequired }) {
  const [workspaceName, setWorkspaceName] = useState("Transport Workspace");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(message || "");
  const newPasswordState = passwordValidationState(password, confirmPassword);
  const canSubmit =
    !isSubmitting &&
    email.trim() &&
    password &&
    (!setupRequired || (workspaceName.trim() && newPasswordState.isValid));

  useEffect(() => {
    setError(message || "");
  }, [message]);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    if (setupRequired && !newPasswordState.isValid) {
      setError("Complete the password requirements before creating the account.");
      setIsSubmitting(false);
      return;
    }

    try {
      if (setupRequired) {
        await onSetup({ email, name, password, workspaceName });
      } else {
        await onSignIn({ email, password });
      }
    } catch (nextError) {
      setError(nextError.message || "Sign in failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-panel" onSubmit={handleSubmit}>
        <p className="eyebrow">Transport Break-even Engine</p>
        <h1>{setupRequired ? "Create the first workspace account" : "Sign in to the pricing workspace"}</h1>
        {setupRequired && (
          <>
            <label className="text-field">
              <span>Workspace</span>
              <input
                autoComplete="organization"
                onChange={(event) => setWorkspaceName(event.target.value)}
                value={workspaceName}
              />
            </label>
            <label className="text-field">
              <span>Name</span>
              <input
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
          </>
        )}
        <label className="text-field">
          <span>Email</span>
          <input
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </label>
        <PasswordField
          autoComplete={setupRequired ? "new-password" : "current-password"}
          label={setupRequired ? "New password" : "Password"}
          onChange={setPassword}
          showPassword={showPassword}
          toggleShowPassword={() => setShowPassword((current) => !current)}
          value={password}
        />
        {setupRequired && (
          <>
            <PasswordField
              autoComplete="new-password"
              label="Confirm password"
              onChange={setConfirmPassword}
              showPassword={showPassword}
              toggleShowPassword={() => setShowPassword((current) => !current)}
              value={confirmPassword}
            />
            <PasswordChecklist state={newPasswordState} />
          </>
        )}
        {error && <div className="auth-error">{error}</div>}
        {!setupRequired && (
          <p className="auth-note">
            New accounts are created by a workspace admin from the Team page.
          </p>
        )}
        <button className="primary-button" disabled={!canSubmit} type="submit">
          {isSubmitting
            ? setupRequired ? "Creating..." : "Signing in..."
            : setupRequired ? "Create account" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

function SessionChip({ onSignOut, session }) {
  return (
    <div className="session-chip">
      <span>{session.workspace?.name || "Workspace"}</span>
      <strong>{session.user?.email || "Signed in"}</strong>
      <button onClick={onSignOut} type="button">
        Sign out
      </button>
    </div>
  );
}

function PasswordField({
  autoComplete,
  label,
  onChange,
  showPassword,
  toggleShowPassword,
  value
}) {
  return (
    <label className="text-field password-field">
      <span>{label}</span>
      <div className="password-input-row">
        <input
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          type={showPassword ? "text" : "password"}
          value={value}
        />
        <button onClick={toggleShowPassword} type="button">
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
    </label>
  );
}

function PasswordChecklist({ state }) {
  return (
    <div className="password-panel">
      <div className="password-strength">
        <span>Password strength</span>
        <strong>{state.label}</strong>
        <div className="password-meter" aria-hidden="true">
          <span style={{ "--strength": `${state.score * 20}%` }} />
        </div>
      </div>
      <ul className="password-checklist">
        {state.checks.map((check) => (
          <li className={check.valid ? "valid" : ""} key={check.label}>
            <span>{check.valid ? "OK" : "--"}</span>
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DashboardPage({
  fleetGroups,
  generateMonthlyPlan,
  historyCount,
  onExportCsv,
  onPrintPdf,
  periods,
  previewIsStale,
  pricingScenarios,
  result,
  selectedBusinessModel,
  selectedCompanyType,
  selectedCountry,
  selectedTaxProfile,
  setActivePage,
  timeModel,
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
          <button onClick={() => setActivePage("time")} type="button">
            Time Model
          </button>
          <button onClick={onExportCsv} type="button">
            Export CSV
          </button>
          <button onClick={onPrintPdf} type="button">
            Print PDF
          </button>
        </div>
      </section>

      <ModeStatusPanel
        onGeneratePlan={generateMonthlyPlan}
        onOpenTimeModel={() => setActivePage("time")}
        periods={periods}
        result={result}
        timeModel={timeModel}
      />

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

      <DashboardVisualAidGrid
        formatContext={getFormatContext(selectedCountry)}
        onGeneratePlan={generateMonthlyPlan}
        onOpenTimeModel={() => setActivePage("time")}
        periods={periods}
        pricingScenarios={pricingScenarios}
        result={result}
        selectedTaxProfile={selectedTaxProfile}
        timeModel={timeModel}
      />

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
          <Fact label="Rule status" value={titleCase(selectedTaxProfile?.status || "indicative")} />
          <Fact
            label="Review status"
            value={titleCase(selectedTaxProfile?.reviewStatus || "needs_review")}
          />
          <Fact
            label="Confidence"
            value={titleCase(selectedTaxProfile?.confidenceLevel || "medium")}
          />
          <Fact label="Source date" value={formatMonth(selectedTaxProfile?.sourceDate)} />
          <Fact
            label="Last reviewed"
            value={formatMonth(selectedTaxProfile?.lastReviewedAt)}
          />
          <Fact label="Valid from" value={formatMonth(selectedTaxProfile?.validFrom)} />
          <Fact
            label="Valid to"
            value={selectedTaxProfile?.validTo ? formatMonth(selectedTaxProfile.validTo) : "Open"}
          />
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

function ModeStatusPanel({
  onGeneratePlan,
  onOpenTimeModel,
  periods = [],
  result,
  timeModel
}) {
  const mode = result?.calculationMode || timeModel?.calculationMode || "snapshot";
  const warnings = result?.warnings || [];
  const periodCount =
    result?.periodAggregation?.sourcePeriodCount ?? periods.length ?? 0;

  return (
    <section className="mode-status-panel">
      <div>
        <span className="mode-badge">{calculationModeLabels[mode] || mode}</span>
        <strong>{result?.modeLabel || calculationModeLabels[mode]}</strong>
        <p>
          {mode === "snapshot"
            ? "Current values are treated as a full-year assumption."
            : "Annual cost and loaded kilometres are built from selected period rows."}
        </p>
      </div>
      <div className="mode-facts">
        <Fact label="Plan year" value={result?.planYear || timeModel?.planYear || "n/a"} />
        <Fact label="As of" value={result?.asOfDate || timeModel?.asOfDate || "n/a"} />
        <Fact label="Periods" value={formatCount(periodCount)} />
        <Fact label="Completeness" value={result?.dataCompletenessStatus || "fallback"} />
      </div>
      {warnings.length > 0 && (
        <div className="mode-warnings">
          {warnings.map((warning) => (
            <span key={warning}>{friendlyWarning(warning)}</span>
          ))}
        </div>
      )}
      {(onOpenTimeModel || onGeneratePlan) && (
        <div className="mode-actions">
          {onOpenTimeModel && (
            <button onClick={onOpenTimeModel} type="button">
              Edit Time Model
            </button>
          )}
          {onGeneratePlan && periodCount === 0 && (
            <button onClick={onGeneratePlan} type="button">
              Generate Monthly Plan
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TimeModelPage({
  addPeriod,
  applyFirstPeriodAssumptionsToAll,
  applyPeriodAssumptionsForward,
  copyPreviousPeriodAssumptions,
  generateMonthlyPlan,
  periods,
  removePeriod,
  result,
  timeModel,
  updatePeriod,
  updateTimeModel
}) {
  const warnings = result?.warnings || [];
  const aggregation = result?.periodAggregation;
  const periodOutputs = aggregation?.periodBreakdown || [];

  return (
    <div className="page-stack">
      <section className="time-model-hero">
        <div>
          <p className="eyebrow">Time-weighted layer</p>
          <h2>{calculationModeLabels[timeModel.calculationMode]}</h2>
          <div className="dashboard-meta">
            <span>Plan year {timeModel.planYear || "n/a"}</span>
            <span>As of {timeModel.asOfDate || "n/a"}</span>
            <span>{periods.length} periods</span>
            <span>{result?.dataCompletenessStatus || "fallback"}</span>
          </div>
        </div>
        <div className="dashboard-actions">
          <button onClick={generateMonthlyPlan} type="button">
            Generate Monthly Plan
          </button>
          <button onClick={addPeriod} type="button">
            Add Period
          </button>
        </div>
      </section>

      <section className="form-grid">
        <Card title="Input Setup">
          <SelectField
            label="Break-even mode"
            onChange={(value) => updateTimeModel("calculationMode", value)}
            options={calculationModes.map((mode) => [
              mode,
              calculationModeLabels[mode]
            ])}
            value={timeModel.calculationMode}
          />
          <NumberField
            field="planYear"
            label="Plan year"
            onChange={updateTimeModel}
            unit="year"
            value={timeModel.planYear}
            integer
          />
          <DateField
            label="As-of date"
            onChange={(value) => updateTimeModel("asOfDate", value)}
            value={timeModel.asOfDate}
          />
          <SelectField
            label="Scenario status"
            onChange={(value) => updateTimeModel("scenarioStatus", value)}
            options={scenarioStatusOptions.map((status) => [status, titleCase(status)])}
            value={timeModel.scenarioStatus}
          />
        </Card>

        <Card title="Output Preview">
          <Fact label="Mode" value={result?.modeLabel || calculationModeLabels[timeModel.calculationMode]} />
          <Fact label="Weighted cost" value={money(result?.totalAnnualCost)} />
          <Fact label="Weighted loaded km" value={format(result?.loadedKmYear)} />
          <Fact label="Weighted break-even" value={`${money(result?.breakEvenPerLoadedKm)} / loaded km`} />
          <Fact label="Completeness" value={result?.dataCompletenessStatus || "fallback"} />
        </Card>
      </section>

      {warnings.length > 0 && (
        <section className="warning-panel">
          {warnings.map((warning) => (
            <span key={warning}>{friendlyWarning(warning)}</span>
          ))}
        </section>
      )}

      <section className="period-editor-panel">
        <div className="period-editor-header">
          <div>
            <p className="eyebrow">Input Zone</p>
            <h2>Period Assumptions</h2>
          </div>
          <div className="period-editor-actions">
            <button
              className="secondary-button"
              disabled={periods.length < 2}
              onClick={applyFirstPeriodAssumptionsToAll}
              type="button"
            >
              Apply First To All
            </button>
            <button className="secondary-button" onClick={addPeriod} type="button">
              Add Period
            </button>
            <button className="primary-button" onClick={generateMonthlyPlan} type="button">
              Generate Monthly Plan
            </button>
          </div>
        </div>
        {periods.length === 0 ? (
          <div className="empty-periods">
            <p>
              No period rows yet. Snapshot still uses the annual model. Generate a
              monthly plan to switch into time-weighted planned or rolling logic.
            </p>
            <button className="primary-button" onClick={generateMonthlyPlan} type="button">
              Generate Monthly Plan
            </button>
          </div>
        ) : (
          <div className="period-card-list">
            {periods.map((period, index) => (
              <PeriodEditorCard
                canApplyForward={index < periods.length - 1}
                canCopyPrevious={index > 0}
                index={index}
                key={period.id || index}
                onApplyForward={() => applyPeriodAssumptionsForward(index)}
                onCopyPrevious={() => copyPreviousPeriodAssumptions(index)}
                onRemove={() => removePeriod(index)}
                output={periodOutputs[index]}
                period={period}
                updatePeriod={updatePeriod}
              />
            ))}
          </div>
        )}
      </section>

      {aggregation?.periodBreakdown?.length > 0 && (
        <Card title="Output: Selected Periods Used In Result">
          <DataTable
            columns={["Period", "Status", "Loaded km", "Cost", "Break-even"]}
            rows={aggregation.periodBreakdown.map((period) => [
              `${period.periodStart || "n/a"} to ${period.periodEnd || "n/a"}`,
              titleCase(period.dataStatus),
              format(period.loadedKm),
              money(period.periodTotalCost),
              money(period.breakEvenPerLoadedKm)
            ])}
          />
        </Card>
      )}
    </div>
  );
}

function PeriodEditorCard({
  canApplyForward,
  canCopyPrevious,
  index,
  onApplyForward,
  onCopyPrevious,
  onRemove,
  output,
  period,
  updatePeriod
}) {
  const periodLabel = `Period ${index + 1}`;
  const status = period.dataStatus || "planned";

  return (
    <article className="period-editor-card">
      <header className="period-card-header">
        <div>
          <span className={`period-status-chip ${status}`}>{titleCase(status)}</span>
          <h3>{periodLabel}</h3>
        </div>
        <div className="period-card-actions">
          <button disabled={!canCopyPrevious} onClick={onCopyPrevious} type="button">
            Copy Previous
          </button>
          <button disabled={!canApplyForward} onClick={onApplyForward} type="button">
            Apply Forward
          </button>
          <button className="danger-link" onClick={onRemove} type="button">
            Remove
          </button>
        </div>
      </header>

      <div className="period-zone-grid">
        <section className="period-input-zone">
          <div className="zone-heading">
            <span>Inputs</span>
            <strong>Editable assumptions</strong>
          </div>

          <div className="period-input-section period-schedule-section">
            <h4>Period</h4>
            <div className="period-date-grid">
              <DateField
                label="Start"
                onChange={(value) => updatePeriod(index, "periodStart", value)}
                value={period.periodStart}
              />
              <DateField
                label="End"
                onChange={(value) => updatePeriod(index, "periodEnd", value)}
                value={period.periodEnd}
              />
              <SelectField
                label="Status"
                onChange={(value) => updatePeriod(index, "dataStatus", value)}
                options={["planned", "actual", "forecast"].map((item) => [
                  item,
                  titleCase(item)
                ])}
                value={period.dataStatus}
              />
            </div>
          </div>

          <div className="period-input-section">
            <h4>Activity</h4>
            <div className="period-activity-grid">
              <NumberField
                field="totalKm"
                label="Total km"
                onChange={(field, value) => updatePeriod(index, field, value)}
                unit="km"
                value={period.totalKm}
              />
              <NumberField
                field="loadedKm"
                label="Loaded km"
                onChange={(field, value) => updatePeriod(index, field, value)}
                unit="km"
                value={period.loadedKm}
              />
            </div>
          </div>

          <div className="period-input-section">
            <h4>Costs</h4>
            <div className="period-cost-grid">
              {periodCostFields.map(([field, label]) => (
                <NumberField
                  field={field}
                  key={field}
                  label={label}
                  onChange={(fieldName, value) =>
                    updatePeriod(index, fieldName, value)
                  }
                  unit={currencyCode()}
                  value={period[field]}
                />
              ))}
            </div>
          </div>

          <div className="period-input-section">
            <h4>Revenue</h4>
            <div className="period-revenue-grid">
              <NumberField
                field="revenueExclVat"
                label="Revenue excl. VAT"
                onChange={(field, value) => updatePeriod(index, field, value)}
                unit={currencyCode()}
                value={period.revenueExclVat}
              />
            </div>
          </div>
        </section>

        <section className="period-output-zone">
          <div className="zone-heading output">
            <span>Output</span>
            <strong>Calculated preview</strong>
          </div>
          <div className="period-output-metrics">
            <Fact label="Loaded km" value={format(output?.loadedKm)} />
            <Fact label="Cost used" value={money(output?.periodTotalCost)} />
            <Fact label="Break-even" value={`${money(output?.breakEvenPerLoadedKm)} / km`} />
            <Fact label="Status" value={titleCase(output?.dataStatus || period.dataStatus || "planned")} />
          </div>
        </section>
      </div>
    </article>
  );
}

function BreakEvenResultsPage({
  agentError,
  agentInsight,
  calculation,
  isAgentLoading,
  onExplainResult
}) {
  const result = calculation?.result;

  if (!result) return <EmptyState title="No result yet" text="Calculate a preview first." />;

  return (
    <div className="page-stack">
      <ModeStatusPanel result={result} />

      <section className="summary-grid">
        <Kpi label="Total annual cost" value={money(result.totalAnnualCost)} unit={currencyUnit("year")} />
        <Kpi label="Break-even loaded km" value={money(result.breakEvenPerLoadedKm)} unit={`${currencyCode()}/km`} />
        <Kpi label="Break-even tonne-km" value={money(result.breakEvenPerTonneKm)} unit={`${currencyCode()}/t-km`} />
        <Kpi label="EBIT before tax" value={money(result.ebitBeforeTax)} unit={currencyUnit("year")} />
      </section>

      <AIInsightsCard
        error={agentError}
        insight={agentInsight}
        isLoading={isAgentLoading}
        onExplainResult={onExplainResult}
      />

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

function AIInsightsCard({
  buttonLabel = "Explain this result",
  emptyText = "No insight generated yet.",
  error,
  eyebrow = "AI Insights",
  insight,
  isLoading,
  loadingLabel = "Analysing...",
  onExplainResult,
  title = "Cost Intelligence"
}) {
  return (
    <section className="ai-insights-card">
      <div className="ai-insights-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <div className="ai-insights-actions">
          {insight?.confidence && (
            <span className={`confidence-pill ${insight.confidence}`}>
              {titleCase(insight.confidence)} confidence
            </span>
          )}
          <button
            className="primary-button"
            disabled={isLoading}
            onClick={onExplainResult}
            type="button"
          >
            {isLoading ? loadingLabel : buttonLabel}
          </button>
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      {insight ? (
        <div className="ai-insight-body">
          <section className="ai-summary-panel">
            <span>{insight.source === "openai" ? "AI response" : "Rule-based response"}</span>
            <strong>{insight.summary}</strong>
            <p>{insight.answer}</p>
          </section>
          <div className="ai-insight-grid">
            <InsightList title="Calculated Result" items={insight.calculatedResult} />
            <InsightList title="Interpretation" items={insight.interpretation} />
            <InsightList title="Key Drivers" items={insight.mainDrivers} />
            <InsightList title="Risks" items={insight.risks} emptyText="No major risk flagged." />
            <InsightList title="Recommended Actions" items={insight.recommendedActions || insight.recommendations} />
            <InsightList title="Assumptions" items={insight.assumptions} />
          </div>
        </div>
      ) : (
        <div className="ai-empty-state">
          <strong>{emptyText}</strong>
        </div>
      )}
    </section>
  );
}

function InsightList({ emptyText = "No items.", items = [], title }) {
  const visibleItems = items.length > 0 ? items : [emptyText];
  return (
    <section className="insight-list">
      <h3>{title}</h3>
      <ul>
        {visibleItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
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
  const [selectedPayloadUtilisation, setSelectedPayloadUtilisation] = useState(
    sensitivity?.payloadUtilisationSensitivity?.[Math.floor((sensitivity?.payloadUtilisationSensitivity?.length || 1) / 2)]
      ?.payloadUtilisation || 0.8
  );
  if (!sensitivity) return <EmptyState title="No sensitivity yet" text="Calculate a preview first." />;
  const fuelPoint = nearestSensitivityPoint(
    sensitivity.fuelPriceSensitivity,
    "fuelPricePerLiter",
    selectedFuelPrice
  );
  const payloadPoint = nearestSensitivityPoint(
    sensitivity.payloadUtilisationSensitivity,
    "payloadUtilisation",
    selectedPayloadUtilisation
  );
  const vehicleLowest = minBy(sensitivity.vehicleClassSensitivity, "breakEvenPerLoadedKm");
  const vehicleHighest = maxBy(sensitivity.vehicleClassSensitivity, "breakEvenPerLoadedKm");

  return (
    <div className="page-stack">
      <section className="sensitivity-lab-intro">
        <div>
          <p className="eyebrow">Sensitivity lab</p>
          <h2>Hover a card to inspect the moving parts</h2>
          <p>
            Each card stays compact until you need the detail. Move the mouse away and it closes back, keeping the page scannable.
          </p>
        </div>
      </section>

      <section className="sensitivity-stack">
        <HoverSensitivityCard
          kicker="Vehicle mix"
          metric={`${money(vehicleLowest)} - ${money(vehicleHighest)}`}
          metricLabel={`${currencyCode()}/loaded km range`}
          summary="Compare how the same work profile behaves across vehicle classes and payload bands."
          title="Vehicle Class Sensitivity"
        >
          <SensitivityBars
            labelFormatter={(row) => row.vehicleClassName}
            rows={sensitivity.vehicleClassSensitivity}
            valueField="breakEvenPerLoadedKm"
          />
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
        </HoverSensitivityCard>

        <HoverSensitivityCard
          kicker="Payload"
          metric={money(payloadPoint?.breakEvenPerTonneKm)}
          metricLabel={`${currencyCode()}/tonne-km at ${percent(selectedPayloadUtilisation)}`}
          summary="Drag payload utilisation to see how tonne-km economics change as capacity fills or empties."
          title="Payload Utilisation"
        >
          <SensitivitySlider
            max={maxBy(sensitivity.payloadUtilisationSensitivity, "payloadUtilisation")}
            min={minBy(sensitivity.payloadUtilisationSensitivity, "payloadUtilisation")}
            onChange={setSelectedPayloadUtilisation}
            step="0.01"
            value={selectedPayloadUtilisation}
            valueLabel={percent(selectedPayloadUtilisation)}
          />
          <div className="sensitivity-facts">
            <Fact label="Nearest tonne-km break-even" value={money(payloadPoint?.breakEvenPerTonneKm)} />
            <Fact label="Annual tonne-km" value={format(payloadPoint?.annualTonneKm)} />
          </div>
          <SensitivityBars
            labelFormatter={(row) => percent(row.payloadUtilisation)}
            rows={sensitivity.payloadUtilisationSensitivity}
            valueField="breakEvenPerTonneKm"
          />
          <DataTable
            columns={["Utilisation", `${currencyCode()}/tonne-km`, "Annual tonne-km"]}
            rows={sensitivity.payloadUtilisationSensitivity.map((row) => [
              percent(row.payloadUtilisation),
              money(row.breakEvenPerTonneKm),
              format(row.annualTonneKm)
            ])}
          />
        </HoverSensitivityCard>

        <HoverSensitivityCard
          kicker="Fuel"
          metric={money(fuelPoint?.breakEvenPerLoadedKm)}
          metricLabel={`${currencyCode()}/loaded km at ${money(selectedFuelPrice, 2)}/l`}
          summary="Drag fuel price to inspect how variable cost and break-even move together."
          title="Fuel Price"
        >
          <SensitivitySlider
            max={maxBy(sensitivity.fuelPriceSensitivity, "fuelPricePerLiter")}
            min={minBy(sensitivity.fuelPriceSensitivity, "fuelPricePerLiter")}
            onChange={setSelectedFuelPrice}
            step="0.01"
            value={selectedFuelPrice}
            valueLabel={money(selectedFuelPrice, 2)}
          />
          <div className="sensitivity-facts">
            <Fact label="Nearest break-even" value={money(fuelPoint?.breakEvenPerLoadedKm)} />
            <Fact label="Variable cost/km" value={money(fuelPoint?.variableCostPerKm)} />
          </div>
          <SensitivityBars
            labelFormatter={(row) => money(row.fuelPricePerLiter, 2)}
            rows={sensitivity.fuelPriceSensitivity}
            valueField="breakEvenPerLoadedKm"
          />
          <DataTable
            columns={["Fuel price", "Variable cost/km", "Total cost", "Break-even"]}
            rows={sensitivity.fuelPriceSensitivity.map((row) => [
              money(row.fuelPricePerLiter, 2),
              money(row.variableCostPerKm),
              money(row.totalAnnualCost),
              money(row.breakEvenPerLoadedKm)
            ])}
          />
        </HoverSensitivityCard>
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
  const [historyAgentInsight, setHistoryAgentInsight] = useState(null);
  const [historyAgentError, setHistoryAgentError] = useState("");
  const [isHistoryAgentLoading, setIsHistoryAgentLoading] = useState(false);
  const selectedRuns = history.filter((run) => selectedIds.includes(String(run.id)));

  function toggleRunSelection(id) {
    const runId = String(id);
    setHistoryAgentInsight(null);
    setHistoryAgentError("");
    setSelectedIds((current) => {
      if (current.includes(runId)) return current.filter((item) => item !== runId);
      return [...current, runId].slice(-3);
    });
  }

  async function explainHistoryGraphics() {
    setIsHistoryAgentLoading(true);
    setHistoryAgentError("");

    try {
      const response = await apiRequest("/api/agent/analyse", {
        method: "POST",
        body: {
          agent: "history-visual",
          question: "Interpret the saved-run trend and flow graphics.",
          outputs: buildHistoryVisualPayload(history, selectedRuns)
        }
      });
      setHistoryAgentInsight(response);
    } catch (error) {
      setHistoryAgentError(error.message || "Graphic interpretation failed");
    } finally {
      setIsHistoryAgentLoading(false);
    }
  }

  return (
    <div className="page-stack">
      {selectedRuns.length > 0 && (
        <Card title="Run Comparison">
          <RunComparison runs={selectedRuns} />
        </Card>
      )}

      {history.length > 0 && (
        <HistoryTrendPanel
          agentError={historyAgentError}
          agentInsight={historyAgentInsight}
          isAgentLoading={isHistoryAgentLoading}
          onExplainGraphics={explainHistoryGraphics}
          runs={history}
          selectedRuns={selectedRuns}
        />
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
                  <span>
                    {calculationModeLabels[run.calculationMode] || "Snapshot"} | {run.planYear || "n/a"} | {titleCase(run.scenarioStatus || "draft")}
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

function HistoryTrendPanel({
  agentError,
  agentInsight,
  isAgentLoading,
  onExplainGraphics,
  runs,
  selectedRuns
}) {
  const orderedRuns = [...runs]
    .filter((run) =>
      Number.isFinite(Number(run.breakEvenPerLoadedKm)) &&
      Number.isFinite(Number(run.customerRateExclVat)) &&
      Number.isFinite(Number(run.profitAfterTax))
    )
    .sort((left, right) => dateNumber(left.createdAt) - dateNumber(right.createdAt));
  const chartRuns = orderedRuns.slice(-12);

  if (chartRuns.length === 0) return null;

  const selectedIdSet = new Set(selectedRuns.map((run) => String(run.id)));
  const focusedRun = newestRun(selectedRuns.length > 0 ? selectedRuns : chartRuns);
  const firstRun = chartRuns[0];
  const latestRun = chartRuns[chartRuns.length - 1];
  const xStart = 62;
  const xEnd = 790;
  const rateTop = 24;
  const rateBottom = 154;
  const profitBase = 224;
  const profitLimit = 52;
  const rateValues = chartRuns.flatMap((run) => [
    Number(run.breakEvenPerLoadedKm),
    Number(run.customerRateExclVat)
  ]);
  const rateMin = Math.min(...rateValues);
  const rateMax = Math.max(...rateValues);
  const ratePadding = Math.max((rateMax - rateMin) * 0.12, 0.01);
  const rateDomain = {
    min: rateMin - ratePadding,
    max: rateMax + ratePadding
  };
  const maxAbsProfit = Math.max(
    ...chartRuns.map((run) => Math.abs(Number(run.profitAfterTax))),
    1
  );
  const breakEvenPoints = chartRuns.map((run, index) => chartPoint({
    chartRuns,
    index,
    value: Number(run.breakEvenPerLoadedKm),
    xEnd,
    xStart,
    yBottom: rateBottom,
    yDomain: rateDomain,
    yTop: rateTop
  }));
  const customerRatePoints = chartRuns.map((run, index) => chartPoint({
    chartRuns,
    index,
    value: Number(run.customerRateExclVat),
    xEnd,
    xStart,
    yBottom: rateBottom,
    yDomain: rateDomain,
    yTop: rateTop
  }));
  const latestRateDelta =
    Number(latestRun.breakEvenPerLoadedKm) - Number(firstRun.breakEvenPerLoadedKm);
  const latestProfitDelta =
    Number(latestRun.profitAfterTax) - Number(firstRun.profitAfterTax);
  const flowScale = Math.max(
    Number(focusedRun?.totalAnnualCost) || 0,
    Math.abs(Number(focusedRun?.profitAfterTax) || 0),
    1
  );
  const rateScale = Math.max(
    Number(focusedRun?.breakEvenPerLoadedKm) || 0,
    Number(focusedRun?.customerRateExclVat) || 0,
    1
  );
  const flowItems = [
    {
      label: "Annual cost",
      value: money(focusedRun?.totalAnnualCost),
      width: clampPercent(safeRatio(Number(focusedRun?.totalAnnualCost), flowScale) * 100)
    },
    {
      label: "Break-even",
      value: `${money(focusedRun?.breakEvenPerLoadedKm)} / km`,
      width: clampPercent(safeRatio(Number(focusedRun?.breakEvenPerLoadedKm), rateScale) * 100)
    },
    {
      label: "Customer rate",
      value: `${money(focusedRun?.customerRateExclVat)} / km`,
      width: clampPercent(safeRatio(Number(focusedRun?.customerRateExclVat), rateScale) * 100)
    },
    {
      label: "Profit",
      value: money(focusedRun?.profitAfterTax),
      width: clampPercent(
        safeRatio(Math.abs(Number(focusedRun?.profitAfterTax)), flowScale) * 100
      )
    }
  ];

  return (
    <section className="history-visual-panel" aria-label="Saved run trends and flow">
      <div className="history-visual-header">
        <div>
          <p className="eyebrow">Trend & flow</p>
          <h2>Saved run movement</h2>
        </div>
        <div className="history-visual-stats">
          <span>
            Break-even
            <strong>{signedMoney(latestRateDelta, 4)} / km</strong>
          </span>
          <span>
            Profit
            <strong>{signedMoney(latestProfitDelta)}</strong>
          </span>
        </div>
      </div>

      <div className="history-chart-layout">
        <div className="history-trend-chart">
          <svg
            aria-label="Break-even, customer rate and profit trend across saved runs"
            role="img"
            viewBox="0 0 840 274"
          >
            <line className="chart-grid-line" x1="62" x2="790" y1="24" y2="24" />
            <line className="chart-grid-line" x1="62" x2="790" y1="89" y2="89" />
            <line className="chart-grid-line" x1="62" x2="790" y1="154" y2="154" />
            <line className="chart-axis-line" x1="62" x2="790" y1="224" y2="224" />
            <text className="chart-axis-label" x="18" y="28">{money(rateDomain.max, 2)}</text>
            <text className="chart-axis-label" x="18" y="158">{money(rateDomain.min, 2)}</text>
            <text className="chart-axis-label" x="18" y="228">Profit</text>
            {chartRuns.map((run, index) => {
              const x = chartX(index, chartRuns.length, xStart, xEnd);
              const profit = Number(run.profitAfterTax);
              const barHeight = safeRatio(Math.abs(profit), maxAbsProfit) * profitLimit;
              const y = profit >= 0 ? profitBase - barHeight : profitBase;
              const highlighted = selectedIdSet.has(String(run.id));

              return (
                <g className={highlighted ? "is-highlighted" : ""} key={run.id}>
                  <rect
                    className="profit-bar"
                    height={Math.max(barHeight, 2)}
                    rx="3"
                    width="18"
                    x={x - 9}
                    y={y}
                  />
                  {highlighted && (
                    <line className="selected-run-marker" x1={x} x2={x} y1="18" y2="242" />
                  )}
                  <text className="chart-run-label" textAnchor="middle" x={x} y="264">
                    {shortDateTime(run.createdAt)}
                  </text>
                </g>
              );
            })}
            <path className="break-even-line" d={linePath(breakEvenPoints)} />
            <path className="customer-rate-line" d={linePath(customerRatePoints)} />
            {breakEvenPoints.map((point) => (
              <circle className="break-even-point" cx={point.x} cy={point.y} key={`be-${point.id}`} r="4.5" />
            ))}
            {customerRatePoints.map((point) => (
              <circle className="customer-rate-point" cx={point.x} cy={point.y} key={`rate-${point.id}`} r="4.5" />
            ))}
          </svg>
          <div className="chart-legend" aria-hidden="true">
            <span><i className="legend-break-even" />Break-even</span>
            <span><i className="legend-rate" />Customer rate</span>
            <span><i className="legend-profit" />Profit</span>
          </div>
        </div>

        <div className="history-flow-panel">
          <div>
            <span>{focusedRun?.runName || "Latest run"}</span>
            <strong>{dateTime(focusedRun?.createdAt)}</strong>
          </div>
          <div className="history-flow-chain">
            {flowItems.map((item) => (
              <div className="history-flow-step" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <i style={{ width: `${item.width}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <AIInsightsCard
        buttonLabel="Interpret graphics"
        emptyText="Ask the agent to read the trend lines, profit bars, and focused run flow."
        error={agentError}
        eyebrow="AI chart reading"
        insight={agentInsight}
        isLoading={isAgentLoading}
        onExplainResult={onExplainGraphics}
        title="Graphic Interpreter"
      />
    </section>
  );
}

function TeamPage({ createWorkspaceUser, session }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("member");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordState = passwordValidationState(password, confirmPassword);
  const canSubmit =
    !isSubmitting &&
    email.trim() &&
    passwordState.isValid;

  if (session.user?.role !== "admin") {
    return (
      <EmptyState
        title="Admin access required"
        text="Only workspace admins can create new accounts."
      />
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setNotice("");
    setError("");

    if (!passwordState.isValid) {
      setError("Complete the password requirements before creating the account.");
      setIsSubmitting(false);
      return;
    }

    try {
      const user = await createWorkspaceUser({ email, name, password, role });
      setNotice(`Created ${user.email}`);
      setEmail("");
      setName("");
      setPassword("");
      setConfirmPassword("");
      setRole("member");
    } catch (nextError) {
      setError(nextError.message || "User creation failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Team</p>
          <h2>{session.workspace?.name || "Workspace"} accounts</h2>
          <div className="dashboard-meta">
            <span>{session.user?.email}</span>
            <span>{titleCase(session.user?.role || "admin")}</span>
          </div>
        </div>
      </section>

      <section className="form-grid">
        <Card title="Create User">
          <form className="team-form" onSubmit={handleSubmit}>
            <TextField label="Name" onChange={setName} value={name} />
            <TextField label="Email" onChange={setEmail} type="email" value={email} />
            <PasswordField
              autoComplete="new-password"
              label="New password"
              onChange={setPassword}
              showPassword={showPassword}
              toggleShowPassword={() => setShowPassword((current) => !current)}
              value={password}
            />
            <PasswordField
              autoComplete="new-password"
              label="Confirm password"
              onChange={setConfirmPassword}
              showPassword={showPassword}
              toggleShowPassword={() => setShowPassword((current) => !current)}
              value={confirmPassword}
            />
            <PasswordChecklist state={passwordState} />
            <SelectField
              label="Role"
              onChange={setRole}
              options={[
                ["member", "Member"],
                ["admin", "Admin"]
              ]}
              value={role}
            />
            {notice && <div className="team-notice">{notice}</div>}
            {error && <div className="auth-error">{error}</div>}
            <button className="primary-button" disabled={!canSubmit} type="submit">
              {isSubmitting ? "Creating..." : "Create account"}
            </button>
          </form>
        </Card>

        <Card title="Access Model">
          <p className="helper-text">
            Accounts belong to this workspace. Members can work with saved runs and exports; admins can create users and view audit data.
          </p>
          <Fact label="Workspace" value={session.workspace?.name || "n/a"} />
          <Fact label="Your role" value={titleCase(session.user?.role || "admin")} />
        </Card>
      </section>
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

function HoverSensitivityCard({
  children,
  kicker,
  metric,
  metricLabel,
  summary,
  title
}) {
  return (
    <section
      aria-label={title}
      className="hover-sensitivity-card"
      tabIndex={0}
    >
      <div className="hover-sensitivity-summary">
        <div>
          <span>{kicker}</span>
          <h2>{title}</h2>
          <p>{summary}</p>
        </div>
        <div className="hover-sensitivity-metric">
          <strong>{metric}</strong>
          <small>{metricLabel}</small>
        </div>
      </div>
      <div className="hover-sensitivity-body">{children}</div>
    </section>
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

function TextField({ label, onChange, type = "text", value }) {
  return (
    <label className="text-field">
      <span>{label}</span>
      <input
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value ?? ""}
      />
    </label>
  );
}

function DateField({ label, onChange, value }) {
  return (
    <label className="text-field">
      <span>{label}</span>
      <input
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value ?? ""}
      />
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

function primaryVehicleCode(input, vehicles = []) {
  const vehicle = vehicles.find((item) => item.id === Number(input.vehicleClassId));
  return vehicle?.code || vehicle?.displayName || vehicle?.name || "BLUEPRINT_DEFAULT";
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

function defaultTimeModel() {
  return {
    calculationMode: "snapshot",
    planYear: new Date().getFullYear(),
    asOfDate: todayIso(),
    scenarioStatus: "draft",
    scenarioVersion: 1
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function calculationSignature(payloadOrCalculation) {
  return JSON.stringify({
    input: payloadOrCalculation.input,
    calculationMode: payloadOrCalculation.calculationMode,
    planYear: payloadOrCalculation.planYear,
    asOfDate: payloadOrCalculation.asOfDate,
    scenarioStatus: payloadOrCalculation.scenarioStatus,
    scenarioVersion: payloadOrCalculation.scenarioVersion,
    periods: payloadOrCalculation.periods || []
  });
}

function normalizePeriodForPayload(period) {
  return {
    ...period,
    periodType: period.periodType || "month",
    dataStatus: period.dataStatus || "planned",
    totalKm: parseNullableNumber(period.totalKm),
    loadedKm: parseNullableNumber(period.loadedKm),
    loadFactor: parseNullableNumber(period.loadFactor),
    fuelCost: parseNullableNumber(period.fuelCost),
    tyresCost: parseNullableNumber(period.tyresCost),
    maintenanceCost: parseNullableNumber(period.maintenanceCost),
    roadFeesCost: parseNullableNumber(period.roadFeesCost),
    driverCost: parseNullableNumber(period.driverCost),
    fixedVehicleCost: parseNullableNumber(period.fixedVehicleCost),
    structuralOverheadCost: parseNullableNumber(period.structuralOverheadCost),
    otherCost: parseNullableNumber(period.otherCost),
    revenueExclVat: parseNullableNumber(period.revenueExclVat)
  };
}

function periodNumberField(field) {
  return [
    "totalKm",
    "loadedKm",
    "loadFactor",
    "fuelCost",
    "tyresCost",
    "maintenanceCost",
    "roadFeesCost",
    "driverCost",
    "fixedVehicleCost",
    "structuralOverheadCost",
    "otherCost",
    "revenueExclVat"
  ].includes(field);
}

function parseNullableNumber(value) {
  if (value === "" || value == null) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function createBlankPeriod(year, index) {
  const monthIndex = index % 12;
  return {
    id: `period-${Date.now()}-${index}`,
    periodStart: monthStart(year || new Date().getFullYear(), monthIndex),
    periodEnd: monthEnd(year || new Date().getFullYear(), monthIndex),
    periodType: "month",
    dataStatus: "planned",
    totalKm: "",
    loadedKm: "",
    fuelCost: "",
    tyresCost: "",
    maintenanceCost: "",
    roadFeesCost: "",
    driverCost: "",
    fixedVehicleCost: "",
    structuralOverheadCost: "",
    otherCost: "",
    revenueExclVat: ""
  };
}

function copyPeriodAssumptions(source = {}, target = {}) {
  return periodAssumptionFields.reduce(
    (nextPeriod, field) => ({
      ...nextPeriod,
      [field]: source[field]
    }),
    target
  );
}

function buildMonthlyPlanFromResult(result, year) {
  const planYear = Number(year) || new Date().getFullYear();
  return Array.from({ length: 12 }, (_, index) => {
    const totalKm = safeRatio(result.annualTotalKm, 12);
    const loadedKm = safeRatio(result.loadedKmYear, 12);
    return {
      id: `planned-${planYear}-${String(index + 1).padStart(2, "0")}`,
      periodStart: monthStart(planYear, index),
      periodEnd: monthEnd(planYear, index),
      periodType: "month",
      dataStatus: "planned",
      totalKm,
      loadedKm,
      fuelCost: (result.fuelCostPerKm || 0) * totalKm,
      tyresCost: (result.tyresCostPerKm || 0) * totalKm,
      maintenanceCost: (result.maintenanceCostPerKm || 0) * totalKm,
      roadFeesCost: (result.roadFeesCostPerKm || 0) * totalKm,
      driverCost: safeRatio(result.driverAnnualCost, 12),
      fixedVehicleCost: safeRatio(result.vehicleFixedAnnualCost, 12),
      structuralOverheadCost: safeRatio(result.structuralIndirectCostsAnnual, 12),
      otherCost: safeRatio(result.otherAnnualCost, 12),
      revenueExclVat: safeRatio(result.annualRevenueExclVat, 12)
    };
  });
}

function monthStart(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

function monthEnd(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
}

function passwordValidationState(password, confirmPassword) {
  const value = String(password || "");
  const checks = [
    {
      label: "At least 12 characters",
      valid: value.length >= 12
    },
    {
      label: "Lowercase letter",
      valid: /[a-z]/.test(value)
    },
    {
      label: "Uppercase letter",
      valid: /[A-Z]/.test(value)
    },
    {
      label: "Number",
      valid: /\d/.test(value)
    },
    {
      label: "Symbol",
      valid: /[^A-Za-z0-9\s]/.test(value)
    },
    {
      label: "No spaces",
      valid: value.length > 0 && !/\s/.test(value)
    },
    {
      label: "Passwords match",
      valid: value.length > 0 && value === String(confirmPassword || "")
    }
  ];
  const coreScore = checks.slice(0, 6).filter((check) => check.valid).length;
  const score = value ? Math.min(5, Math.max(1, coreScore)) : 0;

  return {
    checks,
    isValid: checks.every((check) => check.valid),
    label:
      coreScore >= 6
        ? "Strong"
        : coreScore >= 4
          ? "Getting there"
          : value
            ? "Weak"
            : "Empty",
    score
  };
}

function friendlyWarning(code) {
  const labels = {
    SNAPSHOT_ASSUMPTION_FULL_YEAR: "Snapshot assumes current values apply to the full year",
    MISSING_ACTUAL_PERIODS: "Some completed periods use planned data",
    MISSING_FORECAST_PERIODS: "Some future periods use planned data",
    ACTUAL_YEAR_INCOMPLETE: "Actual annual mode is missing actual periods",
    LOW_LOADED_KM: "Loaded kilometres are low or zero",
    LOW_LOAD_FACTOR: "Load factor is unusually low",
    PERIOD_DATA_INCOMPLETE: "Some period data is incomplete"
  };
  return labels[code] || titleCase(String(code).replaceAll("_", " "));
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function chartX(index, count, xStart, xEnd) {
  if (count <= 1) return (xStart + xEnd) / 2;
  return xStart + (index / (count - 1)) * (xEnd - xStart);
}

function chartPoint({
  chartRuns,
  index,
  value,
  xEnd,
  xStart,
  yBottom,
  yDomain,
  yTop
}) {
  const ratio = safeRatio(value - yDomain.min, yDomain.max - yDomain.min);
  return {
    id: chartRuns[index].id,
    x: chartX(index, chartRuns.length, xStart, xEnd),
    y: yBottom - clampPercent(ratio * 100) / 100 * (yBottom - yTop)
  };
}

function linePath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function dateTime(value) {
  if (!value) return "n/a";
  return new Date(value).toLocaleString(activeFormatContext.locale, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function shortDateTime(value) {
  if (!value) return "n/a";
  return new Date(value).toLocaleString(activeFormatContext.locale, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  });
}

function dateNumber(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestRun(runs = []) {
  const sortedRuns = [...runs].sort(
    (left, right) => dateNumber(left.createdAt) - dateNumber(right.createdAt)
  );
  return sortedRuns[sortedRuns.length - 1];
}

function buildHistoryVisualPayload(runs = [], selectedRuns = []) {
  const chartRuns = [...runs]
    .filter((run) =>
      Number.isFinite(Number(run.breakEvenPerLoadedKm)) &&
      Number.isFinite(Number(run.customerRateExclVat)) &&
      Number.isFinite(Number(run.profitAfterTax))
    )
    .sort((left, right) => dateNumber(left.createdAt) - dateNumber(right.createdAt))
    .slice(-12)
    .map(historyRunForAgent);
  const selectedIdSet = new Set(selectedRuns.map((run) => String(run.id)));
  const visibleSelectedRuns = chartRuns.filter((run) => selectedIdSet.has(String(run.id)));
  const focusedRun = newestRun(visibleSelectedRuns.length > 0 ? visibleSelectedRuns : chartRuns);
  const firstRun = chartRuns[0];
  const latestRun = chartRuns[chartRuns.length - 1];

  return {
    chartRuns,
    selectedRuns: visibleSelectedRuns,
    focusedRun,
    deltas:
      firstRun && latestRun
        ? {
            breakEvenPerLoadedKm:
              Number(latestRun.breakEvenPerLoadedKm) -
              Number(firstRun.breakEvenPerLoadedKm),
            customerRateExclVat:
              Number(latestRun.customerRateExclVat) -
              Number(firstRun.customerRateExclVat),
            profitAfterTax:
              Number(latestRun.profitAfterTax) - Number(firstRun.profitAfterTax)
          }
        : {}
  };
}

function historyRunForAgent(run) {
  return {
    id: String(run.id),
    runName: run.runName,
    createdAt: run.createdAt,
    country: run.country,
    companyType: run.companyType,
    calculationMode: run.calculationMode,
    planYear: run.planYear,
    scenarioStatus: run.scenarioStatus,
    totalAnnualCost: Number(run.totalAnnualCost),
    breakEvenPerLoadedKm: Number(run.breakEvenPerLoadedKm),
    customerRateExclVat: Number(run.customerRateExclVat),
    profitAfterTax: Number(run.profitAfterTax)
  };
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
