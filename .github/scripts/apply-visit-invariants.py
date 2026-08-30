from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected patch context not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "src/services/PlannerRepository.ts",
    """  async dropPlace(placeId: string): Promise<boolean> {
    await this.initialize();
    const existing = (await this.listPlaces()).find((place) => place.id === placeId);
    if (!existing) return false;
    await this.store.writeMarkdownFile(
      this.directory(PLANNER_DIRECTORIES.places),
      entityFileName(existing),
      serializeMarkdownEntity({ ...existing, state: 'dropped', updated_at: new Date().toISOString() }, ''),
    );
    return true;
  }
""",
    """  async dropPlace(placeId: string): Promise<boolean> {
    await this.initialize();
    const existing = (await this.listPlaces()).find((place) => place.id === placeId);
    if (!existing) return false;
    const blockingVisits = (await this.listVisits()).filter(
      (visit) => visit.trip_id === existing.trip_id && visit.place_id === placeId,
    );
    if (blockingVisits.length > 0) {
      throw new Error(`Cannot drop ${existing.title}: remove ${blockingVisits.length} scheduled visit(s) first.`);
    }
    await this.store.writeMarkdownFile(
      this.directory(PLANNER_DIRECTORIES.places),
      entityFileName(existing),
      serializeMarkdownEntity({ ...existing, state: 'dropped', updated_at: new Date().toISOString() }, ''),
    );
    return true;
  }
""",
)

replace_once(
    "src/services/PlannerRepository.ts",
    """  async reorderVisits(date: string, orderedVisitIds: string[]): Promise<number> {
    const visits = await this.listVisits();
    const byId = new Map(visits.map((visit) => [visit.id, visit] as const));
    const ordered = orderedVisitIds
      .map((id) => byId.get(id))
      .filter((visit): visit is PlannerTripVisit => Boolean(visit) && visit!.date === date);
    let written = 0;
    for (let index = 0; index < ordered.length; index += 1) {
      const visit = ordered[index];
      if (visit.sort_order === index) continue;
      await this.upsertVisit({ ...visit, sort_order: index, updated_at: new Date().toISOString() });
      written += 1;
    }
    return written;
  }
""",
    """  async reorderVisits(date: string, orderedVisitIds: string[]): Promise<number> {
    if (orderedVisitIds.length === 0) return 0;
    const visits = await this.listVisits();
    const byId = new Map(visits.map((visit) => [visit.id, visit] as const));
    const resolved = orderedVisitIds.map((id) => byId.get(id));
    if (resolved.some((visit) => !visit)) throw new Error('Planner reorder contains an unknown visit.');
    const ordered = resolved as PlannerTripVisit[];
    const tripId = ordered[0].trip_id;
    if (ordered.some((visit) => visit.trip_id !== tripId || visit.date !== date)) {
      throw new Error('Planner reorder must stay within one trip and one day.');
    }
    const dayVisits = visits.filter((visit) => visit.trip_id === tripId && visit.date === date);
    const requestedIds = new Set(orderedVisitIds);
    if (dayVisits.length !== ordered.length || dayVisits.some((visit) => !requestedIds.has(visit.id))) {
      throw new Error('Planner reorder must contain every visit in the trip day exactly once.');
    }
    let written = 0;
    for (let index = 0; index < ordered.length; index += 1) {
      const visit = ordered[index];
      if (visit.sort_order === index) continue;
      await this.upsertVisit({ ...visit, sort_order: index, updated_at: new Date().toISOString() });
      written += 1;
    }
    return written;
  }
""",
)

