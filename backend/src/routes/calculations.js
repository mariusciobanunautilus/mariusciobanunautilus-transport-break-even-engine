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
import {
  deleteCalculationRun,
  getCalculationRun,
  listAuditEvents,
  listCalculationRuns,
  saveCalculationRun
} from "../storage.js";

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
    res.json(await getTaxProfile(req.query));
  } catch (error) {
    sendApiError(res, error);
  }
});

router.post("/calculations/preview", (req, res) => {
  try {
    res.json(calculateBreakEven(req.body || {}));
  } catch (error) {
    sendApiError(res, error);
  }
});

router.post("/pricing-scenarios/preview", (req, res) => {
  try {
    res.json(generatePricingScenarios(req.body || {}));
  } catch (error) {
    sendApiError(res, error);
  }
});

router.post("/sensitivity/preview", (req, res) => {
  try {
    res.json(generateSensitivity(req.body || {}));
  } catch (error) {
    sendApiError(res, error);
  }
});

router.post("/calculations", async (req, res) => {
  try {
    if (isLegacyCalculationRequest(req.body)) {
      const result = computeTransportEngine(req.body || {});
      const savedRun = await saveCalculationRun({
        profile: result.profile.code,
        jurisdiction: result.jurisdiction.code,
        companyType: result.cascade.companyType,
        businessModel: result.cascade.businessModel,
        inputs: result.inputs,
        outputs: result,
        runName: req.body?.runName
      });

      res.json({
        calculationRunId: savedRun.id,
        savedRun,
        result
      });
      return;
    }

    const calculation = calculateBreakEven(req.body || {});
    const pricingScenarios = generatePricingScenarios(req.body || {});
    const savedRun = await saveCalculationRun({
      runName: req.body?.runName,
      inputSnapshot: calculation.input,
      taxSnapshot: calculation.taxProfile,
      vehicleSnapshot: calculation.vehicleSnapshot,
      resultSnapshot: calculation.result,
      pricingScenarios,
      createdBy: req.body?.createdBy
    });

    res.status(201).json({
      calculationRunId: savedRun.id,
      resultSummary: {
        totalAnnualCost: calculation.result.totalAnnualCost,
        breakEvenPerLoadedKm: calculation.result.breakEvenPerLoadedKm,
        customerRateExclVat: calculation.result.customerRateExclVat,
        profitAfterTax: calculation.result.profitAfterTax
      },
      savedRun
    });
  } catch (error) {
    sendApiError(res, error);
  }
});

router.get("/calculations", async (req, res) => {
  res.json(await listCalculationRuns());
});

router.get("/calculations/:id", async (req, res) => {
  const run = await getCalculationRun(req.params.id);
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
});

router.delete("/calculations/:id", async (req, res) => {
  const deleted = await deleteCalculationRun(req.params.id, req.body?.actor);
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
});

router.get("/exports/:calculationRunId/json", async (req, res) => {
  const run = await getCalculationRun(req.params.calculationRunId);
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
});

router.get("/audit-log", async (req, res) => {
  res.json(await listAuditEvents());
});

router.post("/vehicles/:profile/calculations", async (req, res) => {
  try {
    const result = computeTransportEngine({
      ...(req.body || {}),
      profileCode: String(req.params.profile || "").toUpperCase(),
      inputs: req.body?.inputs || req.body?.overrides || {}
    });

    const savedRun = await saveCalculationRun({
      profile: result.profile.code,
      jurisdiction: result.jurisdiction.code,
      companyType: result.cascade.companyType,
      businessModel: result.cascade.businessModel,
      inputs: result.inputs,
      outputs: result,
      runName: req.body?.runName
    });

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

function sendApiError(res, error) {
  const status = error.code === "VALIDATION_ERROR" ? 400 : 500;
  res.status(status).json({
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "Unexpected error",
      field: error.field
    }
  });
}
