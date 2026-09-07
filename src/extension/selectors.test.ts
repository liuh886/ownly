import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackSelector } from './selectors';

const sendMessage = vi.fn().mockResolvedValue({});

vi.stubGlobal('chrome', {
  runtime: { sendMessage },
});

beforeEach(() => sendMessage.mockClear());

describe('trackSelector', () => {
  it('reports drift once when data provably exists but the selector misses', () => {
    trackSelector('rating', null, true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'OWNLY_SELECTOR_DRIFT',
      selector: 'rating',
    }));

    // Second miss while still drifted: no spam.
    trackSelector('rating', null, true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the data is genuinely absent', () => {
    trackSelector('reviewCount', null, false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('stays silent on hits that were never reported', () => {
    trackSelector('address', {}, true);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('self-heals: a later hit clears the report and re-arms detection', () => {
    trackSelector('priceBadge', null, true);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    trackSelector('priceBadge', {}, true);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'OWNLY_SELECTOR_RECOVERED',
      selector: 'priceBadge',
    }));

    // Drift again after recovery: reported anew.
    trackSelector('priceBadge', null, true);
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'OWNLY_SELECTOR_DRIFT',
    }));
  });
});
