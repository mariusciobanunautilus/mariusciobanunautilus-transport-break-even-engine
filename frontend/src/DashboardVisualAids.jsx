const calculationModeLabels = {
  snapshot: "Snapshot",
  planned_annual: "Planned Annual",
  rolling_forecast: "Rolling Forecast",
  actual_annual: "Actual Annual"
};

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

export function DashboardVisualAidGrid({
  formatContext,
  onGeneratePlan,
  onOpenTimeModel,
  periods,
  pricingScenarios,
  result,
  selectedTaxProfile,
  timeModel
}) {
  const formatters = createFormatters(formatContext);

  return (
    <section className="dashboard-visual-grid">
      <CostBreakdownVisual formatters={formatters} result={result} />
      <TimeWeightedTimeline
        formatters={formatters}
        onGeneratePlan={onGeneratePlan}
        onOpenTimeModel={onOpenTimeModel}
        periods={periods}
        result={result}
        timeModel={timeModel}
      />
      <PeriodComparisonVisual
        formatters={formatters}
        onGeneratePlan={onGeneratePlan}
        onOpenTimeModel={onOpenTimeModel}
        periods={periods}
        result={result}
      />
      <ModelSignalsVisual
        formatters={formatters}
        periods={periods}
        pricingScenarios={pricingScenarios}
        result={result}
        selectedTaxProfile={selectedTaxProfile}
        timeModel={timeModel}
      />
    </section>
  );
}

