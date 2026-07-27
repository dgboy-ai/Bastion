"""Tests for Bastion error hierarchy."""

from __future__ import annotations

import pytest

from bastion.errors import (
    BastionAuthError,
    BastionConfigError,
    BastionConnectionError,
    BastionError,
    BastionNotFoundError,
    BastionPoolExhaustedError,
    BastionRetryExhaustedError,
    BastionSerializationError,
    BastionTimeoutError,
    BastionValidationError,
)

_ALL_ERRORS = [
    BastionConnectionError,
    BastionTimeoutError,
    BastionSerializationError,
    BastionRetryExhaustedError,
    BastionPoolExhaustedError,
    BastionValidationError,
    BastionConfigError,
    BastionNotFoundError,
    BastionAuthError,
]


class TestErrorInstantiation:
    @pytest.mark.parametrize("error_cls", _ALL_ERRORS)
    def test_can_instantiate_no_args(self, error_cls):
        exc = error_cls()
        assert isinstance(exc, Exception)

    @pytest.mark.parametrize(
        "error_cls,msg",
        [
            (BastionConnectionError, "connection refused"),
            (BastionTimeoutError, "operation timed out after 30s"),
            (BastionSerializationError, "serialization conflict 40001"),
            (BastionRetryExhaustedError, "all 5 retries exhausted"),
            (BastionPoolExhaustedError, "no connections available"),
            (BastionValidationError, "invalid input: memory_id is required"),
            (BastionConfigError, "BASTION_CONN is not set"),
            (BastionNotFoundError, "memory not found"),
            (BastionAuthError, "invalid API key"),
        ],
    )
    def test_can_instantiate_with_message(self, error_cls, msg):
        exc = error_cls(msg)
        assert str(exc) == msg


class TestIsInstanceChecks:
    @pytest.mark.parametrize(
        "error_cls",
        [
            BastionConnectionError,
            BastionTimeoutError,
            BastionSerializationError,
            BastionRetryExhaustedError,
            BastionPoolExhaustedError,
            BastionValidationError,
            BastionConfigError,
            BastionNotFoundError,
            BastionAuthError,
        ],
    )
    def test_all_errors_are_bastion_error(self, error_cls):
        exc = error_cls()
        assert isinstance(exc, BastionError)

    @pytest.mark.parametrize(
        "error_cls",
        [
            BastionConnectionError,
            BastionTimeoutError,
            BastionSerializationError,
            BastionRetryExhaustedError,
            BastionPoolExhaustedError,
            BastionValidationError,
            BastionConfigError,
            BastionNotFoundError,
            BastionAuthError,
        ],
    )
    def test_all_errors_are_exception(self, error_cls):
        exc = error_cls()
        assert isinstance(exc, Exception)

    def test_bastion_error_is_not_generic_exception_by_default(self):
        with pytest.raises(AssertionError):
            assert isinstance(ValueError(), BastionError)

    def test_custom_subclass_of_bastion_error(self):
        class CustomError(BastionError):
            pass

        assert issubclass(CustomError, BastionError)

    def test_bastion_error_is_base(self):
        """BastionError is the base class and should not be a subclass of itself
        in the wrong way."""
        assert issubclass(BastionConnectionError, BastionError)


class TestErrorMessageStorage:
    def test_empty_message(self):
        exc = BastionError()
        assert str(exc) == ""

    def test_message_stored_in_args(self):
        exc = BastionConnectionError("db connection lost")
        assert exc.args == ("db connection lost",)

    def test_none_message(self):
        exc = BastionTimeoutError(None)
        assert str(exc) == "None"

    def test_formatted_message(self):
        msg = f"retry {3} of {5} failed"
        exc = BastionRetryExhaustedError(msg)
        assert str(exc) == "retry 3 of 5 failed"


def test_raise_and_catch_bastion_error():
    def might_fail(should_fail):
        if should_fail:
            raise BastionConnectionError("fail")
        return "ok"

    with pytest.raises(BastionError):
        might_fail(True)

    assert might_fail(False) == "ok"


def test_raise_and_catch_specific():
    with pytest.raises(BastionPoolExhaustedError):
        raise BastionPoolExhaustedError("pool full")

    with pytest.raises(BastionSerializationError):
        raise BastionSerializationError("40001")


def test_error_can_be_chained():
    try:
        raise BastionConnectionError("outer") from ValueError("inner")
    except BastionConnectionError as e:
        assert isinstance(e.__cause__, ValueError)
        assert str(e.__cause__) == "inner"
