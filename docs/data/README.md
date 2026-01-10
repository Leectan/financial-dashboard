# Static Data Directory

This directory contains pinned datasets for reproducible research and backtesting. All data files should be versioned and checksummed.

## Directory Structure

```
docs/data/
  README.md           # This file
  *.csv               # Pinned datasets (versioned)
  *.sha256            # Checksums for verification
```

## Data Provenance Requirements

Each dataset must have documented:

1. **Source URL** - Original data location
2. **Access Date** - When the data was downloaded (UTC)
3. **License/Terms** - Any usage restrictions
4. **Schema** - Column definitions and units
5. **Transformations** - Any processing applied

## Currently Used Datasets

### FRED (Federal Reserve Economic Data)

Live data fetched via API. Not pinned here.

| Series ID | Description | Start Date | Frequency |
|-----------|-------------|------------|-----------|
| BAMLH0A0HYM2 | ICE BofA US High Yield OAS | 1996-12-31 | Daily |
| BAMLC0A0CM | ICE BofA US Corporate Index OAS | 1996-12-31 | Daily |
| BAMLC0A4CBBB | ICE BofA BBB US Corporate Index OAS | 1996-12-31 | Daily |
| VIXCLS | CBOE Volatility Index | 1990-01-02 | Daily |
| T10Y2Y | 10Y-2Y Treasury Spread | 1976-06-01 | Daily |
| WALCL | Fed Balance Sheet | 2002-12-18 | Weekly |
| WTREGEN | Treasury General Account | 2015-05-06 | Weekly |
| RRPONTSYD | Overnight Reverse Repo | 2013-09-23 | Daily |
| USREC | NBER Recession Indicator | 1854-12-01 | Monthly |

### NY Fed Markets API

Live data fetched via API. Not pinned here.

- Standing Repo Facility operations (SRF)
- SOMA Treasury holdings

## Adding a New Pinned Dataset

### 1. Download and Version

```bash
# Download with timestamp
curl -o dataset_v2024-01-15.csv "https://source-url/data.csv"

# Compute checksum
shasum -a 256 dataset_v2024-01-15.csv > dataset_v2024-01-15.sha256
```

### 2. Document Provenance

Add an entry to this README with:
- Source URL
- Access timestamp (UTC)
- License terms
- Column schema
- Any transformations applied

### 3. Verify Before Commit

```bash
# Verify checksum
shasum -c dataset_v2024-01-15.sha256
```

## Future Datasets (Planned)

### Robert Shiller Long-Run Data

For 100+ year equity and macro research:

- **Source**: `http://www.econ.yale.edu/~shiller/data.htm`
- **Contents**: S&P composite, dividends, earnings, CAPE, CPI, long rates
- **Use Case**: Deep historical regime analysis and drawdown studies
- **Status**: Not yet pinned - will add when implementing long-horizon backtests

### NBER Recession Dates

- **Source**: `https://www.nber.org/research/data/us-business-cycle-expansions-and-contractions`
- **Note**: Currently using FRED USREC series instead (functionally equivalent)

## Data Ethics & Reproducibility Notes

1. **Revisions**: Many macro series can be revised historically. Backtests may differ from "real-time" vintages unless explicitly using ALFRED/real-time datasets.

2. **Lookahead Bias**: The research engine applies publication lags to avoid using data that wouldn't have been available at the time.

3. **No Silent Updates**: Never overwrite existing versioned files. Create new versions when updating.

4. **Citation**: Always cite original sources in any published analysis.
