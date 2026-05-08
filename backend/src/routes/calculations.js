import express from "express";
import {
  calculateBreakEven,
  computeTransportEngine,
  generatePricingScenarios,
  generateSensitivity,
  getReferenceData
} from "@transport-break-even/shared";
import {
  getBlueprintReferenceData,
  getBusinessModels,
  getCompanyTypesForCountry,
  getCountries,
  getTaxProfile,
  getVehicleClasses
} from "../referenceRepository.js";
import { authContext, requireAdmin } from "../auth.js";
import { sendApiError } from "../apiError.js";
import {
  deleteCalculationRun,
  getCalculationRun,
  listAuditEvents,
  listCalculationRuns,
  saveCalculationRun
} from "../storage.js";
import {
  requirePositiveId,
  validateCalculationPayload,
  validateTaxProfileQuery
} from "../validation.js";

const router = express.Router();

router.get("/reference-data", async (req, res) => {
  try {
    res.json({
      legacy: getReferenceData(),
      blueprint: await getBlueprintReferenceData()
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

router.get("/countries", async (req, res) => {
  try {
    res.json(await getCountries());
  } catch (error) {
    sendApiError(res, error);
  }
});

router.get("/countries/:countryId/company-types", async (req, res) => {
  try {
    requirePositiveId(req.params.countryId, "countryId");
    res.json(await getCompanyTypesForCountry(req.params.countryId));
  } catch (error) {
    sendApiError(res, error);
  }
});

router.get("/business-models", async (req, res) => {
  try {
    res.json(await getBusinessModels());
  } catch (error) {
    sendApiError(res, error);
  }
});

router.get("/vehicle-classes", async (req, res) => {
  try {
    res.json(await getVehicleClasses());
  } catch (error) {
    sendApiError(res, error);
  }
});

router.get("/tax-profile", async (req, res) => {
  try {
    validateTaxProfileQuery(req.query);
    res.json(await getTaxProfile(req.query));
  } catch (error) {
    sendApiError(res, error);
  }
});

router.post("/calculations/preview", (req, res) => {
  try {
    const payload = validateCalculationPayload(req.body || {});
    res.json(calculateBreakEven(payload));
  } catch (error) {
    sendApiError(res, error);
  }
});

router.post("/pricing-scenarios/preview", (req, res) => {
  try {
    const payload = validateCalculationPayload(req.body || {});
    res.json(generatePricingScenarios(payload));
  } catch (error) {
    sendApiError(res, error);
  }
});

router.post("/sensitivity/preview", (req, res) => {
  try {
    const payload = validateCalculationPayload(req.body || {});
    res.json(generateSensitivity(payload));
  } catch (error) {
    sendApiError(res, error);
  }
});

router.post("/calculations", async (req, res) => {
  try {
    const context = authContext(req);
    const payload = validateCalculationPayload(req.body || {});

    if (isLegacyCalculationRequest(payload)) {
      const result = computeTransportEngine(payload);
      const savedRun = await saveCalculationRun({
        profile: result.profile.code,
        jurisdiction: result.jurisdiction.code,
        companyType: result.cascade.companyType,
        businessModel: result.cascade.businessModel,
        inputs: result.inputs,
        outputs: result,
        runName: payload.runName,
        createdBy: context.actor,
        createdByUserId: context.actorUserId,
        workspaceId: context.workspaceId
      }, context);

      res.json({
        calculationRunId: savedRun.id,
        savedRun,
        result
      });
      return;
    }

    const calculation = calculateBreakEven(payload);
    const pricingScenarios = generatePricingScenarios(payload);
    const savedRun = await saveCalculationRun({
      runName: payload.runName,
      inputSnapshot: calculation.input,
      taxSnapshot: calculation.taxProfile,
      vehicleSnapshot: calculation.vehicleSnapshot,
      resultSnapshot: calculation.result,
      pricingScenarios,
      periods: calculation.periods,
      calculationMode: calculation.calculationMode,
      planYear: calculation.planYear,
      asOfDate: calculation.asOfDate,
      scenarioStatus: calculation.scenarioStatus,
      engineVersion: calculation.engineVersion,
      scenarioName: calculation.scenarioName,
      scenarioVersion: calculation.scenarioVersion,
      createdBy: context.actor,
      createdByUserId: context.actorUserId,
      workspaceId: context.workspaceId
    }, context);

    res.status(201).json({
      calculationRunId: savedRun.id,
      resultSummary: {
        totalAnnualCost: calculation.result.totalAnnualCost,
        breakEvenPerLoadedKm: calculation.result.breakEvenPerLoadedKm,
        customerRateExclVat: calculation.result.customerRateExclVat,
        profitAfterTax: calculation.result.profitAfterTax,
        calculationMode: calculation.calculationMode,
        dataCompletenessStatus: calculation.dataCompletenessStatus,
        warnings: calculation.warnings
      },
      savedRun
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

router.get("/calculations", async (req, res) => {
  try {
    res.json(await listCalculationRuns(authContext(req)));
  } catch (error) {
    sendApiError(res, error);
  }
});

router.get("/calculations/:id", async (req, res) => {
  try {
    const id = requirePositiveId(req.params.id);
    const run = await getCalculationRun(id, authContext(req));
    if (!run) {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Calculation run not found",
          field: "id"
        }
      });
      return;
    }

    res.json(run);
  } catch (error) {
    sendApiError(res, error);
  }
});

router.delete("/calculations/:id", async (req, res) => {
  try {
    const id = requirePositiveId(req.params.id);
    const deleted = await deleteCalculationRun(id, authContext(req));
    if (!deleted) {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Calculation run not found",
          field: "id"
        }
      });
      return;
    }

    res.status(204).end();
  } catch (error) {
    sendApiError(res, error);
  }
});

router.get("/exports/:calculationRunId/json", async (req, res) => {
  try {
    const id = requirePositiveId(req.params.calculationRunId, "calculationRunId");
    const run = await getCalculationRun(id, authContext(req));
    if (!run) {
      res.status(404).json({
        error: {
          code: "NOT_FOUND",
          message: "Calculation run not found",
          field: "calculationRunId"
        }
      });
      return;
    }

    res.json({
      exportedAt: new Date().toISOString(),
      disclaimer:
        "The tax profile is a modelling layer for business planning. It is not tax advice.",
      run
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

router.get("/audit-log", requireAdmin, async (req, res) => {
  try {
    res.json(await listAuditEvents(authContext(req)));
  } catch (error) {
    sendApiError(res, error);
  }
});

router.post("/vehicles/:profile/calculations", async (req, res) => {
  try {
    const context = authContext(req);
    const payload = validateCalculationPayload(req.body || {});
    const result = computeTransportEngine({
      ...payload,
      profileCode: String(req.params.profile || "").toUpperCase(),
      inputs: payload.inputs || payload.overrides || {}
    });

    const savedRun = await saveCalculationRun({
      profile: result.profile.code,
      jurisdiction: result.jurisdiction.code,
      companyType: result.cascade.companyType,
      businessModel: result.cascade.businessModel,
      inputs: result.inputs,
      outputs: result,
      runName: payload.runName,
      createdBy: context.actor,
      createdByUserId: context.actorUserId,
      workspaceId: context.workspaceId
    }, context);

    res.json({
      calculationRunId: savedRun.id,
      savedRun,
      result
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

export default router;

function isLegacyCalculationRequest(body = {}) {
  return Boolean(body.profileCode || body.inputs || body.overrides);
}
