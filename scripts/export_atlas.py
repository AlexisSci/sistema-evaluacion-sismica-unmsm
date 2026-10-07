"""Exportación reproducible y offline. No modifica datos ni modelos originales."""
from pathlib import Path
from hashlib import sha256
import json
import math
import os
os.environ.setdefault('OMP_NUM_THREADS', '1')
import numpy as np
import pandas as pd
import joblib
from sklearn.cluster import DBSCAN

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'frontend/public/data'

def parse_date(value):
    # El contrato del Excel es ISO, nunca inferir dayfirst para estas cadenas.
    return pd.to_datetime(str(value).strip()[:10], format='%Y-%m-%d', errors='raise')

def event_id(date, lat, lon, depth, mag):
    key = f'{date}|{lat:.6f}|{lon:.6f}|{depth:.3f}|{mag:.3f}'
    return 'igp-' + sha256(key.encode()).hexdigest()[:16]

def distance_km(lat, lon, lat2, lon2):
    a,b,c,d = map(np.radians, (lat,lon,lat2,lon2))
    h = np.sin((c-a)/2)**2 + np.cos(a)*np.cos(c)*np.sin((d-b)/2)**2
    return 6371.0088 * 2 * np.arcsin(np.sqrt(np.clip(h,0,1)))

def export():
    source = next((ROOT/'data').glob('*.xlsx'))
    raw = pd.read_excel(source)
    raw.columns = ['date','time','lat','lon','depth','mag']
    old = pd.read_csv(ROOT/'data/dataset_sismico_maestro.csv')
    usgs = pd.read_csv(ROOT/'data/catalogo_usgs_peru.csv').sort_values('fecha_hora_utc').reset_index(drop=True)
    times = pd.to_datetime(usgs.fecha_hora_utc).astype('int64').to_numpy() # nanoseconds
    # pandas resolution is explicit: avoid ms/us/ns-dependent search windows.
    times = pd.to_datetime(usgs.fecha_hora_utc).to_numpy(dtype='datetime64[ns]').astype('int64')
    artifact = joblib.load(ROOT/'models/modelo_clustering.pkl')
    issues, rows, seen = [], [], set()
    for i, r in raw.iterrows():
        try:
            dt = parse_date(r.date) + pd.to_timedelta(str(r.time).strip())
            vals = [float(r.lat),float(r.lon),float(r.depth),float(r.mag)]
            if not all(math.isfinite(x) for x in vals) or not (-90<=vals[0]<=90 and -180<=vals[1]<=180 and 0<=vals[2]<=1000 and 0<=vals[3]<=10):
                raise ValueError('Parámetros físicos inválidos')
            date = dt.strftime('%Y-%m-%dT%H:%M:%SZ')
            uid = event_id(date,*vals)
            if uid in seen:
                issues.append({'row':int(i)+2,'reason':'Duplicado exacto','id':uid})
                continue
            seen.add(uid)
            rows.append({'id':uid,'date':date,'year':dt.year,'lat':vals[0],'lon':vals[1],'depth':vals[2],'mag':vals[3],'sourceRow':int(i)+2})
        except (ValueError,TypeError) as exc:
            issues.append({'row':int(i)+2,'reason':str(exc)})
    rows.sort(key=lambda x:(x['date'],x['id']))
    coords = pd.DataFrame([[r['lat'],r['lon'],r['depth']] for r in rows],columns=['latitud','longitud','profundidad_km'])
    km = artifact['kmeans_model'].predict(artifact['scaler_3d'].transform(coords))
    original_km = artifact['kmeans_model'].predict(artifact['scaler_3d'].transform(old[['latitud','longitud','profundidad_km']]))
    if not np.array_equal(original_km,artifact['kmeans_model'].labels_):
        raise ValueError('K-Means no corresponde al orden/contenido del catálogo original')
    shallow = [i for i,r in enumerate(rows) if r['depth']<=60]
    params = artifact['parametros_dbscan']
    labels = DBSCAN(eps=params['radio_km']/6371.0,min_samples=params['min_sismos'],metric='haversine',n_jobs=1).fit_predict(np.radians(coords.iloc[shallow,:2].to_numpy()))
    db = dict(zip(shallow,labels))
    candidates = {}
    used = {}
    for i,r in enumerate(rows):
        r.update(kmeans=int(km[i]),dbscan=int(db[i]) if i in db else None,usgs=None,intensity=None,intensitySource=None,impact=None)
        timestamp = pd.Timestamp(r['date']).value
        lo,hi = np.searchsorted(times,[timestamp-15_000_000_000,timestamp+15_000_000_000],side='left')
        # Inclusive upper boundary.
        hi = np.searchsorted(times,timestamp+15_000_000_000,side='right')
        possible = [j for j in range(lo,hi) if distance_km(r['lat'],r['lon'],usgs.iloc[j].lat_usgs,usgs.iloc[j].lon_usgs)<=75]
        if len(possible)==1:
            j=possible[0]; candidates[i]=j; used.setdefault(j,[]).append(i)
        elif len(possible)>1:
            issues.append({'id':r['id'],'reason':'Asociación USGS ambigua; no publicada'})
    for i,j in candidates.items():
        if len(used[j])!=1:
            issues.append({'id':rows[i]['id'],'reason':'USGS compartido por varios eventos; no publicado'})
            continue
        u=usgs.iloc[j]; r=rows[i]
        r['usgs']=str(u.id_usgs)
        r['place']=str(u.lugar_usgs) if pd.notna(u.lugar_usgs) else None
        r['matchKm']=round(float(distance_km(r['lat'],r['lon'],u.lat_usgs,u.lon_usgs)),2)
        r['matchSeconds']=round(abs(pd.Timestamp(r['date']).value-times[j])/1e9,3)
        for col,name in [('mmi_usgs','MMI USGS'),('cdi_usgs','CDI USGS')]:
            if pd.notna(u[col]) and 0<float(u[col])<=12:
                r['intensity']=round(float(u[col]),1); r['intensitySource']=name
                v=r['intensity']; r['impact']='Leve (I-III)' if v<=3.9 else 'Moderado (IV-V)' if v<=5.4 else 'Fuerte/Severo (VI+)'
                break
    changed_dates=int((pd.to_datetime(old.fecha_utc,format='%Y-%m-%d').dt.date != pd.to_datetime(old.fecha_hora_utc).dt.date).sum())
    # Associate old rows by original date/time/physical values, independently of ordering.
    old_lookup={}
    for _,r in old.iterrows():
        date=(parse_date(r.fecha_utc)+pd.to_timedelta(str(r.hora_utc))).strftime('%Y-%m-%dT%H:%M:%SZ')
        old_lookup[event_id(date,r.latitud,r.longitud,r.profundidad_km,r.magnitud)]=r
    changed_links=changed_targets=0
    for r in rows:
        previous=old_lookup.get(r['id'])
        if previous is not None:
            old_id=str(previous.id_usgs) if pd.notna(previous.id_usgs) else None
            old_target=str(previous.nivel_impacto) if pd.notna(previous.nivel_impacto) else None
            changed_links+=old_id!=r['usgs']; changed_targets+=old_target!=r['impact']
    raw_json=json.dumps(rows,ensure_ascii=False,separators=(',',':'),allow_nan=False)
    version=sha256(raw_json.encode()).hexdigest()[:12]
    def groups(field):
        results=[]
        for label in sorted({r[field] for r in rows if r[field] is not None}):
            subset=[r for r in rows if r[field]==label]
            results.append({'id':label,'count':len(subset),'meanDepth':round(float(np.mean([r['depth'] for r in subset])),1),'maxMagnitude':max(r['mag'] for r in subset)})
        return results
    manifest={'version':version,'file':f'events-{version}.json','count':len(rows),'minYear':min(r['year'] for r in rows),'maxYear':max(r['year'] for r in rows),'start':rows[0]['date'],'end':rows[-1]['date'],'stdMagnitude':float(np.std([r['mag'] for r in rows])),'stdDepth':float(np.std([r['depth'] for r in rows])),'sources':['IGP: '+source.name,'USGS: catalogo_usgs_peru.csv'],'sourceHashes':{p.name:sha256(p.read_bytes()).hexdigest() for p in [source,ROOT/'data/catalogo_usgs_peru.csv',ROOT/'models/modelo_clustering.pkl']},'matching':{'seconds':15,'km':75,'unique':True,'note':'Asociación automática conservadora; no validación manual evento por evento.'},'counts':{'intensity':sum(r['intensity'] is not None for r in rows),'usgs':sum(r['usgs'] is not None for r in rows),'shallow':len(shallow)},'groups':{'kmeans':groups('kmeans'),'dbscan':groups('dbscan')},'audit':{'correctedDates':changed_dates,'changedAssociations':changed_links,'changedTargets':changed_targets,'issues':len(issues),'kmeansOriginalLabelsVerified':True},'model':{'status':'experimental','trainingCompatible':changed_targets==0,'note':'El XGBoost existente fue entrenado con el catálogo anterior. Las asociaciones y etiquetas revisadas requieren reentrenamiento y evaluación independiente.'},'dbscan':params}
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/manifest['file']).write_text(raw_json,encoding='utf-8')
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'reports/atlas-audit.json').write_text(json.dumps({'manifest':manifest,'issues':issues},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'version':version,'count':len(rows),'audit':manifest['audit'],'counts':manifest['counts'],'groups':manifest['groups']},ensure_ascii=False,indent=2))

if __name__=='__main__': export()
