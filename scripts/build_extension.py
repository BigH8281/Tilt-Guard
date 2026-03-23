from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parent.parent
EXTENSION_ROOT = REPO_ROOT / "extension"
DIST_ROOT = EXTENSION_ROOT / "dist"
CONFIG_PATH = Path("src/shared/extension-config.js")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Build a mode-specific unpacked Tilt Guard extension.")
  parser.add_argument("--mode", choices=["local", "hosted"], required=True)
  parser.add_argument("--api-base-url")
  parser.add_argument("--app-base-url")
  parser.add_argument("--output-dir")
  return parser.parse_args()


def normalise_base_url(value: str | None, *, name: str) -> str:
  if not value:
    raise SystemExit(f"{name} is required for this mode.")

  parsed = urlparse(value)
  if parsed.scheme not in {"http", "https"} or not parsed.netloc:
    raise SystemExit(f"{name} must be an absolute http(s) URL.")

  return value.rstrip("/")


def loopback_aliases(url: str) -> list[str]:
  parsed = urlparse(url)
  if parsed.hostname not in {"127.0.0.1", "localhost"}:
    return [url]

  aliases = []
  for host in ("127.0.0.1", "localhost"):
    aliases.append(parsed._replace(netloc=f"{host}:{parsed.port}" if parsed.port else host).geturl().rstrip("/"))
  return aliases


def to_match_pattern(url: str) -> str:
  parsed = urlparse(url)
  return f"{parsed.scheme}://{parsed.netloc}/*"


def write_config(target_root: Path, *, mode: str, api_base_url: str, app_base_url: str, allowed_external_origins: list[str]) -> None:
  config_file = target_root / CONFIG_PATH
  config_file.write_text(
    "\n".join(
      [
        "export const EXTENSION_CONFIG = {",
        f'  mode: "{mode.upper()}",',
        f'  apiBaseUrl: "{api_base_url}",',
        f'  appBaseUrl: "{app_base_url}",',
        "  allowedExternalOrigins: [",
        *[f'    "{origin}",' for origin in allowed_external_origins],
        "  ],",
        "};",
        "",
      ]
    ),
    encoding="utf-8",
  )


def write_manifest(target_root: Path, *, host_permissions: list[str], externally_connectable_matches: list[str]) -> None:
  manifest_path = target_root / "manifest.json"
  manifest = json.loads((EXTENSION_ROOT / "manifest.json").read_text(encoding="utf-8"))
  manifest["host_permissions"] = host_permissions
  manifest["externally_connectable"] = {"matches": externally_connectable_matches}
  manifest_path.write_text(f"{json.dumps(manifest, indent=2)}\n", encoding="utf-8")


def build_extension(mode: str, api_base_url: str, app_base_url: str, output_dir: Path) -> None:
  if output_dir.exists():
    shutil.rmtree(output_dir)

  shutil.copytree(
    EXTENSION_ROOT,
    output_dir,
    ignore=shutil.ignore_patterns("dist", ".DS_Store"),
  )

  allowed_external_origins = sorted(set(loopback_aliases(app_base_url) if mode == "local" else [app_base_url]))
  host_permissions = ["https://www.tradingview.com/*"] + [
    to_match_pattern(url)
    for url in sorted(set(loopback_aliases(api_base_url) if mode == "local" else [api_base_url]))
  ]
  externally_connectable_matches = [to_match_pattern(url) for url in allowed_external_origins]

  write_config(
    output_dir,
    mode=mode,
    api_base_url=api_base_url,
    app_base_url=app_base_url,
    allowed_external_origins=allowed_external_origins,
  )
  write_manifest(
    output_dir,
    host_permissions=host_permissions,
    externally_connectable_matches=externally_connectable_matches,
  )


def main() -> None:
  args = parse_args()

  if args.mode == "local":
    api_base_url = args.api_base_url or "http://127.0.0.1:8000"
    app_base_url = args.app_base_url or "http://127.0.0.1:5173"
    output_dir = Path(args.output_dir) if args.output_dir else DIST_ROOT / "local"
  else:
    api_base_url = normalise_base_url(args.api_base_url, name="--api-base-url")
    app_base_url = normalise_base_url(args.app_base_url, name="--app-base-url")
    output_dir = Path(args.output_dir) if args.output_dir else DIST_ROOT / "hosted"

  build_extension(
    args.mode,
    normalise_base_url(api_base_url, name="api base URL"),
    normalise_base_url(app_base_url, name="app base URL"),
    output_dir,
  )
  print(f"Built Tilt Guard extension ({args.mode.upper()}) at {output_dir}")


if __name__ == "__main__":
  main()
