const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "answer",
    "calculatedResult",
    "interpretation",
    "assumptions",
    "mainDrivers",
    "risks",
    "recommendedActions",
    "confidence",
    "requiresHumanReview"
  ],
  properties: {
    summary: { type: "string" },
    answer: { type: "string" },
    calculatedResult: {
      type: "array",
      items: { type: "string" }
    },
    interpretation: {
      type: "array",
      items: { type: "string" }
    },
    assumptions: {
      type: "array",
      items: { type: "string" }
    },
    mainDrivers: {
      type: "array",
      items: { type: "string" }
    },
    risks: {
      type: "array",
      items: { type: "string" }
    },
    recommendedActions: {
      type: "array",
      items: { type: "string" }
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"]
    },
    requiresHumanReview: { type: "boolean" }
  }
};

export async function runCostIntelligenceAgent(context) {
  const localResponse = buildLocalCostInsight(context);
  let aiResponse = null;

  try {
    aiResponse = await tryOpenAiCostInsight(context, localResponse);
  } catch (error) {
    console.warn(`Cost intelligence AI fallback used: ${error.message}`);
  }

  return normalizeAgentOutput(aiResponse || localResponse, aiResponse ? "openai" : "local");
}

export function buildLocalCostInsight({
  question = "",
  run = null,
  inputs = {},
  outputs = {},
  comparisonRun = null
} = {}) {
  const result = normalizeResult(run?.resultSnapshot ?? outputs?.result ?? outputs);
  const input = run?.inputSnapshot ?? inputs?.input ?? inputs;
  const comparison = comparisonRun ? normalizeResult(comparisonRun) : null;
  const costItems = [
    ["Variable cost", result.variableAnnualCost],
    ["Driver cost", result.driverAnnualCost],
    ["Vehicle fixed cost", result.vehicleFixedAnnualCost],
    ["Structural cost", result.structuralIndirectCostsAnnual]
  ].filter(([, value]) => isFiniteNumber(value));
  const totalCost = finiteNumber(result.totalAnnualCost);
  const loadedKm = finiteNumber(result.loadedKmYear);
  const breakEven = finiteNumber(result.breakEvenPerLoadedKm);
  const customerRate = finiteNumber(result.customerRateExclVat);
  const profit = finiteNumber(result.profitAfterTax);
  const margin = finiteNumber(result.afterTaxMargin);
  const loadFactor = finiteNumber(input.loadFactor);
  const largestCostItem = costItems
    .map(([label, value]) => ({
      label,
      value: finiteNumber(value),
      share: safeRatio(finiteNumber(value), totalCost)
    }))
    .sort((left, right) => right.value - left.value)[0];
  const mainDrivers = [];
  const risks = [];
  const recommendedActions = [];
  const interpretation = [];
  const assumptions = [];

  if (largestCostItem) {
    mainDrivers.push(`${largestCostItem.label} is the largest visible cost block.`);
    interpretation.push(
      `${largestCostItem.label} accounts for ${formatPercent(largestCostItem.share)} of the annual cost base.`
    );
  }

  if (loadedKm > 0 && totalCost > 0) {
    mainDrivers.push("Loaded kilometres determine how much annual cost is absorbed per km.");
    interpretation.push(
      `The break-even rate is annual cost divided by loaded kilometres: ${formatMoney(totalCost)} / ${formatNumber(loadedKm)} loaded km.`
    );
  }

  if (comparison) {
    const breakEvenDelta = breakEven - finiteNumber(comparison.breakEvenPerLoadedKm);
    const profitDelta = profit - finiteNumber(comparison.profitAfterTax);
    const direction = breakEvenDelta >= 0 ? "increased" : "decreased";
    mainDrivers.push(`Break-even ${direction} by ${formatMoney(Math.abs(breakEvenDelta), 4)} per loaded km versus the comparison run.`);
    interpretation.push(`Profit changed by ${formatSignedMoney(profitDelta)} versus the comparison run.`);
  }

  if (customerRate > 0 && breakEven > 0) {
    const spread = customerRate - breakEven;
    interpretation.push(
      `The customer rate sits ${formatSignedMoney(spread, 4)} per loaded km above break-even.`
    );
    if (spread <= 0) {
      risks.push("Customer rate is at or below break-even.");
      recommendedActions.push("Increase the customer rate or reduce the cost base before approving the run.");
    }
  }

  if (profit < 0) {
    risks.push("The run is loss-making after tax.");
    recommendedActions.push("Review markup, utilisation, and fixed-cost absorption before using this price commercially.");
  } else if (margin > 0 && margin < 0.05) {
    risks.push("After-tax margin is thin.");
    recommendedActions.push("Set a minimum acceptable after-tax margin threshold for this lane or fleet profile.");
  }

  if (loadFactor > 0 && loadFactor < 0.75) {
    risks.push("Loaded-km utilisation is low.");
    recommendedActions.push("Increase loaded kilometres or separate empty-km assumptions in the commercial review.");
  }

  if (largestCostItem?.share > 0.45) {
    recommendedActions.push(`Review ${largestCostItem.label.toLowerCase()} assumptions first; it has the biggest cost leverage.`);
  }

  if (!isFiniteNumber(totalCost) || !isFiniteNumber(breakEven)) {
    risks.push("The agent did not receive a complete calculated result.");
    assumptions.push("Some conclusions are limited because the result payload is incomplete.");
  }

  assumptions.push("The calculation engine remains the source of truth.");
  assumptions.push("The agent interprets saved or current run data and does not modify formulas.");

  const summary =
    mainDrivers.length > 0
      ? `${mainDrivers[0]} ${risks.length > 0 ? "The run needs review before management use." : "The result is usable for management review with the stated assumptions."}`
      : "The result needs a complete calculation before the agent can explain the cost-per-km position.";

  return {
    summary,
    answer: buildAnswer({
      breakEven,
      customerRate,
      profit,
      question,
      summary
    }),
    calculatedResult: [
      `Annual cost: ${formatMoney(totalCost)}`,
      `Break-even: ${formatMoney(breakEven, 4)} per loaded km`,
      `Customer rate: ${formatMoney(customerRate, 4)} per loaded km`,
      `Profit after tax: ${formatMoney(profit)}`
    ],
    interpretation: uniqueStrings(interpretation).slice(0, 5),
    assumptions: uniqueStrings(assumptions).slice(0, 5),
    mainDrivers: uniqueStrings(mainDrivers).slice(0, 5),
    risks: uniqueStrings(risks).slice(0, 5),
    recommendedActions: uniqueStrings(recommendedActions).slice(0, 5),
    confidence: confidenceFor(result, risks),
    requiresHumanReview:
      risks.length > 0 || !isFiniteNumber(totalCost) || !isFiniteNumber(breakEven)
  };
}

