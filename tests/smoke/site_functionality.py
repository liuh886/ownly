import argparse
import os
import re
import subprocess
import sys
import time
import urllib.request
from contextlib import contextmanager

from playwright.sync_api import Error, Page, expect, sync_playwright


def wait_for_server(url: str, timeout_s: int) -> None:
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


@contextmanager
def managed_server(command: str | None, port: int, timeout_s: int):
    if not command:
        yield
        return

    env = os.environ.copy()
    env.setdefault("PORT", str(port))
    process = subprocess.Popen(
        command.format(port=port),
        cwd=os.getcwd(),
        env=env,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        wait_for_server(f"http://127.0.0.1:{port}", timeout_s)
        yield
    finally:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


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
    ignored_console_fragments = [
        "Failed to load resource: the server responded with a status of 404",
    ]
    relevant_console_errors = [
        message
        for message in console_errors
        if not any(fragment in message for fragment in ignored_console_fragments)
    ]

    if page_errors or relevant_console_errors:
        details = "\n".join(page_errors + relevant_console_errors)
        raise AssertionError(f"Browser runtime errors detected:\n{details}")


def assert_english_desktop(page: Page, base_url: str) -> None:
    page.goto(base_url, wait_until="commit", timeout=60_000)
    page.get_by_text("Ownly").first.wait_for(state="visible")

    expect(page.get_by_text("Demo mode").first).to_be_visible()
    expect(page.get_by_role("button", name="Connect Vault").first).to_be_visible()
    expect(page.get_by_role("button", name="Home")).to_be_visible()
    expect(page.get_by_role("button", name="Objects")).to_be_visible()
    expect(page.get_by_role("button", name="Accounts")).to_be_visible()
    expect(page.get_by_role("button", name="Reviews")).to_be_visible()
    expect(page.get_by_role("button", name="Run Doctor")).to_be_visible()

    page.get_by_role("button", name="Objects").click()
    expect(page.get_by_role("heading", name="Objects")).to_be_visible()
    try:
        expect(page.get_by_text("No objects yet").first).to_be_visible(timeout=3000)
    except AssertionError:
        expect(page.get_by_role("heading", name="Object console")).to_be_visible()
        expect(page.get_by_placeholder("Search name, category, status, or type")).to_be_visible()
        first_detail = page.get_by_role("button", name=re.compile(r"^View details -")).first
        expect(first_detail).to_be_visible()
        first_detail.click()
        expect(page.get_by_role("button", name="Close")).to_be_visible()
    expect(page.get_by_text("Quick entry").first).to_be_visible()
    expect(page.get_by_text("Connect Vault to write to Obsidian").first).to_be_visible()

    page.get_by_role("button", name="Accounts").click()
    expect(page.get_by_role("heading", name="Accounts")).to_be_visible()
    expect(page.get_by_text("Account console").first).to_be_visible()
    expect(page.get_by_text("Record snapshot").first).to_be_visible()

    page.get_by_role("button", name="Reviews").click()
    expect(page.get_by_role("heading", name="Reviews")).to_be_visible()
    expect(page.get_by_text("Review console").first).to_be_visible()
    expect(page.get_by_text("Review history").first).to_be_visible()
    expect(page.get_by_text("Travel insights").first).to_be_visible()

    page.get_by_role("button", name="中文").click()
    expect(page.get_by_role("button", name="首页", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="物欲", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="账户", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="复盘", exact=True)).to_be_visible()


def assert_mobile_navigation(page: Page, base_url: str) -> None:
    page.goto(base_url, wait_until="commit", timeout=60_000)
    page.get_by_text("Ownly").first.wait_for(state="visible")
    expect(page.get_by_role("button", name="Objects")).to_be_visible()

    page.get_by_role("button", name="Objects").click()
    expect(page.get_by_role("heading", name="Objects")).to_be_visible()

    page.get_by_role("button", name="Accounts").click()
    expect(page.get_by_role("heading", name="Accounts")).to_be_visible()

    page.get_by_role("button", name="Reviews").click()
    expect(page.get_by_role("heading", name="Reviews")).to_be_visible()


def run_site_functionality(base_url: str) -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)

        desktop = browser.new_context(locale="en-US", viewport={"width": 1280, "height": 900})
        desktop_page = desktop.new_page()
        desktop_page.set_default_timeout(15_000)
        desktop_page_errors, desktop_console_errors = attach_error_collectors(desktop_page)
        assert_english_desktop(desktop_page, base_url)
        assert_no_runtime_errors(desktop_page_errors, desktop_console_errors)
        desktop.close()

        mobile = browser.new_context(locale="en-US", viewport={"width": 390, "height": 844})
        mobile_page = mobile.new_page()
        mobile_page.set_default_timeout(15_000)
        mobile_page_errors, mobile_console_errors = attach_error_collectors(mobile_page)
        assert_mobile_navigation(mobile_page, base_url)
        assert_no_runtime_errors(mobile_page_errors, mobile_console_errors)
        mobile.close()

        browser.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Ownly whole-site functionality smoke tests.")
    parser.add_argument("--port", type=int, default=int(os.environ.get("OWNLY_SITE_SMOKE_PORT", "3101")))
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument(
        "--server-command",
        default="node node_modules/next/dist/bin/next dev -p {port} -H 127.0.0.1",
        help="Command used to start the app. Use an empty string when --base-url is already running.",
    )
    parser.add_argument("--base-url", default=None)
    args = parser.parse_args()

    base_url = args.base_url or f"http://127.0.0.1:{args.port}"
    command = args.server_command.strip() or None

    try:
        with managed_server(command, args.port, args.timeout):
            if command is None:
                wait_for_server(base_url, args.timeout)
            run_site_functionality(base_url)
    except Error as error:
        print(f"Playwright error: {error}", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"Site functionality smoke test failed: {error}", file=sys.stderr)
        return 1

    print("Site functionality smoke test passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
