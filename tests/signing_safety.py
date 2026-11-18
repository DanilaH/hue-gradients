import base64,importlib.util,os,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('prepare_signing',Path(__file__).resolve().parents[1]/'tools/prepare-signing.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class SigningSafety(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.path=Path(self.directory.name)/'test-only.keystore'
        self.env={'ANDROID_RELEASE_KEYSTORE_BASE64':base64.b64encode(b'fixture-not-a-real-keystore'*100).decode(),'ANDROID_RELEASE_KEYSTORE':str(self.path),'ANDROID_RELEASE_STORE_PASSWORD':'fixture-store','ANDROID_RELEASE_KEY_ALIAS':'fixture-alias','ANDROID_RELEASE_KEY_PASSWORD':'fixture-key'}
        self.config={'certificateSha256':'a'*64}
    def tearDown(self):self.directory.cleanup()
    def test_private_mode_and_no_implicit_replacement(self):
        module.prepare(self.env,self.config);self.assertEqual(self.path.stat().st_mode&0o777,0o600);original=self.path.read_bytes()
        with self.assertRaises(FileExistsError):module.prepare(self.env,self.config)
        self.assertEqual(self.path.read_bytes(),original)
    def test_missing_or_unpinned_does_not_create_file(self):
        for env,config in [({},self.config),(self.env,{'certificateSha256':None})]:
            with self.assertRaises(ValueError):module.prepare(env,config)
            self.assertFalse(self.path.exists())
    def test_invalid_payload_diagnostics_never_echo_its_value(self):
        value='fixture-sensitive-invalid-base64'
        with self.assertRaises(ValueError) as error:module.prepare({**self.env,'ANDROID_RELEASE_KEYSTORE_BASE64':value},self.config)
        self.assertNotIn(value,str(error.exception));self.assertFalse(self.path.exists())
    def test_link_destination_is_not_followed(self):
        victim=Path(self.directory.name)/'existing';victim.write_text('keep');os.symlink(victim,self.path)
        with self.assertRaises(FileExistsError):module.prepare(self.env,self.config)
        self.assertEqual(victim.read_text(),'keep')
if __name__=='__main__':unittest.main()
