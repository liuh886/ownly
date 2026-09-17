"""Headless smoke for the packaged Ownly Capture extension (dist/extension).

Loads the unpacked extension in real Chromium, opens the side panel page as a
tab (extension APIs available there), asserts no page errors, and captures a
1280x800 draft store screenshot.

Requires an UNMANAGED browser: enterprise-managed Chrome blocks
--load-extension (chrome://extensions shows "managed by your organization").
On such machines use a personal Edge/Chrome profile instead, or run the manual
checklist in docs/STORE_LISTING.md.
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
# Forward slashes: Chrome extension flags misbehave with Windows backslashes.
EXT_DIR = (ROOT / "dist" / "extension").as_posix()
SHOT_DIR = ROOT / "dist" / "store-shots"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

manifest = json.loads((ROOT / "dist" / "extension" / "manifest.json").read_text())
assert manifest["manifest_version"] == 3, "not MV3"
assert "update_url" not in manifest, "store package must not carry update_url"

errors: list[str] = []
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir=str(ROOT / "dist" / ".smoke-profile"),
        executable_path=CHROME,
        # Needs a display (dev machine / manual session). Playwright disables
        # extensions by default, so those defaults must be ignored explicitly.
        headless=False,
        ignore_default_args=[
            "--disable-extensions",
            "--disable-component-extensions-with-background-pages",
        ],
        viewport={"width": 1280, "height": 800},
        args=[
            "--no-first-run",
            f"--disable-extensions-except={EXT_DIR}",
            f"--load-extension={EXT_DIR}",
        ],
    )
    # Find the extension id via the service worker target.
    ext_id = None
    for _ in range(50):
        for w in ctx.background_pages + ctx.service_workers:
            url = w.url
            if url.startswith("chrome-extension://"):
                ext_id = url.split("/")[2]
                break
        if ext_id:
            break
        time.sleep(0.2)
    if not ext_id:
        print("SMOKE FAIL: extension service worker did not start", file=sys.stderr)
        ctx.close()
        sys.exit(1)
    print(f"extension id: {ext_id}")

    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(f"chrome-extension://{ext_id}/sidepanel.html", wait_until="networkidle")
    page.wait_for_timeout(1500)
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    shot = SHOT_DIR / "01-sidepanel.png"
    page.screenshot(path=str(shot))
    print(f"screenshot: {shot} ({shot.stat().st_size} bytes)")
    ctx.close()

if errors:
    print("SMOKE FAIL: page errors:", file=sys.stderr)
    for e in errors[:10]:
        print(f"  - {e}", file=sys.stderr)
    sys.exit(1)
print("SMOKE PASS: sidepanel rendered with zero page errors")
