import express from "express";
import { runCostIntelligenceAgent } from "../agents/costIntelligenceAgent.js";
import { sendApiError } from "../apiError.js";
import { authContext } from "../auth.js";
import {
  getCalculationRun,
  listCalculationRuns,
  saveAgentRun
} from "../storage.js";
import { validateAgentAnalysisPayload } from "../validation.js";

const router = express.Router();

router.post("/analyse", async (req, res) => {
  try {
    const context = authContext(req);
    const payload = validateAgentAnalysisPayload(req.body || {});
    const run = payload.calculationRunId
      ? await getCalculationRun(payload.calculationRunId, context)
      : null;

    if (payload.calculationRunId && !run) {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Calculation run not found",
          field: "calculationRunId"
        }
      });
      return;
    }

    const history = await listCalculationRuns(context);
    const comparisonRun = findComparisonRun({
      history,
      run,
      currentOutputs: payload.outputs
    });
    const agentContext = {
      agent: payload.agent,
      question: payload.question,
      vehicleCode: payload.vehicleCode,
      run,
      inputs: payload.inputs,
      outputs: payload.outputs,
      comparisonRun
    };
    const insight = await runCostIntelligenceAgent(agentContext);
    const savedAgentRun = await saveAgentRun(
      {
        agentName: payload.agent,
        vehicleCode: payload.vehicleCode,
        calculationRunId: payload.calculationRunId,
        userQuestion: payload.question,
        inputPayload: agentContext,
        outputPayload: insight
      },
      context
    );

    res.json({
      agent: payload.agent,
      agentRunId: savedAgentRun.id,
      ...insight
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

function findComparisonRun({ history, run, currentOutputs }) {
  const currentId = run?.id ? String(run.id) : null;
  const sortedHistory = [...history].sort(
    (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
  );

  if (currentId) {
    return sortedHistory.find((item) => String(item.id) !== currentId) || null;
  }

  if (currentOutputs?.createdAt) {
    return (
      sortedHistory.find(
        (item) => new Date(item.createdAt) < new Date(currentOutputs.createdAt)
      ) || sortedHistory[0] || null
    );
  }

  return sortedHistory[0] || null;
}

export default router;
