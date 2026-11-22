"""Research executable model, not a mobile app or deployed cloud service.
SQLite experiments validate transaction/retry boundaries on this host only.
Identity verification, PostgreSQL, SDKs, physical storage and networking are NOT run.
"""
import copy, datetime as dt, hashlib, json, os, sqlite3, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def canonical(x):
    return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False)

def digest(x):
    return hashlib.sha256(canonical(x).encode()).hexdigest()

def connect(path):
    c=sqlite3.connect(path,timeout=10,isolation_level=None)
    c.execute('PRAGMA journal_mode=WAL');c.execute('PRAGMA synchronous=FULL')
    return c

def setup(path):
    c=connect(path)
    c.executescript("""
    CREATE TABLE profiles(id TEXT PRIMARY KEY,epoch INTEGER NOT NULL);
    CREATE TABLE ops(profile TEXT,epoch INTEGER,id TEXT,hash TEXT,PRIMARY KEY(profile,epoch,id));
    CREATE TABLE completions(profile TEXT,epoch INTEGER,kind TEXT,target TEXT,PRIMARY KEY(profile,epoch,kind,target));
    CREATE TABLE best(profile TEXT,epoch INTEGER,fingerprint TEXT,assisted INTEGER,moves INTEGER,PRIMARY KEY(profile,epoch,fingerprint,assisted));
    CREATE TABLE nodes(profile TEXT,entity TEXT,id TEXT,parents TEXT,payload TEXT,PRIMARY KEY(profile,id));
    CREATE TABLE resets(profile TEXT,id TEXT,new_epoch INTEGER,PRIMARY KEY(profile,id));
    INSERT INTO profiles VALUES('A',1),('B',1);
    """)
    c.close()

def complete(opid,target='gradient-001',moves=7,assisted=False,kind='campaign',fingerprint='fp1'):
    return dict(id=opid,type='complete',kind=kind,target=target,moves=moves,assisted=assisted,fingerprint=fingerprint)

def node(opid,node_id,parents=(),entity='draft-1',value='blue'):
    return dict(id=opid,type='node',nodeId=node_id,parents=list(parents),entity=entity,value=value)

def apply(path,principal,target,epoch,operations,crash=None):
    # principal is already verified by an unimplemented auth boundary.
    if principal!=target:raise ValueError('FORBIDDEN')
    c=connect(path);results=[]
    try:
        c.execute('BEGIN IMMEDIATE')
        current=c.execute('SELECT epoch FROM profiles WHERE id=?',(principal,)).fetchone()
        if not current:raise ValueError('PROFILE_MISSING')
        if current[0]!=epoch:raise ValueError('EPOCH_MISMATCH')
        if not 1<=len(operations)<=64:raise ValueError('BATCH_SIZE')
        for o in operations:
            if not isinstance(o.get('id'),str) or not o['id']:raise ValueError('OP_ID')
            h=digest(o);prev=c.execute('SELECT hash FROM ops WHERE profile=? AND epoch=? AND id=?',(principal,epoch,o['id'])).fetchone()
            if prev:
                if prev[0]!=h:raise ValueError('OP_ID_REUSED')
                results.append('already-applied');continue
            if o['type']=='complete':
                if o['kind'] not in ('campaign','daily'):raise ValueError('KIND')
                if type(o['moves']) is not int or o['moves']<0 or type(o['assisted']) is not bool:raise ValueError('RESULT')
                c.execute('INSERT OR IGNORE INTO completions VALUES(?,?,?,?)',(principal,epoch,o['kind'],o['target']))
                c.execute('INSERT INTO best VALUES(?,?,?,?,?) ON CONFLICT(profile,epoch,fingerprint,assisted) DO UPDATE SET moves=min(moves,excluded.moves)',
                          (principal,epoch,o['fingerprint'],int(o['assisted']),o['moves']))
            elif o['type']=='node':
                existing=c.execute('SELECT payload FROM nodes WHERE profile=? AND id=?',(principal,o['nodeId'])).fetchone()
                payload=canonical({k:v for k,v in o.items() if k!='id'})
                if existing and existing[0]!=payload:raise ValueError('NODE_ID_REUSED')
                if len(o['parents'])!=len(set(o['parents'])) or o['nodeId'] in o['parents']:raise ValueError('PARENTS')
                for parent in o['parents']:
                    found=c.execute('SELECT entity FROM nodes WHERE profile=? AND id=?',(principal,parent)).fetchone()
                    if not found:raise ValueError('MISSING_PARENT')
                    if found[0]!=o['entity']:raise ValueError('CROSS_ENTITY_PARENT')
                if not existing:c.execute('INSERT INTO nodes VALUES(?,?,?,?,?)',(principal,o['entity'],o['nodeId'],canonical(o['parents']),payload))
            else:raise ValueError('TYPE')
            if crash=='after_effect':os._exit(81)
            c.execute('INSERT INTO ops VALUES(?,?,?,?)',(principal,epoch,o['id'],h));results.append('applied')
        c.commit()
        if crash=='after_commit':os._exit(82)
        return results
    except BaseException:
        c.rollback();raise
    finally:c.close()

