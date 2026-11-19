package com.danilah.huegradients;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Explicit user-requested PNG export. No workspace/database path is exposed. */
@CapacitorPlugin(name="HueExport")
public class HueExportPlugin extends Plugin {
  private static final ExecutorService WRITER=Executors.newSingleThreadExecutor();
  private boolean active=false;
  private synchronized boolean claim(){if(active)return false;active=true;return true;}
  private synchronized void release(){active=false;}
  private void resolve(PluginCall call,String status){release();JSObject result=new JSObject();result.put("status",status);call.resolve(result);}
  private void reject(PluginCall call,Exception error){release();call.reject("Не удалось сохранить или передать PNG. Проверьте доступ и свободное место.","EXPORT_UNAVAILABLE",error);}
  private File prepare(PluginCall call)throws Exception {
    String value=call.getString("base64");if(value==null||value.length()>16*1024*1024)throw new IllegalArgumentException("PNG size");
    byte[] bytes=Base64.decode(value,Base64.DEFAULT);byte[] signature={(byte)137,80,78,71,13,10,26,10};
    if(bytes.length<33)throw new IllegalArgumentException("PNG header");for(int i=0;i<8;i++)if(bytes[i]!=signature[i])throw new IllegalArgumentException("PNG signature");
    ByteBuffer header=ByteBuffer.wrap(bytes);if(header.getInt(8)!=13||header.getInt(12)!=0x49484452)throw new IllegalArgumentException("PNG IHDR");
    int width=header.getInt(16),height=header.getInt(20);if(width<1||height<1||width>3000||height>3000)throw new IllegalArgumentException("PNG dimensions");
    File directory=new File(getContext().getCacheDir(),"hue-exports");if(!directory.isDirectory()&&!directory.mkdirs())throw new java.io.IOException("Cache unavailable");
    File[] old=directory.listFiles();if(old!=null)for(File file:old)if(file.lastModified()<System.currentTimeMillis()-24*60*60*1000L)file.delete();
    File file=new File(directory,UUID.randomUUID()+".png");try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);out.getFD().sync();}
    call.getData().put("exportCacheFile",file.getName());call.getData().remove("base64");return file;
  }
  private String filename(PluginCall call){String name=call.getString("filename","Poluson.png");return name.matches("[A-Za-z0-9._-]{1,100}\\.png")?name:"Poluson.png";}
  @PluginMethod public void save(PluginCall call){
    if(!claim()){call.reject("Экспорт уже открыт.","EXPORT_BUSY");return;}
    try{prepare(call);Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("image/png");intent.putExtra(Intent.EXTRA_TITLE,filename(call));getActivity().runOnUiThread(()->{try{startActivityForResult(call,intent,"savedDocument");}catch(Exception error){reject(call,error);}});}
    catch(Exception error){reject(call,error);}
  }
  @ActivityCallback private void savedDocument(PluginCall call,ActivityResult result){
    if(call==null){release();return;}
    File file=new File(new File(getContext().getCacheDir(),"hue-exports"),call.getString("exportCacheFile","missing"));
    if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){file.delete();resolve(call,"cancelled");return;}
    Uri target=result.getData().getData();
    WRITER.execute(()->{try(FileInputStream in=new FileInputStream(file);OutputStream out=getContext().getContentResolver().openOutputStream(target,"w")){
      if(out==null)throw new java.io.IOException("No output stream");byte[] buffer=new byte[16384];int read;while((read=in.read(buffer))!=-1)out.write(buffer,0,read);out.flush();
    }catch(Exception error){file.delete();reject(call,error);return;}
    file.delete();resolve(call,"saved");});
  }
  @PluginMethod public void share(PluginCall call){
    if(!claim()){call.reject("Экспорт уже открыт.","EXPORT_BUSY");return;}
    try{
      File file=prepare(call);Uri uri=FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".hue-export",file);
      Intent send=new Intent(Intent.ACTION_SEND);send.setType("image/png");send.putExtra(Intent.EXTRA_STREAM,uri);send.setClipData(ClipData.newRawUri("PNG",uri));send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      getActivity().runOnUiThread(()->{try{getActivity().startActivity(Intent.createChooser(send,"Поделиться изображением"));
        // Starting a chooser cannot establish delivery/publication or distinguish later cancellation.
        resolve(call,"opened");}catch(Exception error){reject(call,error);}});
    }catch(Exception error){reject(call,error);}
  }
}
