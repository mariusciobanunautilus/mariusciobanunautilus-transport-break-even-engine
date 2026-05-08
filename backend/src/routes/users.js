import express from "express";
import { authContext, createWorkspaceUser, requireAdmin } from "../auth.js";
import { sendApiError } from "../apiError.js";
import { validateUserCreatePayload } from "../validation.js";

const router = express.Router();

router.post("/", requireAdmin, async (req, res) => {
  try {
    const payload = validateUserCreatePayload(req.body);
    const user = await createWorkspaceUser(payload, authContext(req));
    res.status(201).json({ user });
  } catch (error) {
    sendApiError(res, error);
  }
});

export default router;