replace_once(
    "src/services/PlannerRepository.ts",
    """  async setStaySpan(hotelPlaceId: string, dates: string[]): Promise<PlannerTripVisit[]> {
    const place = (await this.listPlaces()).find((item) => item.id === hotelPlaceId && item.kind === 'stay' && item.state !== 'dropped');
    if (!place) throw new Error(`Planner stay place was not found: ${hotelPlaceId}`);
    const visits = await this.listVisits();
    const tripPlaces = new Map((await this.listPlaces()).map((item) => [item.id, item] as const));
    const dateSet = new Set(dates);
    const stale = visits.filter((visit) => {
      if (visit.trip_id !== place.trip_id || !dateSet.has(visit.date)) return false;
      return tripPlaces.get(visit.place_id)?.kind === 'stay';
    });
    for (const visit of stale) await this.removeVisit(visit.id);
    const created: PlannerTripVisit[] = [];
    for (const date of dates) {
      const visit = await this.addVisit(hotelPlaceId, date, {
        sort_order: 0,
        locked: true,
        is_anchor: true,
        anchor_type: 'stay_checkin',
      });
      if (visit) created.push(visit);
    }
    return created;
  }
""",
    """  async setStaySpan(hotelPlaceId: string, dates: string[]): Promise<PlannerTripVisit[]> {
    const place = (await this.listPlaces()).find((item) => item.id === hotelPlaceId && item.kind === 'stay' && item.state !== 'dropped');
    if (!place) throw new Error(`Planner stay place was not found: ${hotelPlaceId}`);
    const targetDates = [...new Set(dates)].sort();
    if (targetDates.length === 0) throw new Error('Planner stay span requires at least one date.');
    const dateSet = new Set(targetDates);
    const visits = await this.listVisits();
    const tripPlaces = new Map(
      (await this.listPlaces())
        .filter((item) => item.trip_id === place.trip_id)
        .map((item) => [item.id, item] as const),
    );
    const existingHotelVisits = visits
      .filter((visit) => visit.trip_id === place.trip_id && visit.place_id === place.id)
      .sort((left, right) => left.date.localeCompare(right.date) || left.sort_order - right.sort_order || left.id.localeCompare(right.id));
    const keepByDate = new Map<string, PlannerTripVisit>();
    for (const visit of existingHotelVisits) {
      if (
        dateSet.has(visit.date)
        && !keepByDate.has(visit.date)
        && visit.locked
        && visit.is_anchor
        && visit.anchor_type === 'stay_checkin'
      ) {
        keepByDate.set(visit.date, visit);
      }
    }
    const stale = visits.filter((visit) => {
      if (visit.trip_id !== place.trip_id || tripPlaces.get(visit.place_id)?.kind !== 'stay') return false;
      if (visit.place_id === place.id) {
        return !dateSet.has(visit.date) || keepByDate.get(visit.date)?.id !== visit.id;
      }
      return dateSet.has(visit.date);
    });
    for (const visit of stale) await this.removeVisit(visit.id);
    const result: PlannerTripVisit[] = [];
    for (const date of targetDates) {
      const existing = keepByDate.get(date);
      if (existing) {
        result.push(existing);
        continue;
      }
      const visit = await this.addVisit(hotelPlaceId, date, {
        sort_order: 0,
        locked: true,
        is_anchor: true,
        anchor_type: 'stay_checkin',
      });
      if (visit) result.push(visit);
    }
    return result;
  }
""",
)

replace_once(
    "scripts/shared/ownly-write-service.ts",
    """  prepareReorderDay(date: string, visitId: string, delta: -1 | 1): PreparedOwnlyOperation {
    const entries = listPlannerVisits(this.dataLocation)
      .filter((entry) => entry.frontmatter.date === date)
      .sort((left, right) => left.frontmatter.sort_order - right.frontmatter.sort_order);
    const index = entries.findIndex((entry) => entry.frontmatter.id === visitId);
""",
    """  prepareReorderDay(date: string, visitId: string, delta: -1 | 1): PreparedOwnlyOperation {
    const selectedEntry = this.plannerVisitEntry(visitId);
    const selectedVisit = selectedEntry.frontmatter as PlannerTripVisit;
    if (selectedVisit.date !== date) {
      throw new OwnlyMutationError('Reorder date does not match the selected visit.', 'INVALID_INPUT');
    }
    const entries = listPlannerVisits(this.dataLocation)
      .filter((entry) => entry.frontmatter.trip_id === selectedVisit.trip_id && entry.frontmatter.date === date)
      .sort((left, right) => left.frontmatter.sort_order - right.frontmatter.sort_order);
    const index = entries.findIndex((entry) => entry.frontmatter.id === visitId);
""",
)

