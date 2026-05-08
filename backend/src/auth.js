import crypto from "node:crypto";
import { ApiError } from "./apiError.js";
import { hasDatabaseUrl, query, withTransaction } from "./db.js";
import { normalizeEmail } from "./validation.js";

const sessionHours = 12;
let memoryUserId = 1;
let memoryWorkspaceId = 1;
const memoryWorkspaces = new Map();
const memoryUsers = new Map();
const memoryMemberships = [];
const memorySessions = new Map();

export async function bootstrapAuth(env = process.env) {
  if (hasDatabaseUrl()) {
    return bootstrapDatabaseAuth(env);
  }

  return bootstrapMemoryAuth(env);
}

export async function getAuthStatus() {
  if (!hasDatabaseUrl()) {
    return {
      bootstrapRequired: memoryUsers.size === 0,
      userCount: memoryUsers.size
    };
  }

  const result = await query("SELECT COUNT(*)::INT AS count FROM users");
  const userCount = Number(result.rows[0]?.count || 0);
  return {
    bootstrapRequired: userCount === 0,
    userCount
  };
}

export async function authenticateRequest(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) {
      throw new ApiError(401, "UNAUTHENTICATED", "Sign in is required");
    }

    const session = await findSession(token);
    if (!session) {
      throw new ApiError(401, "UNAUTHENTICATED", "Session is invalid or expired");
    }

    req.auth = session;
    req.authToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req, res, next) {
  if (req.auth?.role !== "admin") {
    next(new ApiError(403, "FORBIDDEN", "Admin access is required"));
    return;
  }

  next();
}

export function authContext(req) {
  return {
    actor: req.auth?.user?.email || "system",
    actorUserId: req.auth?.user?.id || null,
    role: req.auth?.role || "member",
    workspaceId: req.auth?.workspace?.id || null,
    workspaceName: req.auth?.workspace?.name || null
  };
}

export async function loginUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const userRecord = await findUserForLogin(normalizedEmail);

  if (!userRecord || !verifyPassword(password, userRecord.passwordHash)) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }

  if (userRecord.user.status !== "active") {
    throw new ApiError(403, "FORBIDDEN", "This user is not active");
  }

  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + sessionHours * 60 * 60 * 1000);
  await saveSession({
    token,
    userId: userRecord.user.id,
    workspaceId: userRecord.workspace.id,
    expiresAt
  });

  return {
    token,
    user: publicUser(userRecord.user, userRecord.role),
    workspace: userRecord.workspace
  };
}

export async function setupFirstAdmin({ email, name, password, workspaceName }) {
  const normalizedEmail = normalizeEmail(email);

  if (!hasDatabaseUrl()) {
    if (memoryUsers.size > 0) {
      throw new ApiError(409, "SETUP_CLOSED", "The first admin account already exists");
    }

    const workspace = ensureMemoryWorkspace(workspaceName);
    createMemoryUser({
      email: normalizedEmail,
      name,
      passwordHash: hashPassword(password),
      role: "admin",
      workspaceId: workspace.id
    });
    return loginUser({ email: normalizedEmail, password });
  }

  await withTransaction(async (client) => {
    const userCount = await client.query("SELECT COUNT(*)::INT AS count FROM users");
    if (Number(userCount.rows[0].count) > 0) {
      throw new ApiError(409, "SETUP_CLOSED", "The first admin account already exists");
    }

    const workspaceResult = await client.query(
      `INSERT INTO workspaces (name)
       VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [workspaceName]
    );
    const userResult = await client.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [normalizedEmail, name || normalizedEmail, hashPassword(password)]
    );

    await client.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [workspaceResult.rows[0].id, userResult.rows[0].id]
    );
  });

  return loginUser({ email: normalizedEmail, password });
}

export async function logoutUser(token) {
  if (!token) return;

  if (!hasDatabaseUrl()) {
    memorySessions.delete(tokenHash(token));
    return;
  }

  await query("DELETE FROM auth_sessions WHERE token_hash = $1", [tokenHash(token)]);
}

export async function createWorkspaceUser({ email, name, password, role }, context) {
  if (!context?.workspaceId) {
    throw new ApiError(500, "WORKSPACE_CONTEXT_MISSING", "Workspace context is missing");
  }

  const normalizedEmail = normalizeEmail(email);
  const passwordHash = hashPassword(password);

  if (!hasDatabaseUrl()) {
    return createMemoryUser({
      email: normalizedEmail,
      name,
      passwordHash,
      role,
      workspaceId: context.workspaceId
    });
  }

  return withTransaction(async (client) => {
    const insertedUser = await client.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         status = 'active'
       RETURNING id, email, name, status`,
      [normalizedEmail, name || normalizedEmail, passwordHash]
    );
    const user = insertedUser.rows[0];

    await client.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [context.workspaceId, user.id, role]
    );

    return publicUser(
      {
        id: String(user.id),
        email: user.email,
        name: user.name,
        status: user.status
      },
      role
    );
  });
}

export function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || null;
}

function bootstrapMemoryAuth(env) {
  const workspaceName = env.WORKSPACE_NAME || "Local Workspace";
  const workspace = ensureMemoryWorkspace(workspaceName);
  const email = normalizeEmail(env.ADMIN_EMAIL || env.DEV_AUTH_EMAIL || "admin@example.com");

  if ([...memoryUsers.values()].some((user) => user.email === email)) {
    return { adminCreated: false, bootstrapRequired: false };
  }

  createMemoryUser({
    email,
    name: env.ADMIN_NAME || "Local Admin",
    passwordHash: hashPassword(env.ADMIN_PASSWORD || env.DEV_AUTH_PASSWORD || "admin12345"),
    role: "admin",
    workspaceId: workspace.id
  });
  return { adminCreated: true, bootstrapRequired: false };
}

