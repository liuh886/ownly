import argparse
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Page, Route, sync_playwright


def wait_for_server(url: str, timeout_s: int = 60) -> None:
    deadline = time.time() + timeout_s
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status < 500:
                    return
        except Exception as error:
            last_error = error
        time.sleep(0.5)
    raise RuntimeError(f"Server did not become ready at {url}: {last_error}")


def keep_local_requests(route: Route, allowed_host: str) -> None:
    request_host = urlparse(route.request.url).netloc
    if request_host and request_host != allowed_host:
        route.abort()
    else:
        route.continue_()


def attach_error_collectors(page: Page) -> tuple[list[str], list[str]]:
    page_errors: list[str] = []
    console_errors: list[str] = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on(
        "console",
        lambda message: console_errors.append(message.text)
        if message.type == "error"
        else None,
    )
    return page_errors, console_errors


def assert_no_runtime_errors(page_errors: list[str], console_errors: list[str]) -> None:
    ignored = (
        "ERR_FAILED",
        "Failed to load resource",
    )
    relevant = [message for message in console_errors if not any(fragment in message for fragment in ignored)]
    if page_errors or relevant:
        raise AssertionError("Browser runtime errors detected:\n" + "\n".join(page_errors + relevant))


def assert_no_horizontal_overflow(page: Page, label: str) -> None:
    dimensions = page.evaluate(
        """() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        })"""
    )
    widest = max(dimensions["document"], dimensions["body"])
    if widest > dimensions["viewport"] + 1:
        raise AssertionError(f"{label} overflows horizontally: {dimensions}")


def capture(page: Page, selector: str, path: Path, label: str) -> None:
    target = page.locator(selector)
    target.wait_for(state="visible")
    target.scroll_into_view_if_needed()
    page.wait_for_timeout(350)
    assert_no_horizontal_overflow(page, label)
    page.screenshot(path=str(path), full_page=False)
    if path.stat().st_size < 18_000:
        raise AssertionError(f"{label} screenshot appears blank or incomplete: {path.stat().st_size} bytes")


def run(base_url: str, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    allowed_host = urlparse(base_url).netloc
    wait_for_server(base_url)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)

        desktop = browser.new_context(locale="en-US", viewport={"width": 1440, "height": 1000})
        desktop_page = desktop.new_page()
        desktop_page.route("**/*", lambda route: keep_local_requests(route, allowed_host))
        desktop_page_errors, desktop_console_errors = attach_error_collectors(desktop_page)
        desktop_page.goto(base_url, wait_until="networkidle", timeout=60_000)
        desktop_page.get_by_role("heading", name="Know what you own. Decide what deserves to stay.").wait_for()
        for scene in ("overview", "cost", "review"):
            if desktop_page.locator(f'[data-ownly-scene="{scene}"]').count() != 1:
                raise AssertionError(f"Expected exactly one {scene} scene")
        capture(desktop_page, '[data-ownly-scene="overview"]', output_dir / "homepage-desktop.png", "desktop overview")
        capture(desktop_page, '[data-ownly-scene="cost"]', output_dir / "cost-desktop.png", "desktop cost")
        capture(desktop_page, '[data-ownly-scene="review"]', output_dir / "review-desktop.png", "desktop review")
        assert_no_runtime_errors(desktop_page_errors, desktop_console_errors)
        desktop.close()

        mobile = browser.new_context(locale="zh-CN", viewport={"width": 390, "height": 844})
        mobile_page = mobile.new_page()
        mobile_page.route("**/*", lambda route: keep_local_requests(route, allowed_host))
        mobile_page_errors, mobile_console_errors = attach_error_collectors(mobile_page)
        mobile_page.goto(base_url, wait_until="networkidle", timeout=60_000)
        mobile_page.get_by_role("heading", name="记住你拥有什么，决定什么值得留下。").wait_for()
        capture(mobile_page, '[data-ownly-scene="overview"]', output_dir / "homepage-mobile-zh.png", "mobile Chinese overview")
        capture(mobile_page, '[data-ownly-scene="review"]', output_dir / "review-mobile-zh.png", "mobile Chinese review")
        assert_no_runtime_errors(mobile_page_errors, mobile_console_errors)
        mobile.close()

        browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Capture and validate the focused Ownly homepage.")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/homepage"))
    args = parser.parse_args()
    run(args.base_url, args.output_dir)
    print(f"Ownly homepage visual QA passed. Screenshots: {args.output_dir}")
