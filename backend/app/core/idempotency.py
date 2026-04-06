from __future__ import annotations

import hashlib
import json
from typing import Any


def canonical_payload(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def request_hash(scope: str, payload: Any) -> str:
    digest = hashlib.sha256()
    digest.update(scope.encode("utf-8"))
    digest.update(b"|")
    digest.update(canonical_payload(payload).encode("utf-8"))
    return digest.hexdigest()
