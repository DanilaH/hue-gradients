"""Restore existing production identity; never generate a replacement or log values."""
import base64,json,os,sys
from pathlib import Path
def prepare(env,config):
    required=['ANDROID_RELEASE_KEYSTORE_BASE64','ANDROID_RELEASE_KEYSTORE','ANDROID_RELEASE_STORE_PASSWORD','ANDROID_RELEASE_KEY_ALIAS','ANDROID_RELEASE_KEY_PASSWORD']
    missing=[name for name in required if not env.get(name,'').strip()]
    if missing:raise ValueError('Missing signing inputs: '+', '.join(missing))
    import re
    if not re.fullmatch('[a-fA-F0-9]{64}',config.get('certificateSha256') or ''):raise ValueError('Missing/invalid public certificate pin in android-project.json')
    try:data=base64.b64decode(env['ANDROID_RELEASE_KEYSTORE_BASE64'],validate=True)
    except Exception:raise ValueError('Invalid ANDROID_RELEASE_KEYSTORE_BASE64') from None
    if not 1024<=len(data)<=32768:raise ValueError('Invalid signing payload size')
    target=Path(env['ANDROID_RELEASE_KEYSTORE']);target.parent.mkdir(parents=True,exist_ok=True)
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as file:file.write(data)
if __name__=='__main__':
    try:prepare(os.environ,json.loads(Path('android-project.json').read_text()))
    except ValueError as error:print(str(error),file=sys.stderr);sys.exit(1)
    except Exception:print('Could not restore private signing material',file=sys.stderr);sys.exit(1)
    print('Existing signing material restored; actual APK must match the public certificate pin.')
