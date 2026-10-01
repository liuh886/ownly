"""
Demo mode fills every tab — the check that motivated this work.

Drives the real built app in Chromium: enters Demo mode (no data folder), then
asserts Home / Objects / Accounts / Reviews / Planner all render content and the
session stays read-only.

`next build` runs with `output: export`, so there is no server to start; this
serves the static export directly. The app shell is fully client-rendered.

Run: python tests/smoke/demo_mode_smoke.py
"""

import re
import subprocess
import sys
import time
import urllib.request
from contextlib import contextmanager
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

REPO = Path(__file__).resolve().parents[2]
PORT = 47123
BASE = f"http://127.0.0.1:{PORT}"
SERVER = Path(__file__).with_name("static-server.mjs")

DEMO_BUTTON = re.compile("Continue in demo mode|暂时使用演示模式")

# The shell follows the browser locale, so each needle accepts either language.
# Counts are asserted literally: they prove the seeded set loaded in full rather
# than merely that some panel rendered.
TABS = {
    "Home": [r"净值|Net worth", r"12 objects|12 个对象", r"Data scale|数据规模"],
    "Objects": [r"索尼|Sony", r"MacBook", r"云盘|Cloud"],
    "Accounts": [r"净值|Net worth", r"招行|CMB", r"负债|Liabilit"],
    "Reviews": [r"复盘|Review", r"关西|Kansai"],
    "Planner": [r"行程|Trip", r"曼谷|Bangkok"],
}


@contextmanager
def managed_server():
    """Serve the static export with Node.

    Python's `http.server` stalls under Chromium's parallel chunk loading, which
    surfaces as phantom `status: 0` fetch failures. Run `npm run build` first.
    """
    if not (REPO / "out" / "app" / "index.html").exists():
        raise SystemExit("out/ is missing — run `npm run build` first.")

    process = subprocess.Popen(
        ["node", str(SERVER), "out", str(PORT)],
        cwd=REPO,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    deadline = time.time() + 60
    while time.time() < deadline:
        if process.poll() is not None:
            raise SystemExit(f"static server exited: {process.communicate()[0]}")
        try:
            with urllib.request.urlopen(BASE, timeout=2) as response:
                if response.status < 500:
                    break
        except Exception:
            time.sleep(0.3)
    else:
        process.terminate()
        raise SystemExit(f"static server never became ready at {BASE}")
    try:
        yield
    finally:
        process.terminate()


def open_app(page: Page) -> list[str]:
    """Load the app and collect console errors.

    Deliberately no `page.route` interception: routing every request through
    Playwright breaks the app's own `fetch` for static assets, which looks
    exactly like an application hang. The analytics beacon is simply ignored
    instead — it never settles, so `networkidle` is avoided rather than blocked.
    """
    errors: list[str] = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(f"{BASE}/app/", wait_until="domcontentloaded")
    return errors


def enter_demo(page: Page) -> None:
    button = page.get_by_role("button", name=DEMO_BUTTON).first
    expect(button).to_be_visible(timeout=45_000)
    button.click(timeout=45_000)
    # The dialog stays up (disabled) until seeding resolves, so its disappearance
    # is the completion signal.
    expect(page.get_by_role("dialog").first).to_be_hidden(timeout=60_000)
    page.wait_for_timeout(1500)


def main() -> int:
    failures: list[str] = []

    with managed_server():
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            errors = open_app(page)
            enter_demo(page)

            for tab, needles in TABS.items():
                tab_button = page.get_by_role("button", name=tab, exact=True).first
                if tab_button.count() == 0:
                    failures.append(f"tab not found: {tab}")
                    continue
                tab_button.click(timeout=20_000)
                page.wait_for_timeout(1200)
                body = page.inner_text("body")
                missing = [n for n in needles if not re.search(n, body)]
                if missing:
                    failures.append(f"{tab}: missing {missing}")
                    page.screenshot(path=f"tmp-demo-{tab}.png")
                else:
                    print(f"  ok  {tab}")

            # Demo mode must stay read-only: no write control is enabled.
            page.get_by_role("button", name="Objects", exact=True).first.click(timeout=20_000)
            page.wait_for_timeout(800)
            save_button = page.get_by_role(
                "button", name=re.compile("保存到 Ownly|Save to Ownly")
            ).first
            if save_button.count() and save_button.is_enabled():
                failures.append("Objects save button is enabled in Demo mode (should be read-only)")

            browser.close()

    real_errors = [e for e in errors if "favicon" not in e.lower()]
    if real_errors:
        failures.append(f"console errors: {real_errors[:3]}")

    if failures:
        print("\nDEMO MODE SMOKE FAILED:")
        for failure in failures:
            print(f" - {failure}")
        return 1

    print("\nDemo mode smoke passed: all five tabs render, session is read-only.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

