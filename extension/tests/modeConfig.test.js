const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

async function loadConfigModule() {
  return import(pathToFileURL(path.resolve(__dirname, "../src/shared/extension-config.js")).href);
}

async function loadStorageModule() {
  return import(pathToFileURL(path.resolve(__dirname, "../src/shared/storage.js")).href);
}

test("defaults new installs to hosted mode", async () => {
  const { EXTENSION_MODES } = await loadConfigModule();
  const { deriveModeSettings } = await loadStorageModule();

  const settings = deriveModeSettings({});

  assert.equal(settings.mode, EXTENSION_MODES.HOSTED);
});

test("migrates legacy localhost defaults to hosted when no auth is present", async () => {
  const { EXTENSION_MODES } = await loadConfigModule();
  const { STORAGE_KEYS, deriveModeSettings, shouldMigrateLegacyModeDefaults } = await loadStorageModule();

  const stored = {
    [STORAGE_KEYS.mode]: EXTENSION_MODES.LOCAL,
    [STORAGE_KEYS.appBaseUrl]: "http://127.0.0.1:5173",
    [STORAGE_KEYS.apiBaseUrl]: "http://127.0.0.1:8000",
  };

  assert.equal(shouldMigrateLegacyModeDefaults(stored), true);
  assert.equal(deriveModeSettings(stored).mode, EXTENSION_MODES.HOSTED);
});

test("preserves legacy local mode when auth already exists", async () => {
  const { EXTENSION_MODES } = await loadConfigModule();
  const { STORAGE_KEYS, deriveModeSettings, shouldMigrateLegacyModeDefaults } = await loadStorageModule();

  const stored = {
    [STORAGE_KEYS.mode]: EXTENSION_MODES.LOCAL,
    [STORAGE_KEYS.appBaseUrl]: "http://127.0.0.1:5173",
    [STORAGE_KEYS.apiBaseUrl]: "http://127.0.0.1:8000",
    [STORAGE_KEYS.authToken]: "local-token",
  };

  assert.equal(shouldMigrateLegacyModeDefaults(stored), false);
  assert.equal(deriveModeSettings(stored).mode, EXTENSION_MODES.LOCAL);
});

test("returns both localhost aliases in local mode", async () => {
  const { EXTENSION_MODES, getAllowedExternalOrigins } = await loadConfigModule();

  assert.deepEqual(getAllowedExternalOrigins(EXTENSION_MODES.LOCAL), [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ]);
});