replace_once(
    "scripts/shared/ownly-write-service.ts",
    """    return this.prepare('planner_reorder_day', {
      date,
      changes: targets.map(({ next }) => ({ visit_id: next.id, place_id: next.place_id, sort_order: next.sort_order })),
""",
    """    return this.prepare('planner_reorder_day', {
      trip_id: selectedVisit.trip_id,
      date,
      changes: targets.map(({ next }) => ({ visit_id: next.id, place_id: next.place_id, sort_order: next.sort_order })),
""",
)

replace_once(
    "scripts/shared/ownly-write-service.ts",
    """  prepareSetStaySpan(hotelPlaceId: string, dates: string[]): PreparedOwnlyOperation {
    const hotelEntry = findPlannerEntry(listPlannerPlaces(this.dataLocation), hotelPlaceId);
    if (!hotelEntry || hotelEntry.frontmatter.kind !== 'stay' || hotelEntry.frontmatter.state === 'dropped') {
      throw new OwnlyMutationError(`Hotel place was not found: ${hotelPlaceId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    }
    const hotel = hotelEntry.frontmatter;
    const dateSet = new Set(dates);
    const placeById = new Map(
      listPlannerPlaces(this.dataLocation)
        .filter((entry) => entry.frontmatter.trip_id === hotel.trip_id)
        .map((entry) => [entry.frontmatter.id, entry.frontmatter] as const),
    );
    const visitEntries = listPlannerVisits(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === hotel.trip_id);
    const stale = visitEntries.filter((entry) => dateSet.has(entry.frontmatter.date) && placeById.get(entry.frontmatter.place_id)?.kind === 'stay');
    const timestamp = this.now();
    const created = dates.map((date) => createPlannerTripVisit(hotel, date, 0, {
      locked: true,
      is_anchor: true,
      anchor_type: 'stay_checkin',
    }, timestamp, randomUUID()));
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.visits);
    const createTargets = created.map((visit) => {
      const fileName = plannerTripVisitFileName(visit.id);
      const filePath = join(directory, fileName);
      return { visit, fileName, filePath, expected: fingerprint(filePath) };
    });
    const staleTargets = stale.map((entry) => ({ entry, expected: fingerprint(entry.filePath) }));

    return this.prepare(
      'planner_set_stay_span',
      {
        hotel: hotel.title,
        dates,
        creates: created.map((visit) => ({ visit_id: visit.id, date: visit.date })),
        retires_visit_ids: stale.map((entry) => entry.frontmatter.id),
      },
      () => {
        for (const target of staleTargets) assertUnchanged(target.entry.filePath, target.expected);
        for (const target of createTargets) assertUnchanged(target.filePath, target.expected);
        for (const target of staleTargets) unlinkSync(target.entry.filePath);
        mkdirSync(directory, { recursive: true });
        for (const target of createTargets) writeFileSync(target.filePath, serializeMarkdownEntity(target.visit, ''), 'utf8');
        return { hotel_id: hotelPlaceId, nights: dates.length, retired_visits: stale.length, created_visits: created.length };
      },
    );
  }
""",
    """  prepareSetStaySpan(hotelPlaceId: string, dates: string[]): PreparedOwnlyOperation {
    const hotelEntry = findPlannerEntry(listPlannerPlaces(this.dataLocation), hotelPlaceId);
    if (!hotelEntry || hotelEntry.frontmatter.kind !== 'stay' || hotelEntry.frontmatter.state === 'dropped') {
      throw new OwnlyMutationError(`Hotel place was not found: ${hotelPlaceId}`, 'NOT_FOUND' as OwnlyMutationErrorCode);
    }
    const hotel = hotelEntry.frontmatter;
    const targetDates = [...new Set(dates)].sort();
    if (targetDates.length === 0) throw new OwnlyMutationError('Stay span requires at least one date.', 'INVALID_INPUT');
    const dateSet = new Set(targetDates);
    const placeById = new Map(
      listPlannerPlaces(this.dataLocation)
        .filter((entry) => entry.frontmatter.trip_id === hotel.trip_id)
        .map((entry) => [entry.frontmatter.id, entry.frontmatter] as const),
    );
    const visitEntries = listPlannerVisits(this.dataLocation).filter((entry) => entry.frontmatter.trip_id === hotel.trip_id);
    const targetHotelEntries = visitEntries
      .filter((entry) => entry.frontmatter.place_id === hotel.id)
      .sort((left, right) => left.frontmatter.date.localeCompare(right.frontmatter.date)
        || left.frontmatter.sort_order - right.frontmatter.sort_order
        || left.frontmatter.id.localeCompare(right.frontmatter.id));
    const keepByDate = new Map<string, (typeof targetHotelEntries)[number]>();
    for (const entry of targetHotelEntries) {
      const visit = entry.frontmatter as PlannerTripVisit;
      if (
        dateSet.has(visit.date)
        && !keepByDate.has(visit.date)
        && visit.locked
        && visit.is_anchor
        && visit.anchor_type === 'stay_checkin'
      ) {
        keepByDate.set(visit.date, entry);
      }
    }
    const stale = visitEntries.filter((entry) => {
      const visit = entry.frontmatter as PlannerTripVisit;
      if (placeById.get(visit.place_id)?.kind !== 'stay') return false;
      if (visit.place_id === hotel.id) {
        return !dateSet.has(visit.date) || keepByDate.get(visit.date)?.frontmatter.id !== visit.id;
      }
      return dateSet.has(visit.date);
    });
    const timestamp = this.now();
    const created = targetDates
      .filter((date) => !keepByDate.has(date))
      .map((date) => createPlannerTripVisit(hotel, date, 0, {
        locked: true,
        is_anchor: true,
        anchor_type: 'stay_checkin',
      }, timestamp, randomUUID()));
    const directory = join(resolve(this.dataLocation), PLANNER_DIRECTORIES.visits);
    const createTargets = created.map((visit) => {
      const fileName = plannerTripVisitFileName(visit.id);
      const filePath = join(directory, fileName);
      return { visit, fileName, filePath, expected: fingerprint(filePath) };
    });
    const staleTargets = stale.map((entry) => ({ entry, expected: fingerprint(entry.filePath) }));

    return this.prepare(
      'planner_set_stay_span',
      {
        hotel: hotel.title,
        dates: targetDates,
        creates: created.map((visit) => ({ visit_id: visit.id, date: visit.date })),
        keeps: [...keepByDate.values()].map((entry) => ({ visit_id: entry.frontmatter.id, date: entry.frontmatter.date })),
        retires_visit_ids: stale.map((entry) => entry.frontmatter.id),
      },
      () => {
        for (const target of staleTargets) assertUnchanged(target.entry.filePath, target.expected);
        for (const target of createTargets) assertUnchanged(target.filePath, target.expected);
        for (const target of staleTargets) unlinkSync(target.entry.filePath);
        if (createTargets.length > 0) mkdirSync(directory, { recursive: true });
        for (const target of createTargets) writeFileSync(target.filePath, serializeMarkdownEntity(target.visit, ''), 'utf8');
        return { hotel_id: hotelPlaceId, nights: targetDates.length, retired_visits: stale.length, created_visits: created.length };
      },
    );
  }
""",
)

