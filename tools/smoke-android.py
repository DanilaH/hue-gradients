"""Real non-debuggable sample APK: native storage, recreation, Back and system-safe bounds."""
import argparse,hashlib,json,re,subprocess,sys,time,xml.etree.ElementTree as ET
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('apk',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
cfg=json.loads(Path('android-project.json').read_text());package=cfg['appId']+'.releasecheck'
def adb(*args):return subprocess.check_output(['adb',*args],stderr=subprocess.STDOUT,timeout=45)
def shell(*args):return adb('shell',*args).decode(errors='replace').strip()
def failure(kind,error,trace):
    sys.__excepthook__(kind,error,trace)
    for name,args in [('failure.png',('exec-out','screencap','-p')),('logcat.txt',('logcat','-d'))]:
        try:(a.out/name).write_bytes(adb(*args))
        except Exception:pass
sys.excepthook=failure
def dump(name):
    shell('rm','-f','/sdcard/bootstrap-window.xml')
    shell('uiautomator','dump','/sdcard/bootstrap-window.xml')
    if shell('test','-f','/sdcard/bootstrap-window.xml','&&','echo','ready','||','true')!='ready':return None
    raw=adb('exec-out','cat','/sdcard/bootstrap-window.xml')
    (a.out/(name+'.xml')).write_bytes(raw)
    if not raw.lstrip().startswith(b'<?xml'):return None
    return ET.fromstring(raw)
def find(tree,text):
    return None if tree is None else next((node for node in tree.iter('node') if text in [node.get('text'),node.get('content-desc')]),None)
def wait(text,name,enabled=False):
    print('Waiting for '+name+': '+text,flush=True)
    deadline=time.monotonic()+60
    while time.monotonic()<deadline:
        try:tree=dump(name)
        except subprocess.CalledProcessError as error:
            if error.returncode not in [137,-9]:raise
            time.sleep(1);continue
        node=find(tree,text)
        if node is not None and (not enabled or node.get('enabled')=='true'):return tree,node
        time.sleep(.5)
    raise AssertionError('Expected Android control: '+text)
def bounds(node):return tuple(map(int,re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',node.get('bounds')).groups()))
def screenshot(name):(a.out/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
def safe_control(tree,button):
    web=next(node for node in tree.iter('node') if node.get('class')=='android.webkit.WebView')
    x1,y1,x2,y2=bounds(button);left,top,right,bottom=bounds(web)
    assert left<=x1<x2<=right and top<=y1<y2<=bottom,'Action outside WebView safe content'
    assert top>0,'Native root did not reserve the status/cutout area'
    density=int(re.findall(r'\d+',shell('wm','density'))[-1])/160
    assert y2-y1+1>=48*density,'Primary control smaller than48dp'
    return right-left,bottom-top
def launch():shell('am','start','-W','-n',package+'/'+cfg['appId']+'.MainActivity')
print('Checking USER emulator environment',flush=True)
assert shell('getprop','ro.build.type')=='user' and shell('getprop','ro.debuggable')=='0','Use a USER image; userdebug forces WebView inspection'
shell('cmd','connectivity','airplane-mode','enable');shell('svc','wifi','disable');shell('svc','data','disable')
print('Installing and launching actual releaseCheck APK',flush=True)
assert 'Success' in adb('install','-r',str(a.apk)).decode();adb('logcat','-c');launch()
tree,button=wait('Add one','fresh',True);assert find(tree,'Saved taps: 0') is not None
safe_control(tree,button)
x1,y1,x2,y2=bounds(button);assert x2>x1 and y2>y1;assert y1>0
shell('input','tap',str((x1+x2)//2),str((y1+y2)//2));wait('Saved taps: 1','saved');screenshot('saved')
shell('am','force-stop',package);launch();wait('Saved taps: 1','cold-restore');screenshot('cold-restore')
print('Checking root Back and foreground restoration',flush=True)
shell('input','keyevent','4');time.sleep(1);tree=dump('back');assert tree is not None and find(tree,'Add one') is None,'Root Back did not minimize the app'
launch();wait('Saved taps: 1','foreground');
if cfg['orientation']=='responsive':
    print('Checking responsive rotation and safe control bounds',flush=True)
    shell('settings','put','system','accelerometer_rotation','0');shell('settings','put','system','user_rotation','1');time.sleep(1)
    tree,button=wait('Add one','landscape',True);assert find(tree,'Saved taps: 1') is not None
    width,height=safe_control(tree,button);assert width>height,'Responsive host did not rotate'
    screenshot('landscape')
    shell('settings','put','system','user_rotation','0')
pid=shell('pidof',package);assert re.fullmatch(r'\d+',pid)
assert not re.search(r'@webview_devtools_remote_'+pid+r'(?:\s|$)',shell('cat','/proc/net/unix'))
assert 'FATAL EXCEPTION' not in adb('logcat','-d','-s','AndroidRuntime:E').decode(errors='replace')
report={'package':package,'apkSha256':hashlib.sha256(a.apk.read_bytes()).hexdigest(),'androidApi':shell('getprop','ro.build.version.sdk'),'systemBuild':'user','installed':True,'counterCommitted':True,'coldRestore':True,'rootBackMinimized':True,'foregroundRestored':True,'orientation':cfg['orientation'],'debugSocketAbsent':True,'fatalExceptions':False,'provenance':'Actual R8 releaseCheck APK/test signer on USER emulator; UIAutomator input/accessibility, no WebView debug bridge, injected JS or seeded state. Offline launch, no ads/analytics SDKs installed. Not production signing, live services or physical-device acceptance.'}
(a.out/'runtime.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
