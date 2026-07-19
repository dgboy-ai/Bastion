"""Pytest configuration and fixtures."""

import pytest

from bastion.mock import reset


@pytest.fixture(autouse=True)
def _clean_mock_state():
    """Clear mock module global state before each test to prevent pollution."""
    reset()


@pytest.fixture(autouse=True)
def _disable_strict_a2a():
    import os
    orig = os.environ.get("BASTION_A2A_STRICT")
    os.environ["BASTION_A2A_STRICT"] = "false"
    yield
    if orig is not None:
        os.environ["BASTION_A2A_STRICT"] = orig
    else:
        os.environ.pop("BASTION_A2A_STRICT", None)


def pytest_addoption(parser):
    """Add custom CLI flags for different test categories."""
    parser.addoption(
        "--e2e",
        action="store_true",
        default=False,
        help="Run end-to-end tests against a live server",
    )
    parser.addoption(
        "--integration",
        action="store_true",
        default=False,
        help="Run integration tests against a real CockroachDB",
    )
    parser.addoption(
        "--stress",
        action="store_true",
        default=False,
        help="Run resource-intensive stress tests",
    )
    parser.addoption(
        "--property",
        action="store_true",
        default=False,
        help="Run property-based tests (requires hypothesis)",
    )


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "e2e: tests needing a live server")
    config.addinivalue_line("markers", "integration: tests needing real CockroachDB")
    config.addinivalue_line("markers", "stress: resource-intensive tests")
    config.addinivalue_line("markers", "property: property-based tests")
