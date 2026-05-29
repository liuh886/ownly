'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { searchCities, type CitySearchResult } from '@/domain/travel';
import { useI18n } from '@/core/i18n-context';

interface CitySearchInputProps {
  onSelect: (city: {
    name: string;
    country: string;
    countryCode: string;
    latitude: number;
    longitude: number;
  }) => void;
  initialValue?: string;
  disabled?: boolean;
}

export function CitySearchInput({ onSelect, initialValue, disabled }: CitySearchInputProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState(initialValue || '');
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (value.trim().length > 0) {
      const matches = searchCities(value, 8);
      setResults(matches);
      setIsOpen(true);
      setHighlightIndex(-1);
    } else {
      setResults([]);
      setIsOpen(false);
    }
  }, []);

  const handleSelect = useCallback((city: CitySearchResult) => {
    setQuery(city.displayName);
    setIsOpen(false);
    setResults([]);
    onSelect({
      name: city.name,
      country: city.countryCode,
      countryCode: city.countryCode,
      latitude: city.latitude,
      longitude: city.longitude,
    });
  }, [onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < results.length) {
          handleSelect(results[highlightIndex]);
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    },
    [isOpen, results, highlightIndex, handleSelect],
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true);
        }}
        placeholder={t('citySearchPlaceholder')}
        disabled={disabled}
        className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-400"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="city-search-listbox"
        aria-autocomplete="list"
      />
      {isOpen && query.trim().length > 0 ? (
        results.length > 0 ? (
          <ul
            id="city-search-listbox"
            role="listbox"
            className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
          >
            {results.map((city, i) => (
              <li
                key={`${city.name}-${city.countryCode}`}
                role="option"
                aria-selected={i === highlightIndex}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  i === highlightIndex ? 'bg-stone-100 text-stone-950' : 'text-stone-700 hover:bg-stone-50'
                }`}
                onMouseEnter={() => setHighlightIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(city);
                }}
              >
                <span className="font-medium">{city.displayName}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-400 shadow-lg">
            {t('citySearchNoResults')}
          </div>
        )
      ) : null}
    </div>
  );
}
