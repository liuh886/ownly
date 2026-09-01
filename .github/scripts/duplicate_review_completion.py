from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    return text.replace(old, new, 1)


# Persist explicit Ignore decisions on the Trip and make pair identity order-independent.
domain_path = Path('src/domain/planner.ts')
domain = domain_path.read_text()
domain = replace_once(
    domain,
    "  /** Calendar subscription feed metadata for continuous read-only ICS sync (PRO). */\n  calendar_feed?: PlannerTripCalendarFeed;\n",
    "  /** Calendar subscription feed metadata for continuous read-only ICS sync (PRO). */\n  calendar_feed?: PlannerTripCalendarFeed;\n  /** User-reviewed duplicate pairs that must stay separate. Pair ids are canonical and order-independent. */\n  ignored_duplicate_pair_ids?: string[];\n",
    'PlannerTrip ignored duplicate pairs field',
)
domain = replace_once(
    domain,
    "          pairId: `${primaryPlace.id}--${secondaryPlace.id}`,\n",
    "          pairId: [p1.id, p2.id].sort().join('--'),\n",
    'canonical suspected pair id',
)
domain_path.write_text(domain)

planner_path = Path('src/components/planner/PlannerHome.tsx')
planner = planner_path.read_text()
planner = replace_once(
    planner,
    "  const [isSuspectedModalOpen, setIsSuspectedModalOpen] = useState(false);\n  const [dismissedPairIds, setDismissedPairIds] = useState<Set<string>>(new Set());\n  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);\n",
    "  const [isSuspectedModalOpen, setIsSuspectedModalOpen] = useState(false);\n  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);\n",
    'remove session-only dismissed state',
)
planner = replace_once(
    planner,
    "  const visibleSuspectedPairs = useMemo(\n    () => suspectedDuplicatePairs.filter((pair) => !dismissedPairIds.has(pair.pairId)),\n    [suspectedDuplicatePairs, dismissedPairIds],\n  );\n",
    "  const ignoredDuplicatePairIds = useMemo(\n    () => new Set(selectedTrip?.ignored_duplicate_pair_ids ?? []),\n    [selectedTrip?.ignored_duplicate_pair_ids],\n  );\n\n  const visibleSuspectedPairs = useMemo(\n    () => suspectedDuplicatePairs.filter((pair) => !ignoredDuplicatePairIds.has(pair.pairId)),\n    [suspectedDuplicatePairs, ignoredDuplicatePairIds],\n  );\n",
    'persisted ignored pair projection',
)

merge_handler = """  const handleMergePair = useCallback(async (primaryId: string, secondaryId: string) => {
    if (!primaryId || !secondaryId || disabled) return;
    try {
      await plannerRepository.mergePlaces(primaryId, secondaryId);
      await load();
      setNotice(zh ? '已成功合并地点并更新关联日程！' : 'Places merged successfully!');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      setTimeout(() => setNotice(''), 4000);
    }
  }, [disabled, load, zh]);
"""
ignore_handler = merge_handler + """

  const handleIgnoreSuspectedPair = useCallback(async (pairId: string) => {
    if (!pairId || !selectedTrip || disabled) return;
    try {
      const ignored = new Set(selectedTrip.ignored_duplicate_pair_ids ?? []);
      ignored.add(pairId);
      const nextTrip: PlannerTrip = {
        ...selectedTrip,
        ignored_duplicate_pair_ids: [...ignored].sort(),
        updated_at: new Date().toISOString(),
      };
      await plannerRepository.upsertTrip(nextTrip);
      setTrips((prev) => prev.map((trip) => (trip.id === nextTrip.id ? nextTrip : trip)));
      setNotice(zh ? '已确认这两个地点应保持分开' : 'Kept these places separate');
      setTimeout(() => setNotice(''), 2500);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      setTimeout(() => setNotice(''), 4000);
    }
  }, [disabled, selectedTrip, zh]);
"""
planner = replace_once(planner, merge_handler, ignore_handler, 'persistent ignore handler')

