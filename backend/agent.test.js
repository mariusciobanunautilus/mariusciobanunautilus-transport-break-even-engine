import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLocalCostInsight } from "./src/agents/costIntelligenceAgent.js";
import { saveAgentRun } from "./src/storage.js";
import { validateAgentAnalysisPayload } from "./src/validation.js";

test("cost intelligence agent separates calculated result and recommendations", () => {
  const insight = buildLocalCostInsight({
    question: "Why is my cost per km high?",
    inputs: {
      loadFactor: 0.7
    },
    outputs: {
      totalAnnualCost: 120000,
      loadedKmYear: 60000,
      breakEvenPerLoadedKm: 2,
      customerRateExclVat: 1.9,
      variableAnnualCost: 42000,
      driverAnnualCost: 50000,
      vehicleFixedAnnualCost: 21000,
      structuralIndirectCostsAnnual: 7000,
      profitAfterTax: -5000,
      afterTaxMargin: -0.04
    },
    comparisonRun: {
      breakEvenPerLoadedKm: 1.7,
      profitAfterTax: 8000
    }
  });

  assert.equal(insight.requiresHumanReview, true);
  assert.ok(insight.calculatedResult.some((item) => item.includes("Break-even")));
  assert.ok(insight.mainDrivers.length > 0);
  assert.ok(insight.risks.some((risk) => risk.includes("Customer rate")));
  assert.ok(insight.recommendedActions.length > 0);
});

test("agent analysis validation accepts only the first sprint agent", () => {
  assert.equal(
    validateAgentAnalysisPayload({
      question: "Explain",
      inputs: {},
      outputs: {}
    }).agent,
    "cost-intelligence"
  );
  assert.throws(
    () => validateAgentAnalysisPayload({ agent: "scenario", inputs: {}, outputs: {} }),
    /cost-intelligence/
  );
});

test("agent run logging works in memory storage", async () => {
  const saved = await saveAgentRun(
    {
      agentName: "cost-intelligence",
      userQuestion: "Explain this result",
      inputPayload: { outputs: { breakEvenPerLoadedKm: 1.5 } },
      outputPayload: { summary: "Stable" }
    },
    {
      actor: "agent@example.com",
      actorUserId: "agent-user",
      workspaceId: "agent-workspace"
    }
  );

  assert.ok(saved.id);
  assert.equal(saved.workspaceId, "agent-workspace");
  assert.equal(saved.agentName, "cost-intelligence");
});
