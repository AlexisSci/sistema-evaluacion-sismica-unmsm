import json
from pathlib import Path
import pandas as pd
from export_atlas import parse_date,event_id,distance_km
ROOT=Path(__file__).resolve().parents[1]

def test_iso_dates_do_not_swap_month_and_day():
    assert parse_date('1960-04-01').strftime('%Y-%m-%d')=='1960-04-01'
    assert parse_date('2020-02-29').day==29

def test_identifiers_stable_and_distinct():
    assert event_id('1960-04-01T13:18:23Z',-14.5,-73.5,100,6.1)==event_id('1960-04-01T13:18:23Z',-14.50,-73.50,100.0,6.10)
    assert event_id('a',1,2,3,4)!=event_id('b',1,2,3,4)

def test_export_matches_every_original_excel_row():
    manifest=json.loads((ROOT/'frontend/public/data/manifest.json').read_text(encoding='utf-8'))
    events=json.loads((ROOT/'frontend/public/data'/manifest['file']).read_text(encoding='utf-8'))
    original=pd.read_excel(next((ROOT/'data').glob('*.xlsx')))
    assert len(events)==len(original)==manifest['count']
    assert len({e['id'] for e in events})==len(events)
    for e in events:
        row=original.iloc[e['sourceRow']-2]
        date=(parse_date(row.iloc[0])+pd.to_timedelta(str(row.iloc[1]))).strftime('%Y-%m-%dT%H:%M:%SZ')
        assert e['date']==date
        assert [e[k] for k in ('lat','lon','depth','mag')]==[float(v) for v in row.iloc[2:6]]
    linked=[e['usgs'] for e in events if e['usgs']]
    assert len(linked)==len(set(linked))
    assert all(e.get('matchKm',0)<=75 and e.get('matchSeconds',0)<=15 for e in events)
    assert sum(e['intensity'] is not None for e in events)==manifest['counts']['intensity']
    assert manifest['model']['trainingCompatible'] is False
    assert sum(g['count'] for g in manifest['groups']['kmeans'])==len(events)
    assert sum(g['count'] for g in manifest['groups']['dbscan'])==manifest['counts']['shallow']

def test_distance():
    assert abs(distance_km(0,0,0,1)-111.195)<.01
