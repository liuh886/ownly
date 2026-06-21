# Naming Compatibility Guide

## Public vs Internal Naming

- **Public Product Name:** Ownly
- **Legacy / Internal Alias:** WYQD (物欲清单)

## Why Two Names?

The project started internally as "WYQD" (an acronym for 物欲清单, meaning "Material Desire Checklist"). As the product evolved to focus more holistically on decision making, reviews, and experience tracking, the public-facing name was changed to **Ownly**.

To maintain backward compatibility and avoid breaking existing users' data, internal storage keys and package aliases have not been aggressively renamed.

## What to Expect

1. **User Interface & Documentation:** Everywhere facing the user (UI, README, plugin name, store listings) uses **Ownly**.
2. **Command Line Interface:** The CLI is invoked via the legacy alias: `npm run wyqd`. We refer to this as the "Ownly CLI" in documentation, but the package script name remains `wyqd` for now.
3. **Storage & Plugins:** Obsidian view types, CSS classes, and local storage keys may still contain `wyqd`. Do not change these in existing code, as doing so would break user data or plugin recognition.
4. **Source Code:** You will see a mix of `Ownly` and `WYQD` in the repository. Treat them interchangeably as referring to the same project. 
