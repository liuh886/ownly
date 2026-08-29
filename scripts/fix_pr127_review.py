from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, got {count}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, repl: str, label: str) -> str:
    next_text, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, got {count}")
    return next_text

# ── Domain: external import safety, structured price authority, schedule warnings ──
path = Path('src/domain/planner.ts')
text = path.read_text(encoding='utf-8')

make_place = r'''  const makePlace = \(partial: Partial<PlannerTripPlace> & \{ title: string; category\?: string \}\): PlannerTripPlace => \{.*?\n  \};\n\n  // 1\. Try JSON'''
make_place_repl = '''  const makePlace = (partial: Partial<PlannerTripPlace> & { title: string; category?: string }): PlannerTripPlace => {
    const allowedKinds: PlannerPlaceKind[] = ['attraction', 'food', 'cafe', 'stay', 'shopping', 'transit', 'experience', 'other'];
    const explicitKind = allowedKinds.includes(partial.kind as PlannerPlaceKind) ? partial.kind : undefined;
    const kind = explicitKind
      || (partial.category ? inferPlaceKind(partial.category) : undefined)
      || (partial.source_category ? inferPlaceKind(partial.source_category) : undefined)
      || inferPlaceKind(partial.title);
    const allowedProviders: PlannerPlaceSourceProvider[] = ['google_maps', 'tabelog', 'xiaohongshu', 'booking', 'other'];
    const sourceProvider = allowedProviders.includes(partial.source_provider as PlannerPlaceSourceProvider)
      ? partial.source_provider as PlannerPlaceSourceProvider
      : (partial.source_url ? inferSourceProvider(partial.source_url) : 'other');
    const priority: PlannerPlacePriority = ['must', 'want', 'optional'].includes(partial.priority as string)
      ? partial.priority as PlannerPlacePriority
      : 'want';
    const normalizedPrice = normalizeObservedPrice(partial.observed_price, partial.price_currency);
    const explicitPriceUnit = ['person', 'night', 'item', 'level', 'unknown'].includes(partial.price_unit as string)
      ? partial.price_unit as PlannerPriceUnit
      : undefined;
    const tags = Array.isArray(partial.tags) ? partial.tags.filter((value): value is string => typeof value === 'string') : [];
    const signals = Array.isArray(partial.signals) ? partial.signals.filter((value): value is string => typeof value === 'string') : [];
    const risks = Array.isArray(partial.risks) ? partial.risks.filter((value): value is string => typeof value === 'string') : [];
    const reviewTopics = Array.isArray(partial.review_topics) ? partial.review_topics.filter((value): value is string => typeof value === 'string') : undefined;
    const types = Array.isArray(partial.types) ? partial.types.filter((value): value is string => typeof value === 'string') : undefined;
    const coordinates = partial.coordinates
      && Number.isFinite(partial.coordinates.lat)
      && Number.isFinite(partial.coordinates.lng)
      && partial.coordinates.lat >= -90
      && partial.coordinates.lat <= 90
      && partial.coordinates.lng >= -180
      && partial.coordinates.lng <= 180
      ? partial.coordinates
      : undefined;
    return {
      schema_version: '0.1',
      type: 'trip_place',
      id: partial.id || crypto.randomUUID(),
      trip_id: tripId,
      title: partial.title.trim(),
      source_provider: sourceProvider,
      source_url: partial.source_url || '',
      source_place_id: partial.source_place_id,
      kind,
      area: partial.area?.trim() || undefined,
      priority,
      tags: ensurePlaceKindTag(tags, kind),
      why: partial.why?.trim() || undefined,
      signals,
      risks,
      notes: partial.notes?.trim() || undefined,
      source_category: partial.source_category?.trim() || partial.category?.trim() || undefined,
      observed_rating: typeof partial.observed_rating === 'number' && Number.isFinite(partial.observed_rating) ? partial.observed_rating : undefined,
      observed_review_count: typeof partial.observed_review_count === 'number' && Number.isFinite(partial.observed_review_count) && partial.observed_review_count >= 0
        ? Math.round(partial.observed_review_count)
        : undefined,
      observed_price: partial.observed_price?.trim() || undefined,
      price_currency: partial.price_currency?.trim().toUpperCase() || normalizedPrice?.currency,
      price_min: typeof partial.price_min === 'number' && Number.isFinite(partial.price_min) ? partial.price_min : normalizedPrice?.min,
      price_max: typeof partial.price_max === 'number' && Number.isFinite(partial.price_max) ? partial.price_max : normalizedPrice?.max,
      price_unit: explicitPriceUnit || normalizedPrice?.unit,
      price_level: typeof partial.price_level === 'number' && Number.isFinite(partial.price_level) ? partial.price_level : normalizedPrice?.level,
      observed_at: partial.observed_at,
      preferred_window: partial.preferred_window,
      duration_minutes: typeof partial.duration_minutes === 'number' && Number.isFinite(partial.duration_minutes) && partial.duration_minutes > 0
        ? partial.duration_minutes
        : undefined,
      open_hours: partial.open_hours?.trim() || undefined,
      address: partial.address?.trim() || undefined,
      coordinates,
      phone: partial.phone?.trim() || undefined,
      plus_code: partial.plus_code?.trim() || undefined,
      menu_url: partial.menu_url?.trim() || undefined,
      reservation_url: partial.reservation_url?.trim() || undefined,
      reservation_status: partial.reservation_status || 'none',
      review_topics: reviewTopics,
      types,
      state: 'candidate',
      created_at: partial.created_at || now,
      updated_at: partial.updated_at || now,
    };
  };

  // 1. Try JSON'''