function CostBreakdownVisual({ formatters, result }) {
  const rows = buildCostBreakdownRows(result);
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <section className="dashboard-visual-panel cost-breakdown-visual">
      <div className="panel-heading">
        <h2>Cost Mix</h2>
        <span>{formatters.money(total || result?.totalAnnualCost)}</span>
      </div>
      {rows.length === 0 ? (
        <EmptyVisual text="No cost result yet" />
      ) : (
        <>
          <div className="stacked-cost-bar" aria-label="Cost breakdown">
            {rows.map((row) => (
              <span
                key={row.label}
                style={{
                  "--segment-color": row.color,
                  "--segment-width": `${Math.max(row.share, 1.5)}%`
                }}
                title={`${row.label}: ${formatters.money(row.value)}`}
              />
            ))}
          </div>
          <div className="cost-legend">
            {rows.map((row) => (
              <div className="cost-legend-row" key={row.label}>
                <span style={{ "--legend-color": row.color }} />
                <strong>{row.label}</strong>
                <small>{formatters.money(row.value)}</small>
                <em>{formatters.number(row.share)}%</em>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function TimeWeightedTimeline({
  formatters,
  onGeneratePlan,
  onOpenTimeModel,
  periods,
  result,
  timeModel
}) {
  const months = buildTimelineMonths({
    locale: formatters.locale,
    periods,
    result,
    timeModel
  });
  const hasPeriods = periods.length > 0;
  const mode = result?.calculationMode || timeModel?.calculationMode || "snapshot";

  return (
    <section className="dashboard-visual-panel timeline-visual">
      <div className="panel-heading">
        <h2>Time Timeline</h2>
        <span>{calculationModeLabels[mode] || titleCase(mode)}</span>
      </div>
      <div className="timeline-track">
        {months.map((month) => (
          <div
            className={[
              "timeline-month",
              `status-${month.status}`,
              month.selected ? "selected" : ""
            ].join(" ")}
            key={month.key}
            title={`${month.label}: ${titleCase(month.status)}`}
          >
            <span>{month.shortLabel}</span>
          </div>
        ))}
      </div>
      <div className="timeline-legend">
        {["actual", "forecast", "planned", "snapshot"].map((status) => (
          <span className={`status-dot status-${status}`} key={status}>
            {titleCase(status)}
          </span>
        ))}
      </div>
      {!hasPeriods && (
        <div className="visual-actions">
          <button onClick={onGeneratePlan} type="button">
            Generate Monthly Plan
          </button>
          <button onClick={onOpenTimeModel} type="button">
            Time Model
          </button>
        </div>
      )}
    </section>
  );
}

function PeriodComparisonVisual({
  formatters,
  onGeneratePlan,
  onOpenTimeModel,
  periods,
  result
}) {
  const rows = buildPeriodComparisonRows({ periods, result });
  const maxCost = Math.max(...rows.map((row) => row.cost), 0);
  const maxLoadedKm = Math.max(...rows.map((row) => row.loadedKm), 0);

  return (
    <section className="dashboard-visual-panel period-comparison-visual">
      <div className="panel-heading">
        <h2>Plan Actual Forecast</h2>
        <span>{rows.length ? `${rows.length} periods` : "No periods"}</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty-visual">
          <span>No period rows yet</span>
          <div className="visual-actions">
            <button onClick={onGeneratePlan} type="button">
              Generate Monthly Plan
            </button>
            <button onClick={onOpenTimeModel} type="button">
              Time Model
            </button>
          </div>
        </div>
      ) : (
        <div className="period-comparison-list">
          {rows.map((row) => (
            <div className="period-comparison-row" key={row.key}>
              <div className="period-comparison-label">
                <strong>{row.label}</strong>
                <span className={`period-status status-${row.status}`}>
                  {titleCase(row.status)}
                </span>
              </div>
              <div className="comparison-bars">
                <span
                  className="loaded-km-bar"
                  style={{ "--bar-width": `${barPercent(row.loadedKm, maxLoadedKm)}%` }}
                  title={`Loaded km: ${formatters.number(row.loadedKm)}`}
                />
                <span
                  className="cost-bar"
                  style={{ "--bar-width": `${barPercent(row.cost, maxCost)}%` }}
                  title={`Cost: ${formatters.money(row.cost)}`}
                />
              </div>
              <div className="period-comparison-values">
                <span>{formatters.number(row.loadedKm)} km</span>
                <strong>{formatters.money(row.cost)}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ModelSignalsVisual({
  formatters,
  periods,
  pricingScenarios,
  result,
  selectedTaxProfile,
  timeModel
}) {
  const mode = result?.calculationMode || timeModel?.calculationMode || "snapshot";
  const warnings = result?.warnings || [];
  const completeness = result?.dataCompletenessStatus || "fallback";
  const periodCount =
    result?.periodAggregation?.sourcePeriodCount ?? periods.length ?? 0;
  const signals = [
    {
      label: "Mode",
      value: calculationModeLabels[mode] || titleCase(mode),
      tone: mode === "snapshot" ? "neutral" : "good"
    },
    {
      label: "Completeness",
      value: titleCase(completeness),
      tone:
        completeness === "complete"
          ? "good"
          : completeness === "partial"
            ? "warning"
            : "danger"
    },
    {
      label: "Periods",
      value: formatters.count(periodCount),
      tone: periodCount > 0 ? "good" : "neutral"
    },
    {
      label: "Warnings",
      value: formatters.count(warnings.length),
      tone: warnings.length > 0 ? "warning" : "good"
    },
    {
      label: "Pricing Cases",
      value: formatters.count(pricingScenarios.length),
      tone: pricingScenarios.length > 0 ? "good" : "neutral"
    },
    {
      label: "Reference",
      value: titleCase(
        selectedTaxProfile?.reviewStatus || selectedTaxProfile?.status || "indicative"
      ),
      tone:
        selectedTaxProfile?.reviewStatus === "reviewed" ||
        selectedTaxProfile?.status === "official"
          ? "good"
          : "warning"
    },
    {
      label: "Confidence",
      value: titleCase(selectedTaxProfile?.confidenceLevel || "medium"),
      tone: selectedTaxProfile?.confidenceLevel === "high" ? "good" : "warning"
    }
  ];

  return (
    <section className="dashboard-visual-panel model-signals-visual">
      <div className="panel-heading">
        <h2>Model Signals</h2>
        <span>{timeModel?.scenarioStatus ? titleCase(timeModel.scenarioStatus) : "Draft"}</span>
      </div>
      <div className="signal-grid">
        {signals.map((signal) => (
          <div className={`signal-tile tone-${signal.tone}`} key={signal.label}>
            <span>{signal.label}</span>
            <strong>{signal.value}</strong>
          </div>
        ))}
      </div>
      {warnings.length > 0 ? (
        <div className="signal-warnings">
          {warnings.map((warning) => (
            <span key={warning}>{friendlyWarning(warning)}</span>
          ))}
        </div>
      ) : (
        <div className="signal-warnings clear">
          <span>No model warnings</span>
        </div>
      )}
    </section>
  );
}

function EmptyVisual({ text }) {
  return (
    <div className="empty-visual">
      <span>{text}</span>
    </div>
  );
}

function buildCostBreakdownRows(result) {
  if (!result) return [];
  const totalKm = Number(result.annualTotalKm || 0);
  const aggregation = result.periodAggregation || {};
  const variableDetails = [
    {
      color: "#167761",
      label: "Fuel",
      value:
        aggregation.annualFuelCost ??
        nullableCost(result.fuelCostPerKm) * totalKm
    },
    {
      color: "#2f6fb0",
      label: "Tyres",
      value:
        aggregation.annualTyresCost ??
        nullableCost(result.tyresCostPerKm) * totalKm
    },
    {
      color: "#7a5cbd",
      label: "Maintenance",
      value:
        aggregation.annualMaintenanceCost ??
        nullableCost(result.maintenanceCostPerKm) * totalKm
    },
    {
      color: "#c98632",
      label: "Road fees",
      value:
        aggregation.annualRoadFeesCost ??
        nullableCost(result.roadFeesCostPerKm) * totalKm
    }
  ].filter((row) => row.value > 0);
  const variableDetailTotal = variableDetails.reduce(
    (sum, row) => sum + row.value,
    0
  );
  const rows =
    variableDetailTotal > 0
      ? variableDetails
      : [
          {
            color: "#167761",
            label: "Variable",
            value: nullableCost(result.variableAnnualCost)
          }
        ];

  rows.push(
    {
      color: "#a43f5f",
      label: "Driver",
      value: nullableCost(result.driverAnnualCost)
    },
    {
      color: "#55636f",
      label: "Vehicle fixed",
      value: nullableCost(result.vehicleFixedAnnualCost)
    },
    {
      color: "#d9a441",
      label: "Overhead",
      value: nullableCost(result.structuralIndirectCostsAnnual)
    },
    {
      color: "#4b8f8c",
      label: "Other",
      value: nullableCost(result.otherAnnualCost)
    }
  );

  const cleanRows = rows.filter((row) => row.value > 0);
  const shownTotal = cleanRows.reduce((sum, row) => sum + row.value, 0);
  const totalCost = nullableCost(result.totalAnnualCost);

  if (totalCost > shownTotal + 1) {
    cleanRows.push({
      color: "#8b949e",
      label: "Unallocated",
      value: totalCost - shownTotal
    });
  }

  const denominator = cleanRows.reduce((sum, row) => sum + row.value, 0);
  return cleanRows.map((row) => ({
    ...row,
    share: denominator > 0 ? (row.value / denominator) * 100 : 0
  }));
}

function buildTimelineMonths({ locale, periods = [], result, timeModel }) {
  const planYear =
    Number(result?.planYear || timeModel?.planYear) ||
    inferYearFromPeriods(periods) ||
    new Date().getFullYear();
  const visualPeriods = buildVisualPeriods({ periods, result });
  const selectedKeys = new Set(
    (result?.periodAggregation?.periodBreakdown || result?.periodBreakdown || [])
      .map(periodVisualKey)
  );

  return Array.from({ length: 12 }, (_, monthIndex) => {
    const matchingPeriods = visualPeriods.filter((period) =>
      periodOverlapsMonth(period, planYear, monthIndex)
    );
    const match =
      matchingPeriods.find((period) => selectedKeys.has(periodVisualKey(period))) ||
      matchingPeriods.find((period) => period.status === "actual") ||
      matchingPeriods.find((period) => period.status === "forecast") ||
      matchingPeriods[0];

    return {
      key: `${planYear}-${monthIndex + 1}`,
      label: new Date(Date.UTC(planYear, monthIndex, 1)).toLocaleDateString(
        locale,
        { month: "long", year: "numeric" }
      ),
      selected: match ? selectedKeys.has(periodVisualKey(match)) : false,
      shortLabel: new Date(Date.UTC(planYear, monthIndex, 1)).toLocaleDateString(
        locale,
        { month: "short" }
      ),
      status: match?.status || (periods.length > 0 ? "empty" : "snapshot")
    };
  });
}

function buildPeriodComparisonRows({ periods = [], result }) {
  const visualPeriods = buildVisualPeriods({ periods, result });
  return visualPeriods
    .filter((period) => period.loadedKm > 0 || period.cost > 0)
    .slice(0, 12)
    .map((period, index) => ({
      ...period,
      key: `${periodVisualKey(period)}-${index}`,
      label: shortPeriodLabel(period, index)
    }));
}

function buildVisualPeriods({ periods = [], result }) {
  const selectedPeriods =
    result?.periodAggregation?.periodBreakdown || result?.periodBreakdown || [];
  const source = selectedPeriods.length > 0 ? selectedPeriods : periods;
  return source.map((period, index) => {
    const loadedKm = nullableCost(
      period.loadedKm ?? period.loadedRevenueKm ?? period.loaded_km
    );
    const cost = periodTotalCost(period);

    return {
      cost,
      end: period.periodEnd ?? period.period_end ?? null,
      index,
      loadedKm,
      start: period.periodStart ?? period.period_start ?? null,
      status:
        period.dataStatus ??
        period.data_status ??
        period.status ??
        "planned"
    };
  });
}

function periodTotalCost(period) {
  const direct = nullableCost(
    period.periodTotalCost ?? period.totalAnnualCost ?? period.totalCost
  );
  if (direct > 0) return direct;

  return periodCostFields.reduce(
    (sum, [field]) => sum + nullableCost(period[field]),
    0
  );
}

function periodVisualKey(period) {
  return [
    period.start ?? period.periodStart ?? period.period_start ?? "",
    period.end ?? period.periodEnd ?? period.period_end ?? "",
    period.status ?? period.dataStatus ?? period.data_status ?? ""
  ].join("|");
}

function shortPeriodLabel(period, index) {
  if (!period.start && !period.end) return `P${index + 1}`;
  const start = period.start ? shortDateLabel(period.start) : "n/a";
  const end = period.end ? shortDateLabel(period.end) : null;
  return end && end !== start ? `${start} - ${end}` : start;
}

function shortDateLabel(value) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(
    "en-US",
    { month: "short" }
  );
}

function periodOverlapsMonth(period, year, monthIndex) {
  if (!period.start && !period.end) return false;
  const monthStartDate = new Date(Date.UTC(year, monthIndex, 1));
  const monthEndDate = new Date(Date.UTC(year, monthIndex + 1, 0));
  const start = parseDateOnly(period.start || period.end);
  const end = parseDateOnly(period.end || period.start);
  if (!start || !end) return false;
  return start <= monthEndDate && end >= monthStartDate;
}

function inferYearFromPeriods(periods = []) {
  const datedPeriod = periods.find((period) => period.periodStart || period.periodEnd);
  const date = datedPeriod?.periodStart || datedPeriod?.periodEnd;
  return date ? Number(String(date).slice(0, 4)) : null;
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function nullableCost(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function barPercent(value, maxValue) {
  if (!(maxValue > 0) || !(value > 0)) return 0;
  return Math.max(3, Math.min(100, (value / maxValue) * 100));
}

function createFormatters(formatContext = {}) {
  const locale = formatContext.locale || "en-US";
  const currency = formatContext.currency || "EUR";

  return {
    locale,
    count(value) {
      if (value == null || Number.isNaN(Number(value))) return "n/a";
      return String(Math.max(0, Math.round(Number(value))));
    },
    money(value, decimals = 2) {
      if (value == null || Number.isNaN(Number(value))) return "n/a";
      return Number(value).toLocaleString(locale, {
        currency,
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
        style: "currency"
      });
    },
    number(value) {
      if (value == null || Number.isNaN(Number(value))) return "n/a";
      return Number(value).toLocaleString(locale, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
      });
    }
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
