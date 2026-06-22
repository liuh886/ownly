import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        # Define routes and their screenshot names
        routes = {
            "Home": "",
            "Objects": "?tab=objects",
            "Accounts": "?tab=accounts",
            "Reviews": "?tab=reviews"
        }

        modes = ["light", "dark"]

        import os
        os.makedirs("docs/assets", exist_ok=True)

        for mode in modes:
            # Emulate color scheme
            await page.emulate_media(color_scheme=mode)

            for name, qs in routes.items():
                url = f"http://localhost:3000/{qs}"
                print(f"Capturing {name} in {mode} mode...")
                await page.goto(url)
                # Wait for animations to settle
                await page.wait_for_timeout(1000)
                
                filename = f"docs/assets/{name.lower()}-{mode}.png"
                await page.screenshot(path=filename, full_page=True)

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
