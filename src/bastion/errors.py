from __future__ import annotations


class BastionError(Exception):
    """Base exception for all Bastion SDK errors."""


class BastionConnectionError(BastionError):
    """Raised when database connection fails."""


class BastionTimeoutError(BastionError):
    """Raised when an operation exceeds its timeout."""


class BastionSerializationError(BastionError):
    """Raised on unrecoverable serialization conflict (40001)."""


class BastionRetryExhaustedError(BastionError):
    """Raised when the retry engine exhausts all attempts."""


class BastionPoolExhaustedError(BastionError):
    """Raised when the connection pool has no available connections."""


class BastionValidationError(BastionError):
    """Raised when input validation fails."""


class BastionConfigError(BastionError):
    """Raised when configuration is invalid or missing."""


class BastionNotFoundError(BastionError):
    """Raised when a requested resource is not found."""


class BastionAuthError(BastionError):
    """Raised on authentication or authorization failure."""


class SecurityBlockError(BastionError):
    """Raised when MemoryGuard blocks content as unsafe."""

    def __init__(self, message: str, report: object | None = None) -> None:
        super().__init__(message)
        self.report = report
