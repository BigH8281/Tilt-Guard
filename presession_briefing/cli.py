from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .live_data import build_live_snapshot
from .orchestrator import generate_session_brief
from .service import generate_live_response


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate a pre-session market briefing.")
    parser.add_argument("--input", type=Path, help="Path to the input snapshot JSON.")
    parser.add_argument("--sample", action="store_true", help="Use the bundled sample snapshot.")
    parser.add_argument("--live", action="store_true", help="Fetch live market data before generating the briefing.")
    parser.add_argument(
        "--snapshot-only",
        action="store_true",
        help="Print the live snapshot without generating the briefing.",
    )
    parser.add_argument("--market", default="us-index-futures", help="Live market profile to use.")
    parser.add_argument("--timezone", help="IANA timezone for local-time rendering, for example Europe/London.")
    parser.add_argument("--no-social", action="store_true", help="Disable the social-sentiment fetch on live runs.")
    parser.add_argument(
        "--bundle",
        action="store_true",
        help="Print the full integration response envelope instead of only the briefing.",
    )
    parser.add_argument(
        "--with-charts",
        action="store_true",
        help="When used with --bundle, include static chart images in the response.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if not args.input and not args.sample and not args.live:
        parser.error("Provide --input, --sample, or --live.")

    if args.live:
        if args.bundle:
            print(
                json.dumps(
                    generate_live_response(
                        {
                            "market": args.market,
                            "local_timezone": args.timezone,
                            "include_social": not args.no_social,
                            "include_charts": args.with_charts,
                            "include_snapshot": True,
                        }
                    ),
                    indent=2,
                )
            )
            return

        payload = build_live_snapshot(
            market=args.market,
            local_timezone=args.timezone,
            include_social=not args.no_social,
        )
        if args.snapshot_only:
            print(json.dumps(payload, indent=2))
            return
    else:
        source_path = args.input
        if args.sample:
            source_path = _repo_root() / "data" / "sample_snapshot.json"
        payload = _load_json(source_path)

    result = generate_session_brief(payload)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
