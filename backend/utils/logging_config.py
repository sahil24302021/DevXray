"""
Structured Logging Configuration for the Developer Intelligence Platform.
Replaces all print() calls with proper, configurable logging.
"""
import logging
import sys


def setup_logging(level: str = "INFO") -> None:
    """Configure structured logging for the entire application."""
    log_format = (
        "%(asctime)s | %(levelname)-8s | %(name)-25s | %(message)s"
    )
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format=log_format,
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
        force=True,
    )
    # Quiet down noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("google").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Get a named logger for a module."""
    return logging.getLogger(f"dip.{name}")
