# Armor Importer

Local CLI for validating armor records and adding them to both MHWBuilder databases.

## Folders

- `inbox/`: drop unprocessed armor screenshots here.
- `drafts/generated/`: OCR output; safe to regenerate.
- `drafts/reviewed/`: records you have checked and are ready to apply.
- `processed/`: screenshots that have already been imported.

The contents of these folders are intentionally ignored by Git.

## Current workflow

1. Put all screenshots in `inbox/`.
2. Run `npm run armor-importer -- --scan-inbox`.
3. Review the generated records and move approved files from `drafts/generated/` to `drafts/reviewed/`.
4. Preview the exact compact and detailed entries:

```powershell
npm run armor-importer -- --input tools/armor-importer/drafts/reviewed/rey-sandhelm-gamma.json
```

5. Apply the reviewed record:

```powershell
npm run armor-importer -- --input tools/armor-importer/drafts/reviewed/rey-sandhelm-gamma.json --apply
```

Existing names are rejected by default. Use `--overwrite` only when intentionally correcting an existing entry.
Unknown skills and bonuses are also rejected by default because their descriptions, maximum levels, IDs, and other
metadata must be imported separately.

## Draft format

```json
{
    "name": "Rey Sandhelm Gamma",
    "type": "head",
    "rarity": 8,
    "rank": "high",
    "defense": 68,
    "slots": [3],
    "resistances": {
        "fire": 0,
        "water": -2,
        "thunder": 4,
        "ice": -3,
        "dragon": 0
    },
    "skills": {
        "Weakness Exploit": 1,
        "Maximum Might": 1,
        "Stamina Surge": 1
    },
    "setSkills": ["Rey Dau's Voltage"],
    "groupSkills": ["Lord's Soul"],
    "description": ""
}
```

The scanner generates drafts automatically. Repository writes remain a separate final step so extracted values can be
reviewed before modifying production data.

## OCR behavior

The scanner uses the Windows OCR engine locally; screenshots are not uploaded anywhere. It groups multiple images by
the detected armor name and combines stats, equipment skills, Set Bonuses, and Group Skills. `_importer.reviewRequired`
lists fields that could not be read with sufficient evidence. Colored resistance numbers, skill levels, and slot icons
can require review. A future template-classification stage will target slot icons specifically.
