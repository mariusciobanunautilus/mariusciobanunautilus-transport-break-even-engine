import express from "express";
import {
  computeTransportEngine,
  getReferenceData
} from "@transport-break-even/shared";
import { saveCalculationRun } from "../storage.js";

const router = express.Router();

router.get("/reference-data", (req, res) => {
  res.json(getReferenceData());
});

router.post("/calculations", async (req, res) => {
  try {
    const result = computeTransportEngine(req.body || {});

    saveCalculationRun({
      profile: result.profile.code,
      jurisdiction: result.jurisdiction.code,
      companyType: result.cascade.companyType,
      businessModel: result.cascade.businessModel,
      inputs: result.inputs,
      outputs: result
    }).catch((error) => {
      console.warn("[calculations] save skipped or failed:", error.message);
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: "Calculation failed",
      details: error.message
    });
  }
});

router.post("/vehicles/:profile/calculations", async (req, res) => {
  try {
    const result = computeTransportEngine({
      ...(req.body || {}),
      profileCode: String(req.params.profile || "").toUpperCase(),
      inputs: req.body?.inputs || req.body?.overrides || {}
    });

    saveCalculationRun({
      profile: result.profile.code,
      jurisdiction: result.jurisdiction.code,
      companyType: result.cascade.companyType,
      businessModel: result.cascade.businessModel,
      inputs: result.inputs,
      outputs: result
    }).catch((error) => {
      console.warn("[calculations] save skipped or failed:", error.message);
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: "Calculation failed",
      details: error.message
    });
  }
});

export default router;
