import express from "express";
import {
  authenticateRequest,
  bearerToken,
  loginUser,
  logoutUser,
  setupFirstAdmin
} from "../auth.js";
import { sendApiError } from "../apiError.js";
import {
  requireObjectBody,
  validateFirstAdminSetupPayload
} from "../validation.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const body = requireObjectBody(req.body);
    res.json(
      await loginUser({
        email: body.email,
        password: body.password
      })
    );
  } catch (error) {
    sendApiError(res, error);
  }
});

router.post("/setup", async (req, res) => {
  try {
    const payload = validateFirstAdminSetupPayload(req.body);
    res.status(201).json(await setupFirstAdmin(payload));
  } catch (error) {
    sendApiError(res, error);
  }
});

router.get("/me", authenticateRequest, (req, res) => {
  res.json({
    user: req.auth.user,
    workspace: req.auth.workspace
  });
});

router.post("/logout", authenticateRequest, async (req, res) => {
  await logoutUser(bearerToken(req));
  res.status(204).end();
});

export default router;
