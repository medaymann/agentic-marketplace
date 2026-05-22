"""
basira.agent — high-level interface for building autonomous Basira agents.

Minimal example:

    from basira import Agent

    agent = Agent.from_env()

    @agent.on_task
    def handle(task):
        return f"Summary of: {task.title}"

    agent.serve(port=3001)

The SDK handles:
  - the webhook HTTP listener at /basira/<event>
  - HMAC-SHA256 signature verification on every request
  - applying to bounties (task.created) and accepting work (task.offered)
  - calling Basira's REST API (apply / submit) with API-key auth

This deterministic SDK talks to the platform over plain REST. MCP exists for
LLM-driven agents that reason about which action to take; a fixed
webhook → handler → submit pipeline doesn't need tool discovery.

Notably, the SDK does *not* hold a Solana private key. The platform signs the
on-chain submission tx on your behalf — your agent only ever needs an API key
and a webhook secret, both minted at onboarding.
"""

from __future__ import annotations

import asyncio
import hmac
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional, Union

import aiohttp
from aiohttp import web

log = logging.getLogger("basira-agent")

DEFAULT_BASIRA_URL = "https://basira.xyz"

WEBHOOK_AGE_TOLERANCE_S = 5 * 60


def _load_dotenv() -> None:
    """Load a local .env (or .env.basira) into os.environ if present.

    The onboarding CLI writes credentials to one of these files, so the agent
    runs without a manual `export`. Real environment variables always win — we
    never overwrite a key that's already set. Tiny built-in parser; no extra
    dependency. Lines are `KEY=VALUE`; blank lines and `#` comments ignored.
    """
    for name in (".env", ".env.basira"):
        path = os.path.join(os.getcwd(), name)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, encoding="utf-8") as f:
                for raw in f:
                    line = raw.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = value
        except OSError:
            # A missing/unreadable .env is not fatal — fall back to real env.
            continue


@dataclass
class Task:
    """The payload of a task.created or task.offered webhook."""
    task_id: str
    event: str
    raw: dict
    # Convenience fields (present on task.created; may be None on task.offered)
    title: Optional[str] = None
    description: Optional[str] = None
    acceptance_criteria: Optional[list[str]] = None
    capability_tags: Optional[list[str]] = None
    currency: Optional[str] = None
    amount: Optional[str] = None
    deadline: Optional[int] = None


SyncHandler = Callable[[Task], Union[str, None]]
AsyncHandler = Callable[[Task], Awaitable[Union[str, None]]]
Handler = Union[SyncHandler, AsyncHandler]


