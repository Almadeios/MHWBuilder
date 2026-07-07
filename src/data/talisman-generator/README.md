# Talisman Generator Data

This folder is the workbook export target for generated talismans.

`rules.json` has two top-level keys:

- `templates`: rows from the `Talisman` sheet.
- `groups`: skill groups from the `SkillGroups` sheet.

Template example:

```json
{
  "rarity": "RARE[5]",
  "skillGroups": [1, 8, 6],
  "slotCombos": [[1, 1], [2, 0], [2, 1], [3, 0], ["W1", 1]]
}
```

Group example:

```json
{
  "1": [
    { "skill": "Attack Boost", "maxLevel": 1 },
    { "skill": "Artillery", "maxLevel": 1 }
  ]
}
```

Generated talismans disallow duplicate skills across all rolled skill groups.
