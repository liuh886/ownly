"""Walk through connected Ownly workflows using real browser-local filesystem handles.

Only the directory picker is replaced. Chromium's isolated OPFS supplies native
handles, IndexedDB persistence and Markdown reads/writes without touching a
personal folder. Run after npm run build: python tests/smoke/workflow_smoke.py.
"""
import json
import re

from playwright.sync_api import expect, sync_playwright
from demo_mode_smoke import BASE, REPO, managed_server


def files(page, directory):
    return page.evaluate("""async directory => {
      let handle = await (await navigator.storage.getDirectory()).getDirectoryHandle('Ownly');
      for (const part of directory.split('/').filter(Boolean)) handle = await handle.getDirectoryHandle(part);
      const result = [];
      for await (const [name, child] of handle.entries()) {
        if (child.kind === 'file' && name.endsWith('.md')) result.push({name, content: await (await child.getFile()).text()});
      }
      return result;
    }""", directory)


def object_card(page, title):
    return page.get_by_role('heading', name=title, exact=True).locator('xpath=ancestor::*[@role="button"][1]')


def switch_tab(page, name):
    # The app deliberately hides navigation while scrolling down; reveal it.
    page.evaluate('window.scrollTo(0, 0)')
    page.get_by_role('button', name=name, exact=True).click()


