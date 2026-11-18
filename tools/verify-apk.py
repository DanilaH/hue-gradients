"""Official Android-tool verification of the exact generated application's APK."""
import argparse,hashlib,json,os,re,subprocess,tempfile,zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('apk',type=Path);p.add_argument('--kind',choices=['release','releasecheck'],required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
cfg=json.loads(Path('android-project.json').read_text());a.out.mkdir(parents=True,exist_ok=True)
sdk=Path(os.environ['ANDROID_HOME'])/'build-tools'/'36.0.0'
# dexdump prints DEX modified UTF-8 strings; only ASCII class/method metadata is parsed.
def run(tool,*args):return subprocess.check_output([str(sdk/tool),*map(str,args)],text=True,encoding='utf-8',errors='replace' if tool=='dexdump' else 'strict',stderr=subprocess.STDOUT)
sign=run('apksigner','verify','--verbose','--print-certs',a.apk);assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in sign
cert=re.search(r'Signer #1 certificate SHA-256 digest: ([a-fA-F0-9:]+)',sign)[1].replace(':','').lower()
if a.kind=='release':assert cert==(cfg.get('certificateSha256') or '').lower(),'Production signer mismatch'
elif cfg.get('certificateSha256'):assert cert!=cfg['certificateSha256'].lower(),'Release-check must not use the production signer'
alignment=run('zipalign','-c','-P','16','4',a.apk)
badging=run('aapt','dump','badging',a.apk);manifest=run('aapt','dump','xmltree',a.apk,'AndroidManifest.xml')
package=cfg['appId']+('.releasecheck' if a.kind=='releasecheck' else '')
assert f"package: name='{package}'" in badging
assert f"versionCode='{cfg['versionCode']}'" in badging and f"versionName='{cfg['versionName']}'" in badging
assert 'application-debuggable' not in badging
if cfg['orientation']!='responsive':assert re.search(r'android:screenOrientation[^\n]*\(type 0x10\)0x'+('1' if cfg['orientation']=='portrait' else '0')+r'(?:\s|$)',manifest)
web={}
with zipfile.ZipFile(a.apk) as z:
    native=json.loads(z.read('assets/capacitor.config.json'))
    assert native['appId']==cfg['appId'] and native['android']['webContentsDebuggingEnabled'] is False
    assert native['loggingBehavior']=='debug' and native['plugins']['SystemBars']['insetsHandling']=='disable'
    public={name.removeprefix('assets/public/'):name for name in z.namelist() if name.startswith('assets/public/') and not name.endswith('/')}
    stamp=json.loads(z.read(public['native-build.json']));assert stamp['channel']=='release'
    assert not set(cfg['releaseExcludedPaths'])&set(public)
    for path in Path('dist').rglob('*'):
        if not path.is_file():continue
        name=path.relative_to('dist').as_posix();data=z.read(public[name]);assert data==path.read_bytes(),name
        web[name]=hashlib.sha256(data).hexdigest()
        if name.endswith(('.js','.html')):
            for marker in cfg['releaseExcludedMarkers']:assert marker.encode() not in data,'Excluded debug/lab content'
    assert set(public)-set(web)<={'cordova.js','cordova_plugins.js'}
    output=[]
    with tempfile.TemporaryDirectory() as temp:
        for name in z.namelist():
            if re.fullmatch(r'classes\d*\.dex',name):
                file=Path(temp)/name;file.write_bytes(z.read(name));output.append(run('dexdump',file))
    blocks=re.split(r'(?=Class #\d+)','\n'.join(output));descriptor='L'+cfg['appId'].replace('.','/')+'/GameStoragePlugin;'
    plugin=[b for b in blocks if re.search(r"Class descriptor\s*:\s*'"+re.escape(descriptor)+"'",b)];assert plugin,'Storage bridge removed by R8'
    for method in ['get','set','remove','list']:assert any(re.search(r"name\s*:\s*'"+method+"'",b) for b in plugin),method
mapping=Path('native/android/app/build/outputs/mapping')/('release' if a.kind=='release' else 'releaseCheck')/'mapping.txt';assert mapping.is_file() and mapping.stat().st_size>1000
report={'kind':a.kind,'package':package,'versionName':cfg['versionName'],'versionCode':cfg['versionCode'],'kitRef':stamp['kitRef'],'source':os.environ.get('GITHUB_SHA','local'),'apkSha256':hashlib.sha256(a.apk.read_bytes()).hexdigest(),'bytes':a.apk.stat().st_size,'certificateSha256':cert,'productionSigner':a.kind=='release','v2':True,'zipalign16k':True,'debuggable':False,'webViewDebuggingConfigured':False,'nativeInsetOwner':'content-root','webPayload':web,'nativeRuntime':'NOT RUN','liveServices':'NOT INSTALLED BY THIS HOST TEMPLATE'}
for name,text in [('signing.txt',sign),('badging.txt',badging),('manifest.txt',manifest),('alignment.txt',alignment)]: (a.out/name).write_text(text)
(a.out/'verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='webPayload'},indent=2))