replace_once(
    "scripts/shared/ownly-write-service.ts",
    """  prepareDropPlannerPlace(placeId: string): PreparedOwnlyOperation {
    const entry = this.plannerPlaceEntry(placeId);
    const before = entry.frontmatter;
    const next = { ...before, state: 'dropped' as const };
""",
    """  prepareDropPlannerPlace(placeId: string): PreparedOwnlyOperation {
    const entry = this.plannerPlaceEntry(placeId);
    const before = entry.frontmatter;
    const blockingVisits = listPlannerVisits(this.dataLocation).filter(
      (visit) => visit.frontmatter.trip_id === before.trip_id && visit.frontmatter.place_id === placeId,
    );
    if (blockingVisits.length > 0) {
      throw new OwnlyMutationError(
        `Cannot drop ${before.title}: remove ${blockingVisits.length} scheduled visit(s) first.`,
        'INVALID_INPUT',
      );
    }
    const next = { ...before, state: 'dropped' as const };
""",
)

replace_once(
    "src/components/planner/PlannerHome.tsx",
    """  const scheduled = useMemo(
    () => sortPlannerScheduledPlaces(scheduledAll.filter((place) => place.scheduled_date === activeDate)),
    [activeDate, scheduledAll],
  );

  const tripLegs = useMemo(
""",
    """  const scheduled = useMemo(
    () => sortPlannerScheduledPlaces(scheduledAll.filter((place) => place.scheduled_date === activeDate)),
    [activeDate, scheduledAll],
  );

  // The map is a spatial Place projection, not an occurrence timeline. Collapse
  // repeated Visits for one Place while keeping every Visit in the day timeline.
  const mapScheduled = useMemo(() => {
    const seen = new Set<string>();
    return scheduled.filter((place) => {
      if (seen.has(place.place_id)) return false;
      seen.add(place.place_id);
      return true;
    });
  }, [scheduled]);
  const mapScheduledPlaceIds = useMemo(
    () => new Set(mapScheduled.map((place) => place.place_id)),
    [mapScheduled],
  );

  const tripLegs = useMemo(
""",
)

