import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLocalCostInsight,
  buildLocalHistoryGraphicInsight
} from "./src/agents/costIntelligenceAgent.js";
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

test("history graphic agent interprets saved-run movement", () => {
  const insight = buildLocalHistoryGraphicInsight({
    outputs: {
      chartRuns: [
        {
          id: "1",
          runName: "Baseline",
          createdAt: "2026-05-08T20:42:00.000Z",
          totalAnnualCost: 1342980,
          breakEvenPerLoadedKm: 1.46,
          customerRateExclVat: 1.68,
          profitAfterTax: 169215
        },
        {
          id: "2",
          runName: "Latest",
          createdAt: "2026-05-13T00:25:00.000Z",
          totalAnnualCost: 178756,
          breakEvenPerLoadedKm: 1.95,
          customerRateExclVat: 2.24,
          profitAfterTax: 22523
        }
      ]
    }
  });

  assert.equal(insight.requiresHumanReview, true);
  assert.ok(insight.calculatedResult.some((item) => item.includes("Break-even")));
  assert.ok(insight.mainDrivers.some((item) => item.includes("Customer rate")));
  assert.ok(insight.risks.some((risk) => risk.includes("Break-even")));
  assert.ok(insight.recommendedActions.length > 0);
});

test("agent analysis validation accepts supported agents", () => {
  assert.equal(
    validateAgentAnalysisPayload({
      question: "Explain",
      inputs: {},
      outputs: {}
    }).agent,
    "cost-intelligence"
  );
  assert.equal(
    validateAgentAnalysisPayload({
      agent: "history-visual",
      outputs: {
        chartRuns: []
      }
    }).agent,
    "history-visual"
  );
  assert.throws(
    () => validateAgentAnalysisPayload({ agent: "scenario", inputs: {}, outputs: {} }),
    /cost-intelligence or history-visual/
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
