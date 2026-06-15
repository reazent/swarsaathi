# Labels (ground truth)

Edit **`labels.xlsx`** — not the CSV directly. The CSV is generated from Excel.

## Files

| File | Purpose |
|------|---------|
| `labels.xlsx` | **You edit this** (sheet `labels`) |
| `labels.csv` | Generated for scripts/training — run sync after Excel changes |
| `audio/` | One audio file per row (`.wav` or `.mp3`) |

## Excel columns

**Auto-filled from audio metadata** (never edit by hand — `fill_labels_from_audio.py` writes these):

| Column | Source tag | Example |
|--------|-----------|---------|
| `track_id` | derived | `tum-bin-jaoon-kahan-mohd-rafi-1969` |
| `title` | `©nam` | Tum Bin Jaoon Kahan |
| `film` | `©alb` | Pyar Ka Mausam (… Soundtrack) |
| `year` | `©day` | 1969 |
| `singer` | `©ART` (first) | Mohd. Rafi |
| `artists` | `©ART` | Mohd. Rafi |
| `music_director` | `aART` | R.D. Burman |
| `writers` | `©wrt` | R.D. Burman & Majrooh Sultanpuri |
| `genre` | `©gen` | Bollywood |
| `label` | `©cprt` | Saregama |
| `isrc` | `xid` | INH100161270 |
| `track_no` | `trkn` | 1 |
| `audio_filename` | file | `01 Tum Bin Jaoon Kahan.m4a` |

**You fill manually:**

| Column | Example |
|--------|---------|
| `sa_note` | `G` |
| `verified` | `true` or `false` |
| `notes` | optional |

Row 1 = headers, row 2 = hint text (not synced), row 3+ = data.
Only `sa_note`, `verified`, `notes` are manual — everything else comes from metadata. These facets power discovery queries later (e.g. "Rafi songs by R.D. Burman in the 1960s in D pitch").

## Auto-fill metadata from iTunes / audio files

After you copy purchases into `audio/`, close Excel, then run:

```bash
cd ~/Projects/indian-pitch
pip3 install -r requirements.txt   # once
python3 scripts/fill_labels_from_audio.py
```

This reads **embedded tags** (iTunes `.m4a` works well) and **appends new rows** to `labels.xlsx`:

- **Filled:** `track_id`, `title`, `film` (from album/soundtrack), `year`, `singer`, `audio_filename`
- **Left blank:** `sa_note`, `verified`, `notes`

Skips files already listed in Excel. Preview without writing:

```bash
python3 scripts/fill_labels_from_audio.py --dry-run
```

Edit `film` in Excel if the album name is not the film title.

## Sync Excel → CSV

```bash
cd ~/Projects/indian-pitch
python3 scripts/sync_labels_from_excel.py
```

Or ask in Cursor: **“sync labels from excel to csv”**.

## Audio folder

Put files in `audio/` using the exact name in `audio_filename`. Both formats work:

- `.wav` — best for analysis (lossless)
- `.mp3` — fine for labeling and early engine work

Same `track_id` + matching filename = one training example.
