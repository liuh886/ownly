"""Exercise the shared travel lifecycle against native isolated OPFS handles.

Run after npm run build: python tests/smoke/trip_unification_smoke.py
"""
import json
import re

from playwright.sync_api import expect, sync_playwright
from demo_mode_smoke import BASE, REPO, managed_server
from workflow_smoke import files, switch_tab


def run():
    artifacts = REPO / 'node_modules' / '.cache' / 'trip-unification'
    artifacts.mkdir(parents=True, exist_ok=True)
    with managed_server(), sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(locale='en-US', viewport={'width': 1280, 'height': 900})
        page.set_default_timeout(15000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Ownly', {create: true});")
        try:
            page.goto(BASE + '/app/', wait_until='networkidle')
            # A pre-existing Objects record represents data entered before Planner existed.
            page.evaluate("""async () => {
              const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('Ownly', {create: true});
              const dir = await root.getDirectoryHandle('Objects', {create: true});
              const file = await dir.getFileHandle('travel-intention.md', {create: true});
              const writer = await file.createWritable();
              await writer.write(`---
schema_version: '0.1'
type: object
object_type: one_time_experience
id: original-travel-intention
title: Kyoto Unified Trip
status: completed
experience_subtype: travel_worldview
started_at: '2026-10-01'
ended_at: '2026-10-05'
location:
  city: Kyoto
  country_code: JP
budget_total: 5000
actual_total: 4200
currency: USD
created_at: '2026-09-01'
updated_at: '2026-09-01'
tags: [ownly, travel]
---

My original travel intention.
`);
              await writer.close();
            }""")
            page.get_by_role('button', name='Choose save location', exact=True).click()
            switch_tab(page, 'Objects')
            expect(page.get_by_role('heading', name='Kyoto Unified Trip', exact=True)).to_be_visible()
            page.get_by_role('button', name='Plan trip', exact=True).click()
            dialog = page.get_by_role('dialog')
            expect(dialog.get_by_label('Trip Title *', exact=True)).to_have_value('Kyoto Unified Trip')
            dialog.screenshot(path=str(artifacts / 'create-linked-trip.png'))
            dialog.get_by_role('button', name=re.compile('Create Trip', re.I)).click()
            expect(page.get_by_role('dialog')).to_have_count(0)
            assert len(files(page, 'Objects')) == 1
            trip = files(page, 'Trips')
            assert len(trip) == 1 and 'experience_id: original-travel-intention' in trip[0]['content'], trip
            page.get_by_role('button', name=re.compile(r'📝\s*Review$')).click()
            page.locator('#trip-review-summary').fill('Autumn temples')
            page.locator('#trip-review-body').fill('Shared trip review body')
            page.locator('#trip-food-score').fill('93')
            page.get_by_role('dialog').screenshot(path=str(artifacts / 'shared-review-editor.png'))
            page.get_by_role('button', name='Confirm & save', exact=True).click()
            expect(page.get_by_role('dialog')).to_have_count(0)
            page.get_by_role('button', name=re.compile(r'View in Reviews$')).click()
            expect(page.get_by_text('Autumn temples', exact=True).first).to_be_visible()
            review = files(page, 'Reviews')
            assert len(review) == 1 and 'target_id: original-travel-intention' in review[0]['content'], review
            assert 'Shared trip review body' in review[0]['content'] and 'food_score: 93' in review[0]['content']
            aside = page.locator('aside')
            aside.get_by_role('button', name='Edit', exact=True).click()
            aside.get_by_label('Summary', exact=True).fill('Edited in Reviews')
            aside.get_by_label('Food', exact=True).fill('97')
            aside.get_by_role('button', name='Save changes', exact=True).click()
            expect(aside.get_by_role('button', name='Edit', exact=True)).to_be_visible()
            page.get_by_role('button', name='Open trip planner', exact=True).click()
            expect(page.get_by_role('button', name=re.compile(r'★\s*97$'))).to_be_visible()
            page.get_by_role('button', name=re.compile(r'★\s*97$')).click()
            expect(page.locator('aside').get_by_text('Edited in Reviews', exact=True)).to_be_visible()
            switch_tab(page, 'Objects')
            page.get_by_role('button', name='Plan trip', exact=True).click()
            expect(page.get_by_role('dialog')).to_have_count(0)
            assert len(files(page, 'Trips')) == len(files(page, 'Objects')) == len(files(page, 'Reviews')) == 1
            object_text = files(page, 'Objects')[0]['content']
            assert 'budget_total: 5000' in object_text and 'My original travel intention.' in object_text
            page.reload(wait_until='networkidle')
            switch_tab(page, 'Objects')
            page.get_by_role('button', name='Plan trip', exact=True).click()
            expect(page.get_by_role('button', name=re.compile(r'★\s*97$'))).to_be_visible()
            assert not errors, errors
            page.screenshot(path=str(artifacts / 'desktop.png'), full_page=True)
            page.set_viewport_size({'width': 390, 'height': 844})
            page.screenshot(path=str(artifacts / 'mobile.png'), full_page=True)
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile page overflows'
            (artifacts / 'result.json').write_text(json.dumps({'objects': files(page, 'Objects'), 'trips': files(page, 'Trips'), 'reviews': files(page, 'Reviews'), 'page_errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
            print('PASS: one travel object, one itinerary and one shared review; identity, ratings, notes, reload and mobile layout verified.')
        except Exception:
            page.screenshot(path=str(artifacts / 'failure.png'), full_page=True)
            print(page.locator('body').inner_text())
            raise
        finally:
            browser.close()


if __name__ == '__main__':
    run()