text = sub_once(text, make_place, make_place_repl, 'safe external makePlace')

text = replace_once(
    text,
    "      if (closingMatch && !/(?:2[0-4]|1[8-9]):[0-5]\\d/.test(lowerHours) && !/24小时|24\\s*hours/i.test(lowerHours)) {",
    "      const closingHour = closingMatch ? Number(closingMatch[1]) : null;\n      if (closingMatch && closingHour !== null && closingHour >= 6 && closingHour <= 17 && !/(?:2[0-4]|1[8-9]):[0-5]\\d/.test(lowerHours) && !/24小时|24\\s*hours/i.test(lowerHours)) {",
    'overnight opening-hours guard',
)
text = replace_once(
    text,
    "    totalDurationMinutes += p.duration_minutes || 60;",
    "    if (p.duration_minutes && p.duration_minutes > 0) totalDurationMinutes += p.duration_minutes;",
    'do not invent missing duration',
)

expense_pattern = r'''export function parsePlaceExpenseEstimate\(\n  place: PlannerTripPlace,\n  fallbackCurrency = 'USD',\n\): \{ title: string; amount: number; currency: string; category: TripExpenseCategory \} \| null \{.*?\n\}\n\nexport function exportTripToMarkdown'''
expense_repl = '''export interface PlaceExpenseEstimate {
  title: string;
  amount: number;
  minAmount: number;
  maxAmount: number;
  currency: string;
  unit: PlannerPriceUnit;
  category: TripExpenseCategory;
}

export function parsePlaceExpenseEstimate(
  place: PlannerTripPlace,
  fallbackCurrency = 'USD',
): PlaceExpenseEstimate | null {
  const normalized = normalizeObservedPrice(
    place.observed_price,
    place.price_currency || fallbackCurrency,
  );
  const minAmount = typeof place.price_min === 'number' && Number.isFinite(place.price_min)
    ? place.price_min
    : normalized?.min;
  const maxAmount = typeof place.price_max === 'number' && Number.isFinite(place.price_max)
    ? place.price_max
    : normalized?.max;
  const unit = place.price_unit || normalized?.unit || 'unknown';
  if (unit === 'level' || minAmount === undefined || maxAmount === undefined || minAmount < 0 || maxAmount < 0) return null;

  const currency = (place.price_currency || normalized?.currency || fallbackCurrency).trim().toUpperCase();
  if (!currency) return null;
  const amount = (minAmount + maxAmount) / 2;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  let category: TripExpenseCategory = 'other';
  switch (place.kind) {
    case 'stay': category = 'stay'; break;
    case 'food':
    case 'cafe': category = 'food'; break;
    case 'attraction':
    case 'experience': category = 'ticket'; break;
    case 'shopping': category = 'shopping'; break;
    case 'transit': category = 'transit'; break;
    default: category = 'other';
  }

  return {
    title: place.title,
    amount,
    minAmount,
    maxAmount,
    currency,
    unit,
    category,
  };
}

export function exportTripToMarkdown'''
text = sub_once(text, expense_pattern, expense_repl, 'structured place estimate')