class Agent:
    """
    Build an autonomous Basira agent.

    Construct with `Agent.from_env()` to pick up:
      BASIRA_API_KEY         (required) — your agent's API key
      BASIRA_WEBHOOK_SECRET  (required) — HMAC secret for webhook verification
      BASIRA_URL             (optional) — defaults to https://basira.xyz
    """

    def __init__(
        self,
        api_key: str,
        webhook_secret: str,
        basira_url: str = DEFAULT_BASIRA_URL,
    ) -> None:
        self.api_key = api_key
        self.webhook_secret = webhook_secret
        self.basira_url = basira_url.rstrip("/")

        self._handler: Optional[Handler] = None
        self._apply_filter: Optional[Callable[[Task], bool]] = None

    # ----- construction ----------------------------------------------------

    @classmethod
    def from_env(cls) -> "Agent":
        # Pick up credentials from a local .env (written by `npm run onboard`)
        # if present; real env vars take precedence.
        _load_dotenv()
        try:
            return cls(
                api_key=os.environ["BASIRA_API_KEY"],
                webhook_secret=os.environ["BASIRA_WEBHOOK_SECRET"],
                basira_url=os.environ.get("BASIRA_URL", DEFAULT_BASIRA_URL),
            )
        except KeyError as e:
            raise RuntimeError(
                f"{e.args[0]} is not set. Required env: BASIRA_API_KEY, BASIRA_WEBHOOK_SECRET."
            ) from None

    # ----- registering handlers --------------------------------------------

    def on_task(self, fn: Handler) -> Handler:
        """Register the function that does the work for assigned tasks."""
        self._handler = fn
        return fn

    def should_apply(self, fn: Callable[[Task], bool]) -> Callable[[Task], bool]:
        """
        Optional. Decides whether to apply to a `task.created` bounty.

        If unset, the agent applies to every bounty whose tags overlap its
        registered capability_tags (the platform already filters before sending,
        so the default is "apply to everything you hear about").
        """
        self._apply_filter = fn
        return fn

    # ----- the HTTP listener -----------------------------------------------

    def serve(self, host: str = "0.0.0.0", port: int = 3001) -> None:
        """Blocking. Starts the webhook listener on host:port."""
        if self._handler is None:
            raise RuntimeError("No @on_task handler registered.")
        app = self._build_app()
        log.info("listening on http://%s:%d (POST /basira/<event>)", host, port)
        web.run_app(app, host=host, port=port, print=lambda _: None)

    def _build_app(self) -> web.Application:
        app = web.Application()
        # /basira/health is registered before the generic route so the health
        # challenge isn't swallowed by the task-webhook handler.
        app.add_routes([
            web.post("/basira/health", self._handle_health),
            web.post("/basira/{event}", self._handle_webhook),
        ])
        return app

    async def _handle_health(self, request: web.Request) -> web.Response:
        """
        Liveness check. Basira POSTs { nonce, timestamp, signature } where
        signature = HMAC-SHA256(webhook_secret, "{timestamp}.{nonce}").
        We verify it, then reply { status: "ok", nonce_hmac: HMAC(secret, nonce) }
        to prove we hold the shared secret — no Solana keypair needed.
        """
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"status": "bad_request"}, status=400)

        nonce = body.get("nonce")
        ts = body.get("timestamp")
        sig = body.get("signature")
        if not nonce or not ts or not sig:
            return web.json_response({"status": "bad_request"}, status=400)

        expected_challenge = hmac.new(
            self.webhook_secret.encode(),
            f"{ts}.{nonce}".encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected_challenge, sig):
            log.warning("rejected health check with bad challenge signature")
            return web.json_response({"status": "unauthorized"}, status=401)

        nonce_hmac = hmac.new(
            self.webhook_secret.encode(), nonce.encode(), hashlib.sha256
        ).hexdigest()
        return web.json_response({"status": "ok", "nonce_hmac": nonce_hmac})

    async def _handle_webhook(self, request: web.Request) -> web.Response:
        raw = await request.read()
        if not self._verify_signature(request.headers, raw):
            log.warning("rejected webhook with bad signature")
            return web.Response(status=401, text="bad signature")

        event = request.match_info["event"]
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            return web.Response(status=400, text="bad json")

        task = _payload_to_task(event, payload)

        # Return 2xx fast; do work in the background.
        asyncio.create_task(self._dispatch(task))
        return web.Response(status=200, text="ok")

    def _verify_signature(self, headers, raw_body: bytes) -> bool:
        ts = headers.get("x-basira-timestamp")
        sig = headers.get("x-basira-signature")
        if not ts or not sig:
            return False
        try:
            if abs(time.time() - int(ts)) > WEBHOOK_AGE_TOLERANCE_S:
                return False
        except ValueError:
            return False
        expected = hmac.new(
            self.webhook_secret.encode(),
            f"{ts}.{raw_body.decode('utf-8')}".encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, sig)

    # ----- dispatch / work loop --------------------------------------------

    async def _dispatch(self, task: Task) -> None:
        try:
            if task.event == "task.created":
                await self._handle_bounty(task)
            elif task.event == "task.offered":
                await self._handle_offered(task)
            else:
                # Lifecycle events (approved, settled, etc.) — log only.
                log.info("ignoring lifecycle event %s for task %s", task.event, task.task_id)
        except Exception:
            log.exception("dispatch failed for task %s", task.task_id)

    async def _handle_bounty(self, task: Task) -> None:
        if self._apply_filter and not self._apply_filter(task):
            log.info("skipping bounty %s (filter said no)", task.task_id)
            return
        log.info("applying to bounty %s", task.task_id)
        await self._rest_post(
            f"/api/v1/bounties/{task.task_id}/apply",
            {"message": f"Picking up {task.title or task.task_id}"},
        )

    async def _handle_offered(self, task: Task) -> None:
        log.info("running handler for assigned task %s", task.task_id)
        # Fetch full task (typed_inputs may live only there for direct tasks).
        full = await self._fetch_task(task.task_id)
        if full:
            task.raw = full
            task.title = task.title or full.get("title")
            task.description = task.description or full.get("description")

        assert self._handler is not None
        result = self._handler(task)
        if asyncio.iscoroutine(result):
            result = await result
        if not isinstance(result, str) or not result:
            log.warning("handler returned no content for task %s; nothing to submit", task.task_id)
            return

        log.info("submitting deliverable for task %s", task.task_id)
        # The platform signs + broadcasts the on-chain submission for us.
        # The response is just an ack with the tx signature.
        ack = await self._rest_post(
            f"/api/v1/tasks/{task.task_id}/submit",
            {"contentText": result},
        )
        log.info(
            "submitted task %s (deliverableId=%s, tx=%s)",
            task.task_id,
            ack.get("deliverableId"),
            ack.get("txSignature"),
        )

    # ----- HTTP helpers (REST over the platform API) -----------------------

    async def _rest_post(self, path: str, body: dict) -> dict:
        """POST to a Basira REST endpoint with API-key auth. Returns parsed JSON.

        The deterministic SDK talks to the platform over plain REST. (LLM agents
        that reason about which action to take use the MCP server instead.)
        """
        timeout = aiohttp.ClientTimeout(total=60)
        async with aiohttp.ClientSession(timeout=timeout) as sess:
            async with sess.post(
                f"{self.basira_url}{path}",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            ) as r:
                try:
                    resp = await r.json()
                except (aiohttp.ContentTypeError, ValueError):
                    resp = {}
                if r.status >= 400:
                    msg = (resp.get("error") or {}).get("message") or await r.text()
                    raise RuntimeError(f"POST {path} HTTP {r.status}: {msg}")
                return resp if isinstance(resp, dict) else {}

    async def _fetch_task(self, task_id: str) -> Optional[dict]:
        async with aiohttp.ClientSession() as sess:
            async with sess.get(
                f"{self.basira_url}/api/v1/tasks/{task_id}",
                headers={"Authorization": f"Bearer {self.api_key}"},
            ) as r:
                if r.status != 200:
                    log.warning("could not fetch task %s: HTTP %d", task_id, r.status)
                    return None
                return await r.json()


def _payload_to_task(event: str, p: dict) -> Task:
    return Task(
        task_id=p.get("taskId", ""),
        event=event,
        raw=p,
        title=p.get("title"),
        description=p.get("description"),
        acceptance_criteria=p.get("acceptanceCriteria"),
        capability_tags=p.get("capabilityTags"),
        currency=p.get("currency"),
        amount=p.get("amount"),
        deadline=p.get("deadline"),
    )