def run():
    artifacts = REPO / 'node_modules' / '.cache' / 'ownly-ux-audit-20261004'
    artifacts.mkdir(parents=True, exist_ok=True)
    with managed_server(), sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(locale='en-US', viewport={'width': 1280, 'height': 900})
        page.set_default_timeout(10000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Ownly', {create: true});")
        try:
            page.goto(BASE + '/app/', wait_until='domcontentloaded')
            page.get_by_role('button', name='Choose save location', exact=True).click()
            guide = page.get_by_role('dialog')
            guide.get_by_role('button', name='Set up my first record', exact=True).click()
            expect(guide.get_by_role('heading', name='Record your first real object', exact=True)).to_be_visible()
            guide.get_by_role('button').filter(has_text='Physical item').click()
            form = page.locator('form').filter(has=page.get_by_label('Name', exact=True))
            form.get_by_label('Name', exact=True).fill('Audit Camera')
            form.get_by_role('spinbutton').first.fill('0')
            form.locator('input[type=date]').first.fill('2026-09-01')
            form.get_by_role('button', name='Save to Ownly', exact=True).click()
            expect(page.get_by_role('heading', name='Audit Camera', exact=True)).to_be_visible()
            before = files(page, 'Objects')
            assert len(before) == 1 and re.search(r'^total_acquisition_cost: 0$', before[0]['content'], re.M), before
            original_id = re.search(r'^id: (.+)$', before[0]['content'], re.M).group(1)
            assert 'currency: USD' in before[0]['content'], before

            # A type conversion must keep the identity that logs/reviews point at.
            object_card(page, 'Audit Camera').click()
            page.get_by_role('button', name='Edit', exact=True).click()
            edit = page.locator('form').filter(has=page.get_by_label('Name', exact=True)).last
            edit.locator('select').first.select_option('recurring_cost')
            edit.get_by_role('button', name='Save changes', exact=True).click()
            expect(page.get_by_role('button', name='Edit', exact=True)).to_be_visible()
            converted = files(page, 'Objects')[0]['content']
            assert re.search(r'^id: (.+)$', converted, re.M).group(1) == original_id
            assert 'object_type: recurring_cost' in converted and 'purchase_price:' not in converted
            page.get_by_role('button', name='Close', exact=True).click()

            # Editing just the asset side of a prefilled snapshot must retain debt.
            switch_tab(page, 'Accounts')
            page.get_by_label(re.compile('^Asset accounts')).fill('Bank 1000')
            page.get_by_label(re.compile('^Liability accounts')).fill('Card 200')
            page.get_by_role('button', name='Save snapshot', exact=True).click()
            expect(page.get_by_label(re.compile('^Asset accounts'))).to_have_value('Bank 1000')
            page.get_by_label(re.compile('^Asset accounts')).fill('Bank 1100')
            expect(page.get_by_label(re.compile('^Liability accounts'))).to_have_value('Card 200')
            page.get_by_role('button', name='Save snapshot', exact=True).click()
            expect(page.get_by_label(re.compile('^Asset accounts'))).to_have_value('Bank 1100')
            page.wait_for_function("""async () => {
              const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('Ownly')).getDirectoryHandle('Snapshots');
              let count = 0;
              for await (const [name, child] of dir.entries()) {
                if (child.kind === 'file' && name.endsWith('.md') && (await child.getFile()).size > 0) count++;
              }
              return count === 2;
            }""")
            snapshots = files(page, 'Snapshots')
            assert len(snapshots) == 2, snapshots
            assert all(re.search(r'^total_liabilities: 200$', entry['content'], re.M) for entry in snapshots), snapshots
            assert any(re.search(r'^net_worth: 900$', entry['content'], re.M) for entry in snapshots), snapshots
            expect(page.get_by_label(re.compile('^Asset accounts'))).to_have_value('Bank 1100')
            console = page.get_by_role('heading', name='Account console', exact=True).locator('xpath=../../..')
            expect(console.get_by_text('$900', exact=True)).to_be_visible()

            # Same-name bank balances in different units keep separate identities.
            page.get_by_role('button', name='Edit', exact=True).first.click()
            page.get_by_label(re.compile('^Asset accounts')).fill('Bank 1100 USD\nBank 50 CNY')
            page.get_by_role('button', name='Save changes', exact=True).click()
            expect(page.get_by_role('button', name='Save snapshot', exact=True)).to_be_visible()
            mixed = next(entry for entry in files(page, 'Snapshots') if 'net_worth: 900' in entry['content'])
            balance_ids = re.findall(r'account_id: (.+)', mixed['content'])
            assert len(balance_ids) == len(set(balance_ids)) == 3, mixed
            page.get_by_role('button', name='Edit', exact=True).first.click()
            expect(page.get_by_label(re.compile('^Asset accounts'))).to_have_value('Bank 1100 USD\nBank 50 CNY')
            page.get_by_label(re.compile('^Asset accounts')).fill('Bank 60 CNY\nBank 1200 USD')
            page.get_by_role('button', name='Save changes', exact=True).click()
            expect(page.get_by_role('button', name='Save snapshot', exact=True)).to_be_visible()
            expect(console.get_by_text('$1,000', exact=True)).to_be_visible()
            snapshots = files(page, 'Snapshots')
            mixed_after = next(entry for entry in snapshots if entry['name'] == mixed['name'])
            assert set(re.findall(r'account_id: (.+)', mixed_after['content'])) == set(balance_ids), mixed_after
            assert 'net_worth: 1000' in mixed_after['content'] and 'currency: CNY' in mixed_after['content'], mixed_after

            # Deletion is an archive move; restore puts back the same identity.
            switch_tab(page, 'Objects')
            object_card(page, 'Audit Camera').click()
            page.get_by_role('button', name='Delete', exact=True).click()
            page.get_by_role('alertdialog').get_by_role('button', name='Confirm', exact=True).click()
            expect(page.get_by_role('button', name='Restore', exact=True)).to_be_visible()
            assert files(page, 'Objects') == []
            assert len(files(page, 'Archive/Objects')) == 1
            page.get_by_role('button', name='Restore', exact=True).click()
            expect(page.get_by_role('heading', name='Audit Camera', exact=True)).to_be_visible()
            assert re.search(r'^id: (.+)$', files(page, 'Objects')[0]['content'], re.M).group(1) == original_id
            page.reload(wait_until='domcontentloaded')
            switch_tab(page, 'Objects')
            expect(page.get_by_role('heading', name='Audit Camera', exact=True)).to_be_visible()
            assert len(files(page, 'Objects')) == 1 and not errors, errors
            form = page.locator('form').filter(has=page.get_by_label('Name', exact=True))
            form.get_by_label('Name', exact=True).fill('Audit Decimal')
            amount = form.get_by_role('spinbutton').first
            amount.fill('9.99')
            assert amount.evaluate('(input) => !input.validity.stepMismatch')
            form.get_by_role('button', name='Save to Ownly', exact=True).click()
            expect(page.get_by_role('heading', name='Audit Decimal', exact=True)).to_be_visible()
            decimal = next(entry for entry in files(page, 'Objects') if 'title: Audit Decimal' in entry['content'])
            assert 'currency: USD' in decimal['content'] and 'total_acquisition_cost: 9.99' in decimal['content']
            expect(object_card(page, 'Audit Decimal').get_by_text('$9.99', exact=True)).to_be_visible()
            page.get_by_role('button', name='Agent', exact=True).click()
            expect(page.get_by_role('dialog')).to_be_visible()
            page.keyboard.press('Escape')
            expect(page.get_by_role('dialog')).to_have_count(0)
            page.screenshot(path=str(artifacts / 'workflow-connected.png'), full_page=True)
            zh = browser.new_page(locale='zh-CN', viewport={'width': 1280, 'height': 900})
            zh.goto(BASE + '/app/', wait_until='domcontentloaded')
            expect(zh.locator('select[aria-label="新记录的默认币种"]')).to_have_value('CNY')
            zh.close()
            (artifacts / 'workflow-browser.json').write_text(json.dumps({'journeys': ['first-run and zero-cost record', 'identity-preserving type conversion', 'snapshot prefill with debt and same-day chronology', 'archive and restore', 'reload native handle', 'decimal USD record and precise display', 'on-demand Agent dialog'], 'objects': files(page, 'Objects'), 'snapshots': snapshots, 'page_errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
            print('PASS: connected workflow walkthrough; native Markdown, reload, and page-error checks passed.')
        except Exception:
            page.screenshot(path=str(artifacts / 'workflow-failure.png'), full_page=True)
            print(page.locator('body').inner_text())
            raise
        finally:
            browser.close()


if __name__ == '__main__':
    run()

