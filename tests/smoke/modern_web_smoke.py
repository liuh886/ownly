"""Real Chromium checks for URL navigation, keyboard menus and narrow layouts.

Run against a fresh static export: python -B tests/smoke/modern_web_smoke.py.
Only the native directory-picker UI is replaced with isolated Chromium OPFS.
"""
import json
import re

from playwright.sync_api import expect, sync_playwright
from demo_mode_smoke import BASE, REPO, managed_server, enter_demo, open_app
from workflow_smoke import switch_tab


def run():
    artifacts = REPO / 'node_modules' / '.cache' / 'ownly-ux-audit-20261004'
    artifacts.mkdir(parents=True, exist_ok=True)
    result = {'breakpoints': [], 'page_errors': []}
    with managed_server(), sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(locale='en-US', viewport={'width': 1440, 'height': 900})
        page.set_default_timeout(15000)
        page.on('pageerror', lambda error: result['page_errors'].append(str(error)))
        page.add_init_script("window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Ownly', {create: true});")
        try:
            page.goto(BASE + '/app/?capture=1', wait_until='domcontentloaded')
            page.get_by_role('button', name='Choose save location', exact=True).click()
            guide = page.get_by_role('dialog')
            guide.get_by_role('button', name='Set up my first record', exact=True).click()
            guide.get_by_role('button').filter(has_text='Physical item').click()
            form = page.locator('form').filter(has=page.get_by_label('Name', exact=True))
            form.get_by_label('Name', exact=True).fill('Modern Audit Camera')
            form.get_by_role('spinbutton').first.fill('10')
            form.get_by_role('button', name='Save to Ownly', exact=True).click()
            expect(page.get_by_role('heading', name='Modern Audit Camera', exact=True)).to_be_visible()

            switch_tab(page, 'Accounts')
            expect(page).to_have_url(re.compile(r'capture=1&view=accounts'))
            expect(page).to_have_title('Accounts · Ownly')
            expect(page.locator('#ownly-view-title')).to_be_focused()
            page.reload(wait_until='domcontentloaded')
            expect(page.get_by_role('heading', name='Accounts', exact=True)).to_be_visible()
            switch_tab(page, 'Reviews')
            page.go_back(wait_until='domcontentloaded')
            expect(page.get_by_role('heading', name='Accounts', exact=True)).to_be_visible()
            page.go_forward(wait_until='domcontentloaded')
            expect(page.get_by_role('heading', name='Reviews', exact=True)).to_be_visible()
            result['navigation'] = 'deep view/reload/Back/Forward preserve capture parameter and view title'

            # Cross-view intent must survive; reduced motion covers explicit JS scrolling.
            switch_tab(page, 'Home')
            page.emulate_media(reduced_motion='reduce')
            page.evaluate("""() => {
                window.auditScroll = [];
                const original = Element.prototype.scrollIntoView;
                Element.prototype.scrollIntoView = function(options) { window.auditScroll.push(options); return original.call(this, options); };
            }""")
            page.get_by_role('button', name=re.compile('^(Fixed cost|Subscription cost) template$')).click()
            quick = page.get_by_label('Paste line', exact=True)
            expect(quick).to_have_value(re.compile('Spotify / recurring_cost'))
            expect(page.get_by_label('Name', exact=True)).to_have_value('Spotify')
            expect(page.locator('form select').first).to_have_value('recurring_cost')
            expect(quick).to_be_focused()
            scrolls = page.evaluate('window.auditScroll')
            assert any(item.get('behavior') == 'auto' for item in scrolls), scrolls
            result['quick_entry'] = 'Home template reaches Objects with parsed fields, focus and reduced-motion scroll'

            help_control = page.get_by_label('Entry format help', exact=True)
            help_control.focus()
            page.keyboard.press('Enter')
            expect(help_control.locator('..')).to_have_attribute('open', '')
            page.keyboard.press('Enter')
            expect(help_control.locator('..')).not_to_have_attribute('open', '')

            # Collapse with focus outside nav, then re-enter using actual keyboard Tab.
            page.locator('footer').last.evaluate('el => { el.tabIndex = -1; el.focus(); }')
            page.evaluate('window.scrollTo(0,0)')
            page.wait_for_timeout(100)
            page.evaluate('window.scrollTo(0,document.body.scrollHeight)')
            page.wait_for_timeout(400)
            nav = page.get_by_role('navigation', name='Main navigation')
            wrapper = nav.locator('../..')
            expect(wrapper).to_have_class(re.compile('opacity-0'))
            assert nav.locator('xpath=ancestor::*[@inert]').count() == 0
            # Tab from the existing footer must enter a scroll-collapsed nav.
            page.keyboard.press('Tab')
            expect(nav.get_by_role('button', name='Home', exact=True)).to_be_focused()
            expect(wrapper).to_have_class(re.compile('opacity-100'))
            page.keyboard.press('Tab')
            expect(nav.get_by_role('button', name='Objects', exact=True)).to_be_focused()
            page.keyboard.press('Enter')
            result['keyboard_navigation'] = 'scroll-hidden nav remains reachable; focus reveals it and Tab works'

            # A real connection menu must behave like a menu, including trigger return.
            page.evaluate('window.scrollTo(0,0)')
            connection = page.locator('button[aria-haspopup="menu"]').first
            connection.focus()
            page.keyboard.press('Enter')
            menu = page.get_by_role('menu')
            expect(menu.get_by_role('menuitem').first).to_be_focused()
            page.keyboard.press('End')
            expect(menu.get_by_role('menuitem').last).to_be_focused()
            page.keyboard.press('Escape')
            expect(menu).to_have_count(0)
            expect(connection).to_be_focused()

            # More-action menu on an actual record retains native keyboard focus.
            switch_tab(page, 'Objects')
            page.get_by_role('button', name=re.compile(r'^All types \(')).click()
            more = page.get_by_role('button', name='More actions - Modern Audit Camera', exact=True)
            more.focus()
            page.keyboard.press('Enter')
            menu = page.get_by_role('menu')
            expect(menu.get_by_role('menuitem').first).to_be_focused()
            page.keyboard.press('ArrowUp')
            expect(menu.get_by_role('menuitem').last).to_be_focused()
            page.keyboard.press('Escape')
            expect(more).to_be_focused()
            result['menus'] = 'Header and object menus open, navigate and return focus with native keys'

            # Labels must actually focus their fields in the new-trip form.
            switch_tab(page, 'Planner')
            page.get_by_role('button', name=re.compile('^(Manage Trips|Open Trip management)$')).first.click()
            dialog = page.get_by_role('dialog')
            dialog.get_by_role('button', name=re.compile('Create$')).click()
            for label in ['Trip Title *', 'Start Date *', 'End Date *', 'Destinations (comma-separated)', 'Base Currency', 'Transport Mode', 'Tags (optional)']:
                expect(dialog.get_by_label(label, exact=True)).to_have_count(1)
            title = dialog.get_by_label('Trip Title *', exact=True)
            dialog.locator('label').filter(has_text='Trip Title *').click()
            expect(title).to_be_focused()
            page.keyboard.press('Escape')
            expect(dialog).to_have_count(0)

            # An invalid incoming link still offers an import/error once, without navigation lock.
            page.evaluate("location.hash='ownly-trip=invalid'")
            expect(page.get_by_role('dialog')).to_be_visible()
            expect(page).to_have_url(re.compile(r'view=planner$'))
            page.keyboard.press('Escape')
            switch_tab(page, 'Accounts')
            switch_tab(page, 'Planner')
            expect(page.get_by_role('dialog')).to_have_count(0)
            result['share_link'] = 'Incoming fragment is consumed once; closing and switching views does not reoffer it'

            page.set_viewport_size({'width': 390, 'height': 844})
            page.evaluate('window.scrollTo(0,0)')
            preferences_trigger = page.get_by_role('button', name='More options', exact=True)
            preferences_trigger.focus()
            page.keyboard.press('Enter')
            preferences = page.get_by_role('region', name='More options', exact=True)
            expect(preferences).to_be_visible()
            preferences.locator('select').select_option('EUR')
            expect(preferences).to_have_count(0)
            expect(preferences_trigger).to_be_focused()
            preferences_trigger.click()
            preferences.locator('select').select_option('USD')
            preferences_trigger.click()
            page.get_by_role('button', name='Open Trip management', exact=True).click()
            expect(page.get_by_role('dialog')).to_be_visible()
            page.keyboard.press('Escape')
            result['mobile_preferences'] = 'Native currency select restores focus; an outside trip-management click executes immediately'

            # Seeded demo data stresses real content widths across every main view.
            demo = browser.new_page(locale='en-US', viewport={'width': 1440, 'height': 900})
            demo.on('pageerror', lambda error: result['page_errors'].append(str(error)))
            open_app(demo)
            enter_demo(demo)
            for width in [320, 768, 1024, 1440]:
                demo.set_viewport_size({'width': width, 'height': 900})
                for tab in ['Home', 'Objects', 'Accounts', 'Reviews', 'Planner']:
                    switch_tab(demo, tab)
                    expect(demo.locator('h1')).to_have_text(tab)
                    marker = {
                        'Home': demo.get_by_text('Data scale', exact=True),
                        'Objects': demo.get_by_text('Object console', exact=True),
                        'Accounts': demo.get_by_label(re.compile('^Asset accounts')),
                        'Reviews': demo.get_by_text('Review history', exact=True),
                        'Planner': demo.get_by_role('combobox', name='Select trip', exact=True),
                    }[tab]
                    expect(marker).to_be_visible()
                    demo.wait_for_timeout(600)
                    measure = demo.evaluate('''tab => ({tab, width:innerWidth, scrollWidth:document.documentElement.scrollWidth})''', tab)
                    if measure['scrollWidth'] > width:
                        demo.screenshot(path=str(artifacts / f'modern-overflow-{tab}-{width}.png'), full_page=True)
                        print(demo.evaluate("""() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({tag:el.tagName, text:el.textContent.slice(0,80), class:String(el.className), width:el.getBoundingClientRect().width, right:el.getBoundingClientRect().right})).slice(0,30)"""))
                    assert measure['scrollWidth'] <= width, measure
                    result['breakpoints'].append(measure)
                    if width == 320:
                        demo.screenshot(path=str(artifacts / f'{tab.lower()}-320-after.png'), full_page=True)
                if width == 320:
                    switch_tab(demo, 'Home')
                    demo.screenshot(path=str(artifacts / 'home-320-after.png'), full_page=True)
            demo.close()
            assert not result['page_errors'], result['page_errors']
            (artifacts / 'modern-after.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            print('PASS: modern Web navigation, quick entry, keyboard menus, labelled fields, reduced motion, share handoff and 20 viewport/view checks.')
        except Exception:
            page.screenshot(path=str(artifacts / 'modern-failure.png'), full_page=True)
            print(page.locator('body').inner_text())
            raise
        finally:
            browser.close()


if __name__ == '__main__':
    run()