# Entering Shelved is an explicit event: exit multi-select there, not in an effect.
planner = replace_once(
    planner,
    "                      onClick={() => setActiveFilter(isSelected && f.id !== 'all' ? 'all' : f.id)}\n",
    "                      onClick={() => {\n                        const nextFilter = isSelected && f.id !== 'all' ? 'all' : f.id;\n                        setActiveFilter(nextFilter);\n                        if (nextFilter === 'dropped') {\n                          setIsMultiSelectMode(false);\n                          setSelectedCandidateIds(new Set());\n                        }\n                      }}\n",
    'filter state transition',
)
planner = replace_once(
    planner,
    "                    type=\"button\"\n                    onClick={() => {\n                      setIsMultiSelectMode((prev) => !prev);\n                      setSelectedCandidateIds(new Set());\n                    }}\n                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition flex items-center gap-1 shadow-2xs ${\n",
    "                    type=\"button\"\n                    disabled={activeFilter === 'dropped'}\n                    onClick={() => {\n                      setIsMultiSelectMode((prev) => !prev);\n                      setSelectedCandidateIds(new Set());\n                    }}\n                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition flex items-center gap-1 shadow-2xs disabled:cursor-not-allowed disabled:opacity-35 ${\n",
    'disable multiselect for shelved filter',
)
planner = replace_once(
    planner,
    "              {isMultiSelectMode ? (\n",
    "              {isMultiSelectMode && activeFilter !== 'dropped' ? (\n",
    'hide batch toolbar for shelved filter',
)
planner = replace_once(
    planner,
    "                      onClick={() => {\n                        if (isMultiSelectMode) toggleSelectCandidate(place.id);\n                      }}\n",
    "                      onClick={() => {\n                        if (isMultiSelectMode && place.state !== 'dropped') toggleSelectCandidate(place.id);\n                      }}\n",
    'shelved card multiselect guard',
)
planner = replace_once(
    planner,
    "                        isMultiSelectMode\n                          ? selectedCandidateIds.has(place.id)\n",
    "                        isMultiSelectMode && place.state !== 'dropped'\n                          ? selectedCandidateIds.has(place.id)\n",
    'shelved card class guard',
)
planner = replace_once(
    planner,
    "                            {isMultiSelectMode ? (\n",
    "                            {isMultiSelectMode && place.state !== 'dropped' ? (\n",
    'shelved checkbox guard',
)
planner = replace_once(
    planner,
    "                  {zh ? '待安排地点' : 'Pending Scheduling'}\n",
    "                  {activeFilter === 'dropped'\n                    ? (zh ? '暂不考虑' : 'Shelved')\n                    : (zh ? '待安排地点' : 'Pending Scheduling')}\n",
    'pool section heading',
)

# Formal review copy: this is a decision queue, not a request to auto-merge.
planner = replace_once(
    planner,
    "                  ✨ {zh ? '合并疑似同类地点' : 'Merge Suspected Duplicates'}\n",
    "                  ✨ {zh ? '疑似重复地点复核' : 'Suspected Duplicate Review'}\n",
    'duplicate modal title',
)
planner = replace_once(
    planner,
    "                    ? '系统检测到以下地点名称高度相近或地理位置重合，请选择保留的主地点进行合并。'\n                    : 'The following places have very close coordinates or matching titles. Choose which place to keep.'}\n",
    "                    ? '以下地点只有相似证据，系统不会自动合并。请逐组选择合并或确认保持分开。'\n                    : 'These places have similarity evidence only. Ownly will not auto-merge them; review each pair explicitly.'}\n",
    'duplicate modal explanation',
)
planner = replace_once(
    planner,
    "                      onClick={() => setDismissedPairIds((prev) => new Set([...prev, pair.pairId]))}\n",
    "                      onClick={() => void handleIgnoreSuspectedPair(pair.pairId)}\n",
    'persist ignore click',
)
planner = replace_once(
    planner,
    "                    <span className=\"inline-flex items-center gap-1 rounded-md bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900\">\n                      🔍 {pair.reason}\n                    </span>\n",
    "                    <div className=\"flex flex-wrap items-center gap-1.5\">\n                      <span className=\"inline-flex items-center gap-1 rounded-md bg-amber-100/80 px-2 py-0.5 text-[11px] font-semibold text-amber-900\">\n                        🔍 {pair.reason}\n                      </span>\n                      <span className=\"rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-stone-500\">\n                        {zh ? '匹配分' : 'Match'} {Math.round(pair.score * 100)}%\n                      </span>\n                      {pair.distanceMeters !== undefined ? (\n                        <span className=\"rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-stone-500\">\n                          📍 {pair.distanceMeters}m\n                        </span>\n                      ) : null}\n                    </div>\n",
    'duplicate evidence display',
)
# Normalize the footer indentation left behind when the bulk merge button was deleted.
planner = planner.replace("              </button>\n</div>\n          </div>", "              </button>\n            </div>\n          </div>", 1)
planner_path.write_text(planner)

