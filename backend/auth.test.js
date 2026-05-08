import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  bootstrapAuth,
  createWorkspaceUser,
  loginUser,
  logoutUser,
  setupFirstAdmin
} from "./src/auth.js";
import { validateUserCreatePayload } from "./src/validation.js";

before(async () => {
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.ADMIN_PASSWORD = "Admin12345!";
  process.env.WORKSPACE_NAME = "Test Workspace";
  await bootstrapAuth(process.env);
});

test("memory auth logs in the bootstrap admin and returns workspace context", async () => {
  const session = await loginUser({
    email: "ADMIN@example.com",
    password: "Admin12345!"
  });

  assert.ok(session.token);
  assert.equal(session.user.email, "admin@example.com");
  assert.equal(session.user.role, "admin");
  assert.equal(session.workspace.name, "Test Workspace");

  await logoutUser(session.token);
});

test("workspace admins can create member users", async () => {
  const adminSession = await loginUser({
    email: "admin@example.com",
    password: "Admin12345!"
  });
  const created = await createWorkspaceUser(
    {
      email: "operator@example.com",
      name: "Operator",
      password: "Operator123!",
      role: "member"
    },
    {
      actor: adminSession.user.email,
      actorUserId: adminSession.user.id,
      workspaceId: adminSession.workspace.id,
      workspaceName: adminSession.workspace.name,
      role: adminSession.user.role
    }
  );

  assert.equal(created.email, "operator@example.com");
  assert.equal(created.role, "member");

  const memberSession = await loginUser({
    email: "operator@example.com",
    password: "Operator123!"
  });
  assert.equal(memberSession.workspace.id, adminSession.workspace.id);
});

test("new user passwords must satisfy the password policy", () => {
  assert.throws(
    () =>
      validateUserCreatePayload({
        email: "weak@example.com",
        password: "password"
      }),
    /uppercase letter/
  );
  assert.doesNotThrow(() =>
    validateUserCreatePayload({
      email: "strong@example.com",
      password: "StrongPass123!"
    })
  );
});

test("first-admin setup closes after the workspace already has users", async () => {
  await assert.rejects(
    () =>
      setupFirstAdmin({
        email: "late-admin@example.com",
        name: "Late Admin",
        password: "LateAdmin123!",
        workspaceName: "Late Workspace"
      }),
    /already exists/
  );
});