async function bootstrapDatabaseAuth(env) {
  const workspaceName = env.WORKSPACE_NAME || "Default Workspace";
  const email = normalizeEmail(env.ADMIN_EMAIL || "");
  const password = String(env.ADMIN_PASSWORD || "");

  return withTransaction(async (client) => {
    const workspaceResult = await client.query(
      `INSERT INTO workspaces (name)
       VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`,
      [workspaceName]
    );
    const workspace = workspaceResult.rows[0];
    const userCount = await client.query("SELECT COUNT(*)::INT AS count FROM users");

    if (Number(userCount.rows[0].count) > 0) {
      return { adminCreated: false, bootstrapRequired: false };
    }

    if (!email || !password) {
      console.warn(
        "[auth] No users exist yet. Set ADMIN_EMAIL and ADMIN_PASSWORD, then restart to bootstrap the first admin."
      );
      return { adminCreated: false, bootstrapRequired: true };
    }

    const insertedUser = await client.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [email, env.ADMIN_NAME || "Admin", hashPassword(password)]
    );

    await client.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'admin'`,
      [workspace.id, insertedUser.rows[0].id]
    );
    return { adminCreated: true, bootstrapRequired: false };
  });
}

async function findUserForLogin(email) {
  if (!hasDatabaseUrl()) {
    const user = [...memoryUsers.values()].find((candidate) => candidate.email === email);
    if (!user) return null;
    const membership = memoryMemberships.find((item) => item.userId === user.id);
    const workspace = memoryWorkspaces.get(membership?.workspaceId);
    if (!membership || !workspace) return null;

    return {
      passwordHash: user.passwordHash,
      role: membership.role,
      user: publicUserRecord(user),
      workspace
    };
  }

  const result = await query(
    `SELECT
       u.id,
       u.email,
       u.name,
       u.password_hash,
       u.status,
       wm.role,
       w.id AS workspace_id,
       w.name AS workspace_name
     FROM users u
     JOIN workspace_memberships wm ON wm.user_id = u.id
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE u.email = $1
     ORDER BY wm.created_at ASC
     LIMIT 1`,
    [email]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    passwordHash: row.password_hash,
    role: row.role,
    user: {
      id: String(row.id),
      email: row.email,
      name: row.name,
      status: row.status
    },
    workspace: {
      id: String(row.workspace_id),
      name: row.workspace_name
    }
  };
}

async function findSession(token) {
  const hash = tokenHash(token);

  if (!hasDatabaseUrl()) {
    const session = memorySessions.get(hash);
    if (!session || session.expiresAt <= new Date()) return null;
    const user = memoryUsers.get(session.userId);
    const membership = memoryMemberships.find(
      (item) => item.userId === session.userId && item.workspaceId === session.workspaceId
    );
    const workspace = memoryWorkspaces.get(session.workspaceId);
    if (!user || !membership || !workspace || user.status !== "active") return null;

    return {
      role: membership.role,
      user: publicUser(publicUserRecord(user), membership.role),
      workspace
    };
  }

  const result = await query(
    `SELECT
       s.user_id,
       s.workspace_id,
       u.email,
       u.name,
       u.status,
       wm.role,
       w.name AS workspace_name
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN workspaces w ON w.id = s.workspace_id
     JOIN workspace_memberships wm
       ON wm.user_id = s.user_id AND wm.workspace_id = s.workspace_id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()
       AND u.status = 'active'
     LIMIT 1`,
    [hash]
  );

  const row = result.rows[0];
  if (!row) return null;

  await query("UPDATE auth_sessions SET last_seen_at = NOW() WHERE token_hash = $1", [
    hash
  ]);

  return {
    role: row.role,
    user: publicUser(
      {
        id: String(row.user_id),
        email: row.email,
        name: row.name,
        status: row.status
      },
      row.role
    ),
    workspace: {
      id: String(row.workspace_id),
      name: row.workspace_name
    }
  };
}

async function saveSession({ token, userId, workspaceId, expiresAt }) {
  if (!hasDatabaseUrl()) {
    memorySessions.set(tokenHash(token), {
      expiresAt,
      userId: String(userId),
      workspaceId: String(workspaceId)
    });
    return;
  }

  await query(
    `INSERT INTO auth_sessions (token_hash, user_id, workspace_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tokenHash(token), userId, workspaceId, expiresAt]
  );
}

function createMemoryUser({ email, name, passwordHash, role, workspaceId }) {
  const existing = [...memoryUsers.values()].find((user) => user.email === email);
  const user =
    existing ||
    {
      id: String(memoryUserId++),
      email,
      name: name || email,
      passwordHash,
      status: "active"
    };

  user.name = name || user.name;
  user.passwordHash = passwordHash;
  user.status = "active";
  memoryUsers.set(user.id, user);

  const existingMembership = memoryMemberships.find(
    (membership) => membership.userId === user.id && membership.workspaceId === workspaceId
  );
  if (existingMembership) {
    existingMembership.role = role;
  } else {
    memoryMemberships.push({
      role,
      userId: user.id,
      workspaceId
    });
  }

  return publicUser(publicUserRecord(user), role);
}

function ensureMemoryWorkspace(name) {
  const existing = [...memoryWorkspaces.values()].find((workspace) => workspace.name === name);
  if (existing) return existing;

  const workspace = {
    id: String(memoryWorkspaceId++),
    name
  };
  memoryWorkspaces.set(workspace.id, workspace);
  return workspace;
}

function publicUserRecord(user) {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    status: user.status
  };
}

function publicUser(user, role) {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    role
  };
}

function newSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, salt, expectedHash] = String(storedHash || "").split(":");
  if (scheme !== "scrypt" || !salt || !expectedHash) return false;

  const actual = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHash, "base64url");

  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}
