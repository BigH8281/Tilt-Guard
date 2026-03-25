from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parent.parent
EXTENSION_ROOT = REPO_ROOT / "extension"
DIST_ROOT = EXTENSION_ROOT / "dist"
CONFIG_PATH = Path("src/shared/extension-config.js")

DEFAULT_HOSTED_APP_BASE_URL = "https://web-production-91bf.up.railway.app"
DEFAULT_HOSTED_API_BASE_URL = "https://web-production-91bf.up.railway.app"
LOCAL_APP_BASE_URL = "http://127.0.0.1:5173"
LOCAL_API_BASE_URL = "http://127.0.0.1:8000"


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Build the single unpacked Tilt Guard extension.")
  parser.add_argument("--hosted-app-base-url", default=DEFAULT_HOSTED_APP_BASE_URL)
  parser.add_argument("--hosted-api-base-url", default=DEFAULT_HOSTED_API_BASE_URL)
  parser.add_argument("--output-dir")
  return parser.parse_args()


def normalise_base_url(value: str) -> str:
  stripped = value.strip()
  if stripped.startswith("<") and stripped.endswith(">"):
    return stripped

  parsed = urlparse(stripped)
  if parsed.scheme not in {"http", "https"} or not parsed.netloc:
    raise SystemExit(f"Invalid absolute http(s) URL: {value}")

  return stripped.rstrip("/")


def write_extension_config(target_root: Path, *, hosted_app_base_url: str, hosted_api_base_url: str) -> None:
  config_file = target_root / CONFIG_PATH
  config_file.write_text(
    "\n".join(
      [
        "export const EXTENSION_MODES = {",
        '  HOSTED: "HOSTED",',
        '  LOCAL: "LOCAL",',
        "};",
        "",
        "export const EXTENSION_CONFIG = {",
        "  defaultMode: EXTENSION_MODES.HOSTED,",
        "  modes: {",
        "    [EXTENSION_MODES.HOSTED]: {",
        f'      appBaseUrl: "{hosted_app_base_url}",',
        f'      apiBaseUrl: "{hosted_api_base_url}",',
        "    },",
        "    [EXTENSION_MODES.LOCAL]: {",
        f'      appBaseUrl: "{LOCAL_APP_BASE_URL}",',
        f'      apiBaseUrl: "{LOCAL_API_BASE_URL}",',
        "    },",
        "  },",
        "};",
        "",
        "export function normaliseMode(value) {",
        '  if (typeof value !== "string") {',
        "    return EXTENSION_CONFIG.defaultMode;",
        "  }",
        "",
        '  const upperValue = value.trim().toUpperCase();',
        "  return EXTENSION_CONFIG.modes[upperValue] ? upperValue : EXTENSION_CONFIG.defaultMode;",
        "}",
        "",
        "export function getModeConfig(mode) {",
        "  const normalisedMode = normaliseMode(mode);",
        "  const config = EXTENSION_CONFIG.modes[normalisedMode];",
        "  return {",
        "    mode: normalisedMode,",
        "    appBaseUrl: config.appBaseUrl,",
        "    apiBaseUrl: config.apiBaseUrl,",
        "  };",
        "}",
        "",
        "export function isAbsoluteHttpUrl(value) {",
        '  if (typeof value !== "string" || !value.trim()) {',
        "    return false;",
        "  }",
        "",
        "  try {",
        "    const parsed = new URL(value);",
        '    return parsed.protocol === "http:" || parsed.protocol === "https:";',
        "  } catch {",
        "    return false;",
        "  }",
        "}",
        "",
        "export function normaliseBaseUrl(value) {",
        "  if (!isAbsoluteHttpUrl(value)) {",
        '    return "";',
        "  }",
        "",
        '  return value.replace(/\\/+$/, "");',
        "}",
        "",
        "export function getConfiguredModeConfig(mode) {",
        "  const config = getModeConfig(mode);",
        "  return {",
        "    ...config,",
        "    appBaseUrl: normaliseBaseUrl(config.appBaseUrl),",
        "    apiBaseUrl: normaliseBaseUrl(config.apiBaseUrl),",
        "  };",
        "}",
        "",
        "export function loopbackAliases(url) {",
        "  const baseUrl = normaliseBaseUrl(url);",
        "  if (!baseUrl) {",
        "    return [];",
        "  }",
        "",
        "  const parsed = new URL(baseUrl);",
        '  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {',
        "    return [baseUrl];",
        "  }",
        "",
        '  const aliases = ["127.0.0.1", "localhost"].map((hostname) => {',
        "    parsed.hostname = hostname;",
        '    return parsed.toString().replace(/\\/+$/, "");',
        "  });",
        "",
        "  return [...new Set(aliases)];",
        "}",
        "",
        "export function getAllowedExternalOrigins(mode) {",
        "  const { appBaseUrl } = getConfiguredModeConfig(mode);",
        "  return loopbackAliases(appBaseUrl);",
        "}",
        "",
      ]
    ),
    encoding="utf-8",
  )


def build_extension(output_dir: Path, *, hosted_app_base_url: str, hosted_api_base_url: str) -> None:
  if output_dir.exists():
    shutil.rmtree(output_dir)

  shutil.copytree(
    EXTENSION_ROOT,
    output_dir,
    ignore=shutil.ignore_patterns("dist", ".DS_Store"),
  )
  write_extension_config(
    output_dir,
    hosted_app_base_url=hosted_app_base_url,
    hosted_api_base_url=hosted_api_base_url,
  )


def main() -> None:
  args = parse_args()
  output_dir = Path(args.output_dir) if args.output_dir else DIST_ROOT / "unpacked"
  hosted_app_base_url = normalise_base_url(args.hosted_app_base_url)
  hosted_api_base_url = normalise_base_url(args.hosted_api_base_url)

  build_extension(
    output_dir,
    hosted_app_base_url=hosted_app_base_url,
    hosted_api_base_url=hosted_api_base_url,
  )
  print(f"Built Tilt Guard extension at {output_dir}")


if __name__ == "__main__":
  main()
