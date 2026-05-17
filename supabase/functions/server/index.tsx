import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import * as auth from "./auth.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-9245971e/health", (c) => {
  return c.json({ status: "ok" });
});

// ===== AUTHENTICATION ROUTES =====

// Login
app.post("/make-server-9245971e/auth/login", async (c) => {
  try {
    const { email, password } = await c.req.json();
    const result = await auth.authenticateUser(email, password);

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 401);
    }

    // Get permissions if auditor
    let permissions = [];
    if (result.user.role === 'auditor') {
      permissions = await auth.getUserPermissions(result.user.id);
    }

    return c.json({
      success: true,
      user: result.user,
      permissions
    });
  } catch (error) {
    console.log("Login error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Create auditor (owner only)
app.post("/make-server-9245971e/auth/create-auditor", async (c) => {
  try {
    const { email, password, fullName, createdBy } = await c.req.json();

    const user = await auth.createUser(email, password, fullName, 'auditor', createdBy);
    const { password_hash, ...userWithoutPassword } = user;

    return c.json({ success: true, user: userWithoutPassword });
  } catch (error) {
    console.log("Create auditor error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get all auditors (owner only)
app.get("/make-server-9245971e/auth/auditors", async (c) => {
  try {
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, is_active, created_at, last_login')
      .eq('role', 'auditor')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return c.json({ success: true, data: data || [] });
  } catch (error) {
    console.log("Get auditors error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update auditor permissions
app.post("/make-server-9245971e/auth/auditor/:id/permissions", async (c) => {
  try {
    const auditorId = c.req.param("id");
    const { permissions } = await c.req.json();

    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Delete existing permissions
    await supabase
      .from('auditor_permissions')
      .delete()
      .eq('auditor_id', auditorId);

    // Insert new permissions
    if (permissions && permissions.length > 0) {
      const permissionsToInsert = permissions.map((p: any) => ({
        auditor_id: auditorId,
        permission_name: p.name,
        can_view: p.can_view || false,
        can_create: p.can_create || false,
        can_edit: p.can_edit || false,
        can_delete: p.can_delete || false
      }));

      const { error } = await supabase
        .from('auditor_permissions')
        .insert(permissionsToInsert);

      if (error) throw error;
    }

    return c.json({ success: true });
  } catch (error) {
    console.log("Update permissions error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get auditor permissions
app.get("/make-server-9245971e/auth/auditor/:id/permissions", async (c) => {
  try {
    const auditorId = c.req.param("id");
    const permissions = await auth.getUserPermissions(auditorId);
    return c.json({ success: true, data: permissions });
  } catch (error) {
    console.log("Get permissions error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Delete auditor
app.delete("/make-server-9245971e/auth/auditor/:id", async (c) => {
  try {
    const auditorId = c.req.param("id");

    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', auditorId);

    if (error) throw error;
    return c.json({ success: true });
  } catch (error) {
    console.log("Delete auditor error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Get audit logs
app.get("/make-server-9245971e/auth/audit-logs", async (c) => {
  try {
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return c.json({ success: true, data: data || [] });
  } catch (error) {
    console.log("Get audit logs error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

Deno.serve(app.fetch);