replace_once(
    "src/components/planner/PlannerHome.tsx",
    """  const handleDropHotel = useCallback(async (hotelId: string) => {
    if (!hotelId || disabled) return;
    await plannerRepository.dropPlace(hotelId);
    await load();
  }, [disabled, load]);
""",
    """  const handleDropHotel = useCallback(async (hotelId: string) => {
    if (!hotelId || disabled) return;
    try {
      await plannerRepository.dropPlace(hotelId);
      await load();
    } catch {
      setNotice(zh ? '该酒店仍在行程中，请先移除对应的住宿 Visit。' : 'This hotel is still scheduled. Remove its stay Visits first.');
      setTimeout(() => setNotice(''), 4000);
    }
  }, [disabled, load, zh]);
""",
)

replace_once(
    "src/components/planner/PlannerHome.tsx",
    """  const mustTotal = tripPlaces.filter((place) => place.priority === 'must').length;
  const mustScheduled = scheduledAll.filter((place) => place.priority === 'must').length;
""",
    """  const mustTotal = tripPlaces.filter((place) => place.priority === 'must').length;
  const mustScheduled = new Set(
    scheduledAll.filter((place) => place.priority === 'must').map((place) => place.place_id),
  ).size;
""",
)

replace_once(
    "src/components/planner/PlannerHome.tsx",
    """                scheduledPlaces={scheduled}
                candidatePlaces={filteredCandidates}
""",
    """                scheduledPlaces={mapScheduled}
                candidatePlaces={filteredCandidates.filter((place) => !mapScheduledPlaceIds.has(place.id))}
""",
)

replace_once(
    "src/components/planner/PlannerHome.tsx",
    """                scheduledPlaces={scheduled}
                candidatePlaces={sortedCandidates}
""",
    """                scheduledPlaces={mapScheduled}
                candidatePlaces={sortedCandidates.filter((place) => !mapScheduledPlaceIds.has(place.id))}
""",
)

replace_once(
    "src/services/PlannerRepository.schedule.test.ts",
    """  it('reorders occurrences, including repeated places, by visit id', async () => {
    const first = await plannerRepository.addVisit('a', '2026-11-01');
    const repeated = await plannerRepository.addVisit('a', '2026-11-01');
    const third = await plannerRepository.addVisit('b', '2026-11-01');
    await plannerRepository.reorderVisits('2026-11-01', [third!.id, repeated!.id, first!.id]);
    const visits = (await plannerRepository.listVisits())
      .filter((item) => item.date === '2026-11-01')
      .sort((left, right) => left.sort_order - right.sort_order);
    expect(visits.map((item) => item.id)).toEqual([third!.id, repeated!.id, first!.id]);
  });
""",
    """  it('reorders occurrences, including repeated places, by visit id', async () => {
    const first = await plannerRepository.addVisit('a', '2026-11-01');
    const repeated = await plannerRepository.addVisit('a', '2026-11-01');
    const third = await plannerRepository.addVisit('b', '2026-11-01');
    await plannerRepository.reorderVisits('2026-11-01', [third!.id, repeated!.id, first!.id]);
    const visits = (await plannerRepository.listVisits())
      .filter((item) => item.trip_id === 'trip-1' && item.date === '2026-11-01')
      .sort((left, right) => left.sort_order - right.sort_order);
    expect(visits.map((item) => item.id)).toEqual([third!.id, repeated!.id, first!.id]);
  });

  it('rejects cross-trip and partial day reorder payloads', async () => {
    await seed([place('other', { trip_id: 'trip-2' })]);
    const first = await plannerRepository.addVisit('a', '2026-11-01');
    const second = await plannerRepository.addVisit('b', '2026-11-01');
    const other = await plannerRepository.addVisit('other', '2026-11-01');
    await expect(plannerRepository.reorderVisits('2026-11-01', [first!.id, other!.id])).rejects.toThrow(/one trip/i);
    await expect(plannerRepository.reorderVisits('2026-11-01', [first!.id])).rejects.toThrow(/every visit/i);
    expect((await plannerRepository.listVisits()).find((item) => item.id === second!.id)?.sort_order).toBe(1);
  });
""",
)

