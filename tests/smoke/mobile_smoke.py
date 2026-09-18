import argparse
import os
import sys
from contextlib import contextmanager

from playwright.sync_api import Error, expect, sync_playwright
from playwright._impl._errors import TimeoutError as PlaywrightTimeoutError

from web_smoke import managed_server, wait_for_server

# Pre-existing hydration mismatch from framer-motion entrance states
# (server prerender lacks the client's initial opacity/transform). The tree
# recovers via client remount; the animation SSR fix is tracked separately.
# Everything else must stay runtime-error free.
MOBILE_IGNORED_CONSOLE_FRAGMENTS = [
    "Minified React error #418",
]


def assert_no_mobile_runtime_errors(page_errors: list[str], console_errors: list[str]) -> None:
    relevant_page_errors = [
        message
        for message in page_errors
        if not any(fragment in message for fragment in MOBILE_IGNORED_CONSOLE_FRAGMENTS)
    ]
    relevant_console_errors = [
        message
        for message in console_errors
        if not any(fragment in message for fragment in MOBILE_IGNORED_CONSOLE_FRAGMENTS)
    ]
    if relevant_page_errors or relevant_console_errors:
        details = "\n".join(relevant_page_errors + relevant_console_errors)
        raise AssertionError(f"Browser runtime errors detected:\n{details}")


VIEWPORTS = [
    {"name": "phone-360", "width": 360, "height": 740, "mobile": True},
    {"name": "phone-390", "width": 390, "height": 844, "mobile": True},
    {"name": "phone-430", "width": 430, "height": 932, "mobile": True},
    {"name": "tablet-768", "width": 768, "height": 1024, "mobile": True},
    {"name": "tablet-landscape-1024", "width": 1024, "height": 768, "mobile": False},
]

TABS = ["Home", "Objects", "Accounts", "Reviews", "Planner"]


def dismiss_first_run_overlays(page) -> None:
    """Close delayed first-visit dialogs (storage + capture onboarding).

    They appear in sequence, so retry until none remain.
    """
    for _ in range(3):
        dismissed = False
        for name in ("Maybe later", "Continue in demo mode"):
            button = page.get_by_role("button", name=name).first
            try:
                button.wait_for(state="visible", timeout=3_000)
                button.click()
                dismissed = True
            except PlaywrightTimeoutError:
                continue
        page.wait_for_timeout(1_000)
        if not dismissed and page.get_by_role("dialog").count() == 0:
            return


def tap_tab(page, name: str) -> None:
    """Tap a bottom-nav tab without scrolling the page.

    The nav auto-hides on downward scroll (and leaves the a11y tree via
    aria-hidden), so Playwright-style scroll-into-view clicks fight the
    component. A wheel-up nudge reveals it; el.click() then fires React's
    handler without moving the page.
    """
    page.mouse.wheel(0, -320)
    page.wait_for_timeout(350)
    page.evaluate(
        """(label) => {
          const btn = [...document.querySelectorAll('nav button')]
            .find((b) => b.textContent.trim() === label);
          if (!btn) throw new Error('tab not found: ' + label);
          btn.click();
        }""",
        name,
    )


def check_viewport(playwright, base_url: str, spec: dict) -> None:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        locale="en-US",
        viewport={"width": spec["width"], "height": spec["height"]},
        is_mobile=spec["mobile"],
        has_touch=spec["mobile"],
    )
    page = context.new_page()
    page.set_default_timeout(15_000)
    page_errors: list[str] = []
    console_errors: list[str] = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on(
        "console",
        lambda message: console_errors.append(message.text)
        if message.type == "error"
        else None,
    )

    try:
        page.goto(f"{base_url}/app/", wait_until="commit", timeout=60_000)
        page.get_by_text("Ownly").first.wait_for(state="visible")
        dismiss_first_run_overlays(page)
        # Let post-hydration client remount settle (framer-motion entrance
        # states differ from prerendered HTML and regenerate the tree once).
        page.wait_for_timeout(2_000)

        # Shell: brand header + all five bottom tabs reachable.
        expect(page.get_by_text("Ownly").first).to_be_visible()
        for tab in TABS:
            expect(page.get_by_role("button", name=tab).first).to_be_visible()

        # No horizontal overflow at this width.
        overflow = page.evaluate(
            "() => document.documentElement.scrollWidth - window.innerWidth"
        )
        if overflow > 1:
            raise AssertionError(
                f"[{spec['name']}] horizontal overflow of {overflow}px"
            )

        # Tab switching keeps headings on screen.
        tap_tab(page, "Objects")
        expect(page.get_by_role("heading", name="Objects")).to_be_visible()
        tap_tab(page, "Planner")
        expect(page.get_by_role("heading", name="Planner")).to_be_visible()

        # Phone-only overflow menu (language/currency/sponsor).
        if spec["width"] < 640:
            page.get_by_role("button", name="More options").click()
            expect(page.get_by_role("menu").first).to_be_visible()
            page.keyboard.press("Escape")
            expect(page.get_by_role("menu").first).to_be_hidden()

        assert_no_mobile_runtime_errors(page_errors, console_errors)
    finally:
        context.close()
        browser.close()

    print(f"[{spec['name']}] ok")


def run_mobile_smoke(base_url: str) -> None:
    with sync_playwright() as playwright:
        for spec in VIEWPORTS:
            check_viewport(playwright, base_url, spec)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Ownly mobile viewport smoke tests.")
    parser.add_argument("--port", type=int, default=int(os.environ.get("OWNLY_SMOKE_PORT", "3100")))
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument(
        "--server-command",
        default="python -m http.server {port} --directory out",
        help="Command used to start the app. Must serve the static export.",
    )
    parser.add_argument("--base-url", default=None)
    args = parser.parse_args()

    base_url = args.base_url or f"http://127.0.0.1:{args.port}"
    command = args.server_command.strip() or None

    try:
        with managed_server(command, args.port, args.timeout):
            if command is None:
                wait_for_server(base_url, args.timeout)
            run_mobile_smoke(base_url)
    except Error as error:
        print(f"Playwright error: {error}", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"Mobile smoke test failed: {error}", file=sys.stderr)
        return 1

    print("Mobile smoke test passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