old_summary = '''  const tripExpenses = expenses.filter((e) => e.trip_id === trip.id);
  if (tripExpenses.length > 0) {
    lines.push(`---`, ``, `## 💰 ${zh ? '费用账本汇总' : 'Expense Summary'}`, ``);
    let total = 0;
    tripExpenses.forEach((e) => {
      total += e.amount;
      lines.push(`- **${e.date || '-'}** | ${e.title} (${e.category}): ${e.currency} ${e.amount} (${zh ? '付款人' : 'Paid by'}: ${e.paid_by})`);
    });
    lines.push(``, `**${zh ? '总支出笔数' : 'Total Entries'}:** ${tripExpenses.length} | **${zh ? '累计金额' : 'Total Amount'}:** ${total.toFixed(2)} ${trip.currency || ''}`, ``);
  }
'''
new_summary = '''  const tripExpenses = expenses.filter((e) => e.trip_id === trip.id);
  if (tripExpenses.length > 0) {
    lines.push(`---`, ``, `## 💰 ${zh ? '费用账本汇总' : 'Expense Summary'}`, ``);
    const baseCurrency = (trip.currency || 'USD').toUpperCase();
    const fx: FxSettings = { base: baseCurrency, overrides: trip.fx_rates };
    let total = 0;
    let unconverted = 0;
    tripExpenses.forEach((e) => {
      const rate = effectiveFxRate(e.currency, fx);
      if (rate === null) unconverted += 1;
      else total += e.amount * rate;
      lines.push(`- **${e.date || '-'}** | ${e.title} (${e.category}): ${e.currency} ${e.amount} (${zh ? '付款人' : 'Paid by'}: ${e.paid_by})`);
    });
    const totalText = `${currencySymbolFor(baseCurrency)}${total.toFixed(getCurrencyDecimals(baseCurrency))} ${baseCurrency}`;
    lines.push(``, `**${zh ? '总支出笔数' : 'Total Entries'}:** ${tripExpenses.length} | **${zh ? '已折算总额' : 'Converted Total'}:** ${totalText}`);
    if (unconverted > 0) {
      lines.push(`> ⚠️ ${zh ? `${unconverted} 笔支出缺少可用汇率，未计入折算总额。` : `${unconverted} expense(s) had no usable FX rate and were excluded from the converted total.`}`);
    }
    lines.push(``);
  }
'''
text = replace_once(text, old_summary, new_summary, 'markdown currency-safe total')
path.write_text(text, encoding='utf-8')

# ── Repository: one research-import core, separate public entry points ──
path = Path('src/services/PlannerRepository.ts')
text = path.read_text(encoding='utf-8')
repo_pattern = r'''  /\*\*\n   \* Capture import is an explicit boundary\..*?\n  async importCapturedPlaces\(places: PlannerTripPlace\[\]\): Promise<string\[\]> \{.*?\n    return importedIds;\n  \}\n'''
repo_repl = '''  private async importResearchPlaces(places: PlannerTripPlace[]): Promise<string[]> {
    if (places.length === 0) return [];
    await this.initialize();

    const existing = await this.listPlaces();
    const byId = new Map(existing.map((place) => [place.id, place] as const));
    const byPlaceId = new Map<string, PlannerTripPlace>();
    const byUrlIdentity = new Map<string, PlannerTripPlace>();
    const byCoordinates = new Map<string, PlannerTripPlace>();

    const coordinateKey = (place: PlannerTripPlace): string | null => {
      if (!place.coordinates) return null;
      return `${place.trip_id}::geo:${place.coordinates.lat.toFixed(5)},${place.coordinates.lng.toFixed(5)}`;
    };
    const indexPlace = (place: PlannerTripPlace) => {
      byId.set(place.id, place);
      if (place.source_place_id) byPlaceId.set(`${place.trip_id}::${place.source_provider}::${place.source_place_id}`, place);
      if (place.source_url) byUrlIdentity.set(`${place.trip_id}::${place.source_provider}::${normalizePlaceIdentity(place.source_url)}`, place);
      const geo = coordinateKey(place);
      if (geo) byCoordinates.set(geo, place);
    };

    existing.forEach(indexPlace);
    const importedIds: string[] = [];

    for (const rawPlace of places) {
      if (!rawPlace.id || !rawPlace.trip_id) continue;
      const incoming: PlannerTripPlace = {
        ...rawPlace,
        tags: ensurePlaceKindTag(rawPlace.tags, rawPlace.kind),
        reservation_status: rawPlace.reservation_status ?? 'none',
        state: 'candidate',
        scheduled_date: undefined,
        sort_order: undefined,
        locked: undefined,
      };
      const existingPlace = byId.get(incoming.id)
        ?? (incoming.source_place_id
          ? byPlaceId.get(`${incoming.trip_id}::${incoming.source_provider}::${incoming.source_place_id}`)
          : undefined)
        ?? (coordinateKey(incoming) ? byCoordinates.get(coordinateKey(incoming)!) : undefined)
        ?? (incoming.source_url
          ? byUrlIdentity.get(`${incoming.trip_id}::${incoming.source_provider}::${normalizePlaceIdentity(incoming.source_url)}`)
          : undefined);

      try {
        const persisted = existingPlace
          ? mergeCapturedPlaceResearch(existingPlace, incoming)
          : incoming;
        await this.upsert(persisted);
        indexPlace(persisted);
        importedIds.push(rawPlace.id);
      } catch (err) {
        console.warn(`[PlannerRepository] Failed to import research place ${rawPlace.id} (${rawPlace.title}):`, err);
      }
    }

    return importedIds;
  }

  /** Capture boundary: ACK only IDs that reached canonical Planner storage. */
  async importCapturedPlaces(places: PlannerTripPlace[]): Promise<string[]> {
    return this.importResearchPlaces(places);
  }

  /** External files/clipboard enter as research candidates, never as scheduled decisions. */
  async importExternalCandidates(places: PlannerTripPlace[]): Promise<string[]> {
    return this.importResearchPlaces(places);
  }
'''
text = sub_once(text, repo_pattern, repo_repl, 'repository import boundary')
path.write_text(text, encoding='utf-8')