async function tryOpenAiCostInsight(context, localResponse) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_AGENT_MODEL || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "You are a cost intelligence agent for a transport break-even calculator. The calculation engine is the source of truth. Do not invent missing business data, do not change formulas, and clearly separate calculated result, interpretation, assumptions, risks, and recommendations."
        },
        {
          role: "user",
          content: JSON.stringify({
            question: context.question,
            run: context.run,
            inputs: context.inputs,
            outputs: context.outputs,
            comparisonRun: context.comparisonRun,
            localDraft: localResponse
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "cost_intelligence_response",
          strict: true,
          schema: outputSchema
        }
      }
    }),
    signal: AbortSignal.timeout(18000)
  });

  if (!response.ok) {
    throw new Error(`OpenAI agent request failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);
  return outputText ? JSON.parse(outputText) : null;
}

function normalizeAgentOutput(output, source) {
  const normalized = {
    summary: stringOrDefault(output.summary),
    answer: stringOrDefault(output.answer),
    calculatedResult: stringList(output.calculatedResult),
    interpretation: stringList(output.interpretation),
    assumptions: stringList(output.assumptions),
    mainDrivers: stringList(output.mainDrivers),
    risks: stringList(output.risks),
    recommendedActions: stringList(output.recommendedActions),
    confidence: ["low", "medium", "high"].includes(output.confidence)
      ? output.confidence
      : "medium",
    requiresHumanReview: Boolean(output.requiresHumanReview),
    source
  };

  return {
    ...normalized,
    risks: normalized.risks,
    recommendations: normalized.recommendedActions
  };
}

function normalizeResult(result = {}) {
  return result || {};
}

function buildAnswer({ breakEven, customerRate, profit, question, summary }) {
  const requested = question ? `For "${question}", ` : "";
  return `${requested}${summary} Current break-even is ${formatMoney(breakEven, 4)} per loaded km, customer rate is ${formatMoney(customerRate, 4)} per loaded km, and profit after tax is ${formatMoney(profit)}.`;
}

function confidenceFor(result, risks) {
  if (!isFiniteNumber(result.totalAnnualCost) || !isFiniteNumber(result.breakEvenPerLoadedKm)) {
    return "low";
  }

  return risks.length > 0 ? "medium" : "high";
}

function extractOutputText(payload) {
  if (payload.output_text) return payload.output_text;

  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }

  return "";
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function safeRatio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function formatMoney(value, decimals = 2) {
  if (!isFiniteNumber(value)) return "n/a";
  return `${Number(value).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals
  })} EUR`;
}

function formatSignedMoney(value, decimals = 2) {
  if (!isFiniteNumber(value)) return "n/a";
  return `${Number(value) >= 0 ? "+" : ""}${formatMoney(value, decimals)}`;
}

function formatNumber(value) {
  if (!isFiniteNumber(value)) return "n/a";
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: 0
  });
}

function formatPercent(value) {
  if (!isFiniteNumber(value)) return "n/a";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function stringList(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function stringOrDefault(value) {
  return String(value || "No insight available.");
}