def reset(path,principal,expected,opid):
    c=connect(path)
    try:
        c.execute('BEGIN IMMEDIATE')
        old=c.execute('SELECT new_epoch FROM resets WHERE profile=? AND id=?',(principal,opid)).fetchone()
        if old:return old[0]
        row=c.execute('SELECT epoch FROM profiles WHERE id=?',(principal,)).fetchone()
        if row is None:raise ValueError('PROFILE_MISSING')
        if row[0]!=expected:raise ValueError('EPOCH_MISMATCH')
        new=expected+1;c.execute('UPDATE profiles SET epoch=? WHERE id=?',(new,principal))
        c.execute('DELETE FROM completions WHERE profile=?',(principal,));c.execute('DELETE FROM best WHERE profile=?',(principal,))
        c.execute('INSERT INTO resets VALUES(?,?,?)',(principal,opid,new));c.commit();return new
    finally:c.close()

def rows(path,table,profile='A'):
    c=connect(path);r=c.execute('SELECT * FROM '+table+' WHERE profile=?',(profile,)).fetchall();c.close();return r

def heads(path,entity):
    ns=[r for r in rows(path,'nodes') if r[1]==entity];parents={p for r in ns for p in json.loads(r[3])}
    return {r[2] for r in ns if r[2] not in parents}

def slots_at(manifest,server_now):
    current=dt.datetime.fromisoformat(server_now.replace('Z','+00:00')).astimezone(dt.timezone.utc).date()
    available=[]
    for s in manifest:
        day=dt.date.fromisoformat(s['slotId'])
        if day.isoformat()!=s['slotId']:raise ValueError('DAY_FORMAT')
        if day<=current and s['status']=='published':available.append(s['slotId'])
    return available

def install_blob(cache,ref,blob):
    if hashlib.sha256(blob).hexdigest()!=ref['sha256']:raise ValueError('HASH_MISMATCH')
    data=json.loads(blob)
    if data['id']!=ref['contentId'] or data['revision']!=ref['revision']:raise ValueError('IDENTITY_MISMATCH')
    # Model of one pointer replacement only after complete validation.
    cache[ref['slotId']]={'ref':copy.deepcopy(ref),'data':data}

def ad_decision(state,context):
    if not context['userNext'] or not context['saved'] or not context['newOfficialClear']:return 'not-opportunity'
    if context['protected'] or context['fullscreen'] or not context['foreground']:return 'protected'
    if state['uniqueOfficial']<5 or state['processActiveSeconds']<180:return 'grace'
    if state['newSinceRequest']<3 or state['activeSeconds']-state['lastRequestActiveSeconds']<180:return 'cadence'
    if not context['ready']:return 'not-ready'
    state['lastRequestActiveSeconds']=state['activeSeconds'];state['newSinceRequest']=0
    return 'request'