replace_once(
    "src/services/PlannerRepository.schedule.test.ts",
    """  it('sets a hotel span as repeatable locked visits without cloning the hotel place', async () => {
    const created = await plannerRepository.setStaySpan('hotel', ['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(created).toHaveLength(3);
    expect(created.every((item) => item.place_id === 'hotel' && item.locked && item.is_anchor)).toBe(true);
    expect((await plannerRepository.listPlaces()).filter((item) => item.id === 'hotel')).toHaveLength(1);
  });
""",
    """  it('replaces a hotel span without leaving stale dates and is idempotent', async () => {
    const first = await plannerRepository.setStaySpan('hotel', ['2026-11-01', '2026-11-02', '2026-11-03']);
    const firstByDate = new Map(first.map((visit) => [visit.date, visit.id] as const));
    const shifted = await plannerRepository.setStaySpan('hotel', ['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(shifted.map((item) => item.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(shifted.find((item) => item.date === '2026-11-02')?.id).toBe(firstByDate.get('2026-11-02'));
    expect(shifted.find((item) => item.date === '2026-11-03')?.id).toBe(firstByDate.get('2026-11-03'));
    expect((await plannerRepository.listVisits()).filter((item) => item.place_id === 'hotel').map((item) => item.date).sort())
      .toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    const repeated = await plannerRepository.setStaySpan('hotel', ['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(repeated.map((item) => item.id)).toEqual(shifted.map((item) => item.id));
    expect((await plannerRepository.listPlaces()).filter((item) => item.id === 'hotel')).toHaveLength(1);
  });

  it('blocks dropping a Place while a Visit still references it', async () => {
    const visit = await plannerRepository.addVisit('a', '2026-11-01');
    await expect(plannerRepository.dropPlace('a')).rejects.toThrow(/remove 1 scheduled visit/i);
    await plannerRepository.removeVisit(visit!.id);
    expect(await plannerRepository.dropPlace('a')).toBe(true);
  });
""",
)