# ── External import modal: use its own repository entry point and keep failures visible ──
path = Path('src/components/planner/ImportCandidatesModal.tsx')
text = path.read_text(encoding='utf-8')
old_modal = '''      const importedIds = await plannerRepository.importCapturedPlaces(parsedPlaces);
      onImportSuccess(importedIds.length);
      setInputText('');
      setParsedPlaces([]);
      onClose();
'''
new_modal = '''      const importedIds = await plannerRepository.importExternalCandidates(parsedPlaces);
      onImportSuccess(importedIds.length);
      if (importedIds.length < parsedPlaces.length) {
        const imported = new Set(importedIds);
        const remaining = parsedPlaces.filter((place) => !imported.has(place.id));
        setParsedPlaces(remaining);
        setErrorMsg(zh
          ? `已写入 ${importedIds.length} 个，仍有 ${remaining.length} 个未写入；请检查数据目录后重试。`
          : `Imported ${importedIds.length}; ${remaining.length} place(s) remain. Check the data directory and retry.`);
        return;
      }
      setInputText('');
      setParsedPlaces([]);
      onClose();
'''
text = replace_once(text, old_modal, new_modal, 'external import partial failure')
path.write_text(text, encoding='utf-8')

# ── Planner UI: estimates stay estimates; ledger stays actual ──
path = Path('src/components/planner/PlannerHome.tsx')
text = path.read_text(encoding='utf-8')
old_costs = '''  const dayEstimatedCost = useMemo(() => {
    if (!selectedTrip) return 0;
    let total = 0;
    const tripCurrency = selectedTrip.currency || 'USD';
    const fx = { base: tripCurrency, overrides: selectedTrip.fx_rates };
    scheduled.forEach((p) => {
      const est = parsePlaceExpenseEstimate(p, tripCurrency);
      if (est) {
        const rate = effectiveFxRate(est.currency, fx) ?? 1;
        total += est.amount * rate;
      }
    });
    return Math.round(total * 100) / 100;
  }, [scheduled, selectedTrip]);

  const dayActualCost = useMemo(() => {
    if (!selectedTrip) return 0;
    const tripCurrency = selectedTrip.currency || 'USD';
    const fx = { base: tripCurrency, overrides: selectedTrip.fx_rates };
    let total = 0;
    currentExpenses.filter((e) => e.date === activeDate).forEach((e) => {
      const rate = effectiveFxRate(e.currency, fx) ?? 1;
      total += e.amount * rate;
    });
    return Math.round(total * 100) / 100;
  }, [currentExpenses, activeDate, selectedTrip]);

  const handleAddPlaceExpense = useCallback(
    async (place: PlannerTripPlace) => {
      if (!selectedTrip) return;
      const est = parsePlaceExpenseEstimate(place, selectedTrip.currency || 'USD');
      const amount = est?.amount || 0;
      const currency = est?.currency || selectedTrip.currency || 'USD';
      const category = est?.category || 'other';

      await handleAddExpense({
        trip_id: selectedTrip.id,
        title: place.title,
        amount,
        currency,
        category,
        date: place.scheduled_date || activeDate,
        paid_by: currentMembers[0],
        split_members: currentMembers,
        notes: place.why || place.notes,
      });

      setNotice(zh ? `已将「${place.title}」记入预算账本！` : `Added "${place.title}" to budget expenses!`);
      setTimeout(() => setNotice(''), 3000);
    },
    [selectedTrip, activeDate, currentMembers, handleAddExpense, zh],
  );
'''
new_costs = '''  const dayEstimatedCost = useMemo(() => {
    if (!selectedTrip) return { total: 0, unconverted: 0 };
    let total = 0;
    let unconverted = 0;
    const tripCurrency = selectedTrip.currency || 'USD';
    const fx = { base: tripCurrency, overrides: selectedTrip.fx_rates };
    scheduled.forEach((place) => {
      const estimate = parsePlaceExpenseEstimate(place, tripCurrency);
      if (!estimate) return;
      const rate = effectiveFxRate(estimate.currency, fx);
      if (rate === null) {
        unconverted += 1;
        return;
      }
      const quantity = estimate.unit === 'person' ? Math.max(1, currentMembers.length) : 1;
      total += estimate.amount * rate * quantity;
    });
    return { total: Math.round(total * 100) / 100, unconverted };
  }, [scheduled, selectedTrip, currentMembers.length]);

  const dayActualCost = useMemo(() => {
    if (!selectedTrip) return { total: 0, unconverted: 0 };
    const tripCurrency = selectedTrip.currency || 'USD';
    const fx = { base: tripCurrency, overrides: selectedTrip.fx_rates };
    let total = 0;
    let unconverted = 0;
    currentExpenses.filter((expense) => expense.date === activeDate).forEach((expense) => {
      const rate = effectiveFxRate(expense.currency, fx);
      if (rate === null) unconverted += 1;
      else total += expense.amount * rate;
    });
    return { total: Math.round(total * 100) / 100, unconverted };
  }, [currentExpenses, activeDate, selectedTrip]);
'''
text = replace_once(text, old_costs, new_costs, 'estimate/actual semantic split')
text = replace_once(
    text,
    "                <span>{zh ? '预估' : 'Est'}: {currencySymbolFor(selectedTrip.currency)}{dayEstimatedCost}</span>\n                <span className=\"text-stone-300\">|</span>\n                <span>{zh ? '实记' : 'Act'}: {currencySymbolFor(selectedTrip.currency)}{dayActualCost}</span>",
    "                <span>{zh ? '预估' : 'Est'}: {currencySymbolFor(selectedTrip.currency)}{dayEstimatedCost.total}</span>\n                <span className=\"text-stone-300\">|</span>\n                <span>{zh ? '实记' : 'Act'}: {currencySymbolFor(selectedTrip.currency)}{dayActualCost.total}</span>\n                {dayEstimatedCost.unconverted + dayActualCost.unconverted > 0 ? (\n                  <span className=\"text-amber-700\" title={zh ? '存在缺少可用汇率的金额，未计入总额' : 'Some amounts lack a usable FX rate and are excluded'}>\n                    ⚠ {dayEstimatedCost.unconverted + dayActualCost.unconverted}\n                  </span>\n                ) : null}",
    'cost summary UI',
)
scheduled_button = '''                          <button
                            type="button"
                            aria-label={zh ? '记入账本' : 'Add to expense'}
                            onClick={() => void handleAddPlaceExpense(place)}
                            className="h-8 rounded-md border border-stone-200 px-2 text-[10px] font-semibold text-stone-600 hover:bg-stone-50 hover:border-stone-300 transition"
                            title={zh ? '将此地点预估消费记入预算账本' : 'Record this place expense in budget ledger'}
                          >
                            + {zh ? '记账' : 'Exp'}
                          </button>
'''
text = replace_once(text, scheduled_button, '', 'remove estimate-to-actual scheduled action')
candidate_button = '''                            {place.observed_price ? (
                              <button
                                type="button"
                                onClick={() => void handleAddPlaceExpense(place)}
                                className="rounded-md border border-stone-200 bg-white px-1.5 py-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 transition"
                                title={zh ? '将此地点预估消费记入预算账本' : 'Add to budget expenses'}
                              >
                                + {zh ? '记账' : 'Exp'}
                              </button>
                            ) : null}
'''
text = replace_once(text, candidate_button, '', 'remove estimate-to-actual candidate action')
path.write_text(text, encoding='utf-8')