def run():
    report=[]
    def ok(name,condition):assert condition,name;report.append({'case':name,'passed':True})
    def rejects(name,fn,code):
        try:fn()
        except ValueError as e:ok(name,str(e)==code)
        else:raise AssertionError(name+' did not reject')
    with tempfile.TemporaryDirectory() as tmp:
        p=str(Path(tmp)/'model.sqlite');setup(p)
        ok('first completion applied',apply(p,'A','A',1,[complete('one')])==['applied'])
        ok('lost-ack retry is idempotent',apply(p,'A','A',1,[complete('one')])==['already-applied'])
        ok('single completion after retry',len(rows(p,'completions'))==1)
        rejects('same operation id cannot change payload',lambda:apply(p,'A','A',1,[complete('one',moves=6)]),'OP_ID_REUSED')
        rejects('session A cannot address B',lambda:apply(p,'A','B',1,[complete('foreign')]),'FORBIDDEN')
        ok('other profile untouched',not rows(p,'completions','B'))
        apply(p,'A','A',1,[complete('replay',moves=5),complete('assist',moves=2,assisted=True)])
        ok('replay cannot farm unique completion',len(rows(p,'completions'))==1)
        b={r[3]:r[4] for r in rows(p,'best')};ok('assisted best separate',b=={0:5,1:2})
        apply(p,'A','A',1,[complete('revision',fingerprint='fp2',moves=3)])
        ok('revision does not create another base reward',len(rows(p,'completions'))==1 and len(rows(p,'best'))==3)
        apply(p,'A','A',1,[complete('daily','2026-11-01',kind='daily')])
        apply(p,'A','A',1,[complete('daily-replay','2026-11-01',kind='daily')])
        ok('archive slot counts once',len([r for r in rows(p,'completions') if r[2]=='daily'])==1)
        before=rows(p,'completions')
        rejects('invalid second operation rolls back whole batch',lambda:apply(p,'A','A',1,[complete('would-commit','gradient-002'),complete('bad',moves=-1)]),'RESULT')
        ok('batch rollback retained previous state',rows(p,'completions')==before and not any(r[2]=='would-commit' for r in rows(p,'ops')))
        rejects('boolean moves rejected',lambda:apply(p,'A','A',1,[complete('bool',moves=True)]),'RESULT')
        rejects('empty batch rejected',lambda:apply(p,'A','A',1,[]),'BATCH_SIZE')
        apply(p,'A','A',1,[node('root','r'),node('left','a',['r']),node('right','b',['r'])])
        ok('both concurrent draft branches survive',heads(p,'draft-1')=={'a','b'})
        apply(p,'A','A',1,[node('continue','a2',['a'])])
        ok('descendant advances only its own branch',heads(p,'draft-1')=={'a2','b'})
        rejects('missing parent remains recoverable',lambda:apply(p,'A','A',1,[node('missing','z',['unknown'])]),'MISSING_PARENT')
        rejects('parents cannot cross works',lambda:apply(p,'A','A',1,[node('cross','other',['r'],entity='draft-2')]),'CROSS_ENTITY_PARENT')
        rejects('immutable revision id',lambda:apply(p,'A','A',1,[node('changed','a',['r'],value='red')]),'NODE_ID_REUSED')
        apply(p,'A','A',1,[node('resolve','selected',['a2','b'])])
        ok('explicit resolution joins heads without deleting history',heads(p,'draft-1')=={'selected'} and len(rows(p,'nodes'))==5)
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(lambda i:apply(p,'A','A',1,[complete('race-'+str(i),'gradient-race',moves=9-i)]),[0,1]))
        ok('two database connections do not duplicate a logical win',len([r for r in rows(p,'completions') if r[3]=='gradient-race'])==1)
        ok('reset advances epoch',reset(p,'A',1,'reset1')==2)
        ok('reset retry returns same epoch',reset(p,'A',1,'reset1')==2)
        rejects('old offline completion cannot resurrect reset progress',lambda:apply(p,'A','A',1,[complete('late')]),'EPOCH_MISMATCH')
        ok('progress empty and own works retained after reset',not rows(p,'completions') and len(rows(p,'nodes'))==5)
        apply(p,'A','A',2,[complete('one')])
        ok('new epoch may earn fresh progression',len(rows(p,'completions'))==1)
        for fault,expected in [('after_effect',0),('after_commit',1)]:
            q=str(Path(tmp)/(fault+'.sqlite'));setup(q)
            child=subprocess.run([sys.executable,__file__,'--fault',q,fault],capture_output=True)
            ok('process terminated at '+fault,child.returncode in (81,82))
            ok('atomic recovery '+fault,len(rows(q,'completions'))==expected and len(rows(q,'ops'))==expected)
            apply(q,'A','A',1,[complete('crash-op')])
            ok('retry after process death '+fault,len(rows(q,'completions'))==1 and len(rows(q,'ops'))==1)
    manifest=[{'slotId':d,'status':s} for d,s in [('2026-11-17','published'),('2026-11-18','published'),('2026-11-19','published'),('2026-11-16','withdrawn')]]
    ok('future and withdrawn slots excluded',slots_at(manifest,'2026-11-18T23:59:59Z')==['2026-11-17','2026-11-18'])
    ok('UTC boundary admits next slot',slots_at(manifest,'2026-11-19T00:00:00Z')[-1]=='2026-11-19')
    ok('timezone does not redefine slot',slots_at(manifest,'2026-11-19T04:59:59+05:00')==['2026-11-17','2026-11-18'])
    ok('leap day accepted',slots_at([{'slotId':'2028-02-29','status':'published'}],'2028-02-29T00:00:00Z')==['2028-02-29'])
    cache={};blob=canonical({'id':'daily-1','revision':1,'board':[1,0]}).encode();ref=dict(slotId='2026-11-18',contentId='daily-1',revision=1,sha256=hashlib.sha256(blob).hexdigest())
    install_blob(cache,ref,blob);before=copy.deepcopy(cache)
    rejects('partial download rejected',lambda:install_blob(cache,ref,blob[:-3]),'HASH_MISMATCH')
    ok('old cache preserved after hash failure',cache==before)
    other=canonical({'id':'wrong','revision':1}).encode();bad={**ref,'sha256':hashlib.sha256(other).hexdigest()}
    rejects('valid hash cannot disguise wrong content id',lambda:install_blob(cache,bad,other),'IDENTITY_MISMATCH')
    ok('old cache preserved after identity failure',cache==before)
    s={'uniqueOfficial':5,'processActiveSeconds':180,'newSinceRequest':5,'activeSeconds':180,'lastRequestActiveSeconds':0}
    c={'userNext':True,'saved':True,'newOfficialClear':True,'protected':False,'fullscreen':False,'foreground':True,'ready':True}
    for key in ('userNext','saved','newOfficialClear'):
        ok('ad rejects missing '+key,ad_decision(copy.deepcopy(s),{**c,key:False})=='not-opportunity')
    for key,value in [('protected',True),('fullscreen',True),('foreground',False)]:
        ok('ad respects '+key,ad_decision(copy.deepcopy(s),{**c,key:value})=='protected')
    ok('no popup from a load callback',ad_decision(copy.deepcopy(s),{**c,'userNext':False})=='not-opportunity')
    ok('first four official wins protected',ad_decision({**s,'uniqueOfficial':4},c)=='grace')
    ok('initial active grace protected',ad_decision({**s,'processActiveSeconds':179},c)=='grace')
    ok('SDK not ready does not block route',ad_decision(copy.deepcopy(s),{**c,'ready':False})=='not-ready')
    ok('eligible transition requests once',ad_decision(s,c)=='request')
    ok('no-fill does not immediately retry',ad_decision(s,c)=='cadence')
    s.update(activeSeconds=360,newSinceRequest=3);ok('next interval with three new wins eligible',ad_decision(s,c)=='request')
    s.update(activeSeconds=1000,newSinceRequest=2);ok('time alone cannot create new-progress opportunity',ad_decision(s,c)=='cadence')
    out={'status':'PASS','cases':len(report),'sqliteVersion':sqlite3.sqlite_version,'actualSubprocessTerminations':2,
         'concurrentDatabaseConnections':2,'scope':'Host SQLite transaction/retry model, pure calendar/cache and ad policy; not production auth/cloud/mobile/SDK/retention.',
         'postgresExecuted':False,'mobileExecuted':False,'authProviderExecuted':False,'liveAdsExecuted':False,'rows':report}
    (ROOT/'evidence').mkdir(exist_ok=True);(ROOT/'evidence/technical-contract-checks-2026-11-18.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in out.items() if k!='rows'},ensure_ascii=False))

if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--fault':apply(sys.argv[2],'A','A',1,[complete('crash-op')],sys.argv[3])
    else:run()

