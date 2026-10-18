import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/persistence/supabase-store";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({})) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("server Supabase credentials", () => {
  it("prefers the secret key when both supported credentials are present", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-legacy");
    expect(isSupabaseConfigured()).toBe(true);
    createSupabaseAdmin();
    expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "test-secret", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("retains compatibility with the legacy service-role credential", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-legacy");
    expect(isSupabaseConfigured()).toBe(true);
    createSupabaseAdmin();
    expect(createClient).toHaveBeenCalledWith("https://example.supabase.co", "test-legacy", expect.any(Object));
  });

  it("does not treat a publishable key as an administrative credential", () => {
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable");
    expect(isSupabaseConfigured()).toBe(false);
    expect(createSupabaseAdmin).toThrow("Missing env SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("requires the project URL before creating a client", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
    vi.stubEnv("SUPABASE_URL", "");
    expect(isSupabaseConfigured()).toBe(false);
    expect(createSupabaseAdmin).toThrow("Missing env SUPABASE_URL");
    expect(createClient).not.toHaveBeenCalled();
  });
});