# ── Tests: lock in corrected semantics ──
path = Path('src/domain/planner.test.ts')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "    expect(est1?.currency).toBe('CNY'); // ¥ mapped to CNY by extractPriceCurrency default, or JPY if prefix",
    "    expect(est1?.currency).toBe('JPY');",
    'yen fallback test',
)
text = replace_once(
    text,
    "    const okCol = checkOpeningHoursCollision('09:00 - 22:00', '2026-10-20', 'afternoon');\n    expect(okCol.isCollision).toBe(false);",
    "    const overnightNight = checkOpeningHoursCollision('18:00 - 02:00', '2026-10-20', 'night');\n    expect(overnightNight.isCollision).toBe(false);\n\n    const okCol = checkOpeningHoursCollision('09:00 - 22:00', '2026-10-20', 'afternoon');\n    expect(okCol.isCollision).toBe(false);",
    'overnight opening-hours test',
)
text = replace_once(
    text,
    "    expect(places[1].kind).toBe('food');\n  });",
    "    expect(places[1].kind).toBe('food');\n  });\n\n  it('preserves comparable research facts from external JSON', () => {\n    const json = JSON.stringify([{\n      title: 'Bangkok Bistro',\n      source_category: 'Thai restaurant',\n      observed_review_count: 1280,\n      observed_price: '฿400–600 per person',\n      price_currency: 'THB',\n    }]);\n    const [place] = parseImportPayload(json, 'trip-123');\n    expect(place.source_category).toBe('Thai restaurant');\n    expect(place.observed_review_count).toBe(1280);\n    expect(place.price_currency).toBe('THB');\n    expect(place.price_min).toBe(400);\n    expect(place.price_max).toBe(600);\n    expect(place.price_unit).toBe('person');\n  });",
    'external structured facts test',
)
text = replace_once(
    text,
    "    expect(est2?.category).toBe('ticket');\n  });",
    "    expect(est2?.category).toBe('ticket');\n\n    const p3 = place('p3', {\n      title: 'Bangkok Dinner',\n      kind: 'food',\n      observed_price: '฿400–600 per person',\n      price_currency: 'THB',\n      price_min: 400,\n      price_max: 600,\n      price_unit: 'person',\n    });\n    const est3 = parsePlaceExpenseEstimate(p3, 'CNY');\n    expect(est3?.amount).toBe(500);\n    expect(est3?.minAmount).toBe(400);\n    expect(est3?.maxAmount).toBe(600);\n    expect(est3?.currency).toBe('THB');\n    expect(est3?.unit).toBe('person');\n  });",
    'structured price estimate test',
)
text = replace_once(
    text,
    "      members: ['Alice', 'Bob'],\n      created_at: '2026-08-01',",
    "      members: ['Alice', 'Bob'],\n      fx_rates: { USD: 150 },\n      created_at: '2026-08-01',",
    'markdown fx fixture',
)
text = replace_once(
    text,
    "    const md = exportTripToMarkdown(trip, places, expenses, 'zh');",
    "    expenses.push({\n      id: 'e2',\n      trip_id: 'trip-1',\n      title: 'Museum',\n      category: 'ticket',\n      amount: 10,\n      currency: 'USD',\n      paid_by: 'Bob',\n      split_members: ['Alice', 'Bob'],\n      created_at: '2026-10-20',\n    });\n\n    const md = exportTripToMarkdown(trip, places, expenses, 'zh');",
    'markdown mixed currency fixture',
)
text = replace_once(
    text,
    "    expect(md).toContain('Train Pass');",
    "    expect(md).toContain('Train Pass');\n    expect(md).toContain('已折算总额');\n    expect(md).toContain('¥4,500 JPY');",
    'markdown converted total test',
)
path.write_text(text, encoding='utf-8')

print('PR #127 review corrections applied')
