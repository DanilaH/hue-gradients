package com.danilah.huegradients;

import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteConstraintException;
import android.database.sqlite.SQLiteDatabaseCorruptException;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.*;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Game-owned transactional storage. No generic SQL, network or delete API crosses the bridge. */
@CapacitorPlugin(name = "HueSQLite")
public class HueSQLitePlugin extends Plugin {
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static Database helper;
    private static synchronized Database database(Context context) {
        if (helper == null) helper = new Database(context.getApplicationContext());
        return helper;
    }
    private interface Action { JSObject run(SQLiteDatabase db) throws Exception; }
    private static class Rejected extends Exception {
        final String code;
        Rejected(String code) { super(code); this.code = code; }
    }
    private void run(PluginCall call, Action action) {
        IO.execute(() -> {
            try { call.resolve(action.run(database(getContext()).getWritableDatabase())); }
            catch (Rejected error) { call.reject("Local transaction rejected", error.code); }
            catch (SQLiteConstraintException error) { call.reject("Immutable fact collision", "CORRUPT"); }
            catch (Exception error) { call.reject("Local transaction result unavailable", "UNAVAILABLE"); }
        });
    }
    private static String id(String value) throws Rejected {
        if (value == null || !value.matches("[a-zA-Z0-9_.:-]{1,160}")) throw new Rejected("CORRUPT");
        return value;
    }
    private static JSObject receipt(SQLiteDatabase db, String vault, String operation) throws Exception {
        try (Cursor cursor = db.rawQuery("SELECT payload_hash, revision FROM operations WHERE vault=? AND operation=?", new String[]{vault, operation})) {
            if (!cursor.moveToFirst()) return null;
            JSObject value = new JSObject(); value.put("operationId", operation);
            value.put("payloadHash", cursor.getString(0)); value.put("appliedRevision", cursor.getLong(1)); return value;
        }
    }
    @PluginMethod public void load(PluginCall call) { run(call, db -> {
        String vault = id(call.getString("vaultId")); JSObject result = new JSObject();
        try (Cursor cursor = db.rawQuery("SELECT revision,snapshot FROM workspaces WHERE vault=?", new String[]{vault})) {
            if (!cursor.moveToFirst()) { result.put("workspace", JSONObject.NULL); return result; }
            JSObject value = new JSObject(); value.put("schemaVersion", 1); value.put("vaultId", vault);
            value.put("localRevision", cursor.getLong(0)); value.put("snapshotJson", cursor.getString(1));
            result.put("workspace", value); return result;
        }
    }); }
    @PluginMethod public void readOperation(PluginCall call) { run(call, db -> {
        JSObject result = new JSObject(); JSObject value = receipt(db, id(call.getString("vaultId")), id(call.getString("operationId")));
        result.put("receipt", value == null ? JSONObject.NULL : value); return result;
    }); }
    @PluginMethod public void listFacts(PluginCall call) { run(call, db -> {
        JSArray facts = new JSArray();
        try (Cursor cursor = db.rawQuery("SELECT id,destination,payload FROM facts WHERE vault=? ORDER BY id", new String[]{id(call.getString("vaultId"))})) {
            while (cursor.moveToNext()) {
                JSObject fact = new JSObject(); fact.put("id", cursor.getString(0));
                fact.put("destination", new JSONObject(cursor.getString(1))); fact.put("payloadJson", cursor.getString(2)); facts.put(fact);
            }
        }
        JSObject result = new JSObject(); result.put("facts", facts); return result;
    }); }
    @PluginMethod public void commit(PluginCall call) { run(call, db -> {
        String raw = call.getString("commandJson"), hash = call.getString("payloadHash");
        if (raw == null || raw.length() > 4_000_000 || hash == null) throw new Rejected("CORRUPT");
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
        StringBuilder actual = new StringBuilder();
        for (byte b : digest) actual.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        if (!actual.toString().equals(hash)) throw new Rejected("OPERATION_MISMATCH");
        JSONObject command = new JSONObject(raw);
        String vault = id(command.getString("vaultId")), operation = id(command.getString("operationId"));
        long expected = command.getLong("expectedRevision");
        if (expected < 0 || expected >= 9007199254740991L || command.getDouble("expectedRevision") != expected) throw new Rejected("CORRUPT");
        String snapshot = command.getString("nextSnapshotJson"); new JSONObject(snapshot);
        JSONArray facts = command.getJSONArray("facts");
        if (snapshot.length() > 2_000_000 || facts.length() > 100) throw new Rejected("CORRUPT");
        HashSet<String> factIds = new HashSet<>();
        for (int i = 0; i < facts.length(); i++) {
            JSONObject fact = facts.getJSONObject(i), destination = fact.getJSONObject("destination");
            if (!factIds.add(id(fact.getString("id"))) || fact.getString("payloadJson").length() > 100_000) throw new Rejected("CORRUPT");
            new JSONObject(fact.getString("payloadJson"));
            String kind = destination.getString("kind");
            if (kind.equals("guest")) { if (!destination.getString("vaultId").equals(vault)) throw new Rejected("CORRUPT"); }
            else if (kind.equals("account")) {
                id(destination.getString("profileId")); long epoch = destination.getLong("epoch");
                if (epoch < 0 || epoch > 9007199254740991L || destination.getDouble("epoch") != epoch) throw new Rejected("CORRUPT");
            } else throw new Rejected("CORRUPT");
        }
        JSObject result;
        db.beginTransaction();
        try {
            result = receipt(db, vault, operation);
            if (result != null) {
                if (!hash.equals(result.getString("payloadHash"))) throw new Rejected("OPERATION_MISMATCH");
            } else {
                long revision = 0;
                try (Cursor cursor = db.rawQuery("SELECT revision FROM workspaces WHERE vault=?", new String[]{vault})) { if (cursor.moveToFirst()) revision = cursor.getLong(0); }
                if (revision != expected) throw new Rejected("CONFLICT");
                ContentValues workspace = new ContentValues(); workspace.put("vault", vault); workspace.put("revision", expected + 1); workspace.put("snapshot", snapshot);
                db.insertWithOnConflict("workspaces", null, workspace, SQLiteDatabase.CONFLICT_REPLACE);
                for (int i = 0; i < facts.length(); i++) {
                    JSONObject fact = facts.getJSONObject(i); ContentValues row = new ContentValues(); row.put("vault", vault); row.put("id", fact.getString("id"));
                    row.put("destination", fact.getJSONObject("destination").toString()); row.put("payload", fact.getString("payloadJson")); db.insertOrThrow("facts", null, row);
                }
                ContentValues ledger = new ContentValues(); ledger.put("vault", vault); ledger.put("operation", operation); ledger.put("payload_hash", hash); ledger.put("revision", expected + 1);
                db.insertOrThrow("operations", null, ledger); result = receipt(db, vault, operation);
            }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        return result; // Resolve only after SQLite has committed, including FULL synchronous flush.
    }); }

    private static class Database extends SQLiteOpenHelper {
        Database(Context context) { super(context, new File(context.getNoBackupFilesDir(), "hue-workspace-v1.db").getAbsolutePath(), null, 1,
            db -> { throw new SQLiteDatabaseCorruptException("Preserve damaged database for recovery"); }); }
        @Override public void onConfigure(SQLiteDatabase db) { db.execSQL("PRAGMA synchronous=FULL"); }
        @Override public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE workspaces(vault TEXT PRIMARY KEY,revision INTEGER NOT NULL,snapshot TEXT NOT NULL)");
            db.execSQL("CREATE TABLE operations(vault TEXT NOT NULL,operation TEXT NOT NULL,payload_hash TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(vault,operation))");
            db.execSQL("CREATE TABLE facts(vault TEXT NOT NULL,id TEXT NOT NULL,destination TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(vault,id))");
        }
        @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { throw new IllegalStateException("Explicit validated migration required"); }
    }
}