replace_once(
    "scripts/shared/ownly-write-service.test.ts",
    """  it('commits an optimized Visit order and its final adjacent canonical legs in one confirmed operation', async () => {
""",
    """  it('keeps manual reorder scoped to the selected Visit trip', async () => {
    const { dataRoot } = fixture();
    const { trip, from, toVisit } = seedPlannerPair(dataRoot);
    const otherTrip: PlannerTrip = { ...trip, id: 'trip-2', title: 'Osaka' };
    const otherPlace: PlannerTripPlace = { ...from, id: 'other', trip_id: otherTrip.id, title: 'Other' };
    const otherVisit: PlannerTripVisit = {
      schema_version: '0.1', type: 'trip_visit', id: 'visit:other', trip_id: otherTrip.id, place_id: otherPlace.id,
      date: '2026-10-05', sort_order: 0, locked: false, is_anchor: false, created_at: NOW.toISOString(),
    };
    writeFileSync(join(dataRoot, 'Trips', 'trip--trip-2.md'), serializeMarkdownEntity(otherTrip, ''), 'utf8');
    writeFileSync(join(dataRoot, 'Trip Places', 'place--other.md'), serializeMarkdownEntity(otherPlace, ''), 'utf8');
    writeFileSync(join(dataRoot, 'Trip Visits', 'visit--other.md'), serializeMarkdownEntity(otherVisit, ''), 'utf8');

    const service = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });
    const prepared = service.prepareReorderDay('2026-10-05', toVisit.id, -1);
    await service.commit(prepared.operation_id);
    const storedOther = parseMarkdownEntity<PlannerTripVisit>(
      readFileSync(join(dataRoot, 'Trip Visits', 'visit--other.md'), 'utf8'),
    ).frontmatter;
    expect(storedOther.sort_order).toBe(0);
  });

  it('replaces stay spans, preserves unchanged Visit ids, and becomes a no-churn repeat', async () => {
    const { dataRoot } = fixture();
    const { from } = seedPlannerPair(dataRoot);
    const hotel: PlannerTripPlace = { ...from, id: 'hotel', kind: 'stay', title: 'Hotel' };
    writeFileSync(join(dataRoot, 'Trip Places', 'place--hotel.md'), serializeMarkdownEntity(hotel, ''), 'utf8');
    const service = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });

    await service.commit(service.prepareSetStaySpan('hotel', ['2026-10-05', '2026-10-06', '2026-10-07']).operation_id);
    const first = readdirSync(join(dataRoot, 'Trip Visits'))
      .map((file) => parseMarkdownEntity<PlannerTripVisit>(readFileSync(join(dataRoot, 'Trip Visits', file), 'utf8')).frontmatter)
      .filter((visit) => visit.place_id === 'hotel');
    const firstByDate = new Map(first.map((visit) => [visit.date, visit.id] as const));

    await service.commit(service.prepareSetStaySpan('hotel', ['2026-10-06', '2026-10-07', '2026-10-08']).operation_id);
    const shifted = readdirSync(join(dataRoot, 'Trip Visits'))
      .map((file) => parseMarkdownEntity<PlannerTripVisit>(readFileSync(join(dataRoot, 'Trip Visits', file), 'utf8')).frontmatter)
      .filter((visit) => visit.place_id === 'hotel')
      .sort((left, right) => left.date.localeCompare(right.date));
    expect(shifted.map((visit) => visit.date)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08']);
    expect(shifted[0].id).toBe(firstByDate.get('2026-10-06'));
    expect(shifted[1].id).toBe(firstByDate.get('2026-10-07'));

    const repeat = service.prepareSetStaySpan('hotel', ['2026-10-06', '2026-10-07', '2026-10-08']);
    expect(repeat.preview).toMatchObject({ creates: [], retires_visit_ids: [] });
    await service.commit(repeat.operation_id);
    expect(readdirSync(join(dataRoot, 'Trip Visits'))
      .map((file) => parseMarkdownEntity<PlannerTripVisit>(readFileSync(join(dataRoot, 'Trip Visits', file), 'utf8')).frontmatter)
      .filter((visit) => visit.place_id === 'hotel')).toHaveLength(3);
  });

  it('refuses to drop a Planner Place while a Visit references it', () => {
    const { dataRoot } = fixture();
    const { from } = seedPlannerPair(dataRoot);
    const service = new OwnlyWriteService(dataRoot, { allowWrite: true, now: () => NOW });
    expect(() => service.prepareDropPlannerPlace(from.id)).toThrow(/remove 1 scheduled visit/i);
  });

  it('commits an optimized Visit order and its final adjacent canonical legs in one confirmed operation', async () => {
""",
)

replace_once(
    "package.json",
    '"test:mcp": "vitest run src/domain/planner-schedule.test.ts src/domain/planner-route-time.test.ts scripts/mcp/ownly-tools.test.ts scripts/mcp/openrouteservice.test.ts scripts/shared/ownly-write-service.test.ts"',
    '"test:mcp": "vitest run src/domain/planner-schedule.test.ts src/domain/planner-route-time.test.ts src/services/PlannerRepository.schedule.test.ts scripts/mcp/ownly-tools.test.ts scripts/mcp/openrouteservice.test.ts scripts/shared/ownly-write-service.test.ts"',
)