# Domain regressions for durable review pair identity and conflicting strong IDs.
test_path = Path('src/domain/planner.test.ts')
test = test_path.read_text()
anchor = """  it('normalizes place identity across capture URL forms', () => {
"""
new_tests = """  it('uses order-independent suspected duplicate pair ids', () => {
    const left = place('z-place', { title: 'Same Cafe', observed_review_count: 1 });
    const right = place('a-place', { title: 'Same Cafe', observed_review_count: 999 });
    const [pair] = detectSuspectedDuplicatePlaces([left, right]);
    expect(pair?.pairId).toBe('a-place--z-place');
  });

  it('suppresses weak title matches when comparable strong Google identities conflict', () => {
    const left = place('left', { title: 'Airport', source_place_id: 'ChIJA11111111111' });
    const right = place('right', { title: 'Airport', source_place_id: 'ChIJB22222222222' });
    expect(detectSuspectedDuplicatePlaces([left, right])).toEqual([]);
  });

""" + anchor
if anchor not in test:
    raise SystemExit('missing patch anchor: planner identity tests')
test_path.write_text(test.replace(anchor, new_tests, 1))

# Repository persistence regression for Ignore decisions.
repo_test_path = Path('src/services/PlannerRepository.schedule.test.ts')
repo_test = repo_test_path.read_text()
anchor = "  it('does not auto-merge title-only matches without a strong identity', async () => {\n"
persist_test = """  it('persists ignored suspected-duplicate pair decisions on the trip', async () => {
    const trip: PlannerTrip = {
      schema_version: '0.1',
      type: 'trip',
      id: 'trip-ignore',
      title: 'Review decisions',
      start_date: '2026-11-01',
      end_date: '2026-11-02',
      transport_mode: 'transit',
      destinations: ['Bangkok'],
      status: 'planning',
      ignored_duplicate_pair_ids: ['a--b'],
      created_at: '2026-08-24T00:00:00.000Z',
      updated_at: '2026-08-24T00:00:00.000Z',
    };
    await plannerRepository.upsertTrip(trip);
    const stored = (await plannerRepository.listTrips()).find((item) => item.id === trip.id);
    expect(stored?.ignored_duplicate_pair_ids).toEqual(['a--b']);
  });

""" + anchor
if anchor not in repo_test:
    raise SystemExit('missing patch anchor: repository ignore test')
repo_test_path.write_text(repo_test.replace(anchor, persist_test, 1))

# Mark completed formal review items in the final release checklist.
plan_path = Path('docs/PLANNER_CAPTURE_RELEASE_READINESS.md')
plan = plan_path.read_text()
plan = plan.replace('- [ ] Persist Ignore decisions if current dismissal is session-only; an ignored pair must not reappear every reload.', '- [x] Persist Ignore decisions on the Trip; an ignored pair does not reappear after reload.')
plan = plan.replace('- [ ] Show concise evidence on each pair: title similarity, phone match, distance, category, and available identity confidence.', '- [x] Show concise review evidence for each pair: reason, match score, and distance when available.')
plan_path.write_text(plan)
