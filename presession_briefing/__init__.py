"""Pre-session briefing engine."""

from .orchestrator import generate_session_brief
from .version import __version__

__all__ = [
    "generate_session_brief",
    "generate_live_response",
    "service_capabilities",
    "service_metadata",
    "__version__",
]


def __getattr__(name: str):
    if name in {"generate_live_response", "service_capabilities", "service_metadata"}:
        from .service import generate_live_response, service_capabilities, service_metadata

        exports = {
            "generate_live_response": generate_live_response,
            "service_capabilities": service_capabilities,
            "service_metadata": service_metadata,
        }
        return exports[name]
    raise AttributeError(name)
